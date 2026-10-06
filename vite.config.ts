import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const csp = {
  name: "inject-csp",
  apply: "build" as const,
  transformIndexHtml: () => [{ tag: "meta", injectTo: "head-prepend" as const, attrs: { "http-equiv": "Content-Security-Policy", content: "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; frame-src blob:; object-src blob:; font-src 'self' data:; connect-src 'self' data: blob:" } }],
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), csp],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
})
