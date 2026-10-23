// Nói thay gõ: ghi âm bằng micro rồi nhờ máy chủ (AI) chép thành chữ. Dùng chung cho Hỏi trợ lý và Báo hỏng.
import { useEffect, useRef, useState } from 'react'
import { Recorder, startRecorder, sttError, transcribeFile } from '../lib/stt'
import { toast } from '../store/ui'

export type VoiceState = 'off' | 'on' | 'busy'

/** state: off (chưa ghi) · on (đang ghi) · busy (đang chép thành chữ). toggle(): bấm lần 1 bắt đầu, lần 2 dừng và trả chữ. */
export function useVoice(onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('off')
  const [secs, setSecs] = useState(0)
  const rec = useRef<Recorder | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  // Rời trang khi đang ghi thì tắt micro
  useEffect(() => () => { rec.current?.cancel(); rec.current = null; if (timer.current) clearInterval(timer.current) }, [])

  async function stop() {
    const r = rec.current; if (!r) return
    rec.current = null
    if (timer.current) clearInterval(timer.current)
    setState('busy')
    try {
      const file = await r.stop()
      if (!file) { toast.warn('Chưa nghe thấy gì. Bấm nút và nói to, rõ hơn.'); return }
      const t = await transcribeFile(file, { language: 'vi' })
      const text = (t.text || '').trim()
      if (text) onText(text); else toast.warn('Chưa nghe rõ. Vui lòng bấm nút và nói lại.')
    } catch (e) { toast.error(sttError(e)) } finally { setState('off'); setSecs(0) }
  }
  async function start() {
    if (rec.current) return
    try {
      rec.current = await startRecorder({ maxSeconds: 120, onLimit: () => void stop() })
      setState('on'); setSecs(0)
      timer.current = setInterval(() => setSecs((s) => s + 1), 1000)
    } catch (e) { toast.error((e as Error).message) }
  }
  const toggle = () => { if (state === 'on') void stop(); else if (state === 'off') void start() }
  const cancel = () => { rec.current?.cancel(); rec.current = null; if (timer.current) clearInterval(timer.current); setState('off'); setSecs(0) }
  return { state, secs, toggle, cancel, start: () => { if (state === 'off') void start() } }
}
