# MP4 Moov 位置检测使用指南

## 概述

MP4 moov 位置检测功能用于判断 MP4 文件中 moov box(元数据)的位置,这对于视频播放优化非常重要。

### 为什么需要检测 moov 位置?

- **Web Optimized MP4**: moov 在文件头部,可以边下载边播放(流式播放)
- **Non-Optimized MP4**: moov 在文件尾部,需要下载完整文件才能播放
- 播放器可以根据 moov 位置选择合适的加载策略

## API 参考

### detectMoovLocation (统一入口)

根据输入类型自动选择检测方式。

```typescript
import { detectMoovLocation } from 'mediainfo-kit'

// 检测本地文件
const result = await detectMoovLocation(file)

// 检测远程视频
const result = await detectMoovLocation('https://example.com/video.mp4')

// 检测内存缓冲区
const result = await detectMoovLocation(arrayBuffer)
```

**参数:**
- `source`: File | string | ArrayBuffer - 输入源
- `options` (可选):
  - `frontChunkSize?: number` - 前部检测块大小(默认 256KB)
  - `backChunkSize?: number` - 后部检测块大小(默认 64KB)
  - `retries?: number` - 重试次数(默认 3)
  - `retryDelay?: number | ((attempt: number) => number)` - 重试延迟(默认 1000ms)

**返回:** `Promise<MoovLocationResult>`

### detectMoovFromFile

专门用于检测本地文件。

```typescript
import { detectMoovFromFile } from 'mediainfo-kit'

const result = await detectMoovFromFile(file, {
  frontChunkSize: 512 * 1024 // 自定义检测块大小
})
```

### detectMoovFromUrl

专门用于检测远程 URL,支持 Range 请求优化。

```typescript
import { detectMoovFromUrl } from 'mediainfo-kit'

const result = await detectMoovFromUrl('https://example.com/video.mp4', {
  frontChunkSize: 256 * 1024,
  backChunkSize: 64 * 1024,
  retries: 3,
  retryDelay: 1000
})
```

### detectMoovFromBuffer

专门用于检测内存中的 ArrayBuffer。

```typescript
import { detectMoovFromBuffer } from 'mediainfo-kit'

const result = detectMoovFromBuffer(buffer, fileSize)
```

## 返回值类型

```typescript
interface MoovLocationResult {
  /** moov 位置 */
  location: 'front' | 'back' | 'unknown'
  
  /** moov 盒子在文件中的偏移量 */
  moovOffset?: number
  
  /** moov 盒子大小 */
  moovSize?: number
  
  /** 文件总大小 */
  fileSize?: number
  
  /** 检测是否完成 */
  detected: boolean
}
```

## 使用场景

### 1. 判断是否为 Web Optimized

```typescript
const result = await detectMoovLocation(file)

if (result.location === 'front') {
  console.log('✅ Web Optimized MP4 - 支持流式播放')
  // 可以直接使用 video 标签播放
} else if (result.location === 'back') {
  console.log('⚠️ Non-Optimized MP4 - 需要转换')
  // 建议使用 ffmpeg 转换: ffmpeg -i input.mp4 -movflags faststart output.mp4
} else {
  console.log('❓ 无法确定 moov 位置')
}
```

### 2. 播放器预加载策略

```typescript
async function loadVideo(url: string) {
  const moovResult = await detectMoovLocation(url)
  
  if (moovResult.location === 'front') {
    // moov 在头部,可以立即开始播放
    videoElement.src = url
    videoElement.play()
  } else {
    // moov 在尾部,需要先缓冲足够数据
    showLoadingIndicator()
    await preloadVideo(url, moovResult.moovOffset)
    videoElement.src = url
    videoElement.play()
  }
}
```

### 3. 批量检测工具

```typescript
async function batchCheckFiles(files: File[]) {
  const results = []
  
  for (const file of files) {
    const result = await detectMoovLocation(file)
    results.push({
      name: file.name,
      size: file.size,
      moovLocation: result.location,
      isOptimized: result.location === 'front'
    })
  }
  
  return results
}
```

### 4. 与 MediaInfo 结合使用

```typescript
import { detectMoovLocation, getMediaInfoFromFile } from 'mediainfo-kit'

async function analyzeVideo(file: File) {
  // 先快速检测 moov 位置
  const moovResult = await detectMoovLocation(file)
  
  // 再获取详细媒体信息
  const mediaInfo = await getMediaInfoFromFile(file)
  
  return {
    moovLocation: moovResult.location,
    isWebOptimized: moovResult.location === 'front',
    duration: mediaInfo.media?.track?.find(t => t['@type'] === 'General')?.Duration,
    // ... 其他信息
  }
}
```

## 性能优化建议

### 1. 调整检测块大小

```typescript
// 对于大文件,可以减小检测块以提高速度
const result = await detectMoovLocation(largeFile, {
  frontChunkSize: 128 * 1024,  // 只检测前 128KB
  backChunkSize: 32 * 1024     // 只检测后 32KB
})
```

### 2. 缓存检测结果

```typescript
const moovCache = new Map<string, MoovLocationResult>()

async function getCachedMoovLocation(file: File) {
  const key = `${file.name}-${file.size}-${file.lastModified}`
  
  if (moovCache.has(key)) {
    return moovCache.get(key)!
  }
  
  const result = await detectMoovLocation(file)
  moovCache.set(key, result)
  return result
}
```

### 3. 并行检测

```typescript
// 同时检测多个文件
const files = [file1, file2, file3]
const results = await Promise.all(
  files.map(file => detectMoovLocation(file))
)
```

## 注意事项

1. **非 MP4 文件**: 对于非 MP4/MOV 格式的文件,detected 可能为 false
2. **网络请求**: URL 检测需要服务器支持 Range 请求
3. **大文件**: 默认只读取头部/尾部,不会加载整个文件到内存
4. **扩展大小**: 支持 MP4 extended size boxes (size = 1)

## 错误处理

```typescript
try {
  const result = await detectMoovLocation(url)
  if (!result.detected) {
    console.warn('无法确定 moov 位置,可能需要下载更多数据')
  }
} catch (error) {
  console.error('检测失败:', error.message)
  // 可能是网络错误或服务器不支持 Range 请求
}
```

## 完整示例

```typescript
import { detectMoovLocation, formatFileSize } from 'mediainfo-kit'

async function checkVideoOptimization(input: File | string) {
  console.log('🔍 检测视频优化状态...')
  
  const result = await detectMoovLocation(input, {
    frontChunkSize: 256 * 1024,
    backChunkSize: 64 * 1024
  })
  
  console.log(`📊 文件大小: ${formatFileSize(result.fileSize)}`)
  console.log(`📍 Moov 位置: ${result.location}`)
  
  if (result.location === 'front') {
    console.log('✅ 已优化 - 支持流式播放')
    console.log(`   Moov 偏移: ${result.moovOffset} bytes`)
    console.log(`   Moov 大小: ${result.moovSize} bytes`)
  } else if (result.location === 'back') {
    console.log('⚠️ 未优化 - 建议转换为 web optimized')
    console.log('   使用命令: ffmpeg -i input.mp4 -movflags faststart output.mp4')
  } else {
    console.log('❓ 无法确定位置')
  }
  
  return result
}

// 使用示例
const fileInput = document.getElementById('fileInput') as HTMLInputElement
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0]
  if (file) {
    await checkVideoOptimization(file)
  }
})
```
