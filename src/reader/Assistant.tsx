import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { AlertTriangle, ArrowRight, BookOpen, Bot, CheckCircle2, ChevronDown, FileText, Globe2, History, Lightbulb, ListChecks, Loader2, Lock, MessageCircleQuestion, Paperclip, RotateCcw, Search, Send, ShieldAlert, ShieldCheck, Sparkles, Trash2, User, X } from 'lucide-react'
import { Md, plainWords } from '../components/shared'
import { AttachStrip } from '../components/Attachments'
import { AskMode, LearnedRef, Msg, WEB_SCOPE_LABEL, WebScope, getChatBytes, useChat } from '../store/chat'
import { AttachTray, FileThumb, SentFiles, useAttachments } from '../components/FileKit'
import { PreviewModal } from '../components/FileViewer'
import { LocalFile, get } from '../lib/api'
import type { ItemType } from '../lib/types'
import { TYPE_ICON, TYPE_SHORT } from './common'
import { ConflictList, FileAskBlock, MemoryUsed } from '../components/Knowledge'
import { WebBlock, WebText } from '../components/WebAnswer'
import { TIER_PLAIN } from '../lib/format'
import { DOC_ACTIONS, runDocAction } from './aiAgent'
import { useReaderCtx } from './workspace'
import { LimitedList } from '../components/ShowMore'

const STARTERS: Record<'documents' | 'web', string[]> = {
  documents: ['Máy in không in được thì làm thế nào?', 'Quy trình xử lý khi hệ thống báo lỗi timeout?', 'Hướng dẫn sao lưu dữ liệu hằng ngày'],
  web: ['Mức lương cơ sở hiện nay là bao nhiêu?', 'Thời hạn nộp tờ khai thuế GTGT theo quý?', 'Cách ký số một file PDF bằng chữ ký số USB token?'],
}
const ACTION_ICON: Record<string, ReactNode> = { sum: <FileText size={18} />, easy: <Lightbulb size={18} />, todo: <ListChecks size={18} />, warn: <ShieldAlert size={18} /> }

// Ba cách trợ lý tìm câu trả lời, nói bằng lời thường
const MODES: { k: 'documents' | 'hybrid' | 'web'; icon: ReactNode; t: string; short: string; d: string; feature: string }[] = [
  { k: 'documents', icon: <BookOpen size={16} />, t: 'Tài liệu công ty', short: 'Tài liệu', d: 'Chỉ trả lời từ tài liệu đã duyệt', feature: 'ask' },
  { k: 'hybrid', icon: <Lightbulb size={16} />, t: 'Tài liệu + hiểu biết chung', short: '+ Kiến thức', d: 'Thiếu thì AI bổ sung, có ghi rõ', feature: 'ask_hybrid' },
  { k: 'web', icon: <Globe2 size={16} />, t: 'Tìm trên Internet', short: 'Internet', d: 'Có nguồn, ưu tiên trang chính thống', feature: 'web_search' },
]

