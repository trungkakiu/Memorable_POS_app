import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { AlertTriangle, ArrowRight, BookOpen, Bot, CheckCircle2, FileText, Globe2, History, Lightbulb, ListChecks, Loader2, MessageCircleQuestion, Paperclip, RotateCcw, Search, Send, ShieldAlert, Sparkles, Trash2, User, X } from 'lucide-react'
import { Md, plainWords } from '../components/shared'
import { AttachStrip } from '../components/Attachments'
import { AskMode, LearnedRef, Msg, WEB_SCOPE_LABEL, WebScope, useChat } from '../store/chat'
import { get } from '../lib/api'
import type { ItemType } from '../lib/types'
import { TYPE_ICON, TYPE_SHORT } from './common'
import { ConflictList, FileAskBlock, MemoryUsed, PolicySelect } from '../components/Knowledge'
import { WebBlock, WebText } from '../components/WebAnswer'
import { TIER_PLAIN } from '../lib/format'
import { DOC_ACTIONS, runDocAction } from './aiAgent'
import { useReaderCtx } from './workspace'

const STARTERS: Record<'documents' | 'web', string[]> = {
  documents: ['Máy in không in được thì làm thế nào?', 'Quy trình xử lý khi hệ thống báo lỗi timeout?', 'Hướng dẫn sao lưu dữ liệu hằng ngày'],
  web: ['Mức lương cơ sở hiện nay là bao nhiêu?', 'Thời hạn nộp tờ khai thuế GTGT theo quý?', 'Cách ký số một file PDF bằng chữ ký số USB token?'],
}
const ACTION_ICON: Record<string, ReactNode> = { sum: <FileText size={18} />, easy: <Lightbulb size={18} />, todo: <ListChecks size={18} />, warn: <ShieldAlert size={18} /> }

// Ba cách trợ lý tìm câu trả lời, nói bằng lời thường
const MODES: { k: 'documents' | 'hybrid' | 'web'; icon: ReactNode; t: string; d: string; feature: string }[] = [
  { k: 'documents', icon: <BookOpen size={18} />, t: 'Tài liệu công ty', d: 'Chỉ trả lời từ tài liệu đã duyệt', feature: 'ask' },
  { k: 'hybrid', icon: <Lightbulb size={18} />, t: 'Tài liệu + hiểu biết chung', d: 'Thiếu thì AI bổ sung, có ghi rõ', feature: 'ask_hybrid' },
  { k: 'web', icon: <Globe2 size={18} />, t: 'Tìm trên Internet', d: 'Có nguồn, ưu tiên trang chính thống', feature: 'web_search' },
]

