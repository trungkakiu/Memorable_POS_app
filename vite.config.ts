import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'node:module'

// Cấu hình chung từ .env (electron/appConfig.cjs): giao diện nhận qua hằng __APP_CONFIG__ (src/lib/appConfig.ts),
// còn tiến trình Electron của bản cài đọc dist/app-config.json (bản cài không chứa tệp .env).
const { publicValues } = createRequire(import.meta.url)('./electron/appConfig.cjs')
const appConfig: Plugin = {
  name: 'app-config',
  apply: 'build',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'app-config.json', source: JSON.stringify(publicValues(), null, 2) }) },
}

const csp = {
  name: "inject-csp",
  apply: "build" as const,
  transformIndexHtml: () => [{ tag: "meta", injectTo: "head-prepend" as const, attrs: { "http-equiv": "Content-Security-Policy", content: "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; frame-src blob:; object-src blob:; font-src 'self' data:; connect-src 'self' data: blob:" } }],
}

export default defineConfig({
  base: './',
  define: { __APP_CONFIG__: JSON.stringify(publicValues()) },
  plugins: [react(), tailwindcss(), csp, appConfig],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
})
