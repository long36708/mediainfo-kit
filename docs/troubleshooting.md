# 常见问题排查

## Failed to load module script: Expected a JavaScript-or-Wasm module script

### 错误信息

```
Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML spec.
```

### 根本原因：`publicDir: '.'` 配置问题

这个错误的根本原因是 Vite 配置中设置了 `publicDir: '.'`，导致了一系列问题：

---

## 图解分析

### 1. 正常配置 vs 问题配置的目录结构对比

#### ✅ 正常配置（`publicDir: 'public'`）

```
playground/
├── index.html          ← 入口文件（Vite 处理）
├── vite.config.ts      ← 配置文件（不暴露）
├── package.json        ← 配置文件（不暴露）
├── src/
│   └── main.ts         ← 源代码（Vite 编译处理）
└── public/             ← publicDir 指向这里
    ├── MediaInfo.wasm  ← 静态资源（直接提供）
    └── favicon.ico     ← 静态资源（直接提供）

请求流程：
GET /MediaInfo.wasm → public/MediaInfo.wasm → Content-Type: application/wasm ✅
GET /src/main.ts    → Vite 编译处理         → Content-Type: application/javascript ✅
```

#### ❌ 问题配置（`publicDir: '.'`）

```
playground/             ← publicDir 指向这里（当前目录）
├── index.html          ← 入口文件 + 静态资源（冲突！）
├── vite.config.ts      ← 配置文件被暴露为静态资源 ⚠️
├── package.json        ← 配置文件被暴露为静态资源 ⚠️
├── src/
│   └── main.ts         ← 源代码也被当作静态资源 ⚠️
└── MediaInfo.wasm      ← WASM 文件（这是原本想要的）

问题：
1. 整个 playground 目录都是"静态资源"
2. Vite 无法区分哪些文件需要编译，哪些直接提供
3. 文件查找优先级混乱
```

---

### 2. 请求处理流程图

#### 正常配置的请求流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Vite Dev Server                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  浏览器请求: GET /src/main.ts                                        │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────┐                                                 │
│  │ 是否在 public/  │── 否 ──→ 由 Vite 编译处理                       │
│  │ 目录中？        │         (TypeScript → JavaScript)               │
│  └─────────────────┘         │                                       │
│         │ 是                 ▼                                       │
│         ▼              Content-Type: application/javascript          │
│  直接返回文件内容                                                    │
│         │                                                            │
│         ▼                                                            │
│  (如: GET /MediaInfo.wasm)                                           │
│  Content-Type: application/wasm                                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                        ✅ 浏览器正常执行
```

#### 问题配置的请求流程（导致错误）

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Vite Dev Server                              │
│                      (publicDir: '.')                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  浏览器请求: GET /some-module.js                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────┐                                                 │
│  │ 是否在当前目录  │── 否 ──→ 文件不存在                             │
│  │ (publicDir)中？ │         │                                       │
│  └─────────────────┘         ▼                                       │
│         │ 是           ┌─────────────┐                               │
│         ▼              │ SPA Fallback │                              │
│  直接返回文件          │ 返回 index   │                              │
│  (不经过 Vite 编译)    │ .html        │                              │
│         │              └─────────────┘                               │
│         │                     │                                      │
│         │                     ▼                                      │
│         │              返回 HTML 内容                                │
│         │              Content-Type: text/html                       │
│         │                     │                                      │
└─────────┼─────────────────────┼──────────────────────────────────────┘
          │                     │
          │                     ▼
          │              ❌ 浏览器拒绝执行
          │              "Expected JavaScript module
          │               but got text/html"
          │
          ▼
    也可能出问题：
    .ts 文件被当作静态资源返回
    Content-Type: text/plain
    同样导致模块加载失败
```

---

### 3. 时序图：错误发生的完整过程

```
┌─────────┐          ┌─────────┐          ┌────────────────┐
│ Browser │          │  Vite   │          │ File System    │
└────┬────┘          │  Server │          │ (publicDir: .) │
     │               └────┬────┘          └───────┬────────┘
     │                    │                       │
     │  1. GET /index.html│                       │
     │───────────────────>│                       │
     │                    │                       │
     │  2. 返回 HTML       │                       │
     │<───────────────────│                       │
     │                    │                       │
     │  3. 解析 HTML，发现 │                       │
     │     <script type="module">                 │
     │     import foo from './foo.js'             │
     │                    │                       │
     │  4. GET /foo.js    │                       │
     │───────────────────>│                       │
     │                    │                       │
     │                    │  5. 在 publicDir 中   │
     │                    │     查找 foo.js       │
     │                    │──────────────────────>│
     │                    │                       │
     │                    │  6. 文件不存在        │
     │                    │<──────────────────────│
     │                    │                       │
     │                    │  7. 触发 SPA Fallback │
     │                    │     返回 index.html   │
     │                    │     (当作 404 处理)   │
     │                    │                       │
     │  8. 响应内容:      │                       │
     │     Content-Type:  │                       │
     │     text/html      │                       │
     │     Body: <html>...│                       │
     │<───────────────────│                       │
     │                    │                       │
     │  9. ❌ 报错！       │                       │
     │     "Expected JS   │                       │
     │      but got HTML" │                       │
     │                    │                       │
```

---

### 4. 问题链路图

