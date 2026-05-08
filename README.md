# mediainfo-kit

[mediainfo.js](https://github.com/buzz/mediainfo.js) 的工具套件，提供多数据源支持和格式化工具。

## 特性

- 📦 **多数据源支持** - File、URL、ArrayBuffer、Blob
- 🔄 **单例模式** - 自动缓存和资源管理
- 🎯 **类型安全** - 完整 TypeScript 支持
- 🛠️ **格式化工具** - 时长、文件大小、比特率格式化
- 🌐 **灵活的 WASM 加载** - 支持 CDN、本地路径或自定义加载器
- ⚡ **MP4 Moov 检测** - 快速判断 MP4 是否为 web optimized(无需 WASM)
- 🔍 **统一 Probe API** - 一次调用完成格式检测 + 元信息 + moov 位置

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

### MP4 Moov 位置检测

快速检测 MP4 文件中 moov box 的位置,判断是否为 web optimized。

**优势:**
- ⚡ 无需加载 WASM,纯 JavaScript 实现
- 🚀 超快速,只需读取文件头部/尾部
- 💾 内存友好,大文件不会加载到内存
- 🌐 网络优化,URL 检测使用 Range 请求

```ts
import { detectMoovLocation } from 'mediainfo-kit'

// 检测本地文件
const result = await detectMoovLocation(file)
console.log(result.location) // 'front' | 'back' | 'unknown'

// 检测远程视频
const result = await detectMoovLocation('https://example.com/video.mp4')

// 检测内存缓冲区
const result = await detectMoovLocation(arrayBuffer)
```

**返回值:**
```ts
interface MoovLocationResult {
  location: 'front' | 'back' | 'unknown'
  moovOffset?: number    // moov 偏移量
  moovSize?: number      // moov 大小
  fileSize?: number      // 文件总大小
  detected: boolean      // 是否检测成功
}
```

**使用场景:**
```ts
// 判断是否为 Web Optimized
const result = await detectMoovLocation(file)
if (result.location === 'front') {
  console.log('✅ 已优化 - 支持流式播放')
} else if (result.location === 'back') {
  console.log('⚠️ 未优化 - 建议转换')
  console.log('使用命令: ffmpeg -i input.mp4 -movflags faststart output.mp4')
}

// 播放器预加载策略
if (result.location === 'front') {
  videoElement.src = url
  videoElement.play()  // 可以立即播放
} else {
  await preloadVideo(url)  // 需要先缓冲
  videoElement.play()
}
```

**配置选项:**
```ts
await detectMoovLocation(file, {
  frontChunkSize: 256 * 1024,  // 前部检测块大小(默认 256KB)
  backChunkSize: 64 * 1024     // 后部检测块大小(默认 64KB)
})
```

📖 详细文档: [docs/moov-detection.md](docs/moov-detection.md)

### 统一 Probe API

`probe()` 函数提供一站式媒体文件分析,一次调用完成:
1. **快速格式检测**(无需 WASM)
2. **详细元信息探测**(需要 WASM)
3. **(可选) moov 位置检测**

```ts
import { probe } from 'mediainfo-kit'

// 基本用法
const result = await probe(file)
console.log(result.format.format) // 'mp4' | 'mov' | 'avi' | etc.
console.log(result.metadata.media?.track)

// 启用 moov 检测
const result = await probe('https://example.com/video.mp4', {
  detectMoov: true
})
console.log(result.moovLocation?.location) // 'front' | 'back'
```

**返回值:**
```ts
interface UnifiedProbeResult {
  format: FormatDetectResult       // 格式检测结果
  metadata: MediaInfoResult        // 元信息
  moovLocation?: MoovLocationResult // moov 位置(可选)
  sourceType: 'file' | 'url' | 'buffer' | 'blob'
}
```

**支持的输入类型:**
- `File` - 本地文件对象
- `string` - URL (包括 blob: URL)
- `ArrayBuffer` - 内存缓冲区

### 快速格式检测

如果只需要知道文件格式,不需要详细信息,可以使用 `detectFormat()`,它**无需加载 WASM**,速度极快:

```ts
import { detectFormat } from 'mediainfo-kit'

const format = await detectFormat(file)
console.log(format.format)     // 'mp4' | 'mov' | 'avi' | 'mkv' | etc.
console.log(format.mimeType)   // 'video/mp4'
console.log(format.confidence) // 0-1 置信度
```

**支持的格式:**
- MP4, MOV, AVI, WMV, MKV, FLV, TS
- HIK (海康私有格式)
- RTP 流

### MediaInfoProbe 类

面向对象的 API,提供更好的状态管理和资源控制:

```ts
import { MediaInfoProbe } from 'mediainfo-kit'

const probe = new MediaInfoProbe({
  chunkSize: 256 * 1024,
  retries: 3
})

const result = await probe.probeFromFile(file)

// 使用完毕后释放资源
probe.destroy()
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
