import { ClipboardEvent, DragEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Camera, CheckCircle2, ClipboardCheck, FileQuestion, ImagePlus, ListChecks, Loader2, Paperclip, Plus, Send, Trash2, UploadCloud, X } from 'lucide-react'
import { ApiError, LocalFile, askWithFiles, checkFile, fromBrowserFile, isImageName, pickLocalFiles, AUDIO_MB, UPLOAD_MB } from '../lib/api'
import { bytes as fmtBytes, FILE_ICON } from '../lib/format'
import { extOf } from '../lib/preview'
import type { AskFileInfo } from '../lib/types'
import { PreviewModal } from '../components/FileViewer'
import { Ans, Msg, useChat } from '../store/chat'
import { toast } from '../store/ui'
import { Bubble } from './Assistant'
import { takeQueued } from './fileQueue'

const MAX = 5
let seq = 1

/** Ảnh nhỏ của tệp ảnh (đọc ngay trên máy) */
function Thumb({ f }: { f: LocalFile }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!f.bytes || !isImageName(f.name)) return
    const u = URL.createObjectURL(new Blob([f.bytes as BlobPart])); setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [f])
  return url ? <img src={url} alt="" className="w-14 h-14 object-cover rounded-md border border-line" /> : <span className="rd-ico md text-2xl" style={{ width: 56, height: 56 }}>{FILE_ICON[extOf(f.name)] || '📎'}</span>
}

// Những việc người đọc hay cần khi có một tệp trong tay — nói bằng lời thường
const QUICK = [
  { icon: <FileQuestion size={19} />, t: 'Tệp này nói gì, tôi cần làm gì?', q: '' },
  { icon: <Camera size={19} />, t: 'Ảnh này báo lỗi gì, xử lý thế nào?', q: 'Ảnh chụp này báo lỗi gì và tôi cần xử lý thế nào?' },
  { icon: <ClipboardCheck size={19} />, t: 'Giấy tờ này có đúng quy định không?', q: 'Nội dung tệp này có đúng với quy định hiện hành của công ty không? Chỉ ra chỗ nào khác.' },
  { icon: <ListChecks size={19} />, t: 'Tôi cần làm những bước nào?', q: 'Dựa vào tệp này, tôi cần làm những bước nào theo đúng hướng dẫn của công ty?' },
]

function friendlyErr(e: unknown) {
  const er = e as ApiError; const st = er?.status
  if (st === 413) return `Tệp quá lớn (mỗi tệp tối đa ${UPLOAD_MB} MB, file ghi âm ${AUDIO_MB} MB) hoặc quá 5 tệp một lần.`
  if (st === 415) return 'Loại tệp này trợ lý chưa đọc được. Hãy dùng ảnh, PDF, Word, Excel, PowerPoint, văn bản hoặc file ghi âm.'
  if (st === 422) return 'Trợ lý không dùng được tệp hoặc câu hỏi này — có thể tệp chứa mật khẩu, mã bí mật hoặc số điện thoại. ' + (er.message || '')
  if (st === 429) return 'Hôm nay trợ lý đã được dùng quá nhiều. Bạn thử lại sau ít phút nhé.'
  if (st === 503) return 'Trợ lý đang tạm nghỉ (quản trị viên chưa bật tính năng này).'
  if (st === 0) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'
  return er?.message || String(e)
}

