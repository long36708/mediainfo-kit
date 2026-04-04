import mediaInfoFactory, {
  type AudioTrack,
  type FormatType,
  type GeneralTrack,
  type ImageTrack,
  type MediaInfo,
  type MediaInfoResult,
  type MenuTrack,
  type OtherTrack,
  type TextTrack,
  type Track,
  type VideoTrack,
} from 'mediainfo.js'

export type {
  MediaInfoResult,
  Track,
  GeneralTrack,
  VideoTrack,
  AudioTrack,
  TextTrack,
  ImageTrack,
  MenuTrack,
  OtherTrack,
}

/**
 * WASM 文件加载策略
 */
export type WasmLoader =
  | string
  | ((path: string) => string)

export interface MediaInfoKitOptions {
  /** 结果格式，默认为 'object' */
  format?: FormatType
  /** 是否显示完整信息 */
  full?: boolean
  /** 是否输出封面数据为 base64 */
  coverData?: boolean
  /** 块大小（字节），默认 256KB */
  chunkSize?: number
  /**
   * WASM 文件加载方式
   * - string: WASM 文件的基础路径（如 '/assets/' 或 'https://cdn.example.com/mediainfo/'）
   * - function: 自定义 locateFile 函数
   * - 未指定: 默认使用 jsdelivr CDN
   */
  wasmLoader?: WasmLoader
  /** 重试次数，默认 3 次 */
  retries?: number
  /** 重试延迟（毫秒），默认 1000ms，支持指数退避函数 */
  retryDelay?: number | ((attempt: number) => number)
}

/** 默认 WASM CDN 路径 */
const DEFAULT_WASM_CDN = 'https://cdn.jsdelivr.net/npm/mediainfo.js@0.3.7/dist/'

