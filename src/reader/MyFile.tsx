import React, { ClipboardEvent, DragEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  AlertTriangle, Bot, Check, Eye, FileSearch, FileText, ListChecks, Loader2, Lock, Replace, ScanText, Send, Sparkles, Trash2, UploadCloud, User as UserIcon,
} from 'lucide-react'
import { ApiError, LocalFile, checkFile, fromBrowserFile, pickLocalFiles, UPLOAD_MB } from '../lib/api'
import { bytes as fmtBytes, FILE_ICON } from '../lib/format'
import { Chunk, LOCAL_ACCEPT, LocalDoc, chunkDoc, kindOfLocal, pickChunks, readLocalFile, redact, sampleChunks, segments } from '../lib/localDoc'
import { extOf } from '../lib/preview'
import { Md } from '../components/shared'
import { PreviewModal } from '../components/FileViewer'
import { Modal } from '../components/ui'
import { useChat } from '../store/chat'
import { toast } from '../store/ui'
import { askFileAgent, forgetFileConversations } from './aiAgent'
import { takeQueued } from './fileQueue'
import { ServerFileAsk } from './AskFile'

interface LMsg { id: number; role: 'user' | 'ai'; text: string; sent?: { label: string; text: string }[]; redacted?: number; err?: string; cost?: number }
let seq = 1
const HEAD = (name: string) => `Tôi hỏi về tệp "${name}" trên máy tôi. Dưới đây là các đoạn trích liên quan từ tệp (không phải tài liệu của công ty). Chỉ dựa vào các đoạn này để trả lời; nếu chưa đủ thông tin thì nói rõ.`

function errText(e: unknown) {
  const er = e as ApiError
  if (er.status === 429) return 'Đã hết hạn mức AI (10 yêu cầu mỗi phút, hạn mức ngày hoặc ngân sách tháng). Hãy thử lại sau.'
  if (er.status === 503) return er.message || 'AI chưa bật hoặc tính năng Agent đang bị tắt.'
  if (er.status === 422) return 'Đoạn trích bị từ chối (có thể còn chứa dữ liệu nhạy cảm như mật khẩu, khóa hay số điện thoại). Hãy thử hỏi về phần khác của tệp.'
  return er.full || String(e)
}

