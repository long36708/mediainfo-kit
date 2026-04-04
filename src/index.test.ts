import { describe, expect, it } from 'vitest'
import {
  formatBitRate,
  formatDuration,
  formatFileSize,
  getAudioTracks,
  getGeneralTrack,
  getTextTracks,
  getVideoTracks,
} from './index'
import type { MediaInfoResult } from './index'

describe('formatDuration', () => {
  it('应返回 N/A 当值为 undefined', () => {
    expect(formatDuration(undefined)).toBe('N/A')
  })

  it('应正确格式化秒数（小于1分钟）', () => {
    expect(formatDuration(30)).toBe('00:30')
  })

  it('应正确格式化分钟数（小于1小时）', () => {
    expect(formatDuration(125.5)).toBe('02:05')
  })

  it('应正确格式化小时数', () => {
    expect(formatDuration(3661.5)).toBe('01:01:01')
  })
})

describe('formatFileSize', () => {
  it('应返回 N/A 当值为 undefined', () => {
    expect(formatFileSize(undefined)).toBe('N/A')
  })

  it('应正确格式化字节', () => {
    expect(formatFileSize(512)).toBe('512.00 B')
  })

  it('应正确格式化 KB', () => {
    expect(formatFileSize(1024)).toBe('1.00 KB')
  })

  it('应正确格式化 MB', () => {
    expect(formatFileSize(1536000)).toBe('1.46 MB')
  })

  it('应正确格式化 GB', () => {
    expect(formatFileSize(1073741824)).toBe('1.00 GB')
  })

  it('应处理字符串输入', () => {
    expect(formatFileSize('1048576')).toBe('1.00 MB')
  })
})

describe('formatBitRate', () => {
  it('应返回 N/A 当值为 undefined', () => {
    expect(formatBitRate(undefined)).toBe('N/A')
  })

  it('应正确格式化 bps', () => {
    expect(formatBitRate(500)).toBe('500 bps')
  })

  it('应正确格式化 Kbps', () => {
    expect(formatBitRate(128000)).toBe('128.00 Kbps')
  })

  it('应正确格式化 Mbps', () => {
    expect(formatBitRate(5000000)).toBe('5.00 Mbps')
  })
})

describe('轨道提取工具', () => {
  const mockResult: MediaInfoResult = {
    media: {
      '@ref': 'test.mp4',
      track: [
        { '@type': 'General', Format: 'MPEG-4', Duration: 120.5 },
        { '@type': 'Video', Format: 'AVC', Width: 1920, Height: 1080 },
        { '@type': 'Video', Format: 'AVC', Width: 1280, Height: 720 },
        { '@type': 'Audio', Format: 'AAC', Channels: 2 },
        { '@type': 'Text', Format: 'SRT' },
      ],
    },
  }

  it('getVideoTracks 应返回所有视频轨道', () => {
    const tracks = getVideoTracks(mockResult)
    expect(tracks).toHaveLength(2)
    expect(tracks[0].Width).toBe(1920)
  })

  it('getAudioTracks 应返回所有音频轨道', () => {
    const tracks = getAudioTracks(mockResult)
    expect(tracks).toHaveLength(1)
    expect(tracks[0].Format).toBe('AAC')
  })

  it('getGeneralTrack 应返回通用轨道', () => {
    const track = getGeneralTrack(mockResult)
    expect(track?.Format).toBe('MPEG-4')
  })

  it('getTextTracks 应返回所有文本轨道', () => {
    const tracks = getTextTracks(mockResult)
    expect(tracks).toHaveLength(1)
  })

  it('应处理空结果', () => {
    const emptyResult: MediaInfoResult = {}
    expect(getVideoTracks(emptyResult)).toHaveLength(0)
    expect(getAudioTracks(emptyResult)).toHaveLength(0)
    expect(getGeneralTrack(emptyResult)).toBeUndefined()
  })
})
