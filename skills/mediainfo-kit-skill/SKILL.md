---
name: mediainfo-kit-skill
description: mediainfo.js 工具套件使用指南。当用户需要解析媒体文件元数据（视频、音频、字幕信息）、获取编解码参数、时长、分辨率、比特率等信息时使用此 skill。支持 File、URL、ArrayBuffer、Blob 多种数据源，适用于视频处理、媒体分析、播放器开发等场景。
---

# mediainfo-kit Skill

mediainfo-kit 是 mediainfo.js 的工具套件，提供多数据源支持和格式化工具，用于解析媒体文件元数据。

## 何时使用

此 skill 适用于以下场景：
- 解析视频/音频文件的元数据信息
- 获取编解码器、分辨率、帧率、比特率等参数
- 提取时长、文件大小并格式化显示
- 从本地文件、远程 URL 或内存数据中分析媒体
- 视频播放器开发中获取媒体信息
- 媒体文件管理和分析工具

## 安装

```bash
npm install mediainfo-kit mediainfo.js
# 或
pnpm add mediainfo-kit mediainfo.js
```

## 核心功能

### 数据源方法

#### 从 File 对象获取媒体信息

```ts
import { getMediaInfoFromFile } from 'mediainfo-kit'

const fileInput = document.querySelector('input[type="file"]')
const file = fileInput.files[0]
const result = await getMediaInfoFromFile(file)
```

#### 从 URL 获取媒体信息（支持 Range 请求）

```ts
import { getMediaInfoFromUrl } from 'mediainfo-kit'

// 无需下载完整文件，通过 Range 请求按需获取
const result = await getMediaInfoFromUrl('https://example.com/video.mp4')
```

#### 从 ArrayBuffer 获取媒体信息

```ts
import { getMediaInfoFromBuffer } from 'mediainfo-kit'

const response = await fetch('/video.mp4')
const buffer = await response.arrayBuffer()
const result = await getMediaInfoFromBuffer(buffer)
```

#### 从 Blob 对象获取媒体信息

```ts
import { getMediaInfoFromBlob } from 'mediainfo-kit'

const blob = new Blob([videoData], { type: 'video/mp4' })
const result = await getMediaInfoFromBlob(blob)
```

### 配置选项

```ts
interface MediaInfoKitOptions {
  /** 结果格式，默认 'object' */
  format?: 'object' | 'JSON' | 'XML' | 'HTML' | 'text'
  /** 是否显示完整信息 */
  full?: boolean
  /** 是否输出封面数据为 base64 */
  coverData?: boolean
  /** 块大小（字节），默认 256KB */
  chunkSize?: number
  /** WASM 文件加载方式 */
  wasmLoader?: string | ((path: string) => string)
  /** 重试次数，默认 3 次 */
  retries?: number
  /** 重试延迟（毫秒），默认 1000ms */
  retryDelay?: number | ((attempt: number) => number)
}

// 使用示例
const result = await getMediaInfoFromFile(file, {
  format: 'object',
  full: true,
  coverData: true,
})
```

### WASM 加载配置

#### 默认 CDN（推荐）

无需配置，自动使用 jsdelivr CDN：
```ts
const result = await getMediaInfoFromFile(file)
```

#### 本地路径

```ts
const result = await getMediaInfoFromFile(file, {
  wasmLoader: '/assets/'
})
```

#### 自定义 CDN

```ts
const result = await getMediaInfoFromFile(file, {
  wasmLoader: 'https://your-cdn.com/mediainfo/'
})
```

#### 完全自定义

```ts
const result = await getMediaInfoFromFile(file, {
  wasmLoader: (path) => {
    if (path.endsWith('.wasm')) {
      return `/custom-path/${path}`
    }
    return path
  }
})
```

### 轨道提取工具

```ts
import {
  getVideoTracks,
  getAudioTracks,
  getGeneralTrack,
  getTextTracks
} from 'mediainfo-kit'

const result = await getMediaInfoFromFile(file)

// 获取视频轨道列表
const videoTracks = getVideoTracks(result)
// videoTracks[0].Width, videoTracks[0].Height, videoTracks[0].FrameRate...

// 获取音频轨道列表
const audioTracks = getAudioTracks(result)
// audioTracks[0].SamplingRate, audioTracks[0].Channels...

// 获取容器信息
const general = getGeneralTrack(result)
// general.FileSize, general.Duration, general.OverallBitRate...

// 获取字幕轨道
const textTracks = getTextTracks(result)
```

### 格式化工具

```ts
import {
  formatDuration,
  formatFileSize,
  formatBitRate
} from 'mediainfo-kit'

// 时长格式化（秒 → MM:SS 或 HH:MM:SS）
formatDuration(125.5)  // '02:05'
formatDuration(3661.5) // '01:01:01'

// 文件大小格式化
formatFileSize(1536000)    // '1.46 MB'
formatFileSize(1073741824) // '1.00 GB'

// 比特率格式化
formatBitRate(5000000)  // '5.00 Mbps'
formatBitRate(128000)   // '128.00 Kbps'
```

### 资源释放

```ts
import { closeMediaInfo } from 'mediainfo-kit'

// 释放 MediaInfo 实例（通常不需要手动调用，单例模式自动管理）
closeMediaInfo()
```

