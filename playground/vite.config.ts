import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'path'

const mimeTypes: Record<string, string> = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
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

export default defineConfig({
  // plugins: [mimeTypePlugin()],
  server: {
    port: 5174,
  },
  resolve: {
    alias: {
      'mediainfo-kit': resolve(__dirname, '../src/index.ts'),
    },
  },
  // base: './',
  // 将根目录设为静态资源目录，.wasm 文件可被直接访问
  // publicDir: '.',
  // publicDir: 'public',  // 使用专门的 public 目录
  // publicDir: false,
  // assetsInclude: ['**/*.wasm'],  // 将 .wasm 文件作为资源处理
  build: {
    // 排除 .wasm 文件复制到 dist
    // rollupOptions: {
    //   external: [/\.wasm$/],
    // },
  },
})