/** Cách mặc định: gửi tệp cho trợ lý đọc (cả ảnh, PDF scan), đối chiếu tài liệu công ty rồi trả lời. Tệp không được lưu lại. */
export function ServerFileAsk() {
  const nav = useNavigate()
  const chat = useChat()
  const [files, setFiles] = useState<LocalFile[]>([])
  const [q, setQ] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [view, setView] = useState<LocalFile | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const general = chat.mode === 'hybrid'

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs.length, busy])
  useEffect(() => { const q0 = takeQueued(); if (q0) { add(q0.files); if (q0.question) void ask(q0.question, q0.files) } }, []) // eslint-disable-line

  function add(list: LocalFile[]) {
    const ok: LocalFile[] = []
    for (const f of list) { const bad = checkFile(f); if (bad) toast.warn(`${f.name}: ${bad}`); else ok.push(f) }
    setFiles((cur) => {
      const merged = [...cur, ...ok.filter((f) => !cur.some((c) => c.name === f.name && c.size === f.size))]
      if (merged.length > MAX) toast.warn(`Mỗi lần chỉ gửi được ${MAX} tệp — mình giữ ${MAX} tệp đầu.`)
      return merged.slice(0, MAX)
    })
  }
  async function pick(images = false) { try { add(await pickLocalFiles(images)) } catch (e) { toast.error(e) } }
  async function onDrop(e: DragEvent) { e.preventDefault(); setOver(false); add(await Promise.all(Array.from(e.dataTransfer.files).map(fromBrowserFile))) }
  async function onPaste(e: ClipboardEvent | globalThis.ClipboardEvent) {
    const list = Array.from(e.clipboardData?.files || []); if (!list.length) return
    e.preventDefault(); add(await Promise.all(list.map((f, i) => fromBrowserFile(new File([f], f.name && f.name !== 'image.png' ? f.name : `anh-chup-${Date.now()}-${i}.png`, { type: f.type })))))
  }
  useEffect(() => { const h = (e: globalThis.ClipboardEvent) => { if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return; void onPaste(e) }; document.addEventListener('paste', h); return () => document.removeEventListener('paste', h) }, []) // eslint-disable-line

  async function ask(question: string, list = files) {
    const text = question.trim()
    if (!list.length) return toast.warn('Hãy thêm ít nhất một tệp hoặc ảnh trước nhé.')
    if (busy) return
    const um: Msg = { id: seq++, role: 'user', text: text || 'Tệp này nói gì, tôi cần làm gì?', files: list.map((f) => ({ name: f.name, size: f.size, status: 'saved' as const })) }
    setMsgs((m) => [...m, um]); setQ(''); setBusy(true)
    try {
      const pol = chat.policy
      const r = await askWithFiles<Ans & AskFileInfo>(list, { question: text.length >= 3 ? text.slice(0, 500) : undefined, mode: general ? 'hybrid' : 'documents', ...(pol !== 'auto' ? { source_policy: pol } : {}) })
      const fileAsk: AskFileInfo = { uploaded: r.uploaded || [], skipped: r.skipped || [], need: r.need, key_facts: r.key_facts, discrepancies: r.discrepancies || [], related: r.related || [], note: r.note }
      setMsgs((m) => [...m, { id: seq++, role: 'ai', text: r.answer, question: text, ans: { ...r, sources: r.sources || [], fileAsk } }])
    } catch (e) {
      setMsgs((m) => [...m, { id: seq++, role: 'ai', text: '', err: friendlyErr(e) }])
    } finally { setBusy(false) }
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(q) } }

  return (
    <div className="flex flex-col gap-5">
      {/* Bước 1: thêm tệp */}
      <section className={clsx('rd-card p-5 flex flex-col gap-4 transition', over && '!border-[#7a2ee6] bg-brand-50')}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="rd-ico md g"><UploadCloud size={24} /></span>
          <div className="flex-1 min-w-[220px]"><div className="font-black text-[1.1em]">1. Thêm tệp hoặc ảnh</div>
            <div className="text-[0.88em] text-muted">Kéo thả vào đây, dán ảnh chụp màn hình (Ctrl+V) hoặc bấm nút. Tối đa {MAX} tệp, mỗi tệp {UPLOAD_MB} MB.</div></div>
          <button className="rd-btn secondary sm" onClick={() => void pick(true)} disabled={files.length >= MAX}><ImagePlus size={18} />Thêm ảnh</button>
          <button className="rd-btn sm" onClick={() => void pick()} disabled={files.length >= MAX}><Paperclip size={18} />Chọn tệp</button>
        </div>
        {files.length === 0 ? (
          <button className="border-2 border-dashed border-brand-200 rounded-lg bg-brand-50/60 py-8 flex flex-col items-center gap-2 text-muted cursor-pointer hover:border-[#7a2ee6] font-[inherit]" onClick={() => void pick()}>
            <Plus size={28} className="text-brand-500" /><b className="text-ink">Chưa có tệp nào</b>
            <span className="text-[0.88em]">Ảnh chụp lỗi, biểu mẫu, hợp đồng, báo cáo, PDF, Word, Excel…</span>
          </button>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2.5">
            {files.map((f, i) => (
              <div key={f.name + i} className="flex items-center gap-3 border border-line rounded-lg bg-white p-2.5">
                <button className="border-0 bg-transparent p-0 cursor-zoom-in shrink-0" onClick={() => setView(f)} aria-label={`Xem ${f.name}`}><Thumb f={f} /></button>
                <div className="min-w-0 flex-1"><div className="font-bold leading-snug break-all line-clamp-2">{f.name}</div><div className="text-[0.8em] text-muted">{fmtBytes(f.size)}</div></div>
                <button className="rd-star !w-10 !h-10" title="Bỏ tệp này" aria-label={`Bỏ ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}><X size={18} /></button>
              </div>))}
          </div>)}
      </section>

      {/* Bước 2: hỏi */}
      <section className="rd-card p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3"><span className="rd-ico md g"><Send size={22} /></span>
          <div><div className="font-black text-[1.1em]">2. Bạn muốn biết điều gì?</div><div className="text-[0.88em] text-muted">Bấm một gợi ý, hoặc tự gõ câu hỏi. Không gõ gì cũng được — trợ lý tự hiểu từ tệp.</div></div></div>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {QUICK.map((x) => (
            <button key={x.t} className="rd-card click rd-intent !p-3.5 !shadow-none" disabled={busy || !files.length} style={busy || !files.length ? { opacity: 0.55 } : undefined} onClick={() => void ask(x.q)}>
              <span className="rd-ico md" style={{ width: 40, height: 40 }}>{x.icon}</span><span className="t !text-[0.95em]">{x.t}</span></button>))}
        </div>
        <div className="flex gap-3 items-end">
          <textarea className="flex-1 border-2 border-line rounded-md px-4 py-3 text-[1em] font-[inherit] resize-none min-h-[52px] max-h-[140px] focus:outline-none focus:border-[#7a2ee6]" rows={2} value={q} maxLength={500} disabled={busy}
            placeholder="Ví dụ: Số tiền trong hóa đơn này có vượt hạn mức không?" aria-label="Câu hỏi về tệp" onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} onPaste={(e) => void onPaste(e)} />
          <button className="rd-btn" style={{ height: 52 }} disabled={busy || !files.length} onClick={() => void ask(q)}>{busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}Hỏi</button>
        </div>
        <label className="flex items-center gap-2.5 text-[0.9em] cursor-pointer w-fit"><input type="checkbox" className="w-[18px] h-[18px] accent-[#7a2ee6]" checked={general} onChange={(e) => chat.setMode(e.target.checked ? 'hybrid' : 'documents')} />
          Nếu tài liệu công ty chưa có, cho phép trợ lý bổ sung hiểu biết chung (sẽ ghi rõ)</label>
      </section>

      {/* Kết quả */}
      {(msgs.length > 0 || busy) && (
        <section className="rd-card p-5 flex flex-col gap-4 bg-brand-50/40">
          <div className="flex items-center gap-2 font-black"><CheckCircle2 size={20} className="text-brand-600" />Trợ lý trả lời
            {msgs.length > 0 && <button className="rd-btn secondary sm ml-auto" onClick={() => setMsgs([])}><Trash2 size={16} />Xóa câu trả lời</button>}</div>
          {msgs.map((m) => <Bubble key={m.id} m={m} onOpen={(id) => nav(`/items/${id}`)} onSearch={(s) => nav(`/search?q=${encodeURIComponent(s)}`)} />)}
          {busy && <div className="rd-bubble bot flex items-center gap-3 text-muted"><Loader2 size={20} className="animate-spin text-brand-500" />Trợ lý đang đọc tệp và tìm trong tài liệu công ty… (có thể mất 10–30 giây)</div>}
          <div ref={end} />
        </section>)}
      {view?.bytes && <PreviewModal src={{ type: 'local', name: view.name, bytes: view.bytes }} onClose={() => setView(null)} />}
    </div>)
}
