/**
 * 视频格式类型
 */
export type VideoFormat =
  | 'mp4'
  | 'mov'
  | 'avi'
  | 'wmv'
  | 'mkv'
  | 'flv'
  | 'ts'
  | 'hik'
  | 'rtp'
  | 'unknown'

/**
 * 格式检测结果
 */
export interface FormatDetectResult {
  /** 检测到的格式 */
  format: VideoFormat
  /** 是否包含私有头部(如海康私有格式) */
  hasPrivateHeader?: boolean
  /** 置信度 (0-1) */
  confidence: number
  /** MIME 类型 */
  mimeType?: string
}

/**
 * 常见视频格式的文件头签名
 */
export const FormatSignatures = {
  /** 海康私有格式签名 */
  HIK: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70],
  /** RTP 标记偏移量 */
  RTP_MARKER_OFFSET: 2,
  /** RTP 标记字节 */
  RTP_MARKER: [0x80],
} as const

const MIN_HEADER_SIZE = 12

/**
 * 标准格式签名列表
 */
const STANDARD_SIGNATURES: Array<{
  format: VideoFormat
  offset: number
  bytes: number[]
  mimeType: string
}> = [
  {
    format: 'avi',
    offset: 0,
    bytes: [0x52, 0x49, 0x46, 0x46], // RIFF
    mimeType: 'video/x-msvideo',
  },
  {
    format: 'wmv',
    offset: 0,
    bytes: [0x30, 0x26, 0xb2, 0x75],
    mimeType: 'video/x-ms-wmv',
  },
  {
    format: 'mkv',
    offset: 0,
    bytes: [0x1a, 0x45, 0xdf, 0xa3],
    mimeType: 'video/x-matroska',
  },
  {
    format: 'flv',
    offset: 0,
    bytes: [0x46, 0x4c, 0x56], // FLV
    mimeType: 'video/x-flv',
  },
  {
    format: 'mp4',
    offset: 4,
    bytes: [0x66, 0x74, 0x79, 0x70], // ftyp
    mimeType: 'video/mp4',
  },
  {
    format: 'ts',
    offset: 0,
    bytes: [0x47], // MPEG-TS sync byte
    mimeType: 'video/mp2t',
  },
]

/**
 * MOV 格式的 brand 标识
 */
const MOV_BRANDS = new Set(['qt  ', 'MSNV'])

/**
 * 检查数据在指定偏移处是否匹配给定的字节序列
 */
function matchesAt(data: Uint8Array, offset: number, bytes: number[]): boolean {
  if (offset + bytes.length > data.length) return false
  for (let i = 0; i < bytes.length; i++) {
    if (data[offset + i] !== bytes[i]) return false
  }
  return true
}

/**
 * 格式检测器
 * 通过文件头签名快速识别视频格式,无需加载 WASM
 */
export class FormatDetector {
  /**
   * 检测海康私有格式
   */
  detectHIK(data: Uint8Array): FormatDetectResult | null {
    if (data.length < FormatSignatures.HIK.length) return null
    if (!matchesAt(data, 0, [...FormatSignatures.HIK])) return null
    return {
      format: 'hik',
      hasPrivateHeader: true,
      confidence: 1,
      mimeType: 'application/x-hikvision',
    }
  }

  /**
   * 检测 RTP 流
   */
  detectRTP(data: Uint8Array): FormatDetectResult | null {
    const offset = FormatSignatures.RTP_MARKER_OFFSET
    const marker = FormatSignatures.RTP_MARKER
    if (data.length < offset + marker.length) return null
    if (!matchesAt(data, offset, [...marker])) return null
    return {
      format: 'rtp',
      hasPrivateHeader: false,
      confidence: 0.8,
      mimeType: 'application/x-rtp',
    }
  }

  /**
   * 检测标准视频格式
   */
  detectStandard(data: Uint8Array): FormatDetectResult | null {
    for (const sig of STANDARD_SIGNATURES) {
      if (matchesAt(data, sig.offset, sig.bytes)) {
        // 特殊处理 MP4/MOV
        if (sig.format === 'mp4' && data.length >= 12) {
          const brand = String.fromCharCode(data[8], data[9], data[10], data[11])
          if (MOV_BRANDS.has(brand)) {
            return {
              format: 'mov',
              hasPrivateHeader: false,
              confidence: 1,
              mimeType: 'video/quicktime',
            }
          }
        }
        return {
          format: sig.format,
          hasPrivateHeader: false,
          confidence: 1,
          mimeType: sig.mimeType,
        }
      }
    }
    return null
  }

  /**
   * 检测视频格式
   * @param data 文件头数据(至少 12 字节)
   * @returns 格式检测结果
   */
  detect(data: Uint8Array): FormatDetectResult {
    if (!data || data.length < MIN_HEADER_SIZE) {
      return { format: 'unknown', hasPrivateHeader: false, confidence: 0 }
    }

    return (
      this.detectHIK(data) ??
      this.detectRTP(data) ??
      this.detectStandard(data) ?? {
        format: 'unknown' as VideoFormat,
        hasPrivateHeader: false,
        confidence: 0,
      }
    )
  }
}
