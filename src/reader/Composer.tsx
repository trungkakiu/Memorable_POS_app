import { ClipboardEvent, DragEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ArrowRight, ArrowUp, AudioLines, Check, FileSearch, GitCompare, Globe2, History, ImagePlus, Lightbulb, Loader2, Mic, Paperclip, Plus, Sparkles, Square, X } from 'lucide-react'
import { LocalFile, checkFile, fromBrowserFile, isAudioName, pickLocalFiles } from '../lib/api'
import { Recorder, startRecorder, sttError, transcribeFile } from '../lib/stt'
import { queueAudio } from '../components/Transcribe'
import { PolicySelect } from '../components/Knowledge'
import { useChat } from '../store/chat'
import { toast } from '../store/ui'
import { TYPE_ICON } from './common'
import { queueMyFile } from './fileQueue'
import { useLearnedSuggestions } from './Assistant'

const BARS = 28
const MAX_DICTATION = 5 * 60 // nói tối đa 5 phút một lần

/** Khung hỏi trợ lý kiểu ChatGPT: nút +, đính tệp, nói thành chữ, gửi. */
export default function Composer({ onSend, placeholder = 'Hỏi trợ lý bất cứ điều gì…' }: { onSend: (text: string) => void; placeholder?: string }) {
  const nav = useNavigate()
  const chat = useChat()
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState(false)
  const [over, setOver] = useState(false)
  const [mic, setMic] = useState<'off' | 'loading' | 'on' | 'finishing'>('off')
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0))
  const [secs, setSecs] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const rec = useRef<Recorder | null>(null)
  const canGeneral = !chat.status || chat.status.features.includes('ask_hybrid')
  const general = chat.mode === 'hybrid'
  const canWeb = !chat.status || chat.status.features.includes('web_search')
  const web = chat.mode === 'web'
  const [sugg, clearSugg] = useLearnedSuggestions(q, !chat.busy && canWeb)
  const canStt = !chat.status || chat.status.features.includes('transcribe')

  useEffect(() => { const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  useEffect(() => () => rec.current?.cancel(), [])
  useEffect(() => { if (mic !== 'on') return; setSecs(0); const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t) }, [mic])
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(220, el.scrollHeight) + 'px' }, [q])

  const join = (a: string, b: string) => (a && b ? a.replace(/\s+$/, '') + ' ' + b : a || b)
  function send() {
    const t = q.trim(); if (t.length < 3 || chat.busy || mic !== 'off') return
    setQ(''); onSend(t)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  // ---- Tệp: chuyển sang "Hỏi về tệp của tôi", mang theo câu hỏi đang gõ ----
  async function useFile(f: LocalFile | LocalFile[]) {
    const ok = (Array.isArray(f) ? f : [f]).filter((x) => { const bad = checkFile(x); if (bad) toast.warn(`${x.name}: ${bad}`); return !bad }).slice(0, 5)
    if (!ok.length) return
    // File ghi âm: sang trang chép lời
    const audio = ok.find((x) => isAudioName(x.name))
    if (audio) { queueAudio(audio); nav('/transcribe'); return }
    queueMyFile(ok, q.trim() || undefined); setQ(''); nav('/my-file')
  }
  async function pick(images?: boolean) { setMenu(false); try { const list = await pickLocalFiles(!!images); if (list.length) await useFile(list) } catch (e) { toast.error(e) } }
  async function onDrop(e: DragEvent) { e.preventDefault(); setOver(false); const list = Array.from(e.dataTransfer.files); if (list.length) await useFile(await Promise.all(list.map(fromBrowserFile))) }
  async function onPaste(e: ClipboardEvent) {
    const f = Array.from(e.clipboardData?.files || [])[0]; if (!f) return
    e.preventDefault(); await useFile(await fromBrowserFile(new File([f], f.name && f.name !== 'image.png' ? f.name : `anh-chup-${Date.now()}.png`, { type: f.type })))
  }

  // ---- Nói thành chữ: ghi âm trong ứng dụng, dừng lại thì AI trên máy chủ chép lời (có dấu câu, đúng tên riêng và con số) ----
  async function startMic() {
    if (mic !== 'off') return
    if (!canStt) return toast.warn('Tính năng nói thành chữ bằng AI đang tắt. Hãy báo quản trị viên.')
    setLevels(Array(BARS).fill(0)); setMic('loading')
    try {
      rec.current = await startRecorder({ onLevel: (l) => setLevels((x) => [...x.slice(1), l]), maxSeconds: MAX_DICTATION, onLimit: () => { toast.info('Đã nghe 5 phút, tự dừng để chép lời.'); void stopMic() } })
      setMic('on')
    } catch (e) { setMic('off'); toast.error((e as Error).message) }
  }
  async function stopMic() {
    const r = rec.current; if (!r) return
    rec.current = null; setMic('finishing')
    try {
      const f = await r.stop()
      if (!f) { toast.warn('Chưa nghe thấy gì. Hãy thử lại và nói gần micro hơn.'); return }
      const said = (await transcribeFile(f)).text.replace(/\s+/g, ' ').trim()
      if (!said) toast.warn('Không nghe rõ lời nói. Hãy thử lại.')
      else setQ((cur) => join(cur, said).slice(0, 500))
    } catch (e) { toast.error(sttError(e)) } finally { setMic('off'); ta.current?.focus() }
  }
  function cancelMic() { rec.current?.cancel(); rec.current = null; setMic('off') }

  const shown = q
  const recording = mic === 'on' || mic === 'finishing'
  return (
    <div className={clsx('rd-composer', over && 'over', recording && 'rec')} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <div className="cmp-top">
        <span className="ai-badge" aria-hidden><Sparkles size={20} /></span>
        <textarea ref={ta} rows={1} value={shown} maxLength={500} readOnly={mic !== 'off'} placeholder={mic === 'loading' ? 'Đang mở micro…' : web ? 'Hỏi điều cần tra cứu trên Internet (có ghi nguồn)…' : placeholder} aria-label="Câu hỏi cho trợ lý"
          onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} onPaste={(e) => void onPaste(e)} />
      </div>

      <div className="cmp-bar">
        <div className="relative" ref={menuRef}>
          <button className={clsx('cmp-ico', menu && 'on')} onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu} title="Thêm tệp, ảnh và công cụ" disabled={recording}><Plus size={20} /></button>
          {menu && (
            <div className="cmp-menu" role="menu">
              <button role="menuitem" onClick={() => void pick()}><Paperclip size={18} /><span><b>Tải tệp lên để hỏi</b><small>PDF, Word, Excel, PowerPoint, văn bản</small></span></button>
              <button role="menuitem" onClick={() => { setMenu(false); nav('/transcribe') }}><AudioLines size={18} /><span><b>Chép lời ghi âm</b><small>File ghi âm cuộc họp, cuộc gọi thành chữ</small></span></button>
              <button role="menuitem" onClick={() => void pick(true)}><ImagePlus size={18} /><span><b>Thêm ảnh</b><small>Ảnh chụp, ảnh màn hình (hoặc dán Ctrl+V)</small></span></button>
              <div className="sep" />
              <button role="menuitem" onClick={() => { setMenu(false); nav('/my-file') }}><FileSearch size={18} /><span><b>Hỏi về tệp của tôi</b><small>Đọc ngay trên máy, không lưu lên máy chủ</small></span></button>
              <button role="menuitem" onClick={() => { setMenu(false); nav('/compare') }}><GitCompare size={18} /><span><b>So sánh các bài</b><small>Bài nào đúng hơn?</small></span></button>
              <button role="menuitem" onClick={() => { setMenu(false); nav('/browse/type/prompt') }}><TYPE_ICON.prompt size={18} /><span><b>Câu lệnh AI mẫu</b><small>Điền thông tin rồi sao chép</small></span></button>
            </div>)}
        </div>

        {recording ? (
          <div className="cmp-wave" aria-live="polite">
            <span className="dot" /><span className="tm">{String(Math.floor(secs / 60)).padStart(1, '0')}:{String(secs % 60).padStart(2, '0')}</span>
            <span className="bars">{levels.map((l, i) => <i key={i} style={{ height: `${Math.max(8, Math.round(l * 100))}%` }} />)}</span>
            <span className="hint">{mic === 'finishing' ? 'AI đang chép lời…' : 'Đang nghe — nói xong bấm ✓'}</span>
          </div>
        ) : (
          <>
            {canGeneral && <button className={clsx('cmp-chip', general && 'on')} aria-pressed={general} onClick={() => chat.setMode(general ? 'documents' : 'hybrid')} title="Cho phép bổ sung kiến thức chung, có ghi rõ phần nào ngoài tài liệu"><Lightbulb size={16} />Kiến thức chung</button>}
            {canWeb && <button className={clsx('cmp-chip', web && 'on')} aria-pressed={web} onClick={() => chat.setMode(web ? 'documents' : 'web')} title="Tìm trên Internet, ưu tiên trang chính thống; luôn ghi nguồn và kiểm tra nguồn"><Globe2 size={16} />Tìm trên Internet</button>}
            {!web && <span className="cmp-pol" title="Nguồn tài liệu trợ lý được dùng"><PolicySelect plain value={chat.policy} onChange={chat.setPolicy} /></span>}
          </>)}

        <div className="cmp-right">
          {recording ? (<>
            <button className="cmp-ico" onClick={cancelMic} disabled={mic === 'finishing'} title="Hủy, bỏ phần vừa nói" aria-label="Hủy ghi âm"><X size={19} /></button>
            <button className="cmp-ico ok" onClick={() => void stopMic()} disabled={mic === 'finishing'} title="Xong, để AI chép thành chữ" aria-label="Dừng ghi âm">{mic === 'finishing' ? <Loader2 size={19} className="animate-spin" /> : <Check size={20} />}</button>
          </>) : (<>
            <button className={clsx('cmp-ico', mic === 'loading' && 'on')} onClick={() => void startMic()} disabled={mic === 'loading'} title={canStt ? 'Nói để nhập câu hỏi (AI chép lời)' : 'Nói thành chữ bằng AI đang tắt'} aria-label="Nói thành chữ">{mic === 'loading' ? <Loader2 size={19} className="animate-spin" /> : <Mic size={19} />}</button>
            <button className="cmp-send" onClick={send} disabled={q.trim().length < 3 || chat.busy} aria-label="Gửi câu hỏi" title="Gửi (Enter)">{chat.busy ? <Square size={15} fill="currentColor" /> : <ArrowUp size={21} />}</button>
          </>)}
        </div>
      </div>
      {sugg.length > 0 && mic === 'off' && (
        <div className="ask-sugg !m-3 !mt-0" aria-live="polite">
          <div className="cap"><Sparkles size={14} />Đã có câu trả lời kiểm chứng cho câu hỏi tương tự — bấm để xem ngay:</div>
          {sugg.map((s) => <button key={s.id} onClick={() => { setQ(''); clearSugg(); chat.setOpen(true); void chat.openLearned(s.id) }}><History size={15} /><span className="flex-1 min-w-0"><b>{s.question}</b><small>{s.topic} · kiểm chứng {new Date(s.learned_at).toLocaleDateString('vi-VN')}</small></span><ArrowRight size={15} /></button>)}
        </div>)}
      {over && <div className="cmp-drop"><Paperclip size={22} />Thả tệp vào đây để hỏi về tệp</div>}
    </div>)
}