export function Bubble({ m, onOpen, onSearch, onAsk }: { m: Msg; onOpen: (id: number) => void; onSearch: (q: string) => void; onAsk?: (q: string, mode: AskMode) => void }) {
  const status = useChat((s) => s.status)
  const has = (f: string) => !status || status.features.includes(f)
  if (m.role === 'sys') return <div className="rd-callout info !py-3 text-[0.92em]"><CheckCircle2 size={18} className="shrink-0 mt-0.5" /><div>{m.text}</div></div>
  if (m.role === 'user') return (
    <div className="flex flex-col items-end gap-1.5">
      {m.files && m.files.length > 0 && <SentFiles files={m.files.map((f, i) => ({ name: f.name, size: f.size, bytes: getChatBytes(m.id, i), error: f.status === 'error' ? f.error || 'Lỗi' : undefined }))} />}
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
        {a?.fileChat && <div className="rd-chip mb-2"><Paperclip size={14} />Đã xem {a.fileChat.files.length} tệp{a.fileChat.kb ? ' · có đối chiếu tài liệu công ty' : ''}</div>}
        {a?.fileChat && a.fileChat.skipped.length > 0 && <div className="rd-callout warn !p-3 mb-2 text-[0.9em]"><AlertTriangle size={17} className="shrink-0 mt-0.5" /><div>{a.fileChat.skipped.map((s) => <div key={s.filename}><b>{s.filename}</b>: {s.reason}</div>)}</div></div>}
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
        {(a?.warning || (a?.mode === 'general' && !a.fileChat)) && <div className="rd-callout warn !p-3 mt-3 text-[0.92em]"><AlertTriangle size={18} className="shrink-0 mt-0.5" />Câu trả lời này lấy từ kiến thức chung của AI, không phải tài liệu công ty. Hãy kiểm tra lại trước khi làm theo.</div>}
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
          <LimitedList items={srcs} first={3} noun="bài nguồn" className="flex flex-col gap-2 w-full" render={(s) => {
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
                    <LimitedList items={s.passages} first={3} noun="đoạn" maxHeight="320px" className="flex flex-col gap-2 mt-2" render={(p, i) => (
                      <div key={i} className="border border-line rounded-md bg-white px-3 py-2.5 leading-relaxed"><div className="text-[0.82em] text-muted mb-1">{[p.filename || 'Nội dung bài', p.page, p.section && `mục “${p.section}”`].filter(Boolean).join(' · ')}{p.ai_text_unverified && <span className="text-amber-700 font-bold"> · chữ do AI đọc, chưa ai kiểm tra</span>}</div>“{p.excerpt}”</div>)} /></details>)}
                <div className="pl-2"><AttachStrip itemId={s.id} size={52} max={5} label={false} /></div>
              </div>)
          }} />
        </div>)}
      {srcs.length === 0 && cited.length > 0 && <div className="flex gap-2 flex-wrap items-center text-[0.85em] text-muted">Bài gốc: <LimitedList items={cited} first={8} noun="bài" className="contents" render={(id) => <button key={id} className="rd-chip" onClick={() => onOpen(id)}>Mở bài #{id}</button>} /></div>}
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
  const { msgs, busy, ask, clear, mode, setMode, status, loadStatus, agentId, agents, newConversation, webScope, setWebScope, openLearned, fileCtx, removeFileCtx, clearFileCtx } = useChat()
  const att = useAttachments()
  const [view, setView] = useState<LocalFile | null>(null)
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
  // Thao tác nhanh với bài đang đọc: mở sẵn khi chưa có tin nhắn, tự gập khi đang trò chuyện để nhường chỗ
  const [ctxOpen, setCtxOpen] = useState(true)

  useEffect(() => { void loadStatus() }, []) // eslint-disable-line
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs.length, busy])
  useEffect(() => { if (variant === 'page') ta.current?.focus() }, [variant])
  useEffect(() => { if (mode === 'general') setMode('documents') }, [mode, setMode])
  useEffect(() => { if (status && !modes.some((x) => x.k === cur)) setMode('documents') }, [status]) // eslint-disable-line
  useEffect(() => { setAboutDoc(true); setCtxOpen(true) }, [ctx?.id])
  useEffect(() => { if (visible.length > 0) setCtxOpen(false) }, [visible.length > 0]) // eslint-disable-line

  async function send(text = q, withDoc = aboutDoc, as: AskMode = cur) {
    const t = text.trim()
    const files = att.files
    const withFiles = files.length > 0 || (useChat.getState().fileCtx.length > 0 && as !== 'web')
    if (busy || (!withFiles && t.length < 3) || (withFiles && !files.length && !t)) return
    setQ(''); clearSugg(); if (ta.current) ta.current.style.height = 'auto'
    if (useChat.getState().agentId) useChat.getState().selectAgent(null)
    if (as !== cur && (as === 'web' || as === 'hybrid' || as === 'documents')) setMode(as)
    // Có tệp: AI nhìn ảnh/PDF, đọc tài liệu, chép lời ghi âm rồi trả lời (chế độ tài liệu thì đối chiếu thêm tài liệu công ty)
    if (withFiles) { att.clear(); await useChat.getState().askFile(files, t); return }
    if (as === 'web') await ask(t, 'web')
    else if (ctx && withDoc) await ask(t, as === 'hybrid' ? 'hybrid' : 'documents', t, { item_ids: [ctx.id] })
    else await ask(t, as === 'hybrid' ? 'hybrid' : 'documents')
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }
  const pickLearned = (id: number) => { setQ(''); clearSugg(); void openLearned(id) }
  const curMode = MODES.find((x) => x.k === cur)!

  return (
    <div className={clsx(variant === 'page' ? 'rd-chat page' : 'rd-dock-in', 'relative')} aria-label="Trợ lý" {...att.dropProps}>
      {att.over && <div className="fc-drop-over !rounded-none"><Paperclip size={30} />Thả tệp vào đây để hỏi trợ lý</div>}
      {view?.bytes && <PreviewModal src={{ type: 'local', name: view.name, bytes: view.bytes }} onClose={() => setView(null)} />}
      <div className="rd-chat-head ask-head">
        <span className="ico">{isWeb ? <Globe2 size={19} /> : <Bot size={19} />}</span>
        <div className="flex-1 min-w-0"><div className="t">Trợ lý của bạn</div><div className="s truncate" title={curMode.d}>{agent ? 'Tự tra cứu và đọc tài liệu giúp bạn' : curMode.d}</div></div>
        {msgs.length > 0 && <button className="hb" onClick={newConversation} title="Câu hỏi mới (bắt đầu chủ đề khác)" aria-label="Câu hỏi mới"><RotateCcw size={16} /></button>}
        {msgs.length > 0 && <button className="hb" onClick={clear} title="Xóa cuộc trò chuyện" aria-label="Xóa cuộc trò chuyện"><Trash2 size={16} /></button>}
        {onClose && <button className="hb" onClick={onClose} aria-label="Đóng trợ lý"><X size={18} /></button>}
      </div>

      {ctx && !isWeb && (
        <div className="ask-ctx">
          <button className="bar" onClick={() => setCtxOpen(!ctxOpen)} aria-expanded={ctxOpen}>
            <FileText size={15} className="shrink-0 text-brand-600" />
            <span className="min-w-0 flex-1 truncate"><span className="text-muted">Đang đọc: </span><b>{ctx.title}</b></span>
            <span className="tg">{ctxOpen ? 'Ẩn' : 'Thao tác nhanh'}<ChevronDown size={14} className={clsx('transition', ctxOpen && 'rotate-180')} /></span>
          </button>
          {ctxOpen && (
            <div className="acts">
              {DOC_ACTIONS.map((a) => <button key={a.key} disabled={busy} onClick={() => void runDocAction(ctx, a)} title={a.hint}>{ACTION_ICON[a.key]}{a.label}</button>)}
            </div>)}
        </div>)}

      <div className="rd-chat-body">
        {visible.length === 0 ? (
          <div className="m-auto w-full max-w-[520px] text-center flex flex-col gap-3 py-2">
            <span className="rd-ico md g mx-auto">{isWeb ? <Globe2 size={24} /> : <MessageCircleQuestion size={24} />}</span>
            <div><div className="text-[1.1em] font-black">{isWeb ? 'Bạn muốn tra cứu gì trên Internet?' : ctx && aboutDoc ? 'Hỏi gì về bài này?' : 'Bạn cần giúp gì?'}</div>
              <div className="text-muted text-[0.92em] mt-1">{isWeb ? 'Tìm ở trang chính thống trước, luôn ghi nguồn và kiểm tra nguồn.' : 'Cứ hỏi như đang nói chuyện với đồng nghiệp.'}</div></div>
            {(!ctx || isWeb) && <div className="flex flex-col gap-2">{STARTERS[isWeb ? 'web' : 'documents'].map((s) => <button key={s} className="rd-card click px-3.5 py-2.5 font-bold text-left flex items-center gap-3 text-[0.93em]" onClick={() => void send(s, false)}><span className="flex-1">{s}</span><ArrowRight size={16} className="text-brand-600" /></button>)}</div>}
          </div>
        ) : visible.map((m) => <Bubble key={m.id} m={m} onOpen={(id) => nav(`/items/${id}`)} onSearch={(t) => nav(`/search?q=${encodeURIComponent(t)}`)} onAsk={(t, md) => void send(t, false, md)} />)}
        {busy && <div className="rd-bubble bot flex items-center gap-3 text-muted"><Loader2 size={20} className="animate-spin text-brand-500" />{fileCtx.length && !isWeb ? 'Mình đang xem tệp của bạn…' : isWeb ? 'Đang tìm trên các trang chính thống và kiểm tra nguồn… (10–30 giây)' : 'Mình đang đọc tài liệu…'}</div>}
        <div ref={end} />
      </div>

      <div className="rd-chat-foot ask-foot">
        {modes.length > 1 && (
          <div className="ask-seg" role="radiogroup" aria-label="Trợ lý tìm câu trả lời ở đâu">
            {modes.map((x) => (
              <button key={x.k} role="radio" aria-checked={cur === x.k} className={clsx(cur === x.k && 'on')} onClick={() => setMode(x.k)} title={`${x.t}: ${x.d}`}>{x.icon}<span>{x.short}</span></button>))}
          </div>)}
        <div className="ask-opts">
          {isWeb ? (<>
            <label className="opt sel" title="Trang nào được dùng làm nguồn"><Globe2 size={14} /><select value={webScope} onChange={(e) => setWebScope(e.target.value as WebScope)} aria-label="Phạm vi tìm trên Internet">{(Object.keys(WEB_SCOPE_LABEL) as WebScope[]).map((s) => <option key={s} value={s}>{WEB_SCOPE_LABEL[s]}</option>)}</select></label>
            <span className="opt note" title="Chỉ câu hỏi được gửi đi để tìm kiếm, không gửi tài liệu của công ty"><Lock size={13} />Không gửi tài liệu công ty</span>
          </>) : (<>
            {ctx && <button className={clsx('opt', aboutDoc && 'on')} aria-pressed={aboutDoc} onClick={() => setAboutDoc(!aboutDoc)} title="Chỉ hỏi về bài đang đọc">{aboutDoc ? <CheckCircle2 size={14} /> : <FileText size={14} />}Về bài này</button>}
            <label className="opt sel" title="Nguồn tài liệu trợ lý được dùng: tự động, chỉ tài liệu đã kiểm duyệt, hoặc chỉ tài liệu chính thống"><ShieldCheck size={14} />Nguồn:<select value={policy} onChange={(e) => setPolicy(e.target.value as never)} aria-label="Nguồn dùng"><option value="auto">Tự động</option><option value="reviewed">Đã kiểm duyệt</option><option value="official">Chính thống</option></select></label>
            <button className={clsx('opt', deep && 'on')} aria-pressed={deep} onClick={() => setDeep(!deep)} title="Xem thêm các bài cùng chủ đề trước khi trả lời — kỹ hơn nhưng chậm hơn">{deep ? <CheckCircle2 size={14} /> : <Search size={14} />}Tìm kỹ</button>
          </>)}
        </div>
        {sugg.length > 0 && (
          <div className="ask-sugg" aria-live="polite">
            <div className="cap"><Sparkles size={14} />Đã có câu trả lời kiểm chứng cho câu hỏi tương tự:</div>
            {sugg.map((s) => <button key={s.id} onClick={() => pickLearned(s.id)}><History size={15} /><span className="flex-1 min-w-0"><b>{s.question}</b><small>{s.topic} · kiểm chứng {new Date(s.learned_at).toLocaleDateString('vi-VN')}</small></span><ArrowRight size={15} /></button>)}
          </div>)}
        {fileCtx.length > 0 && !isWeb && (
          <div className="fc-ctx !mb-0">
            <span className="cap">AI đang xem:</span>
            {fileCtx.map((f, i) => <span key={`${f.name}|${f.size}`} className="fc-ctx-chip" title={f.name}><FileThumb name={f.name} bytes={f.bytes} className="fc-ctx-th" /><span className="truncate">{f.name}</span><button onClick={() => removeFileCtx(i)} aria-label={`Bỏ ${f.name}`}><X size={12} /></button></span>)}
            <button className="fc-ctx-done" onClick={clearFileCtx} title="Hỏi tiếp mà không kèm tệp">Xong với tệp</button>
          </div>)}
        {att.files.length > 0 && <AttachTray files={att.files} onRemove={att.remove} onOpen={setView} />}
        <div className="ask-input">
          <button className="clip" onClick={() => void att.pick()} title="Đính kèm ảnh, PDF, Word, Excel, ghi âm (hoặc kéo thả, dán ảnh Ctrl+V)" aria-label="Đính kèm tệp"><Paperclip size={18} /></button>
          <textarea onPaste={(e) => att.onPaste(e)} ref={ta} rows={1} value={q} maxLength={agent ? 1500 : isWeb ? 1000 : 400} placeholder={att.files.length || (fileCtx.length && !isWeb) ? 'Hỏi về tệp…' : isWeb ? 'Hỏi điều cần tra cứu trên Internet…' : ctx && aboutDoc ? 'Hỏi về bài này…' : 'Gõ câu hỏi hoặc đính kèm ảnh, tệp…'}
            onChange={(e) => { setQ(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(130, e.target.scrollHeight) + 'px' }} onKeyDown={onKey} aria-label="Câu hỏi" />
          <button className="go" disabled={busy || (q.trim().length < 3 && !att.files.length)} onClick={() => void send()} aria-label={isWeb ? 'Tìm' : 'Gửi'} title={isWeb ? 'Tìm (Enter)' : 'Gửi (Enter)'}>{busy ? <Loader2 size={18} className="animate-spin" /> : isWeb ? <Search size={18} /> : <Send size={18} />}</button>
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
