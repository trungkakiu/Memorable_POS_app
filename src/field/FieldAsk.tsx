// Hỏi trợ lý cho khối Sản xuất: nói hoặc chụp ảnh là hỏi được, câu trả lời ngắn, chữ to, có nút "Nghe đọc".
// Trợ lý dùng tài liệu công ty trước, thiếu thì thêm hiểu biết chung (ghi rõ là không phải tài liệu công ty).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Camera, Keyboard, Loader2, MessageCircleQuestion, Mic, RotateCcw, Send, Square, Volume2, VolumeX, X } from 'lucide-react'
import { LocalFile, pickLocalFiles } from '../lib/api'
import { useChat } from '../store/chat'
import { toast } from '../store/ui'
import { Md } from '../components/shared'
import { speak, stopSpeak, useCanSpeak } from './speak'
import { useVoice } from './voice'

// Câu hỏi mẫu cho người chưa biết nên hỏi gì: chạm là hỏi luôn
const EXAMPLES = ['Máy bơm nước không chạy thì làm gì?', 'Cây bị vàng lá là do đâu?', 'Cách bón phân cho rau ăn lá?']

// Bỏ ký hiệu trích nguồn kiểu [1], [#12] cho dễ đọc (nguồn đã ghi riêng ở dưới)
const clean = (t: string) => t.replace(/\s*\[(#?\d+(,\s*#?\d+)*)\]/g, '').trim()

export default function FieldAsk() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const chat = useChat()
  const canSpeak = useCanSpeak()
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const [photo, setPhoto] = useState<LocalFile | null>(null)
  const [reading, setReading] = useState(false)
  const byVoice = useRef(false) // hỏi bằng giọng nói thì tự đọc to câu trả lời
  const voice = useVoice((t) => { if (photo) setText(t); else { byVoice.current = true; void send(t) } })
  // Bấm "Nói để hỏi" / "Chụp ảnh để hỏi" ở trang chủ: bật micro / mở máy ảnh luôn, đỡ một lần bấm
  const auto = useRef(false)
  useEffect(() => {
    if (auto.current) return
    auto.current = true
    const how = sp.get('cach')
    if (how === 'noi') { chat.newConversation(); voice.start() }
    else if (how === 'anh') { chat.newConversation(); void takePhoto() }
  }, []) // eslint-disable-line

  // Khối Sản xuất: tài liệu công ty trước, thiếu thì thêm hiểu biết chung (có ghi rõ)
  useEffect(() => { if (chat.agentId) chat.selectAgent(null); if (chat.mode !== 'hybrid') chat.setMode('hybrid') }, []) // eslint-disable-line
  useEffect(() => () => stopSpeak(), [])

  const last = useMemo(() => {
    // Sau "Hỏi cái khác" chỉ xét các tin nhắn đến sau dòng thông báo bắt đầu hội thoại mới
    const all = chat.msgs
    const cut = all.map((m) => m.role === 'sys' && /hội thoại mới/.test(m.text)).lastIndexOf(true)
    const ms = cut >= 0 ? all.slice(cut + 1) : all
    const ai = [...ms].reverse().find((m) => m.role === 'ai' || m.role === 'sys')
    const q = [...ms].reverse().find((m) => m.role === 'user')
    return { q, ai }
  }, [chat.msgs])

  async function send(t = text) {
    const q = t.trim()
    if (chat.busy) return
    if (photo) {
      setText(''); setTyping(false)
      const f = photo; setPhoto(null)
      await chat.askFile([f], q || 'Ảnh này là gì? Cần làm gì?')
      return
    }
    if (q.length < 3) { toast.warn('Câu hỏi quá ngắn. Vui lòng nói hoặc gõ đầy đủ hơn.'); return }
    setText(''); setTyping(false)
    await chat.ask(q, 'hybrid')
  }
  async function takePhoto() {
    try { const [f] = await pickLocalFiles('camera'); if (f?.bytes) setPhoto(f) } catch (e) { toast.error(e) }
  }
  function again() { stopSpeak(); setReading(false); chat.newConversation(); setPhoto(null); setText('') }
  function read(t: string) {
    if (reading) { stopSpeak(); setReading(false); return }
    if (speak(t, () => setReading(false))) setReading(true)
  }

  const ans = last.ai?.ans
  const answer = last.ai ? clean(last.ai.err || last.ai.text || '') : ''
  const general = ans?.general_knowledge ? clean(ans.general_knowledge) : ''
  const sources = (ans?.sources || []).slice(0, 2)
  // Câu trả lời về: nếu vừa hỏi bằng giọng nói thì đọc to luôn
  const lastId = last.ai ? `${chat.msgs.length}:${answer.length}` : ''
  useEffect(() => {
    if (!byVoice.current || chat.busy || !last.ai || last.ai.err || !answer || !canSpeak) return
    byVoice.current = false
    if (speak([answer, general].filter(Boolean).join('. '), () => setReading(false))) setReading(true)
  }, [lastId, chat.busy, canSpeak]) // eslint-disable-line
  const photoUrl = useMemo(() => (photo?.bytes ? URL.createObjectURL(new Blob([photo.bytes as BlobPart])) : null), [photo])
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }, [photoUrl])

  return (
    <div className="flex flex-col gap-5">
      <h1 className="fd-title">Hỏi trợ lý</h1>

      {(last.q || chat.busy) && (
        <section className="fd-qa">
          {last.q && <div className="fd-you"><small>Bạn hỏi</small>{last.q.text || 'Gửi một tấm ảnh'}</div>}
          {chat.busy ? <div className="fd-wait"><Loader2 size={30} className="animate-spin" />Đang tìm câu trả lời…</div> : last.ai && (
            <div className={clsx('fd-ans', last.ai.err && 'err')}>
              <Md>{answer}</Md>
              {general && <div className="fd-general"><b>Thông tin tham khảo thêm, không có trong tài liệu công ty</b><Md>{general}</Md></div>}
              {sources.length > 0 && <div className="fd-src">Theo: {sources.map((s, i) => <button key={s.id} onClick={() => nav(`/items/${s.id}`)}>{s.title}{i < sources.length - 1 ? ',' : ''}</button>)}</div>}
              <div className="fd-ans-act">
                {canSpeak && !last.ai.err && <button className="fd-btn soft" onClick={() => read([answer, general].filter(Boolean).join('. '))}>{reading ? <VolumeX size={24} /> : <Volume2 size={24} />}{reading ? 'Dừng đọc' : 'Nghe đọc'}</button>}
                <button className="fd-btn soft" onClick={again}><RotateCcw size={22} />Hỏi cái khác</button>
              </div>
            </div>)}
        </section>)}

      {photo && (
        <div className="fd-photo">
          {photoUrl && <img src={photoUrl} alt="Ảnh vừa chụp" />}
          <div className="min-w-0 flex-1"><b>Đã có ảnh</b><span>Nói hoặc gõ câu hỏi về ảnh, hoặc bấm Gửi luôn.</span></div>
          <button className="fd-x" onClick={() => setPhoto(null)} aria-label="Bỏ ảnh"><X size={26} /></button>
        </div>)}

      <div className="fd-ask">
        <button className={clsx('fd-mic', voice.state === 'on' && 'on')} disabled={voice.state === 'busy' || chat.busy} onClick={voice.toggle}
          aria-label={voice.state === 'on' ? 'Chạm để dừng' : 'Chạm để nói'}>
          {voice.state === 'busy' ? <Loader2 size={54} className="animate-spin" /> : voice.state === 'on' ? <Square size={48} /> : <Mic size={58} />}
        </button>
        <div className="fd-mic-label">{voice.state === 'on' ? `Đang nghe… ${voice.secs} giây. Chạm lần nữa để dừng` : voice.state === 'busy' ? 'Đang chuyển lời nói thành chữ…' : photo ? 'Chạm để nói câu hỏi về ảnh' : 'Chạm vào nút rồi nói câu hỏi'}</div>
        <div className="fd-ask-row">
          {!photo && <button className={clsx('fd-btn', sp.get('cach') === 'anh' ? 'primary' : 'soft')} onClick={() => void takePhoto()} disabled={chat.busy}><Camera size={26} />Chụp ảnh</button>}
          <button className="fd-btn soft" onClick={() => setTyping(!typing)}><Keyboard size={24} />{typing ? 'Ẩn ô gõ' : 'Gõ chữ'}</button>
          {photo && <button className="fd-btn primary" disabled={chat.busy} onClick={() => void send()}><Send size={24} />Gửi</button>}
        </div>
        {typing && (
          <div className="fd-type">
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={3} placeholder="Gõ câu hỏi ở đây…" />
            <button className="fd-btn primary" disabled={chat.busy || (!photo && text.trim().length < 3)} onClick={() => void send()}><Send size={24} />Gửi</button>
          </div>)}
      </div>
      {!last.q && !chat.busy && !photo && (
        <div className="fd-eg">
          <p className="fd-cap">Bạn có thể hỏi như:</p>
          {EXAMPLES.map((t) => <button key={t} className="fd-eg-btn" onClick={() => void send(t)}><MessageCircleQuestion size={22} /><span>{t}</span></button>)}
        </div>)}
    </div>)
}