## 类型导出

```ts
import type {
  MediaInfoResult,
  Track,
  GeneralTrack,
  VideoTrack,
  AudioTrack,
  TextTrack,
  ImageTrack,
  MenuTrack,
  OtherTrack
} from 'mediainfo-kit'
```

## 常见场景示例

### 场景1：获取视频详细信息并显示

```ts
import {
  getMediaInfoFromFile,
  getVideoTracks,
  getAudioTracks,
  getGeneralTrack,
  formatDuration,
  formatFileSize,
  formatBitRate
} from 'mediainfo-kit'

async function displayVideoInfo(file: File) {
  const result = await getMediaInfoFromFile(file)
  
  const general = getGeneralTrack(result)
  const videoTracks = getVideoTracks(result)
  const audioTracks = getAudioTracks(result)
  
  console.log('文件大小:', formatFileSize(general?.FileSize))
  console.log('总时长:', formatDuration(Number(general?.Duration)))
  console.log('整体比特率:', formatBitRate(Number(general?.OverallBitRate)))
  
  if (videoTracks.length > 0) {
    const video = videoTracks[0]
    console.log('视频分辨率:', `${video.Width}x${video.Height}`)
    console.log('帧率:', video.FrameRate, 'fps')
    console.log('视频编码:', video.Format)
    console.log('视频比特率:', formatBitRate(Number(video.BitRate)))
  }
  
  if (audioTracks.length > 0) {
    const audio = audioTracks[0]
    console.log('音频采样率:', audio.SamplingRate, 'Hz')
    console.log('声道数:', audio.Channels)
    console.log('音频编码:', audio.Format)
  }
}
```

### 场景2：从远程 URL 分析媒体

```ts
import {
  getMediaInfoFromUrl,
  getVideoTracks,
  formatDuration
} from 'mediainfo-kit'

async function analyzeRemoteVideo(url: string) {
  try {
    const result = await getMediaInfoFromUrl(url, {
      retries: 5,
      retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 10000)
    })
    
    const videoTracks = getVideoTracks(result)
    if (videoTracks.length > 0) {
      const video = videoTracks[0]
      return {
        width: video.Width,
        height: video.Height,
        duration: formatDuration(Number(video.Duration)),
        codec: video.Format,
        frameRate: video.FrameRate
      }
    }
  } catch (error) {
    console.error('分析失败:', error)
  }
}
```

### 场景3：批量处理多个文件

```ts
import { getMediaInfoFromFile, getGeneralTrack } from 'mediainfo-kit'

async function batchAnalyze(files: File[]) {
  const results = await Promise.all(
    files.map(async (file) => {
      const info = await getMediaInfoFromFile(file)
      const general = getGeneralTrack(info)
      return {
        name: file.name,
        size: general?.FileSize,
        duration: general?.Duration,
        format: general?.Format
      }
    })
  )
  return results
}
```

### 场景4：检查视频是否满足特定要求

```ts
import { getMediaInfoFromFile, getVideoTracks, getAudioTracks } from 'mediainfo-kit'

interface VideoRequirements {
  minWidth: number
  minHeight: number
  minFrameRate: number
  audioChannels: number
}

async function checkVideoRequirements(
  file: File,
  requirements: VideoRequirements
): Promise<{ valid: boolean; issues: string[] }> {
  const result = await getMediaInfoFromFile(file)
  const videos = getVideoTracks(result)
  const audios = getAudioTracks(result)
  
  const issues: string[] = []
  
  if (videos.length === 0) {
    issues.push('没有视频轨道')
  } else {
    const video = videos[0]
    if (Number(video.Width) < requirements.minWidth) {
      issues.push(`宽度 ${video.Width} 小于最小要求 ${requirements.minWidth}`)
    }
    if (Number(video.Height) < requirements.minHeight) {
      issues.push(`高度 ${video.Height} 小于最小要求 ${requirements.minHeight}`)
    }
    if (Number(video.FrameRate) < requirements.minFrameRate) {
      issues.push(`帧率 ${video.FrameRate} 小于最小要求 ${requirements.minFrameRate}`)
    }
  }
  
  if (audios.length === 0) {
    issues.push('没有音频轨道')
  } else {
    const audio = audios[0]
    if (Number(audio.Channels) < requirements.audioChannels) {
      issues.push(`声道数 ${audio.Channels} 小于要求 ${requirements.audioChannels}`)
    }
  }
  
  return { valid: issues.length === 0, issues }
}
```

## 重要注意事项

1. **单例模式**：MediaInfo 实例会被缓存，重复调用时自动复用，无需手动管理
2. **Range 请求**：`getMediaInfoFromUrl` 使用 Range 请求，服务器必须支持 Range 请求头
3. **WASM 加载**：默认使用 jsdelivr CDN，生产环境建议使用本地 WASM 文件或自有 CDN
4. **错误处理**：URL 方式支持配置重试策略，默认重试 3 次
5. **类型安全**：提供完整的 TypeScript 类型定义

## 相关资源

- [mediainfo.js GitHub](https://github.com/buzz/mediainfo.js)
- [MediaInfo 官方文档](https://mediaarea.net/en/MediaInfo)