export function Bubble({ m, onOpen, onSearch, onAsk }: { m: Msg; onOpen: (id: number) => void; onSearch: (q: string) => void; onAsk?: (q: string, mode: AskMode) => void }) {
  const status = useChat((s) => s.status)
  const has = (f: string) => !status || status.features.includes(f)
  if (m.role === 'sys') return <div className="rd-callout info !py-3 text-[0.92em]"><CheckCircle2 size={18} className="shrink-0 mt-0.5" /><div>{m.text}</div></div>
  if (m.role === 'user') return (
    <div className="flex flex-col items-end gap-1.5">
      {m.files && m.files.length > 0 && <div className="flex gap-1.5 flex-wrap justify-end">{m.files.map((f, i) => <span key={i} className={`rd-chip ${f.status === 'error' ? 'bad' : ''}`}><Paperclip size={13} />{f.name}</span>)}</div>}
      {m.text && <div className="rd-bubble me">{m.mode === 'web' && <Globe2 size={14} className="inline mr-1.5 -mt-0.5 opacity-80" />}{m.text}</div>}
    </div>)
  if (m.err) return <div className="rd-bubble bot err"><b className="block mb-1">Mình chưa trả lời được lúc này</b>{m.err}</div>
  const a = m.ans
  const web = a?.web
  const srcs = a?.sources || []
  const cited = a?.sourceIds || []
  const st = useChat.getState()
  return (
    <div className="flex flex-col gap-3 items-start w-full">
      <div className="rd-bubble bot">
        {web && <div className="rd-chip mb-2"><Globe2 size={14} />{web.learned ? 'Câu trả lời Internet đã kiểm chứng' : 'Tìm trên Internet'}</div>}
        {a?.insufficient_info && !web && <div className="rd-callout warn !p-3 mb-3 text-[0.92em]"><AlertTriangle size={18} className="shrink-0 mt-0.5" /><div>Mình chưa tìm thấy thông tin này trong tài liệu của công ty.
          {m.question && <div className="mt-2 flex gap-2 flex-wrap">
            {onAsk && has('web_search') && <button className="rd-btn sm" onClick={() => onAsk(m.question!, 'web')}><Globe2 size={16} />Tìm trên Internet</button>}
            {onAsk && has('ask_hybrid') && a.mode !== 'hybrid' && <button className="rd-btn secondary sm" onClick={() => onAsk(m.question!, 'hybrid')}><Lightbulb size={16} />Hỏi bằng hiểu biết chung</button>}
            <button className="rd-btn secondary sm" onClick={() => onSearch(m.question!)}><Search size={16} />Tìm trong thư viện</button></div>}</div></div>}
        {a?.insufficient_info && web && <div className="rd-callout warn !p-3 mb-3 text-[0.92em]"><AlertTriangle size={18} className="shrink-0 mt-0.5" /><div>{m.text}
          {m.question && onAsk && <div className="mt-2"><button className="rd-btn sm" onClick={() => { st.setWebScope('balanced'); onAsk(m.question!, 'web') }}><Globe2 size={16} />Tìm rộng hơn trên Internet</button></div>}</div></div>}
        {a?.analysis && <div className="rd-chip mb-2">Trợ lý đã xem “{a.analysis.filename}”</div>}
        {a?.localFile && <div className="rd-chip mb-2">Từ tệp của bạn: {a.localFile.name}</div>}
        {a?.cross_document && <div className="rd-chip mb-2 ml-1">Đã đối chiếu nhiều tài liệu</div>}
        {web ? (!a?.insufficient_info && <WebText text={m.text} w={web} />)
          : <Md citeIds={[...(a?.sources || []).map((s) => s.id), ...(a?.sourceIds || [])]} citeTitles={Object.fromEntries((a?.sources || []).map((s) => [s.id, s.title]))}>{m.text}</Md>}
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
      {web && !a?.insufficient_info && (
        <WebBlock w={web} plain onAsk={onAsk ? (q) => onAsk(q, 'web') : undefined} onRate={(h) => void st.rateWeb(m.id, h)}
          onOpenLearned={(id) => void st.openLearned(id)} onRefresh={m.question && onAsk ? () => onAsk(m.question!, 'web') : undefined} />)}
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

/** Gợi ý câu hỏi tương tự đã có câu trả lời Internet kiểm chứng, khi đang gõ (không tốn AI) */
export function useLearnedSuggestions(q: string, enabled: boolean) {
  const [list, setList] = useState<LearnedRef[]>([])
  useEffect(() => {
    const t = q.trim()
    if (!enabled || t.length < 4) { setList([]); return }
    let on = true
    const timer = setTimeout(() => { get<LearnedRef[]>('/ai/web/suggestions', { q: t.slice(0, 300) }).then((r) => { if (on) setList((r || []).slice(0, 3)) }).catch(() => { if (on) setList([]) }) }, 350)
    return () => { on = false; clearTimeout(timer) }
  }, [q, enabled])
  return [list, () => setList([])] as const
}

/** Khung trợ lý: dùng làm cột bên phải (dock) ở mọi trang, hoặc trang riêng. Luôn biết bạn đang đọc bài nào. */
export function AssistantPanel({ variant = 'dock', onClose }: { variant?: 'dock' | 'page'; onClose?: () => void }) {
  const { msgs, busy, ask, clear, mode, setMode, status, loadStatus, agentId, agents, newConversation, webScope, setWebScope, openLearned } = useChat()
  const ctx = useReaderCtx((s) => s.item)
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [aboutDoc, setAboutDoc] = useState(true)
  const end = useRef<HTMLDivElement>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const agent = agents.find((a) => a.id === agentId)
  const { policy, setPolicy, deep, setDeep } = useChat()
  const visible = msgs.filter((m) => m.role !== 'sys' || !/hội thoại mới/.test(m.text))
  const has = (f: string) => !status || status.features.includes(f)
  const modes = MODES.filter((x) => has(x.feature))
  const cur: 'documents' | 'hybrid' | 'web' = mode === 'hybrid' || mode === 'web' ? mode : 'documents'
  const isWeb = cur === 'web'
  const [sugg, clearSugg] = useLearnedSuggestions(q, !busy && has('web_search'))

  useEffect(() => { void loadStatus() }, []) // eslint-disable-line
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs.length, busy])
  useEffect(() => { if (variant === 'page') ta.current?.focus() }, [variant])
  useEffect(() => { if (mode === 'general') setMode('documents') }, [mode, setMode])
  useEffect(() => { if (status && !modes.some((x) => x.k === cur)) setMode('documents') }, [status]) // eslint-disable-line
  useEffect(() => { setAboutDoc(true) }, [ctx?.id])

  async function send(text = q, withDoc = aboutDoc, as: AskMode = cur) {
    const t = text.trim(); if (t.length < 3 || busy) return
    setQ(''); clearSugg(); if (ta.current) ta.current.style.height = 'auto'
    if (useChat.getState().agentId) useChat.getState().selectAgent(null)
    if (as !== cur && (as === 'web' || as === 'hybrid' || as === 'documents')) setMode(as)
    if (as === 'web') await ask(t, 'web')
    else if (ctx && withDoc) await ask(t, as === 'hybrid' ? 'hybrid' : 'documents', t, { item_ids: [ctx.id] })
    else await ask(t, as === 'hybrid' ? 'hybrid' : 'documents')
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }
  const pickLearned = (id: number) => { setQ(''); clearSugg(); void openLearned(id) }

  return (
    <div className={variant === 'page' ? 'rd-chat page' : 'rd-dock-in'} aria-label="Trợ lý">
      <div className="rd-chat-head">
        <span className="rd-ico md" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}>{isWeb ? <Globe2 size={24} /> : <Bot size={24} />}</span>
        <div className="flex-1 min-w-0"><div className="t">Trợ lý của bạn</div><div className="s">{agent ? 'Tự tra cứu và đọc tài liệu giúp bạn' : isWeb ? 'Tìm trên Internet, có nguồn đã kiểm tra' : cur === 'hybrid' ? 'Tài liệu công ty, thiếu thì bổ sung hiểu biết chung' : 'Tìm trong tài liệu công ty giúp bạn'}</div></div>
        {msgs.length > 0 && <button className="rd-btn sm" style={{ background: 'rgba(255,255,255,.18)', boxShadow: 'none', minHeight: 40, padding: '0 12px' }} onClick={clear} title="Xóa cuộc trò chuyện"><Trash2 size={16} /></button>}
        {onClose && <button className="rd-btn sm" style={{ background: 'rgba(255,255,255,.18)', boxShadow: 'none', padding: '0 12px' }} onClick={onClose} aria-label="Đóng trợ lý"><X size={20} /></button>}
      </div>

      {ctx && !isWeb && (
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
            <span className="rd-ico lg g mx-auto">{isWeb ? <Globe2 size={30} /> : <MessageCircleQuestion size={30} />}</span>
            <div><div className="text-[1.2em] font-black">{isWeb ? 'Bạn muốn tra cứu gì trên Internet?' : ctx ? 'Hỏi gì về bài này?' : 'Bạn cần giúp gì?'}</div>
              <div className="text-muted mt-1">{isWeb ? 'Trợ lý tìm ở trang chính thống trước, luôn ghi nguồn và kiểm tra nguồn giúp bạn.' : 'Cứ hỏi như đang nói chuyện với đồng nghiệp.'}</div></div>
            {(!ctx || isWeb) && <div className="flex flex-col gap-2">{STARTERS[isWeb ? 'web' : 'documents'].map((s) => <button key={s} className="rd-card click p-3.5 font-bold text-left flex items-center gap-3" onClick={() => void send(s, false)}><span className="flex-1">{s}</span><ArrowRight size={18} className="text-brand-600" /></button>)}</div>}
          </div>
        ) : visible.map((m) => <Bubble key={m.id} m={m} onOpen={(id) => nav(`/items/${id}`)} onSearch={(t) => nav(`/search?q=${encodeURIComponent(t)}`)} onAsk={(t, md) => void send(t, false, md)} />)}
        {busy && <div className="rd-bubble bot flex items-center gap-3 text-muted"><Loader2 size={20} className="animate-spin text-brand-500" />{isWeb ? 'Mình đang tìm trên các trang chính thống và kiểm tra nguồn… (khoảng 10–30 giây)' : 'Mình đang đọc tài liệu…'}</div>}
        <div ref={end} />
      </div>

      <div className="rd-chat-foot">
        {modes.length > 1 && (
          <div className="ask-modes" role="radiogroup" aria-label="Trợ lý tìm câu trả lời ở đâu">
            {modes.map((x) => (
              <button key={x.k} role="radio" aria-checked={cur === x.k} className={clsx(cur === x.k && 'on')} onClick={() => setMode(x.k)} title={x.d}>
                {x.icon}<span><b>{x.t}</b><small>{x.d}</small></span>
              </button>))}
          </div>)}
        <div className="flex gap-x-4 gap-y-1.5 flex-wrap items-center text-[0.86em]">
          {isWeb ? (<>
            <span className="flex items-center gap-2 font-semibold">Tìm ở
              <select className="ask-scope" value={webScope} onChange={(e) => setWebScope(e.target.value as WebScope)}>{(Object.keys(WEB_SCOPE_LABEL) as WebScope[]).map((s) => <option key={s} value={s}>{WEB_SCOPE_LABEL[s]}{s === 'balanced' ? ' (khuyên dùng)' : ''}</option>)}</select></span>
            <span className="text-muted">Chỉ câu hỏi được gửi đi, không gửi tài liệu công ty.</span>
          </>) : (<>
            {ctx && <label className="flex items-center gap-2 cursor-pointer font-semibold select-none"><input type="checkbox" className="w-[18px] h-[18px] accent-[#7a2ee6]" checked={aboutDoc} onChange={(e) => setAboutDoc(e.target.checked)} />Hỏi về bài đang đọc</label>}
            <span className="flex items-center gap-2 font-semibold">Nguồn dùng<span className="w-[190px]"><PolicySelect plain value={policy} onChange={setPolicy} /></span></span>
            <label className="flex items-center gap-2 cursor-pointer" title="Trợ lý xem thêm các bài cùng chủ đề trước khi trả lời — kỹ hơn nhưng chậm hơn một chút"><input type="checkbox" className="w-[18px] h-[18px] accent-[#7a2ee6]" checked={deep} onChange={(e) => setDeep(e.target.checked)} />Tìm kỹ hơn</label>
          </>)}
          {msgs.length > 0 && <button className="ml-auto text-brand-700 font-bold bg-transparent border-0 cursor-pointer flex items-center gap-1.5 p-0" onClick={newConversation}><RotateCcw size={14} />Câu hỏi mới</button>}
        </div>
        {sugg.length > 0 && (
          <div className="ask-sugg" aria-live="polite">
            <div className="cap"><Sparkles size={14} />Đã có câu trả lời kiểm chứng cho câu hỏi tương tự — bấm để xem ngay:</div>
            {sugg.map((s) => <button key={s.id} onClick={() => pickLearned(s.id)}><History size={15} /><span className="flex-1 min-w-0"><b>{s.question}</b><small>{s.topic} · kiểm chứng {new Date(s.learned_at).toLocaleDateString('vi-VN')}</small></span><ArrowRight size={15} /></button>)}
          </div>)}
        <div className="row">
          <textarea ref={ta} rows={1} value={q} maxLength={agent ? 1500 : isWeb ? 1000 : 400} placeholder={isWeb ? 'Hỏi điều cần tra cứu trên Internet…' : ctx && aboutDoc ? 'Hỏi về bài này…' : 'Gõ câu hỏi của bạn…'}
            onChange={(e) => { setQ(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(130, e.target.scrollHeight) + 'px' }} onKeyDown={onKey} aria-label="Câu hỏi" />
          <button className="rd-btn" style={{ height: 52 }} disabled={busy || q.trim().length < 3} onClick={() => void send()}>{isWeb ? <Search size={18} /> : <Send size={18} />}{isWeb ? 'Tìm' : 'Gửi'}</button>
        </div>
      </div>
    </div>)
}

