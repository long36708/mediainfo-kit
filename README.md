# mediainfo-kit

[mediainfo.js](https://github.com/buzz/mediainfo.js) 的工具套件，提供多数据源支持和格式化工具。

## 特性

- 📦 **多数据源支持** - File、URL、ArrayBuffer、Blob
- 🔄 **单例模式** - 自动缓存和资源管理
- 🎯 **类型安全** - 完整 TypeScript 支持
- 🛠️ **格式化工具** - 时长、文件大小、比特率格式化
- 🌐 **灵活的 WASM 加载** - 支持 CDN、本地路径或自定义加载器

## 安装

```bash
npm install mediainfo-kit mediainfo.js
# 或
pnpm add mediainfo-kit mediainfo.js
```

## 快速开始

```ts
import { getMediaInfoFromFile, getVideoTracks, formatDuration } from 'mediainfo-kit'

// 从文件获取媒体信息
const result = await getMediaInfoFromFile(file)

// 提取视频轨道
const videoTracks = getVideoTracks(result)

// 格式化时长
const duration = formatDuration(videoTracks[0].Duration)
console.log(`时长: ${duration}`)
```

## API

### 数据源方法

#### `getMediaInfoFromFile(file, options?)`

从 File 对象获取媒体信息。

```ts
const result = await getMediaInfoFromFile(file)
```

#### `getMediaInfoFromUrl(url, options?)`

从 URL 获取媒体信息（支持 Range 请求，无需下载完整文件）。

```ts
const result = await getMediaInfoFromUrl('https://example.com/video.mp4')
```

#### `getMediaInfoFromBuffer(buffer, options?)`

从 ArrayBuffer 获取媒体信息。

```ts
const result = await getMediaInfoFromBuffer(arrayBuffer)
```

#### `getMediaInfoFromBlob(blob, options?)`

从 Blob 对象获取媒体信息。

```ts
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
  /**
   * WASM 文件加载方式
   * - string: 基础路径（如 '/assets/' 或 'https://cdn.example.com/'）
   * - function: 自定义 locateFile 函数
   * - 未指定: 使用 jsdelivr CDN
   */
  wasmLoader?: string | ((path: string) => string)
}
```

### WASM 加载配置

#### 默认 CDN（推荐）

无需配置，自动使用 jsdelivr CDN：

```ts
const result = await getMediaInfoFromFile(file)
```

#### 本地路径

将 WASM 文件放到你的静态资源目录：

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

// 获取音频轨道列表
const audioTracks = getAudioTracks(result)

// 获取容器信息
const general = getGeneralTrack(result)

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

// 时长格式化（秒 → MM:SS.mmm 或 HH:MM:SS.mmm）
formatDuration(125.5)  // '02:05.500'
formatDuration(3661.5) // '01:01:01.500'

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

// 释放 MediaInfo 实例（通常不需要手动调用）
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

## 与原包对比

| 特性 | mediainfo.js | mediainfo-kit |
|------|--------------|---------------|
| 基础解析 | ✅ | ✅ |
| 多数据源 | 手动实现 | 内置支持 |
| WASM 配置 | 手动配置 | 灵活配置项 |
| 格式化工具 | 无 | 内置 |
| TypeScript | ✅ | ✅ |

## License

MIT
