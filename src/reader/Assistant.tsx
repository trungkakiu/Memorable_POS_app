import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, FileText, Lightbulb, ListChecks, Loader2, MessageCircleQuestion, Paperclip, RotateCcw, Search, Send, ShieldAlert, Sparkles, Trash2, User, X } from 'lucide-react'
import { Md, plainWords } from '../components/shared'
import { AttachStrip } from '../components/Attachments'
import { Msg, useChat } from '../store/chat'
import type { ItemType } from '../lib/types'
import { TYPE_ICON, TYPE_SHORT } from './common'
import { ConflictList, FileAskBlock, MemoryUsed, PolicySelect } from '../components/Knowledge'
import { TIER_PLAIN, TIER_TONE } from '../lib/format'
import { DOC_ACTIONS, runDocAction } from './aiAgent'
import { useReaderCtx } from './workspace'

const STARTERS = ['Máy in không in được thì làm thế nào?', 'Quy trình xử lý khi hệ thống báo lỗi timeout?', 'Hướng dẫn sao lưu dữ liệu hằng ngày']
const ACTION_ICON: Record<string, ReactNode> = { sum: <FileText size={18} />, easy: <Lightbulb size={18} />, todo: <ListChecks size={18} />, warn: <ShieldAlert size={18} /> }