export function AskPage() {
  return (
    <div className="flex flex-col gap-5">
      <div><h1 className="rd-h2 !text-[1.8em]"><MessageCircleQuestion size={30} className="text-brand-600" />Hỏi trợ lý</h1>
        <p className="rd-sub !mb-0">Gõ câu hỏi bằng lời của bạn — trợ lý tìm trong tài liệu của công ty, hoặc tra cứu trên Internet có ghi nguồn.</p></div>
      <div className="grid xl:grid-cols-[1fr_320px] gap-5 items-start">
        <AssistantPanel variant="page" />
        <div className="rd-card p-5 flex flex-col gap-4 text-[0.95em]">
          <div className="font-black flex items-center gap-2"><Sparkles size={20} className="text-amber-500" />Mẹo hỏi hiệu quả</div>
          <ul className="m-0 pl-5 flex flex-col gap-2 leading-relaxed">
            <li>Mô tả vấn đề bằng lời bình thường, không cần từ chuyên môn.</li>
            <li>Nói rõ bạn đang làm gì và thấy gì (ví dụ: “báo lỗi ERR_504”).</li>
            <li>Việc của công ty: chọn <b>“Tài liệu công ty”</b> rồi bấm <b>“Mở bài”</b> để xem bài gốc.</li>
            <li>Quy định nhà nước, thủ tục, số liệu bên ngoài: chọn <b>“Tìm trên Internet”</b>. Nguồn có nhãn <b>Chính thống</b> là đáng tin nhất.</li>
          </ul>
          <div className="rd-callout info !p-3 text-[0.9em]"><User size={18} className="shrink-0 mt-0.5" />Câu trả lời có thể chưa đúng 100%. Việc quan trọng hãy mở trang gốc hoặc hỏi người phụ trách.</div>
        </div>
      </div>
    </div>)
}
