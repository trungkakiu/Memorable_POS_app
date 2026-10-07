// Nói / ghi âm thành chữ bằng AI trên máy chủ (POST /ai/transcribe, mô hình speech-to-text của OpenAI).
// Ghi âm micro ngay trong ứng dụng (WebM/Opus, nhỏ gọn), dừng lại thì gửi lên máy chủ để AI chép lời có dấu câu, đúng tên riêng và con số.
// File ghi âm có sẵn (mp3, m4a, wav...) cũng đi cùng đường này. Máy chủ không lưu âm thanh.
import { ApiError, LocalFile, postFiles, AUDIO_MB } from './api'

export interface TranscriptSegment { index: number; start: number; end: number; text: string }
export interface Transcript {
  filename: string; duration_sec: number; language: string; text: string; markdown: string
  segments: TranscriptSegment[]; model: string | null; cost_usd: number; notes: string[]; note?: string
}
export type SttLanguage = 'auto' | 'vi' | 'en'

/** Gửi một file ghi âm cho AI chép lời. `hints`: tên riêng, mã số, thuật ngữ giúp AI nghe đúng hơn. */
export function transcribeFile(file: LocalFile, opts: { language?: SttLanguage; hints?: string } = {}): Promise<Transcript> {
  return postFiles<Transcript>('/ai/transcribe', [file], { language: opts.language, hints: opts.hints?.trim() || undefined }, 1)
}

/** Lỗi chép lời bằng lời dễ hiểu cho người đọc */
export function sttError(e: unknown): string {
  const er = e as ApiError
  if (er?.status === 503) return 'Tính năng chép lời bằng AI đang tắt hoặc chưa được bật. Hãy báo quản trị viên.'
  if (er?.status === 429) return 'Hôm nay bạn đã dùng hết lượt AI, hoặc AI đang quá tải. Hãy thử lại sau.'
  if (er?.status === 413) return `Bản ghi quá dài hoặc quá nặng. Hãy cắt thành các phần ngắn hơn (dưới ${AUDIO_MB} MB).`
  if (er?.status === 415) return 'Không đọc được âm thanh trong tệp này. Hãy lưu lại thành MP3 hoặc M4A rồi thử lại.'
  if (er?.status === 0) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'
  return er?.message || 'Không chép lời được. Hãy thử lại.'
}

export const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

export interface Recorder {
  /** Dừng và trả về file ghi âm (null nếu không ghi được gì) */
  stop: () => Promise<LocalFile | null>
  /** Hủy, bỏ phần đã ghi */
  cancel: () => void
}
export interface RecorderHandlers {
  onLevel?: (level: number) => void   // âm lượng 0..1 để vẽ sóng
  maxSeconds?: number                 // tự dừng sau chừng này giây
  onLimit?: () => void
}

const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || ''

/** Bắt đầu ghi âm từ micro. Ném lỗi có thông báo tiếng Việt nếu không dùng được micro. */
export async function startRecorder(h: RecorderHandlers = {}): Promise<Recorder> {
  if (typeof MediaRecorder === 'undefined') throw new Error('Máy này chưa hỗ trợ ghi âm trong ứng dụng.')
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
  } catch (e) {
    const n = (e as DOMException).name
    throw new Error(n === 'NotAllowedError' ? 'Máy chưa cho ứng dụng dùng micro. Hãy bật quyền micro trong Cài đặt Windows › Quyền riêng tư › Micro.'
      : n === 'NotFoundError' ? 'Không tìm thấy micro nào trên máy.' : 'Không mở được micro: ' + ((e as Error).message || n))
  }
  const mime = pickMime()
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data) }

  // Đo âm lượng để vẽ sóng
  const ctx = new AudioContext()
  const src = ctx.createMediaStreamSource(stream)
  const an = ctx.createAnalyser(); an.fftSize = 512
  src.connect(an)
  const buf = new Uint8Array(an.fftSize)
  let raf = 0
  const tick = () => {
    an.getByteTimeDomainData(buf); let s = 0
    for (let i = 0; i < buf.length; i += 4) { const v = (buf[i] - 128) / 128; s += v * v }
    h.onLevel?.(Math.min(1, Math.sqrt(s / (buf.length / 4)) * 5))
    raf = requestAnimationFrame(tick)
  }
  tick()

  let closed = false
  const close = () => {
    if (closed) return; closed = true
    cancelAnimationFrame(raf); clearTimeout(limit)
    try { src.disconnect() } catch { /* đã ngắt */ }
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close().catch(() => undefined)
  }
  const limit = h.maxSeconds ? setTimeout(() => h.onLimit?.(), h.maxSeconds * 1000) : 0
  rec.start(1000)

  return {
    stop: () => new Promise<LocalFile | null>((resolve) => {
      if (rec.state === 'inactive') { close(); return resolve(null) }
      rec.onstop = async () => {
        close()
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
        if (blob.size < 2000) return resolve(null) // chưa kịp nói gì
        const ext = /ogg/.test(blob.type) ? 'ogg' : 'webm'
        const d = new Date(); const p = (n: number) => String(n).padStart(2, '0')
        resolve({ name: `ghi-am-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`, size: blob.size, bytes: new Uint8Array(await blob.arrayBuffer()) })
      }
      rec.stop()
    }),
    cancel: () => { try { rec.onstop = null; if (rec.state !== 'inactive') rec.stop() } catch { /* đã dừng */ } close() },
  }
}
