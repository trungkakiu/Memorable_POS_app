// OCR chạy ngay trên máy (tesseract.js, dữ liệu tiếng Việt + Anh đóng gói sẵn) — ảnh không rời khỏi máy khi đọc chữ.
import type { Worker } from 'tesseract.js'

let workerP: Promise<Worker> | null = null
let onProg: ((p: number) => void) | null = null

const base = () => new URL('./ocr/', document.baseURI).href

async function getWorker(): Promise<Worker> {
  if (!workerP) {
    workerP = (async () => {
      const { createWorker } = await import('tesseract.js')
      return createWorker(['vie', 'eng'], 1, {
        workerPath: base() + 'core/worker.min.js',
        corePath: base() + 'core',
        langPath: base() + 'lang',
        gzip: false,
        workerBlobURL: false,
        cacheMethod: 'none',
        logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProg?.(m.progress) },
      })
    })().catch((e) => { workerP = null; throw e })
  }
  return workerP
}

export interface OcrResult { text: string; confidence: number }
/** Đọc chữ trong một ảnh (Blob / canvas). `onProgress` nhận 0..1. */
export async function ocrImage(src: Blob | HTMLCanvasElement | string, onProgress?: (p: number) => void): Promise<OcrResult> {
  const w = await getWorker()
  onProg = onProgress || null
  try {
    const { data } = await w.recognize(src as never)
    return { text: (data.text || '').replace(/\r/g, '').trim(), confidence: Math.round(data.confidence || 0) }
  } finally { onProg = null }
}

export async function stopOcr() { if (workerP) { const w = await workerP.catch(() => null); workerP = null; await w?.terminate().catch(() => undefined) } }