/** Cách riêng tư: đọc tệp ngay trên máy, chỉ gửi vài đoạn chữ liên quan cho trợ lý. */
export function LocalFileAsk() {
  const status = useChat((s) => s.status)
  const [file, setFile] = useState<LocalFile | null>(null)
  const [doc, setDoc] = useState<LocalDoc | null>(null)
  const [reading, setReading] = useState<{ stage: string; pct?: number } | null>(null)
  const [readErr, setReadErr] = useState('')
  const [msgs, setMsgs] = useState<LMsg[]>([])
  const [conv, setConv] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState('')
  const [q, setQ] = useState('')
  const [over, setOver] = useState(false)
  const [view, setView] = useState(false)
  const [textModal, setTextModal] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const chunks = useMemo<Chunk[]>(() => (doc ? chunkDoc(doc) : []), [doc])
  useEffect(() => { void useChat.getState().loadStatus() }, [])
  // Rời trang hoặc đóng ứng dụng: xóa các hội thoại chứa đoạn trích tệp trên máy chủ
  useEffect(() => { const h = () => { void forgetFileConversations() }; window.addEventListener('beforeunload', h); return () => { window.removeEventListener('beforeunload', h); h() } }, [])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs.length, busy])

  async function open(f: LocalFile) {
    const bad = checkFile(f)
    if (bad && kindOfLocal(f.name) === 'unsupported') { /* thông báo chi tiết bên dưới */ } else if (bad) return toast.warn(`${f.name}: ${bad}`)
    void forgetFileConversations()
    setFile(f); setDoc(null); setReadErr(''); setMsgs([]); setConv(null); setReading({ stage: 'Đang đọc tệp…' })
    try { setDoc(await readLocalFile(f, setReading)) } catch (e) { setReadErr((e as Error).message || 'Không đọc được tệp này.') } finally { setReading(null) }
  }
  const [pendingQ, setPendingQ] = useState('')
  useEffect(() => { const q0 = takeQueued(); if (q0?.files[0]) { if (q0.question) setPendingQ(q0.question); void open(q0.files[0]) } }, []) // eslint-disable-line
  useEffect(() => { if (doc && pendingQ) { const t = pendingQ; setPendingQ(''); if (doc.chars >= 20) void ask(t); else setQ(t) } }, [doc]) // eslint-disable-line
  async function pick() { try { const [f] = await pickLocalFiles(false); if (f) await open(f) } catch (e) { toast.error(e) } }
  async function onDrop(e: DragEvent) { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) await open(await fromBrowserFile(f)) }
  async function onPaste(e: ClipboardEvent | globalThis.ClipboardEvent) {
    const f = Array.from(e.clipboardData?.files || [])[0]; if (!f) return
    e.preventDefault(); await open(await fromBrowserFile(new File([f], f.name && f.name !== 'image.png' ? f.name : `anh-dan-${Date.now()}.png`, { type: f.type })))
  }
  useEffect(() => { const h = (e: globalThis.ClipboardEvent) => { if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return; void onPaste(e) }; document.addEventListener('paste', h); return () => document.removeEventListener('paste', h) }, []) // eslint-disable-line

  /** Một lượt hỏi: chọn đoạn → che dữ liệu nhạy cảm → gửi Agent → ghi nhận đoạn đã gửi. */
  async function callAI(question: string, picked: Chunk[], instruction?: string, conversation: number | null = conv) {
    if (!doc) throw new Error('Chưa có tệp')
    const raw = picked.map((c) => `[${c.label}]\n${c.text}`).join('\n\n')
    const r = redact(raw)
    const head = HEAD(doc.name)
    const tail = `\n--- CÂU HỎI ---\n${instruction ? instruction + '\n' : ''}${question}`.slice(0, 520)
    const budget = 1960 - head.length - tail.length - 30
    const body = r.text.length > budget ? r.text.slice(0, budget) + '…' : r.text
    const res = await askFileAgent(`${head}\n--- ĐOẠN TRÍCH ---\n${body}${tail}`, conversation)
    return { res, sent: picked.map((c) => ({ label: c.label, text: c.text })), redacted: r.count }
  }

  async function ask(question: string, mode: 'qa' | 'sample' | 'digits' | 'warn' = 'qa', display?: string) {
    const text = question.trim(); if (!doc || !text || busy) return
    setMsgs((m) => [...m, { id: seq++, role: 'user', text: display ?? text }]); setBusy(true); setProg('Đang chọn đoạn liên quan trong tệp…')
    try {
      const budget = 1250
      let picked: Chunk[]
      if (mode === 'sample') picked = sampleChunks(chunks, budget)
      else if (mode === 'digits') picked = [...chunks].map((c) => ({ c, s: (c.text.match(/\d/g) || []).length / c.text.length })).sort((a, b) => b.s - a.s).slice(0, 4).map((x) => x.c).sort((a, b) => a.idx - b.idx)
      else if (mode === 'warn') picked = pickChunks(chunks, 'lưu ý cảnh báo cấm không được bắt buộc yêu cầu hạn chót quan trọng', budget)
      else picked = pickChunks(chunks, text, budget)
      setProg('Đang hỏi trợ lý…')
      const { res, sent, redacted } = await callAI(text, picked)
      setConv(res.conversation_id)
      setMsgs((m) => [...m, { id: seq++, role: 'ai', text: res.answer, sent, redacted, cost: res.cost_usd }])
    } catch (e) { setMsgs((m) => [...m, { id: seq++, role: 'ai', text: '', err: errText(e) }]) } finally { setBusy(false); setProg('') }
  }

  /** Tóm tắt toàn bộ: tóm tắt từng phần rồi gộp lại. */
  async function summarize() {
    if (!doc || busy) return
    setMsgs((m) => [...m, { id: seq++, role: 'user', text: 'Tóm tắt toàn bộ tệp' }]); setBusy(true)
    try {
      const segs = segments(chunks, 1250, 6)
      const parts: string[] = []; let totalCost = 0; let redacted = 0; const sentAll: { label: string; text: string }[] = []
      for (let i = 0; i < segs.length; i++) {
        setProg(`Đang tóm tắt phần ${i + 1}/${segs.length}…`)
        const { res, sent, redacted: rc } = await callAI('Tóm tắt phần này trong 3–4 câu, giữ lại số liệu, ngày tháng, tên riêng quan trọng.', segs[i], undefined, null)
        parts.push(`Phần ${i + 1} (${segs[i][0].label}${segs[i].length > 1 ? ' → ' + segs[i][segs[i].length - 1].label : ''}): ${res.answer.slice(0, 330)}`); totalCost += res.cost_usd || 0; redacted += rc; sentAll.push(...sent)
      }
      let answer: string; let convId = conv
      if (parts.length === 1) answer = parts[0].replace(/^Phần 1 \([^)]*\): /, '')
      else {
        setProg('Đang gộp các phần thành bản tóm tắt chung…')
        const fin = await askFileAgent(`${HEAD(doc.name).replace('các đoạn trích liên quan từ tệp', 'các bản tóm tắt từng phần của tệp')}\n--- TÓM TẮT TỪNG PHẦN ---\n${parts.join('\n').slice(0, 1500)}\n--- YÊU CẦU ---\nViết bản tóm tắt chung của cả tệp: 1 câu mở đầu nói tệp là gì, rồi 5–7 ý chính (gạch đầu dòng), cuối cùng liệt kê các ngày tháng và con số quan trọng nếu có.`, null)
        answer = fin.answer; convId = fin.conversation_id; totalCost += fin.cost_usd || 0
      }
      setConv(convId)
      setMsgs((m) => [...m, { id: seq++, role: 'ai', text: answer, sent: sentAll.slice(0, 12), redacted, cost: totalCost }])
    } catch (e) { setMsgs((m) => [...m, { id: seq++, role: 'ai', text: '', err: errText(e) }]) } finally { setBusy(false); setProg('') }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const t = q; setQ(''); void ask(t) } }
  const agentOff = !!status && !status.features.includes('agent')
  const quick = [
    { k: 'sum', icon: <FileText size={18} />, t: 'Tóm tắt toàn bộ tệp', d: 'Đọc hết rồi tóm tắt thành các ý chính', act: () => void summarize() },
    { k: 'pts', icon: <ListChecks size={18} />, t: 'Liệt kê ý chính', d: 'Nhanh, từ các phần tiêu biểu', act: () => void ask('Liệt kê 5–7 ý chính của tệp, mỗi ý một dòng ngắn.', 'sample', 'Liệt kê ý chính') },
    { k: 'num', icon: <ScanText size={18} />, t: 'Tìm số liệu, ngày tháng', d: 'Những con số, mốc thời gian quan trọng', act: () => void ask('Liệt kê các ngày tháng, số tiền, số lượng và tên riêng quan trọng trong các đoạn này, kèm số trang/đoạn.', 'digits', 'Tìm số liệu, ngày tháng quan trọng') },
    { k: 'warn', icon: <AlertTriangle size={18} />, t: 'Có điều gì cần lưu ý?', d: 'Cảnh báo, điều cấm, yêu cầu bắt buộc', act: () => void ask('Nêu các lưu ý, cảnh báo, điều cấm hoặc yêu cầu bắt buộc có trong các đoạn này.', 'warn', 'Có điều gì cần lưu ý?') },
  ]

  return (
    <div className="flex flex-col gap-6 max-w-[980px] mx-auto w-full">
      <div className="rd-callout info !py-3 text-[0.92em]"><Lock size={20} className="shrink-0 mt-0.5" /><div><b>Tệp được đọc ngay trên máy này</b> và không gửi đi nguyên vẹn. Chỉ vài đoạn chữ liên quan đến câu hỏi (đã che số điện thoại, mật khẩu…) được gửi cho trợ lý — bạn luôn xem được trợ lý đã nhận những đoạn nào. Cách này không hiểu được hình vẽ, biểu đồ.</div></div>
      {agentOff && <div className="rd-callout warn"><AlertTriangle size={22} className="shrink-0" />Tính năng Agent đang tắt trên máy chủ nên chưa hỏi được về tệp. Bạn vẫn đọc được chữ trích từ tệp.</div>}

      {!file ? (
        <div className={clsx('rd-card p-10 text-center flex flex-col items-center gap-4 border-dashed !border-2 transition', over ? '!border-[#7a2ee6] bg-brand-50' : '!border-brand-200')}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
          <span className="rd-ico lg g"><UploadCloud size={32} /></span>
          <div className="text-[1.3em] font-black">Kéo tệp vào đây hoặc bấm chọn</div>
          <div className="text-muted max-w-[560px] leading-relaxed">Hỗ trợ: ảnh (png, jpg, jfif, webp, ảnh iPhone heic…), PDF, Word (docx), Excel (xlsx), PowerPoint (pptx), văn bản (txt, md, csv, json…). Dán ảnh chụp màn hình bằng Ctrl+V cũng được. Tối đa {UPLOAD_MB} MB.</div>
          <button className="rd-btn lg" onClick={() => void pick()}><UploadCloud size={22} />Chọn tệp từ máy</button>
        </div>
      ) : (
        <div className="rd-card p-5 flex items-center gap-4 flex-wrap" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <span className="rd-ico lg text-3xl">{FILE_ICON[extOf(file.name)] || '📎'}</span>
          <div className="min-w-0 flex-1 basis-[240px]"><div className="font-black text-[1.1em] break-words">{file.name}</div>
            <div className="text-[0.88em] text-muted mt-1 flex gap-x-3 gap-y-1 flex-wrap items-center">{fmtBytes(file.size)}
              {doc && <><span>· {doc.chars.toLocaleString('vi-VN')} ký tự</span><span className="rd-chip">{doc.method}</span>{doc.pageCount ? <span>· {doc.pageCount} trang</span> : null}{doc.truncated && <span className="rd-chip warn">Chỉ đọc phần đầu</span>}{doc.ocrConfidence != null && <span className={clsx('rd-chip', doc.ocrConfidence < 60 ? 'warn' : 'ok')}>Độ chắc chữ ~{doc.ocrConfidence}%</span>}</>}</div></div>
          {doc && file.bytes && <button className="rd-btn secondary sm" onClick={() => setView(true)}><Eye size={17} />Xem tệp</button>}
          {doc && <button className="rd-btn secondary sm" onClick={() => setTextModal(true)}><FileText size={17} />Xem chữ đã đọc</button>}
          <button className="rd-btn secondary sm" onClick={() => void pick()}><Replace size={17} />Đổi tệp</button>
          <button className="rd-btn secondary sm" onClick={() => { void forgetFileConversations(); setFile(null); setDoc(null); setMsgs([]); setConv(null); setReadErr('') }}><Trash2 size={17} />Bỏ</button>
        </div>
      )}

      {reading && (
        <div className="rd-card p-6 flex flex-col gap-3"><div className="flex items-center gap-3 font-bold"><Loader2 size={22} className="animate-spin text-brand-500" />{reading.stage}</div>
          {reading.pct != null && <div className="rd-bar"><i style={{ width: `${Math.round(reading.pct * 100)}%` }} /></div>}
          {/(ảnh|OCR)/i.test(reading.stage) && <div className="text-[0.88em] text-muted">Lần đầu có thể mất vài giây để nạp bộ đọc chữ tiếng Việt; ảnh không rời khỏi máy.</div>}</div>)}
      {readErr && <div className="rd-callout bad"><AlertTriangle size={22} className="shrink-0" /><div><b className="block">Chưa đọc được tệp này</b>{readErr}</div></div>}
      {doc && doc.chars < 20 && <div className="rd-callout warn"><AlertTriangle size={22} className="shrink-0" /><div><b className="block">Gần như không đọc được chữ</b>Tệp có thể là ảnh mờ, hoặc chỉ chứa hình vẽ/biểu đồ. Máy đọc chữ không hiểu được hình ảnh; nếu cần AI “nhìn” ảnh, hãy nhờ người đóng góp đính kèm ảnh vào một bài rồi bấm “Nhờ trợ lý xem”.</div></div>}
      {doc?.kind === 'image' && doc.chars >= 20 && <div className="rd-callout info !py-3 text-[0.9em]"><Eye size={20} className="shrink-0 mt-0.5" />Với ảnh, trợ lý chỉ làm việc trên <b>chữ đọc được trong ảnh</b>. Sơ đồ, biểu đồ, hình minh họa không được hiểu.</div>}

      {doc && doc.chars >= 20 && (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {quick.map((a) => <button key={a.k} className="rd-card click rd-intent !p-4" disabled={busy || agentOff} onClick={a.act} style={busy || agentOff ? { opacity: 0.55 } : undefined}><span className="rd-ico md">{a.icon}</span><span className="min-w-0"><span className="t block !text-[0.95em]">{a.t}</span><span className="d block">{a.d}</span></span></button>)}
          </div>
          <div className="rd-card overflow-hidden flex flex-col" style={{ minHeight: 360 }}>
            <div className="p-5 flex flex-col gap-4 flex-1 bg-brand-50/50 min-h-[260px] max-h-[56vh] overflow-auto">
              {msgs.length === 0 && <div className="m-auto text-center text-muted max-w-[460px] leading-relaxed flex flex-col items-center gap-2"><Sparkles size={28} className="text-brand-400" /><b className="text-ink text-[1.1em]">Hỏi bất cứ điều gì về tệp này</b>Ví dụ: “Hạn nộp là ngày nào?”, “Tổng cộng bao nhiêu tiền?”, “Bước 3 yêu cầu làm gì?”</div>}
              {msgs.map((m) => m.role === 'user' ? <div key={m.id} className="rd-bubble me">{m.text}</div> : (
                <div key={m.id} className="flex flex-col gap-2 items-start">
                  {m.err ? <div className="rd-bubble bot err"><b className="block mb-1">Mình chưa trả lời được</b>{m.err}</div> : <div className="rd-bubble bot"><div className="rd-chip mb-2 max-w-full" title={doc.name}><FileText size={14} className="shrink-0" /><span className="truncate">Trả lời dựa trên tệp của bạn: {doc.name}</span></div><Md>{m.text}</Md></div>}
                  {m.sent && m.sent.length > 0 && (
                    <details className="text-[0.85em] text-muted max-w-full"><summary className="cursor-pointer font-bold text-brand-700">Đã gửi cho AI {m.sent.length} đoạn ({Array.from(new Set(m.sent.map((s) => s.label))).slice(0, 6).join(', ')})</summary>
                      <div className="flex flex-col gap-1.5 mt-2">{m.sent.map((s, i) => <div key={i} className="border border-line rounded-md bg-white px-3 py-2 leading-relaxed"><b className="text-ink">[{s.label}]</b> {s.text.slice(0, 500)}{s.text.length > 500 ? '…' : ''}</div>)}
                        {m.redacted ? <div className="text-amber-700 font-semibold">Đã che {m.redacted} thông tin nhạy cảm (số điện thoại, mật khẩu, khóa, email…) trước khi gửi.</div> : null}</div></details>)}
                </div>))}
              {busy && <div className="rd-bubble bot flex items-center gap-3 text-muted"><Loader2 size={20} className="animate-spin text-brand-500" />{prog || 'Đang xử lý…'}</div>}
              <div ref={end} />
            </div>
            <div className="p-3.5 border-t border-line bg-white flex gap-3 items-end">
              <textarea className="flex-1 border-2 border-line rounded-md px-4 py-3 text-[1em] font-[inherit] resize-none min-h-[52px] max-h-[130px] focus:outline-none focus:border-[#7a2ee6]" rows={1} value={q} maxLength={300} disabled={busy || agentOff} placeholder="Hỏi về tệp này…" aria-label="Câu hỏi về tệp"
                onChange={(e) => { setQ(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(130, e.target.scrollHeight) + 'px' }} onKeyDown={onKey} onPaste={(e) => void onPaste(e)} />
              <button className="rd-btn" style={{ height: 52 }} disabled={busy || agentOff || !q.trim()} onClick={() => { const t = q; setQ(''); void ask(t) }}><Send size={18} />Gửi</button>
            </div>
          </div>
          <div className="text-[0.82em] text-muted flex items-center gap-2"><Bot size={15} />Câu trả lời của AI có thể chưa đúng 100% — việc quan trọng hãy đối chiếu với tệp gốc.</div>
        </>)}
      {view && file?.bytes && <PreviewModal src={{ type: 'local', name: file.name, bytes: file.bytes }} onClose={() => setView(false)} />}
      {textModal && doc && (
        <Modal title="Chữ đã đọc từ tệp" size="lg" onClose={() => setTextModal(false)} footer={<button className="btn" onClick={() => setTextModal(false)}>Đóng</button>}>
          <pre className="m-0 whitespace-pre-wrap font-[inherit] text-[0.95em] leading-relaxed max-h-[60vh] overflow-auto">{doc.text.slice(0, 60000)}{doc.text.length > 60000 ? '\n… (còn nữa)' : ''}</pre>
        </Modal>)}
      <div className="hidden"><UserIcon /><Check />{LOCAL_ACCEPT.length}</div>
    </div>)
}

