import { fetchWithRetry } from './index'
import type { MediaInfoKitOptions } from './index'

/**
 * MP4 moov 位置检测结果
 */
export interface MoovLocationResult {
  /** moov 位置:front-头部, back-尾部, unknown-未知 */
  location: 'front' | 'back' | 'unknown'
  /** moov 盒子在文件中的偏移量 */
  moovOffset?: number
  /** moov 盒子大小 */
  moovSize?: number
  /** 文件总大小 */
  fileSize?: number
  /** 检测是否完成(可能因网络/文件问题无法确定) */
  detected: boolean
}

/**
 * MP4 盒子解析器
 * 用于快速扫描 moov 盒子位置
 */
class Mp4BoxScanner {
  private data: Uint8Array
  private offset = 0

  constructor(data: Uint8Array) {
    this.data = data
  }

  /**
   * 读取 32 位无符号整数(大端序)
   */
  private readUint32(offset: number): number {
    return (
      (this.data[offset] << 24) |
      (this.data[offset + 1] << 16) |
      (this.data[offset + 2] << 8) |
      this.data[offset + 3]
    ) >>> 0
  }

  /**
   * 读取盒子类型(4 字节 ASCII)
   */
  private readBoxType(offset: number): string {
    return String.fromCharCode(
      this.data[offset],
      this.data[offset + 1],
      this.data[offset + 2],
      this.data[offset + 3]
    )
  }

  /**
   * 扫描数据中的 moov 盒子
   * @returns moov 偏移量和大小,未找到返回 null
   */
  scanMoov(): { offset: number; size: number } | null {
    while (this.offset + 8 <= this.data.length) {
      const size = this.readUint32(this.offset)
      const type = this.readBoxType(this.offset + 4)

      // 处理扩展大小(size === 1)
      if (size === 1) {
        if (this.offset + 16 > this.data.length) {
          break
        }
        // 读取扩展大小(8字节),但这里我们只需要跳过即可
        // 实际的扩展大小在第 8-15 字节
        const extendedSize = this.readExtendedSize(this.offset)
        if (extendedSize === 0 || extendedSize > this.data.length - this.offset) {
          break
        }
        if (type === 'moov') {
          return { offset: this.offset, size: extendedSize }
        }
        this.offset += extendedSize
        continue
      }

      // 无效大小
      if (size === 0 || size > this.data.length - this.offset) {
        break
      }

      if (type === 'moov') {
        return { offset: this.offset, size }
      }

      // 跳过当前盒子
      this.offset += size
    }

    return null
  }

  /**
   * 读取扩展大小(64位)
   */
  private readExtendedSize(offset: number): number {
    // 读取高 32 位和低 32 位
    const high = this.readUint32(offset + 8)
    const low = this.readUint32(offset + 12)
    // 转换为数字(注意:JavaScript 只能精确表示 2^53 以内的整数)
    return high * 4294967296 + low
  }
}

/**
 * 从本地文件检测 moov 位置
 * 性能优化:只读取前 256KB 检测 front,如果找不到,可能是在 back
 *
 * @param file 文件对象
 * @param options 配置选项
 * @returns moov 位置检测结果
 */
export async function detectMoovFromFile(
  file: File,
  options?: { frontChunkSize?: number }
): Promise<MoovLocationResult> {
  const frontChunkSize = options?.frontChunkSize ?? 256 * 1024 // 默认 256KB

  // 小文件直接全量读取
  if (file.size <= frontChunkSize) {
    const buffer = await file.arrayBuffer()
    const scanner = new Mp4BoxScanner(new Uint8Array(buffer))
    const moov = scanner.scanMoov()

    return {
      location: moov ? 'front' : 'unknown',
      moovOffset: moov?.offset,
      moovSize: moov?.size,
      fileSize: file.size,
      detected: moov !== null,
    }
  }

  // 大文件先读头部
  const frontBuffer = await file.slice(0, frontChunkSize).arrayBuffer()
  const frontScanner = new Mp4BoxScanner(new Uint8Array(frontBuffer))
  const frontMoov = frontScanner.scanMoov()

  if (frontMoov) {
    return {
      location: 'front',
      moovOffset: frontMoov.offset,
      moovSize: frontMoov.size,
      fileSize: file.size,
      detected: true,
    }
  }

  // moov 不在头部,可能在尾部(web optimized mp4 通常是 front)
  // 对于非 web optimized,moov 通常在文件末尾
  return {
    location: 'back',
    fileSize: file.size,
    detected: true,
  }
}

/**
 * 从 ArrayBuffer 检测 moov 位置
 *
 * @param buffer ArrayBuffer 数据
 * @param fileSize 文件大小(可选)
 * @returns moov 位置检测结果
 */