export function Bubble({ m, onOpen, onSearch }: { m: Msg; onOpen: (id: number) => void; onSearch: (q: string) => void }) {
  if (m.role === 'sys') return <div className="rd-callout info !py-3 text-[0.92em]"><CheckCircle2 size={18} className="shrink-0 mt-0.5" /><div>{m.text}</div></div>
  if (m.role === 'user') return (
    <div className="flex flex-col items-end gap-1.5">
      {m.files && m.files.length > 0 && <div className="flex gap-1.5 flex-wrap justify-end">{m.files.map((f, i) => <span key={i} className={`rd-chip ${f.status === 'error' ? 'bad' : ''}`}><Paperclip size={13} />{f.name}</span>)}</div>}
      {m.text && <div className="rd-bubble me">{m.text}</div>}
    </div>)
  if (m.err) return <div className="rd-bubble bot err"><b className="block mb-1">Mình chưa trả lời được lúc này</b>{m.err}</div>
  const a = m.ans
  const srcs = a?.sources || []
  const cited = a?.sourceIds || []
  return (
    <div className="flex flex-col gap-3 items-start w-full">
      <div className="rd-bubble bot">
        {a?.insufficient_info && <div className="rd-callout warn !p-3 mb-3 text-[0.92em]"><AlertTriangle size={18} className="shrink-0 mt-0.5" /><div>Mình chưa tìm thấy thông tin này trong tài liệu của công ty.
          {m.question && <div className="mt-2"><button className="rd-btn secondary sm" onClick={() => onSearch(m.question!)}><Search size={16} />Thử tìm trong thư viện</button></div>}</div></div>}
        {a?.analysis && <div className="rd-chip mb-2">Trợ lý đã xem “{a.analysis.filename}”</div>}
        {a?.localFile && <div className="rd-chip mb-2">Từ tệp của bạn: {a.localFile.name}</div>}
        {a?.cross_document && <div className="rd-chip mb-2 ml-1">Đã đối chiếu nhiều tài liệu</div>}
        <Md citeIds={[...(a?.sources || []).map((s) => s.id), ...(a?.sourceIds || [])]} citeTitles={Object.fromEntries((a?.sources || []).map((s) => [s.id, s.title]))}>{m.text}</Md>
        {a?.caveats && <div className="text-[0.88em] text-muted mt-2 flex gap-1.5 rd-caveat"><AlertTriangle size={14} className="shrink-0 mt-1 text-amber-600" /><div className="min-w-0 flex-1"><Md citeIds={[...(a.sources || []).map((s) => s.id)]} citeTitles={Object.fromEntries((a.sources || []).map((s) => [s.id, s.title]))}>{plainWords(a.caveats)}</Md></div></div>}
        {a?.general_knowledge && (
          <div className="rd-callout warn !p-3 mt-3 text-[0.92em]"><Lightbulb size={18} className="shrink-0 mt-0.5" />
            <div><b className="block mb-1">Thông tin thêm (không lấy từ tài liệu công ty)</b><Md>{a.general_knowledge}</Md></div></div>)}
        {(a?.warning || a?.mode === 'general') && <div className="rd-callout warn !p-3 mt-3 text-[0.92em]"><AlertTriangle size={18} className="shrink-0 mt-0.5" />Câu trả lời này lấy từ kiến thức chung của AI, không phải tài liệu công ty. Hãy kiểm tra lại trước khi làm theo.</div>}
        {a?.fileAsk && <FileAskBlock info={a.fileAsk} plain onOpen={onOpen} />}
        {a?.conflicts && a.conflicts.length > 0 && <div className="mt-3"><ConflictList conflicts={a.conflicts} plain onOpen={onOpen} /></div>}
        <MemoryUsed m={a?.memory} plain />
        {a?.warnings?.map((w, i) => <div key={i} className="rd-callout warn !p-3 mt-3 text-[0.92em]"><AlertTriangle size={18} className="shrink-0 mt-0.5" /><div className="min-w-0 flex-1 rd-inline-md"><Md citeIds={(a.sources || []).map((s) => s.id)} citeTitles={Object.fromEntries((a.sources || []).map((s) => [s.id, s.title]))}>{plainWords(w)}</Md></div></div>)}
        {a?.grounded && (srcs.length > 0 || cited.length > 0) && <div className="rd-chip ok mt-3"><CheckCircle2 size={15} />Có trong tài liệu của công ty</div>}
      </div>
      {srcs.length > 0 && (
        <div className="flex flex-col gap-2 w-full">
          <div className="text-[0.82em] font-bold text-muted">Xem bài gốc để chắc chắn:</div>
          {srcs.map((s) => {
            const Ico = TYPE_ICON[s.type as ItemType] || TYPE_ICON.document
            return (
              <div key={s.id} className="flex flex-col gap-2">
                <button className="rd-card click flex items-center gap-3 p-3.5" onClick={() => onOpen(s.id)}>
                  <span className="rd-ico md"><Ico size={22} /></span>
                  <span className="min-w-0 flex-1"><span className="block font-bold leading-snug">{s.title}</span><span className="block text-[0.82em] text-muted">{TYPE_SHORT[s.type as ItemType] || 'Tài liệu'}{s.tier ? ` · ${TIER_PLAIN[s.tier] || s.tier}` : ''}</span></span>
                  <span className="rd-chip">Mở bài<ArrowRight size={14} /></span>
                </button>
                {s.passages && s.passages.length > 0 && (
                  <details className="pl-2 text-[0.88em]"><summary className="cursor-pointer text-brand-700 font-bold">Xem đoạn gốc trong tài liệu ({s.passages.length})</summary>
                    <div className="flex flex-col gap-2 mt-2">{s.passages.map((p, i) => (
                      <div key={i} className="border border-line rounded-md bg-white px-3 py-2.5 leading-relaxed"><div className="text-[0.82em] text-muted mb-1">{[p.filename || 'Nội dung bài', p.page, p.section && `mục “${p.section}”`].filter(Boolean).join(' · ')}{p.ai_text_unverified && <span className="text-amber-700 font-bold"> · chữ do AI đọc, chưa ai kiểm tra</span>}</div>“{p.excerpt}”</div>))}</div></details>)}
                <div className="pl-2"><AttachStrip itemId={s.id} size={52} max={5} label={false} /></div>
              </div>)
          })}
        </div>)}
      {srcs.length === 0 && cited.length > 0 && <div className="flex gap-2 flex-wrap items-center text-[0.85em] text-muted">Bài gốc: {cited.map((id) => <button key={id} className="rd-chip" onClick={() => onOpen(id)}>Mở bài #{id}</button>)}</div>}
    </div>)
}

/** Khung trợ lý: dùng làm cột bên phải (dock) ở mọi trang, hoặc trang riêng. Luôn biết bạn đang đọc bài nào. */
export function AssistantPanel({ variant = 'dock', onClose }: { variant?: 'dock' | 'page'; onClose?: () => void }) {
  const { msgs, busy, ask, clear, mode, setMode, status, loadStatus, agentId, agents, newConversation } = useChat()
  const ctx = useReaderCtx((s) => s.item)
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [aboutDoc, setAboutDoc] = useState(true)
  const end = useRef<HTMLDivElement>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const agent = agents.find((a) => a.id === agentId)
  const general = mode === 'hybrid'
  const canGeneral = !status || status.features.includes('ask_hybrid')
  const { policy, setPolicy, deep, setDeep } = useChat()
  const visible = msgs.filter((m) => m.role !== 'sys' || !/hội thoại mới/.test(m.text))

  useEffect(() => { void loadStatus() }, []) // eslint-disable-line
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs.length, busy])
  useEffect(() => { if (variant === 'page') ta.current?.focus() }, [variant])
  useEffect(() => { if (mode === 'general') setMode('documents') }, [mode, setMode])
  useEffect(() => { setAboutDoc(true) }, [ctx?.id])

  async function send(text = q, withDoc = aboutDoc) {
    const t = text.trim(); if (t.length < 3 || busy) return
    setQ(''); if (ta.current) ta.current.style.height = 'auto'
    if (useChat.getState().agentId) useChat.getState().selectAgent(null)
    if (ctx && withDoc) await ask(t, general ? 'hybrid' : 'documents', t, { item_ids: [ctx.id] })
    else await ask(t, general ? 'hybrid' : 'documents')
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }
  function toggleGeneral(v: boolean) { setMode(v ? 'hybrid' : 'documents') }

  return (
    <div className={variant === 'page' ? 'rd-chat page' : 'rd-dock-in'} aria-label="Trợ lý">
      <div className="rd-chat-head">
        <span className="rd-ico md" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}><Bot size={24} /></span>
        <div className="flex-1 min-w-0"><div className="t">Trợ lý của bạn</div><div className="s">{agent ? 'Tự tra cứu và đọc tài liệu giúp bạn' : 'Tìm trong tài liệu công ty giúp bạn'}</div></div>
        {msgs.length > 0 && <button className="rd-btn sm" style={{ background: 'rgba(255,255,255,.18)', boxShadow: 'none', minHeight: 40, padding: '0 12px' }} onClick={clear} title="Xóa cuộc trò chuyện"><Trash2 size={16} /></button>}
        {onClose && <button className="rd-btn sm" style={{ background: 'rgba(255,255,255,.18)', boxShadow: 'none', padding: '0 12px' }} onClick={onClose} aria-label="Đóng trợ lý"><X size={20} /></button>}
      </div>

      {ctx && (
        <div className="rd-ctx">
          <div className="flex items-center gap-2.5 mb-2.5"><FileText size={18} className="text-brand-600 shrink-0" /><div className="min-w-0"><div className="text-[0.75em] font-bold uppercase tracking-wide text-muted">Bạn đang đọc</div><div className="font-bold leading-snug line-clamp-2">{ctx.title}</div></div></div>
          <div className="grid grid-cols-2 gap-2">
            {DOC_ACTIONS.map((a) => (
              <button key={a.key} className="rd-act" disabled={busy} onClick={() => void runDocAction(ctx, a)} title={a.hint}>{ACTION_ICON[a.key]}<span>{a.label}</span></button>))}
          </div>
        </div>)}

      <div className="rd-chat-body">
        {visible.length === 0 ? (
          <div className="m-auto w-full max-w-[520px] text-center flex flex-col gap-4 py-2">
            <span className="rd-ico lg g mx-auto"><MessageCircleQuestion size={30} /></span>
            <div><div className="text-[1.2em] font-black">{ctx ? 'Hỏi gì về bài này?' : 'Bạn cần giúp gì?'}</div><div className="text-muted mt-1">Cứ hỏi như đang nói chuyện với đồng nghiệp.</div></div>
            {!ctx && <div className="flex flex-col gap-2">{STARTERS.map((s) => <button key={s} className="rd-card click p-3.5 font-bold text-left flex items-center gap-3" onClick={() => void send(s, false)}><span className="flex-1">{s}</span><ArrowRight size={18} className="text-brand-600" /></button>)}</div>}
          </div>
        ) : visible.map((m) => <Bubble key={m.id} m={m} onOpen={(id) => nav(`/items/${id}`)} onSearch={(t) => nav(`/search?q=${encodeURIComponent(t)}`)} />)}
        {busy && <div className="rd-bubble bot flex items-center gap-3 text-muted"><Loader2 size={20} className="animate-spin text-brand-500" />Mình đang đọc tài liệu…</div>}
        <div ref={end} />
      </div>

      <div className="rd-chat-foot">
        <div className="flex gap-x-4 gap-y-1.5 flex-wrap items-center text-[0.86em]">
          {ctx && <label className="flex items-center gap-2 cursor-pointer font-semibold select-none"><input type="checkbox" className="w-[18px] h-[18px] accent-[#7a2ee6]" checked={aboutDoc} onChange={(e) => setAboutDoc(e.target.checked)} />Hỏi về bài đang đọc</label>}
          {canGeneral && <label className="flex items-center gap-2 cursor-pointer font-semibold select-none"><input type="checkbox" className="w-[18px] h-[18px] accent-[#7a2ee6]" checked={general} onChange={(e) => toggleGeneral(e.target.checked)} />Cho phép dùng kiến thức chung</label>}
          <span className="flex items-center gap-2 font-semibold">Nguồn dùng<span className="w-[190px]"><PolicySelect plain value={policy} onChange={setPolicy} /></span></span>
          <label className="flex items-center gap-2 cursor-pointer" title="Trợ lý xem thêm các bài cùng chủ đề trước khi trả lời — kỹ hơn nhưng chậm hơn một chút"><input type="checkbox" className="w-[18px] h-[18px] accent-[#7a2ee6]" checked={deep} onChange={(e) => setDeep(e.target.checked)} />Tìm kỹ hơn</label>
          {agent && msgs.length > 0 && <button className="ml-auto text-brand-700 font-bold bg-transparent border-0 cursor-pointer flex items-center gap-1.5 p-0" onClick={newConversation}><RotateCcw size={14} />Câu hỏi mới</button>}
        </div>
        <div className="row">
          <textarea ref={ta} rows={1} value={q} maxLength={agent ? 1500 : 400} placeholder={ctx && aboutDoc ? 'Hỏi về bài này…' : 'Gõ câu hỏi của bạn…'}
            onChange={(e) => { setQ(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(130, e.target.scrollHeight) + 'px' }} onKeyDown={onKey} aria-label="Câu hỏi" />
          <button className="rd-btn" style={{ height: 52 }} disabled={busy || q.trim().length < 3} onClick={() => void send()}><Send size={18} />Gửi</button>
        </div>
      </div>
    </div>)
}

export function AskPage() {
  return (
    <div className="flex flex-col gap-5">
      <div><h1 className="rd-h2 !text-[1.8em]"><MessageCircleQuestion size={30} className="text-brand-600" />Hỏi trợ lý</h1>
        <p className="rd-sub !mb-0">Gõ câu hỏi bằng lời của bạn — trợ lý tìm trong tài liệu của công ty và chỉ cho bạn bài gốc.</p></div>
      <div className="grid xl:grid-cols-[1fr_320px] gap-5 items-start">
        <AssistantPanel variant="page" />
        <div className="rd-card p-5 flex flex-col gap-4 text-[0.95em]">
          <div className="font-black flex items-center gap-2"><Sparkles size={20} className="text-amber-500" />Mẹo hỏi hiệu quả</div>
          <ul className="m-0 pl-5 flex flex-col gap-2 leading-relaxed">
            <li>Mô tả vấn đề bằng lời bình thường, không cần từ chuyên môn.</li>
            <li>Nói rõ bạn đang làm gì và thấy gì (ví dụ: “báo lỗi ERR_504”).</li>
            <li>Luôn bấm <b>“Mở bài”</b> để xem bài gốc trước khi làm theo.</li>
            <li>Đang đọc một bài? Mở trợ lý ngay trong bài đó để hỏi về chính bài ấy.</li>
          </ul>
          <div className="rd-callout info !p-3 text-[0.9em]"><User size={18} className="shrink-0 mt-0.5" />Câu trả lời có thể chưa đúng 100%. Việc quan trọng hãy hỏi người phụ trách.</div>
        </div>
      </div>
    </div>)
}
