// Nói thành chữ tiếng Việt chạy ngay trên máy (Vosk, mô hình đóng gói sẵn trong public/vosk) — giọng nói không rời khỏi máy.
// Lần đầu nạp mô hình mất vài giây; sau đó mô hình được giữ trong bộ nhớ đệm của ứng dụng (IndexedDB).
import type { Model } from 'vosk-browser'

let modelP: Promise<Model> | null = null
const asset = (p: string) => new URL('./vosk/' + p, document.baseURI).href

export function loadSttModel(): Promise<Model> {
  if (!modelP) {
    modelP = (async () => {
      const { createModel } = await import('vosk-browser')
      // Thư viện tạo worker từ blob: (kế thừa CSP chặt của trang và bị chặn). Trong lúc tạo mô hình,
      // chuyển hướng sang bản worker tách sẵn ở public/vosk/vosk-worker.js (scripts/copy-vosk.cjs).
      const Orig = window.Worker
      window.Worker = class extends Orig { constructor(url: string | URL, opts?: WorkerOptions) { super(String(url).startsWith('blob:') ? asset('vosk-worker.js') : url, opts) } } as typeof Worker
      let p: Promise<Model>
      try { p = createModel(asset('vi.tar.gz'), -1) } finally { window.Worker = Orig }
      return await Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('quá thời gian nạp mô hình')), 120000))])
    })().catch((e) => { modelP = null; throw e ?? new Error('không rõ lỗi') })
  }
  return modelP
}

export type DictationState = 'loading' | 'listening' | 'stopped'
export interface DictationHandlers {
  onPartial?: (text: string) => void        // chữ tạm thời đang nghe
  onFinal?: (text: string) => void          // một đoạn câu đã chốt
  onLevel?: (level: number) => void         // âm lượng 0..1 để vẽ sóng
  onState?: (s: DictationState) => void
}
export interface Dictation { stop: () => Promise<void>; cancel: () => void }

/** Bắt đầu nghe micro và chuyển thành chữ. Ném lỗi có thông báo tiếng Việt nếu không dùng được micro. */
export async function startDictation(h: DictationHandlers): Promise<Dictation> {
  h.onState?.('loading')
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
  } catch (e) {
    const n = (e as DOMException).name
    throw new Error(n === 'NotAllowedError' ? 'Máy chưa cho ứng dụng dùng micro. Hãy bật quyền micro trong Cài đặt Windows › Quyền riêng tư › Micro.'
      : n === 'NotFoundError' ? 'Không tìm thấy micro nào trên máy.' : 'Không mở được micro: ' + ((e as Error).message || n))
  }
  let model: Model
  try { model = await loadSttModel() } catch (e) { stream.getTracks().forEach((t) => t.stop()); throw new Error('Không nạp được bộ nhận dạng giọng nói: ' + String((e as Error)?.message || e || 'lỗi không rõ')) }

  const ctx = new AudioContext()
  const rec = new model.KaldiRecognizer(ctx.sampleRate)
  let done = false
  rec.on('result', (m) => { const t = ((m as { result?: { text?: string } }).result?.text || '').trim(); if (t) h.onFinal?.(t) })
  rec.on('partialresult', (m) => { if (!done) h.onPartial?.(((m as { result?: { partial?: string } }).result?.partial || '').trim()) })

  const src = ctx.createMediaStreamSource(stream)
  // ScriptProcessor đơn giản và đủ dùng cho câu ngắn; Vosk tự xử lý lấy mẫu lại.
  const proc = ctx.createScriptProcessor(4096, 1, 1)
  proc.onaudioprocess = (ev) => {
    if (done) return
    const buf = ev.inputBuffer
    try { rec.acceptWaveform(buf) } catch { /* bỏ qua khung lỗi */ }
    const d = buf.getChannelData(0); let s = 0
    for (let i = 0; i < d.length; i += 16) s += d[i] * d[i]
    h.onLevel?.(Math.min(1, Math.sqrt(s / (d.length / 16)) * 6))
  }
  src.connect(proc); proc.connect(ctx.destination)
  h.onState?.('listening')

  const close = () => {
    done = true
    try { proc.disconnect(); src.disconnect() } catch { /* đã ngắt */ }
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close().catch(() => undefined)
    h.onState?.('stopped')
  }
  return {
    // Dừng và lấy nốt phần câu cuối cùng
    stop: () => new Promise<void>((resolve) => {
      if (done) return resolve()
      try { proc.disconnect(); src.disconnect() } catch { /* đã ngắt */ }
      let fin = false
      const finish = () => { if (fin) return; fin = true; try { rec.remove() } catch { /* đã gỡ */ } ; close(); resolve() }
      rec.on('result', () => setTimeout(finish, 0))
      try { rec.retrieveFinalResult() } catch { finish() }
      setTimeout(finish, 1500)
    }),
    cancel: () => { try { rec.remove() } catch { /* đã gỡ */ } ; close() },
  }
}

/** Viết hoa chữ cái đầu câu (Vosk trả chữ thường, không dấu câu). */
export const sentenceCase = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('vi-VN') + s.slice(1) : s)

// Móc kiểm thử cho smoke test của bản đóng gói (không ảnh hưởng người dùng).
if (typeof window !== 'undefined') (window as unknown as { __stt?: unknown }).__stt = { loadSttModel }