/** 缓存的 MediaInfo 实例 */
let cachedMediaInfo: MediaInfo<FormatType> | null = null

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 带重试的 fetch
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries: number,
  retryDelay: number | ((attempt: number) => number),
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, init)
      if (response.ok || response.status === 206) {
        return response
      }
      // 4xx 错误不重试
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`)
      }
      lastError = new Error(`Failed to fetch: ${response.status} ${response.statusText}`)
    } catch (err) {
      lastError = err as Error
    }

    // 最后一次尝试不再等待
    if (attempt < retries) {
      const delayMs = typeof retryDelay === 'function' ? retryDelay(attempt) : retryDelay
      await delay(delayMs)
    }
  }

  throw lastError
}

/**
 * 创建 locateFile 函数
 */
function createLocateFile(wasmLoader?: WasmLoader): (path: string) => string {
  if (typeof wasmLoader === 'function') {
    return wasmLoader
  }

  if (typeof wasmLoader === 'string') {
    const basePath = wasmLoader.endsWith('/') ? wasmLoader : `${wasmLoader}/`
    return (path: string) => basePath + path
  }

  // 默认使用 CDN
  return (path: string) => DEFAULT_WASM_CDN + path
}

/**
 * 获取或创建 MediaInfo 实例（单例模式）
 * @internal
 */
async function getMediaInfoInstance(
  options: MediaInfoKitOptions = {},
): Promise<MediaInfo<FormatType>> {
  if (cachedMediaInfo) {
    cachedMediaInfo.reset()
    return cachedMediaInfo
  }

  const {
    format = 'object',
    full = false,
    coverData = false,
    chunkSize = 256 * 1024,
    wasmLoader,
  } = options

  cachedMediaInfo = await mediaInfoFactory({
    format,
    full,
    coverData,
    chunkSize,
    locateFile: createLocateFile(wasmLoader),
  })

  return cachedMediaInfo
}

/**
 * 从 File 对象获取媒体信息
 * @param file 文件对象
 * @param options 配置选项
 * @returns 媒体信息
 */
export async function getMediaInfoFromFile(
  file: File,
  options: MediaInfoKitOptions = {},
): Promise<MediaInfoResult> {
  const mediainfo = await getMediaInfoInstance(options)

  const getSize = () => file.size

  const readChunk = async (size: number, offset: number): Promise<Uint8Array> => {
    const blob = file.slice(offset, offset + size)
    const buffer = await blob.arrayBuffer()
    return new Uint8Array(buffer)
  }

  const result = await mediainfo.analyzeData(getSize, readChunk)
  return result as MediaInfoResult
}

/**
 * 从 URL 获取媒体信息（支持 Range 请求）
 * @param url 媒体文件 URL
 * @param options 配置选项
 * @returns 媒体信息
 */
export async function getMediaInfoFromUrl(
  url: string,
  options: MediaInfoKitOptions = {},
): Promise<MediaInfoResult> {
  const { retries = 3, retryDelay = 1000 } = options

  const response = await fetchWithRetry(url, { method: 'HEAD' }, retries, retryDelay)

  const contentLength = response.headers.get('Content-Length')
  if (!contentLength) {
    throw new Error('Content-Length header is missing')
  }

  const fileSize = Number.parseInt(contentLength, 10)

  const mediainfo = await getMediaInfoInstance(options)

  const getSize = () => fileSize

  const readChunk = async (size: number, offset: number): Promise<Uint8Array> => {
    if (offset >= fileSize) {
      return new Uint8Array(0)
    }

    const end = Math.min(offset + size - 1, fileSize - 1)
    const rangeResponse = await fetchWithRetry(
      url,
      { headers: { Range: `bytes=${offset}-${end}` } },
      retries,
      retryDelay,
    )

    const buffer = await rangeResponse.arrayBuffer()
    return new Uint8Array(buffer)
  }

  const result = await mediainfo.analyzeData(getSize, readChunk)
  return result as MediaInfoResult
}

/**
 * 从 ArrayBuffer 获取媒体信息
 * @param buffer ArrayBuffer 数据
 * @param options 配置选项
 * @returns 媒体信息
 */
export async function getMediaInfoFromBuffer(
  buffer: ArrayBuffer,
  options: MediaInfoKitOptions = {},
): Promise<MediaInfoResult> {
  const mediainfo = await getMediaInfoInstance(options)

  const uint8Array = new Uint8Array(buffer)
  const getSize = () => uint8Array.length

  const readChunk = (size: number, offset: number): Uint8Array => {
    return uint8Array.slice(offset, offset + size)
  }

  const result = await mediainfo.analyzeData(getSize, readChunk)
  return result as MediaInfoResult
}

/**
 * 从 Blob 对象获取媒体信息
 * @param blob Blob 对象
 * @param options 配置选项
 * @returns 媒体信息
 */
export async function getMediaInfoFromBlob(
  blob: Blob,
  options: MediaInfoKitOptions = {},
): Promise<MediaInfoResult> {
  const mediainfo = await getMediaInfoInstance(options)

  const getSize = () => blob.size

  const readChunk = async (size: number, offset: number): Promise<Uint8Array> => {
    const chunk = blob.slice(offset, offset + size)
    const buffer = await chunk.arrayBuffer()
    return new Uint8Array(buffer)
  }

  const result = await mediainfo.analyzeData(getSize, readChunk)
  return result as MediaInfoResult
}

/**
 * 关闭 MediaInfo 实例，释放资源
 */
export function closeMediaInfo(): void {
  if (cachedMediaInfo) {
    cachedMediaInfo.close()
    cachedMediaInfo = null
  }
}

// ============ 轨道提取工具 ============

/**
 * 获取视频轨道信息
 */
export function getVideoTracks(result: MediaInfoResult): VideoTrack[] {
  return result.media?.track?.filter((t): t is VideoTrack => t['@type'] === 'Video') ?? []
}

/**
 * 获取音频轨道信息
 */
export function getAudioTracks(result: MediaInfoResult): AudioTrack[] {
  return result.media?.track?.filter((t): t is AudioTrack => t['@type'] === 'Audio') ?? []
}

/**
 * 获取通用轨道信息（容器信息）
 */
export function getGeneralTrack(result: MediaInfoResult): GeneralTrack | undefined {
  return result.media?.track?.find((t): t is GeneralTrack => t['@type'] === 'General')
}

/**
 * 获取文本轨道信息（字幕等）
 */
export function getTextTracks(result: MediaInfoResult): TextTrack[] {
  return result.media?.track?.filter((t): t is TextTrack => t['@type'] === 'Text') ?? []
}

// ============ 格式化工具 ============

/**
 * 格式化时长（秒转 HH:MM:SS）
 */
export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) return 'N/A'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  const pad = (n: number) => n.toString().padStart(2, '0')

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`
  }
  return `${pad(minutes)}:${pad(secs)}`
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number | string | undefined): string {
  if (bytes === undefined) return 'N/A'
  const size = typeof bytes === 'string' ? Number.parseInt(bytes, 10) : bytes

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let sizeNum = size

  while (sizeNum >= 1024 && i < units.length - 1) {
    sizeNum /= 1024
    i++
  }

  return `${sizeNum.toFixed(2)} ${units[i]}`
}

/**
 * 格式化比特率
 */
export function formatBitRate(bitRate: number | undefined): string {
  if (bitRate === undefined) return 'N/A'

  if (bitRate >= 1_000_000) {
    return `${(bitRate / 1_000_000).toFixed(2)} Mbps`
  }
  if (bitRate >= 1_000) {
    return `${(bitRate / 1_000).toFixed(2)} Kbps`
  }
  return `${bitRate} bps`
}