export function detectMoovFromBuffer(
  buffer: ArrayBuffer,
  fileSize?: number
): MoovLocationResult {
  const data = new Uint8Array(buffer)
  const scanner = new Mp4BoxScanner(data)
  const moov = scanner.scanMoov()

  return {
    location: moov ? 'front' : 'unknown',
    moovOffset: moov?.offset,
    moovSize: moov?.size,
    fileSize: fileSize ?? data.length,
    detected: moov !== null,
  }
}

/**
 * 从远程 URL 检测 moov 位置
 * 性能优化:使用 Range 请求分段获取,优先检查头部
 *
 * @param url 媒体文件 URL
 * @param options 配置选项
 * @returns moov 位置检测结果
 */
export async function detectMoovFromUrl(
  url: string,
  options?: {
    frontChunkSize?: number
    backChunkSize?: number
    retries?: number
    retryDelay?: number | ((attempt: number) => number)
  }
): Promise<MoovLocationResult> {
  const frontChunkSize = options?.frontChunkSize ?? 256 * 1024 // 默认 256KB
  const backChunkSize = options?.backChunkSize ?? 64 * 1024 // 默认 64KB
  const retries = options?.retries ?? 3
  const retryDelay = options?.retryDelay ?? 1000

  // Step 1: 尝试获取文件大小(HEAD 请求)
  let fileSize: number | undefined
  try {
    const headResponse = await fetchWithRetry(url, { method: 'HEAD' }, retries, retryDelay)
    const contentLength = headResponse.headers.get('content-length')
    if (contentLength) {
      fileSize = parseInt(contentLength, 10)
    }
  } catch {
    // HEAD 可能不支持,继续尝试
  }

  // Step 2: 获取头部数据检测 moov
  try {
    const frontResponse = await fetchWithRetry(
      url,
      {
        headers: { Range: `bytes=0-${frontChunkSize - 1}` },
      },
      retries,
      retryDelay
    )

    if (!frontResponse.ok && frontResponse.status !== 206) {
      throw new Error(`HTTP ${frontResponse.status}`)
    }

    const frontBuffer = await frontResponse.arrayBuffer()
    const frontScanner = new Mp4BoxScanner(new Uint8Array(frontBuffer))
    const frontMoov = frontScanner.scanMoov()

    if (frontMoov) {
      return {
        location: 'front',
        moovOffset: frontMoov.offset,
        moovSize: frontMoov.size,
        fileSize,
        detected: true,
      }
    }

    // moov 不在头部,尝试检查尾部(如果已知文件大小)
    if (fileSize && fileSize > frontChunkSize) {
      const backStart = Math.max(fileSize - backChunkSize, frontChunkSize)
      const backResponse = await fetchWithRetry(
        url,
        {
          headers: { Range: `bytes=${backStart}-${fileSize - 1}` },
        },
        retries,
        retryDelay
      )

      if (backResponse.ok || backResponse.status === 206) {
        const backBuffer = await backResponse.arrayBuffer()
        const backScanner = new Mp4BoxScanner(new Uint8Array(backBuffer))
        const backMoov = backScanner.scanMoov()

        if (backMoov) {
          return {
            location: 'back',
            moovOffset: backStart + backMoov.offset,
            moovSize: backMoov.size,
            fileSize,
            detected: true,
          }
        }
      }
    }

    // 无法确定位置,但确定是 MP4
    return {
      location: 'unknown',
      fileSize,
      detected: false,
    }
  } catch (error: any) {
    throw new Error(`检测 moov 位置失败: ${error.message}`)
  }
}

/**
 * 统一的 moov 位置检测入口
 * 根据 source 类型自动选择检测方式
 *
 * @param source 输入源(File | URL | ArrayBuffer)
 * @param options 配置选项
 * @returns moov 位置检测结果
 *
 * @example
 * // 检测本地文件
 * const result = await detectMoovLocation(file)
 * console.log(result.location) // 'front' | 'back' | 'unknown'
 *
 * @example
 * // 检测远程视频
 * const result = await detectMoovLocation('https://example.com/video.mp4')
 *
 * @example
 * // 检测内存缓冲区
 * const result = await detectMoovLocation(arrayBuffer)
 */
export async function detectMoovLocation(
  source: File | string | ArrayBuffer,
  options?: {
    frontChunkSize?: number
    backChunkSize?: number
    retries?: number
    retryDelay?: number | ((attempt: number) => number)
  }
): Promise<MoovLocationResult> {
  if (source instanceof File) {
    return detectMoovFromFile(source, options)
  }

  if (typeof source === 'string') {
    return detectMoovFromUrl(source, options)
  }

  if (source instanceof ArrayBuffer) {
    return detectMoovFromBuffer(source)
  }

  throw new Error('不支持的 source 类型')
}
