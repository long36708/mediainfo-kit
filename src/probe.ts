import { FormatDetector, type FormatDetectResult } from './format-detector'
import { MediaInfoProbe, type MediaInfoProbeOptions } from './media-info-probe'
import { detectMoovLocation, type MoovLocationResult } from './mp4-moov-detector'
import type { MediaInfoResult } from 'mediainfo.js'
import { fetchWithRetry } from './index'

export interface ProbeOptions extends MediaInfoProbeOptions {
  /** 是否检测 moov 位置(仅对 MP4/mov 有效) */
  detectMoov?: boolean
  /** 前部检测字节数(大文件优化) */
  frontChunkSize?: number
  /** 后部检测字节数(大文件优化) */
  backChunkSize?: number
}

/**
 * 统一的探测结果
 */
export interface UnifiedProbeResult {
  /** 格式检测结果 */
  format: FormatDetectResult
  /** 元信息探测结果 */
  metadata: MediaInfoResult
  /** moov 位置检测结果(仅 MP4/mov 且 detectMoov=true 时有值) */
  moovLocation?: MoovLocationResult
  /** 原始输入类型 */
  sourceType: 'file' | 'url' | 'buffer' | 'blob'
}

/** 判断是否为 Blob URL */
function isBlobUrl(url: string): boolean {
  return url.startsWith('blob:')
}

/**
 * 统一的探测入口函数
 * 支持 File、URL、Blob URL、ArrayBuffer 等多种输入类型
 * 
 * 一次调用完成:
 * 1. 快速格式检测(无需 WASM)
 * 2. 详细元信息探测(需要 WASM)
 * 3. (可选) moov 位置检测
 *
 * @param source - 输入源(File | URL 字符串 | Blob URL | ArrayBuffer)
 * @param options - 探测配置选项
 * @returns 统一的探测结果
 *
 * @example
 * // 探测本地文件
 * const result = await probe(file)
 * console.log(result.format.format) // 'mp4' | 'mov' | etc.
 * console.log(result.metadata.media?.track)
 *
 * @example
 * // 探测远程视频并检测 moov 位置
 * const result = await probe('https://example.com/video.mp4', {
 *   detectMoov: true
 * })
 * console.log(result.moovLocation?.location) // 'front' | 'back'
 *
 * @example
 * // 探测 Blob URL(例如从 canvas 录制或用户选择的文件创建的 URL)
 * const blobUrl = URL.createObjectURL(file)
 * const result = await probe(blobUrl)
 *
 * @example
 * // 探测内存缓冲区
 * const result = await probe(arrayBuffer)
 */
export async function probe(
  source: File | string | ArrayBuffer,
  options?: ProbeOptions
): Promise<UnifiedProbeResult> {
  const opts = {
    detectMoov: false,
    ...options,
  }

  // 1. 确定源类型并读取头部用于格式检测
  let headerBuffer: ArrayBuffer
  let sourceType: 'file' | 'url' | 'buffer' | 'blob'
  let fileSize: number | undefined
  let blobBuffer: ArrayBuffer | null = null // 用于缓存 blob URL 的内容

  if (typeof source === 'string') {
    if (isBlobUrl(source)) {
      // Blob URL: 不支持 Range,需要获取完整内容
      sourceType = 'blob'
      const response = await fetch(source)
      blobBuffer = await response.arrayBuffer()
      headerBuffer = blobBuffer.slice(0, 65536)
      fileSize = blobBuffer.byteLength
    } else {
      // 普通 URL: 使用 Range 请求获取头部
      sourceType = 'url'
      const response = await fetchWithRetry(
        source,
        { method: 'GET', headers: { Range: 'bytes=0-65535' } },
        opts.retries ?? 3,
        opts.retryDelay ?? 1000
      )
      headerBuffer = await response.arrayBuffer()
      // 尝试从 Content-Range 获取文件大小
      const contentRange = response.headers.get('Content-Range')
      if (contentRange) {
        const match = contentRange.match(/\/(\d+)$/)
        if (match) fileSize = parseInt(match[1], 10)
      }
    }
  } else if (source instanceof File) {
    sourceType = 'file'
    headerBuffer = await source.slice(0, 65536).arrayBuffer()
    fileSize = source.size
  } else {
    sourceType = 'buffer'
    headerBuffer = source
    fileSize = source.byteLength
  }

  // 2. 格式检测(快速,无需 WASM)
  const detector = new FormatDetector()
  const formatResult = detector.detect(new Uint8Array(headerBuffer))

  // 3. 元信息探测(需要 WASM)
  const probeInstance = new MediaInfoProbe(opts)
  let metadataResult: MediaInfoResult

  if (blobBuffer) {
    // Blob URL: 使用已获取的 buffer
    metadataResult = await probeInstance.probeFromBuffer(blobBuffer)
  } else if (typeof source === 'string') {
    metadataResult = await probeInstance.probeFromUrl(source)
  } else if (source instanceof File) {
    metadataResult = await probeInstance.probeFromFile(source)
  } else {
    metadataResult = await probeInstance.probeFromBuffer(source)
  }

  // 4. 可选: moov 位置检测(仅对 MP4/mov)
  let moovResult: MoovLocationResult | undefined
  if (opts.detectMoov && (formatResult.format === 'mp4' || formatResult.format === 'mov')) {
    if (blobBuffer) {
      moovResult = await detectMoovLocation(blobBuffer)
    } else {
      moovResult = await detectMoovLocation(source, {
        frontChunkSize: opts.frontChunkSize,
        backChunkSize: opts.backChunkSize,
      })
    }
  }

  return {
    format: formatResult,
    metadata: metadataResult,
    moovLocation: moovResult,
    sourceType,
  }
}

/**
 * 快速格式检测(不加载 WASM,性能更好)
 *
 * @param source - 输入源(File | URL 字符串 | Blob URL | ArrayBuffer)
 * @returns 格式检测结果
 *
 * @example
 * const format = await detectFormat(file)
 * console.log(format.format) // 'mp4' | 'hik' | etc.
 * console.log(format.mimeType) // 'video/mp4'
 */
export async function detectFormat(
  source: File | string | ArrayBuffer
): Promise<FormatDetectResult> {
  let headerBuffer: ArrayBuffer

  if (typeof source === 'string') {
    if (isBlobUrl(source)) {
      // Blob URL: 不支持 Range,获取完整内容后截取头部
      const response = await fetch(source)
      const fullBuffer = await response.arrayBuffer()
      headerBuffer = fullBuffer.slice(0, 65536)
    } else {
      // 普通 URL: 使用 Range 请求
      const response = await fetchWithRetry(
        source,
        { method: 'GET', headers: { Range: 'bytes=0-65535' } },
        3,
        1000
      )
      headerBuffer = await response.arrayBuffer()
    }
  } else if (source instanceof File) {
    headerBuffer = await source.slice(0, 65536).arrayBuffer()
  } else {
    headerBuffer = source
  }

  const detector = new FormatDetector()
  return detector.detect(new Uint8Array(headerBuffer))
}
