// Đọc to câu trả lời bằng giọng tiếng Việt có sẵn trên máy (người lớn tuổi, đang làm tay chân, không tiện đọc).
// Máy không có giọng tiếng Việt thì không hiện nút "Nghe đọc" (đọc bằng giọng nước ngoài sẽ sai hết dấu).
import { useEffect, useState } from 'react'
import { plainText } from '../lib/format'

const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)
const viVoice = () => synth()?.getVoices().find((v) => /^vi([-_]|$)/i.test(v.lang)) || null

/** Có đọc to được bằng giọng tiếng Việt không (danh sách giọng nạp chậm nên theo dõi sự kiện voiceschanged) */
export function useCanSpeak() {
  const [ok, setOk] = useState(() => !!viVoice())
  useEffect(() => {
    const s = synth(); if (!s) return
    const h = () => setOk(!!viVoice())
    h(); s.addEventListener('voiceschanged', h)
    return () => s.removeEventListener('voiceschanged', h)
  }, [])
  return ok
}

export function stopSpeak() { synth()?.cancel() }

/** Đọc to đoạn chữ (bỏ ký hiệu Markdown). Trả về false nếu không đọc được. */
export function speak(text: string, onEnd?: () => void): boolean {
  const s = synth(); const v = viVoice()
  if (!s || !v) return false
  s.cancel()
  const u = new SpeechSynthesisUtterance(plainText(text).slice(0, 3000))
  u.lang = 'vi-VN'; u.voice = v; u.rate = 0.92
  u.onend = () => onEnd?.(); u.onerror = () => onEnd?.()
  s.speak(u)
  return true
}