```
┌──────────────────────────────────────────────────────────────────────┐
│                         问题根因链路                                  │
└──────────────────────────────────────────────────────────────────────┘

    publicDir: '.'
         │
         ▼
┌────────────────────────┐
│ playground 目录本身     │
│ 成为静态资源目录        │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐      ┌────────────────────────┐
│ 配置文件被暴露          │      │ 源代码目录被暴露        │
│ (vite.config.ts 等)    │      │ (src/ 目录)            │
└───────────┬────────────┘      └───────────┬────────────┘
            │                               │
            └───────────┬───────────────────┘
                        │
                        ▼
            ┌────────────────────────┐
            │ Vite 处理优先级混乱     │
            │ - 不知道哪些需要编译   │
            │ - 不知道哪些直接提供   │
            └───────────┬────────────┘
                        │
                        ▼
            ┌────────────────────────┐
            │ 模块请求匹配失败       │
            │ (文件不存在于当前目录) │
            └───────────┬────────────┘
                        │
                        ▼
            ┌────────────────────────┐
            │ SPA Fallback 触发      │
            │ 返回 index.html        │
            └───────────┬────────────┘
                        │
                        ▼
            ┌────────────────────────┐
            │ MIME 类型不匹配        │
            │ 期望: application/js   │
            │ 实际: text/html        │
            └───────────┬────────────┘
                        │
                        ▼
            ┌────────────────────────┐
            │ ❌ 浏览器拒绝执行       │
            │ 抛出错误               │
            └────────────────────────┘
```

---

### 5. MIME 类型检查机制

```
┌─────────────────────────────────────────────────────────────────────┐
│              浏览器 ES Module MIME 类型检查                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  当浏览器遇到 <script type="module"> 时：                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     响应检查流程                             │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                             │   │
│  │   请求模块文件                                               │   │
│  │        │                                                    │   │
│  │        ▼                                                    │   │
│  │   ┌──────────────────┐                                      │   │
│  │   │ 检查 Content-Type │                                      │   │
│  │   └────────┬─────────┘                                      │   │
│  │            │                                                │   │
│  │            ▼                                                │   │
│  │   ┌──────────────────────────────────────┐                  │   │
│  │   │ Content-Type 是 JavaScript MIME 类型？│                  │   │
│  │   │ - application/javascript              │                  │   │
│  │   │ - text/javascript                     │                  │   │
│  │   │ - application/ecmascript              │                  │   │
│  │   └──────────────────┬───────────────────┘                  │   │
│  │                      │                                      │   │
│  │            ┌─────────┴─────────┐                            │   │
│  │            │                   │                            │   │
│  │            ▼ 是                 ▼ 否                         │   │
│  │   ┌──────────────┐     ┌──────────────┐                     │   │
│  │   │ ✅ 执行模块   │     │ ❌ 拒绝执行   │                     │   │
│  │   │              │     │              │                     │   │
│  │   │ 解析 JS 代码  │     │ 抛出错误：    │                     │   │
│  │   │ 处理导出导入  │     │ "Expected a  │                     │   │
│  │   │              │     │ JavaScript   │                     │   │
│  │   │              │     │ module..."   │                     │   │
│  │   └──────────────┘     └──────────────┘                     │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  注意：这是 HTML 规范强制要求，浏览器严格遵守，无法绕过             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## `publicDir` 的作用

`publicDir` 指定静态资源目录，该目录下的文件会被原样复制到构建输出目录，并在开发服务器中直接提供服务。

```ts
export default defineConfig({
  publicDir: '.',  // 将当前目录设为静态资源目录
})
```

## 原始意图

原始配置的意图是让 `.wasm` 文件可以被直接访问：

```ts
publicDir: '.',  // 期望 WASM 文件可被直接访问
```

但这导致了上述问题。正确的做法是：

### 解决方案

#### 方案一：创建专门的 public 目录（推荐）

```ts
export default defineConfig({
  publicDir: 'public',  // 使用专门的 public 目录
})
```

然后将 WASM 文件放在 `playground/public/` 目录中。

#### 方案二：使用 `assetsInclude` 配置

```ts
export default defineConfig({
  publicDir: false,  // 禁用 publicDir
  assetsInclude: ['**/*.wasm'],  // 将 .wasm 文件作为资源处理
})
```

#### 方案三：使用 CDN 加载 WASM（推荐）

在主库中，WASM 文件默认从 jsdelivr CDN 加载：

```ts
const DEFAULT_WASM_CDN = 'https://cdn.jsdelivr.net/npm/mediainfo.js@0.3.7/dist/'
```

playground 中如果需要本地 WASM，应该：

1. 创建 `playground/public/` 目录
2. 将 WASM 文件放入该目录
3. 配置 `publicDir: 'public'`
4. 在代码中指定 WASM 路径：

```ts
const wasmOptions = {
  wasmLoader: '/MediaInfoModule.wasm'  // 指向 public 目录中的文件
}
```

### 补充说明：MIME 类型中间件

如果服务器返回的静态资源缺少正确的 `Content-Type` 头，可以添加中间件修复：

```ts
import { defineConfig, type Plugin } from 'vite'

const mimeTypes: Record<string, string> = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.wasm': 'application/wasm',
  // ... 其他类型
}

function mimeTypePlugin(): Plugin {
  return {
    name: 'mime-type-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || ''
        for (const [ext, mime] of Object.entries(mimeTypes)) {
          if (url.endsWith(ext)) {
            res.setHeader('Content-Type', mime)
            break
          }
        }
        next()
      })
    },
  }
}
```

但请注意，这只是修复 MIME 类型的辅助手段，不能解决 `publicDir` 配置不当导致的根本问题。
