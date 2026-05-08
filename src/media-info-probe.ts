import mediaInfoFactory, { type FormatType, type MediaInfo, type MediaInfoResult } from 'mediainfo.js'
import { fetchWithRetry } from './index'
import type { WasmLoader } from './index'

export interface MediaInfoProbeOptions {
  wasmLoader?: WasmLoader
  chunkSize?: number
  retries?: number
  retryDelay?: number | ((attempt: number) => number)
}

const DEFAULT_WASM_CDN = 'https://cdn.jsdelivr.net/npm/mediainfo.js@0.3.7/dist/'

function createLocateFile(wasmLoader?: WasmLoader): (path: string) => string {
  if (typeof wasmLoader === 'function') {
    return wasmLoader
  }
  if (typeof wasmLoader === 'string') {
    const basePath = wasmLoader.endsWith('/') ? wasmLoader : `${wasmLoader}/`
    return (path: string) => basePath + path
  }
  return (path: string) => DEFAULT_WASM_CDN + path
}

/**
 * MediaInfo 探测类
 * 提供面向对象的 API,更好的状态管理和资源控制
 */
export class MediaInfoProbe {
  private readonly options: {
    chunkSize: number
    retries: number
    retryDelay: number | ((attempt: number) => number)
    locateFile: (path: string) => string
  }

  private mediaInfo: MediaInfo<FormatType> | null = null

  constructor(options?: MediaInfoProbeOptions) {
    this.options = {
      chunkSize: options?.chunkSize ?? 256 * 1024,
      retries: options?.retries ?? 3,
      retryDelay: options?.retryDelay ?? 1000,
      locateFile: createLocateFile(options?.wasmLoader),
    }
  }

  private async getMediaInfo(): Promise<MediaInfo<FormatType>> {
    if (this.mediaInfo) {
      this.mediaInfo.reset()
      return this.mediaInfo
    }

    this.mediaInfo = await mediaInfoFactory({
      format: 'object',
      full: false,
      coverData: false,
      chunkSize: this.options.chunkSize,
      locateFile: this.options.locateFile,
    })

    return this.mediaInfo
  }

  /**
   * 从 File 对象探测媒体信息
   */
  async probeFromFile(file: File): Promise<MediaInfoResult> {
    const mediainfo = await this.getMediaInfo()

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
   * 从 URL 探测媒体信息
   */
  async probeFromUrl(url: string): Promise<MediaInfoResult> {
    const response = await fetchWithRetry(
      url,
      { method: 'HEAD' },
      this.options.retries,
      this.options.retryDelay,
    )

    const contentLength = response.headers.get('Content-Length')
    if (!contentLength) {
      throw new Error('Content-Length header is missing')
    }

    const fileSize = Number.parseInt(contentLength, 10)
    const mediainfo = await this.getMediaInfo()

    const getSize = () => fileSize

    const readChunk = async (size: number, offset: number): Promise<Uint8Array> => {
      if (offset >= fileSize) {
        return new Uint8Array(0)
      }

      const end = Math.min(offset + size - 1, fileSize - 1)
      const rangeResponse = await fetchWithRetry(
        url,
        { headers: { Range: `bytes=${offset}-${end}` } },
        this.options.retries,
        this.options.retryDelay,
      )

      const buffer = await rangeResponse.arrayBuffer()
      return new Uint8Array(buffer)
    }

    const result = await mediainfo.analyzeData(getSize, readChunk)
    return result as MediaInfoResult
  }

  /**
   * 从 ArrayBuffer 探测媒体信息
   */
  async probeFromBuffer(buffer: ArrayBuffer): Promise<MediaInfoResult> {
    const mediainfo = await this.getMediaInfo()

    const uint8Array = new Uint8Array(buffer)
    const getSize = () => uint8Array.length

    const readChunk = (size: number, offset: number): Uint8Array => {
      return uint8Array.slice(offset, offset + size)
    }

    const result = await mediainfo.analyzeData(getSize, readChunk)
    return result as MediaInfoResult
  }

  /**
   * 销毁实例,释放资源
   */
  destroy(): void {
    if (this.mediaInfo) {
      this.mediaInfo.close()
      this.mediaInfo = null
    }
  }
}
