import { ClipboardEvent, DragEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ArrowUp, Check, FileSearch, GitCompare, Globe2, ImagePlus, Loader2, Mic, Paperclip, Plus, Sparkles, Square, X } from 'lucide-react'
import { LocalFile, checkFile, fromBrowserFile, pickLocalFiles } from '../lib/api'
import { Dictation, sentenceCase, startDictation } from '../lib/stt'
import { PolicySelect } from '../components/Knowledge'
import { useChat } from '../store/chat'
import { toast } from '../store/ui'
import { TYPE_ICON } from './common'
import { queueMyFile } from './fileQueue'

const BARS = 28

/** Khung hỏi trợ lý kiểu ChatGPT: nút +, đính tệp, nói thành chữ, gửi. */
export default function Composer({ onSend, placeholder = 'Hỏi trợ lý bất cứ điều gì…' }: { onSend: (text: string) => void; placeholder?: string }) {
  const nav = useNavigate()
  const chat = useChat()
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState(false)
  const [over, setOver] = useState(false)
  const [mic, setMic] = useState<'off' | 'loading' | 'on' | 'finishing'>('off')
  const [partial, setPartial] = useState('')
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0))
  const [secs, setSecs] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const dict = useRef<Dictation | null>(null)
  const base = useRef('') // chữ đã có trước khi bắt đầu nói
  const canGeneral = !chat.status || chat.status.features.includes('ask_hybrid')
  const general = chat.mode === 'hybrid'

  useEffect(() => { const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  useEffect(() => () => dict.current?.cancel(), [])
  useEffect(() => { if (mic !== 'on') return; setSecs(0); const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t) }, [mic])
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(220, el.scrollHeight) + 'px' }, [q, partial])

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
    queueMyFile(ok, q.trim() || undefined); setQ(''); nav('/my-file')
  }
  async function pick(images?: boolean) { setMenu(false); try { const list = await pickLocalFiles(!!images); if (list.length) await useFile(list) } catch (e) { toast.error(e) } }
  async function onDrop(e: DragEvent) { e.preventDefault(); setOver(false); const list = Array.from(e.dataTransfer.files); if (list.length) await useFile(await Promise.all(list.map(fromBrowserFile))) }
  async function onPaste(e: ClipboardEvent) {
    const f = Array.from(e.clipboardData?.files || [])[0]; if (!f) return
    e.preventDefault(); await useFile(await fromBrowserFile(new File([f], f.name && f.name !== 'image.png' ? f.name : `anh-chup-${Date.now()}.png`, { type: f.type })))
  }

  // ---- Nói thành chữ ----
  async function startMic() {
    if (mic !== 'off') return
    base.current = q; setPartial(''); setLevels(Array(BARS).fill(0)); setMic('loading')
    try {
      dict.current = await startDictation({
        onPartial: (p) => setPartial(p),
        onFinal: (t) => { base.current = join(base.current, base.current.trim() ? t : sentenceCase(t)); setQ(base.current); setPartial('') },
        onLevel: (l) => setLevels((x) => [...x.slice(1), l]),
        onState: (s) => { if (s === 'listening') setMic('on') },
      })
    } catch (e) { setMic('off'); toast.error((e as Error).message) }
  }
  async function stopMic() { if (!dict.current) return; setMic('finishing'); await dict.current.stop(); dict.current = null; setPartial(''); setMic('off'); ta.current?.focus() }
  function cancelMic() { dict.current?.cancel(); dict.current = null; setQ(base.current); setPartial(''); setMic('off') }

  const shown = mic === 'off' ? q : join(q, partial)
  const recording = mic === 'on' || mic === 'finishing'
  return (
    <div className={clsx('rd-composer', over && 'over', recording && 'rec')} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <div className="cmp-top">
        <span className="ai-badge" aria-hidden><Sparkles size={20} /></span>
        <textarea ref={ta} rows={1} value={shown} maxLength={500} readOnly={mic !== 'off'} placeholder={mic === 'loading' ? 'Đang mở micro…' : placeholder} aria-label="Câu hỏi cho trợ lý"
          onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} onPaste={(e) => void onPaste(e)} />
      </div>

      <div className="cmp-bar">
        <div className="relative" ref={menuRef}>
          <button className={clsx('cmp-ico', menu && 'on')} onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu} title="Thêm tệp, ảnh và công cụ" disabled={recording}><Plus size={20} /></button>
          {menu && (
            <div className="cmp-menu" role="menu">
              <button role="menuitem" onClick={() => void pick()}><Paperclip size={18} /><span><b>Tải tệp lên để hỏi</b><small>PDF, Word, Excel, PowerPoint, văn bản</small></span></button>
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
            <span className="hint">{mic === 'finishing' ? 'Đang chốt câu…' : 'Đang nghe — nói tiếng Việt'}</span>
          </div>
        ) : (
          <>
            {canGeneral && <button className={clsx('cmp-chip', general && 'on')} aria-pressed={general} onClick={() => chat.setMode(general ? 'documents' : 'hybrid')} title="Cho phép bổ sung kiến thức chung, có ghi rõ phần nào ngoài tài liệu"><Globe2 size={16} />Kiến thức chung</button>}
            <span className="cmp-pol" title="Nguồn tài liệu trợ lý được dùng"><PolicySelect plain value={chat.policy} onChange={chat.setPolicy} /></span>
          </>)}

        <div className="cmp-right">
          {recording ? (<>
            <button className="cmp-ico" onClick={cancelMic} title="Hủy, bỏ phần vừa nói" aria-label="Hủy ghi âm"><X size={19} /></button>
            <button className="cmp-ico ok" onClick={() => void stopMic()} disabled={mic === 'finishing'} title="Xong, giữ chữ vừa nói" aria-label="Dừng ghi âm">{mic === 'finishing' ? <Loader2 size={19} className="animate-spin" /> : <Check size={20} />}</button>
          </>) : (<>
            <button className={clsx('cmp-ico', mic === 'loading' && 'on')} onClick={() => void startMic()} disabled={mic === 'loading'} title="Nói để nhập câu hỏi (nhận dạng ngay trên máy)" aria-label="Nói thành chữ">{mic === 'loading' ? <Loader2 size={19} className="animate-spin" /> : <Mic size={19} />}</button>
            <button className="cmp-send" onClick={send} disabled={q.trim().length < 3 || chat.busy} aria-label="Gửi câu hỏi" title="Gửi (Enter)">{chat.busy ? <Square size={15} fill="currentColor" /> : <ArrowUp size={21} />}</button>
          </>)}
        </div>
      </div>
      {over && <div className="cmp-drop"><Paperclip size={22} />Thả tệp vào đây để hỏi về tệp</div>}
    </div>)
}
