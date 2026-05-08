import { describe, it, expect } from 'vitest'
import { FormatDetector } from './format-detector'
import { detectFormat } from './probe'

describe('Format Detector', () => {
  describe('FormatDetector class', () => {
    it('should detect MP4 format', () => {
      const detector = new FormatDetector()
      // ftyp box at offset 4
      const data = new Uint8Array([
        0x00, 0x00, 0x00, 0x18, // size
        0x66, 0x74, 0x79, 0x70, // ftyp
        0x69, 0x73, 0x6f, 0x6d, // brand: isom
      ])
      
      const result = detector.detect(data)
      expect(result.format).toBe('mp4')
      expect(result.confidence).toBe(1)
      expect(result.mimeType).toBe('video/mp4')
    })

    it('should detect MOV format', () => {
      const detector = new FormatDetector()
      // qt brand indicates MOV
      const data = new Uint8Array([
        0x00, 0x00, 0x00, 0x18,
        0x66, 0x74, 0x79, 0x70, // ftyp
        0x71, 0x74, 0x20, 0x20, // brand: qt
      ])
      
      const result = detector.detect(data)
      expect(result.format).toBe('mov')
      expect(result.mimeType).toBe('video/quicktime')
    })

    it('should detect AVI format', () => {
      const detector = new FormatDetector()
      const data = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00,
        0x41, 0x56, 0x49, 0x20, // AVI
      ])
      
      const result = detector.detect(data)
      expect(result.format).toBe('avi')
      expect(result.mimeType).toBe('video/x-msvideo')
    })

    it('should detect MKV format', () => {
      const detector = new FormatDetector()
      // MKV needs at least 12 bytes
      const data = new Uint8Array([
        0x1a, 0x45, 0xdf, 0xa3, // EBML header
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ])
      
      const result = detector.detect(data)
      expect(result.format).toBe('mkv')
      expect(result.mimeType).toBe('video/x-matroska')
    })

    it('should return unknown for unrecognized format', () => {
      const detector = new FormatDetector()
      const data = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
      
      const result = detector.detect(data)
      expect(result.format).toBe('unknown')
      expect(result.confidence).toBe(0)
    })

    it('should handle insufficient data', () => {
      const detector = new FormatDetector()
      const data = new Uint8Array([0x00, 0x00, 0x00]) // Too short
      
      const result = detector.detect(data)
      expect(result.format).toBe('unknown')
      expect(result.confidence).toBe(0)
    })
  })

  describe('detectFormat function', () => {
    it('should detect format from ArrayBuffer', async () => {
      const data = new Uint8Array([
        0x00, 0x00, 0x00, 0x18,
        0x66, 0x74, 0x79, 0x70, // ftyp
        0x69, 0x73, 0x6f, 0x6d, // isom
      ])
      
      const result = await detectFormat(data.buffer)
      expect(result.format).toBe('mp4')
    })

    it('should detect format from File', async () => {
      const data = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00,
        0x41, 0x56, 0x49, 0x20, // AVI
      ])
      const file = new File([data.buffer], 'test.avi', { type: 'video/avi' })
      
      const result = await detectFormat(file)
      expect(result.format).toBe('avi')
    })
  })
})
