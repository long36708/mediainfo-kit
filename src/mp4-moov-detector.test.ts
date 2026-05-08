import { describe, it, expect } from 'vitest'
import { detectMoovFromBuffer, detectMoovLocation } from './mp4-moov-detector'

describe('MP4 Moov Detector', () => {
  describe('detectMoovFromBuffer', () => {
    it('should detect moov at front', () => {
      // 创建一个简单的 MP4 结构: ftyp + moov
      const ftypBox = createBox('ftyp', 8)
      const moovBox = createBox('moov', 100)
      
      const buffer = new Uint8Array([...ftypBox, ...moovBox]).buffer
      const result = detectMoovFromBuffer(buffer)
      
      expect(result.location).toBe('front')
      expect(result.detected).toBe(true)
      expect(result.moovOffset).toBe(8)
      expect(result.moovSize).toBe(100)
    })

    it('should return unknown when moov not found', () => {
      // 创建没有 moov 的数据
      const ftypBox = createBox('ftyp', 8)
      const mdatBox = createBox('mdat', 200)
      
      const buffer = new Uint8Array([...ftypBox, ...mdatBox]).buffer
      const result = detectMoovFromBuffer(buffer)
      
      expect(result.location).toBe('unknown')
      expect(result.detected).toBe(false)
    })

    it('should handle extended size boxes', () => {
      // 创建带扩展大小的盒子 (size = 1)
      const data = new Uint8Array(200)
      
      // 第一个盒子: ftyp with extended size
      // size = 1 (表示使用扩展大小)
      data[0] = 0
      data[1] = 0
      data[2] = 0
      data[3] = 1
      // type = 'ftyp'
      data[4] = 0x66  // 'f'
      data[5] = 0x74  // 't'
      data[6] = 0x79  // 'y'
      data[7] = 0x70  // 'p'
      // extended size = 50 (8-15 bytes)
      data[8] = 0
      data[9] = 0
      data[10] = 0
      data[11] = 0
      data[12] = 0
      data[13] = 0
      data[14] = 0
      data[15] = 50
      
      // 第二个盒子: moov at offset 50
      // size = 100
      data[50] = 0
      data[51] = 0
      data[52] = 0
      data[53] = 100
      // type = 'moov'
      data[54] = 0x6d  // 'm'
      data[55] = 0x6f  // 'o'
      data[56] = 0x6f  // 'o'
      data[57] = 0x76  // 'v'
      
      const result = detectMoovFromBuffer(data.buffer)
      expect(result.location).toBe('front')
      expect(result.detected).toBe(true)
      expect(result.moovOffset).toBe(50)
    })
  })

  describe('detectMoovLocation', () => {
    it('should work with ArrayBuffer', async () => {
      const ftypBox = createBox('ftyp', 8)
      const moovBox = createBox('moov', 100)
      const buffer = new Uint8Array([...ftypBox, ...moovBox]).buffer
      
      const result = await detectMoovLocation(buffer)
      expect(result.location).toBe('front')
      expect(result.detected).toBe(true)
    })

    it('should throw error for invalid source type', async () => {
      await expect(detectMoovLocation({} as any)).rejects.toThrow('不支持的 source 类型')
    })
  })
})

/**
 * 辅助函数: 创建 MP4 box
 */
function createBox(type: string, size: number): number[] {
  const box = new Array(size).fill(0)
  
  // 写入 size (大端序)
  box[0] = (size >> 24) & 0xff
  box[1] = (size >> 16) & 0xff
  box[2] = (size >> 8) & 0xff
  box[3] = size & 0xff
  
  // 写入 type
  box[4] = type.charCodeAt(0)
  box[5] = type.charCodeAt(1)
  box[6] = type.charCodeAt(2)
  box[7] = type.charCodeAt(3)
  
  return box
}