// ====================================================================
//  Trang "Hỏi về tệp của tôi": chọn cách hỏi bằng lời thường
// ====================================================================
const HOW_KEY = 'memorable.reader.filehow'
export default function ReaderMyFile() {
  const status = useChat((s) => s.status)
  const serverOn = !status || status.features.includes('ask_file')
  const [how, setHowState] = useState<'server' | 'local'>(() => { try { return localStorage.getItem(HOW_KEY) === 'local' ? 'local' : 'server' } catch { return 'server' } })
  const setHow = (h: 'server' | 'local') => { setHowState(h); try { localStorage.setItem(HOW_KEY, h) } catch { /* bỏ qua */ } }
  useEffect(() => { void useChat.getState().loadStatus() }, [])
  const mode = serverOn ? how : 'local'
  const Option = ({ v, icon, t, d, tag }: { v: 'server' | 'local'; icon: React.ReactNode; t: string; d: string; tag?: string }) => (
    <button className={clsx('rd-card click text-left p-4 flex gap-3.5 items-start', mode === v ? '!border-[#7a2ee6] !border-2 bg-brand-50' : '!shadow-none')} aria-pressed={mode === v}
      disabled={v === 'server' && !serverOn} style={v === 'server' && !serverOn ? { opacity: 0.5 } : undefined} onClick={() => setHow(v)}>
      <span className={clsx('rd-ico md', mode === v && 'g')}>{icon}</span>
      <span className="min-w-0"><span className="flex items-center gap-2 font-black">{t}{tag && <span className="rd-chip ok !py-0.5 !px-2 !text-[0.72em]">{tag}</span>}</span>
        <span className="block text-[0.86em] text-muted mt-1 leading-relaxed">{d}</span></span>
    </button>)
  return (
    <div className="flex flex-col gap-5 max-w-[980px] mx-auto w-full">
      <div><h1 className="rd-h2 !text-[1.8em]"><FileSearch size={30} className="text-brand-600" />Hỏi về tệp của tôi</h1>
        <p className="rd-sub !mb-0">Có ảnh chụp lỗi, giấy tờ, hóa đơn, báo cáo… mà chưa biết xử lý thế nào? Đưa cho trợ lý xem, trợ lý sẽ tìm cách làm trong tài liệu của công ty.</p></div>
      <div className="grid md:grid-cols-2 gap-3">
        <Option v="server" icon={<Sparkles size={22} />} t="Nhờ trợ lý đọc và đối chiếu" tag="Nên dùng"
          d="Đọc được cả ảnh chụp, PDF scan. Tìm cách giải trong tài liệu công ty và chỉ ra chỗ tệp của bạn ghi khác quy định. Tệp chỉ dùng để trả lời, không lưu vào thư viện." />
        <Option v="local" icon={<Lock size={22} />} t="Chỉ đọc trên máy này"
          d="Dành cho giấy tờ nhạy cảm. Tệp không gửi đi nguyên vẹn, chỉ vài đoạn chữ liên quan. Không hiểu được hình vẽ, biểu đồ." />
      </div>
      {!serverOn && <div className="rd-callout warn !py-3 text-[0.92em]"><AlertTriangle size={20} className="shrink-0 mt-0.5" />Cách “nhờ trợ lý đọc và đối chiếu” đang tắt trên máy chủ, nên tạm thời chỉ đọc được trên máy này.</div>}
      {mode === 'server' ? <ServerFileAsk /> : <LocalFileAsk />}
    </div>)
}
