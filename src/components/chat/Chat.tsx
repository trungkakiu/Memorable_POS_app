import { ClipboardEvent, DragEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertCircle, AlertTriangle, Bot, CheckCircle2, Eye, ExternalLink, Plus, Settings2, Wrench, FileUp, Info, Loader2, Maximize2, Minimize2, Paperclip, Send, ShieldCheck, Sparkles, Trash2, UploadCloud, User as UserIcon, X,
} from 'lucide-react'
import { fromBrowserFile, isAiVisionName, pickLocalFiles, UPLOAD_MB } from '../../lib/api'
import { bytes as fmtBytes, dt, FILE_ICON, FRESH_LABEL, KNOWLEDGE_LABEL, TOOL_LABEL, TRUST_LABEL, TYPE_LABEL } from '../../lib/format'
import { KIND_LABEL, extOf, kindOf } from '../../lib/preview'
import { can } from '../../lib/permissions'
import { useAuth } from '../../store/auth'
import { AskMode, ChatFile, MODE_FEATURE, MODE_HINT, MODE_LABEL, Msg, WEB_SCOPE_LABEL, WebScope, getChatBytes, useChat } from '../../store/chat'
import { WebBlock, WebText } from '../WebAnswer'
import { toast } from '../../store/ui'
import { AttachImage, AttachStrip, LocalThumb } from '../Attachments'
import { FileSource, PreviewModal } from '../FileViewer'
import { Md } from '../shared'
import { Pill, Seg } from '../ui'
import { ConflictList, FileAskBlock, MemoryUsed, PolicySelect } from '../Knowledge'
import { TIER_LABEL, TIER_TONE } from '../../lib/format'
import { LimitedList } from '../ShowMore'

const STARTERS = ['Quy trình xử lý lỗi ERR_504 là gì?', 'Sao lưu cơ sở dữ liệu chạy lúc mấy giờ?', 'Có prompt nào dịch văn bản không?']
const routeItemId = (p: string) => { const m = /^\/items\/(\d+)/.exec(p); return m ? Number(m[1]) : undefined }

/** Tệp đính kèm trong tin nhắn của người dùng: ảnh → thumbnail, loại khác → thẻ; bấm để xem trước. */
function ChatFileChip({ msgId, index, f, onOpen }: { msgId: number; index: number; f: ChatFile; onOpen: (s: FileSource) => void }) {
  const bytes = getChatBytes(msgId, index)
  const image = kindOf(f.name) === 'image'
  const open = () => { if (bytes) onOpen({ type: 'local', name: f.name, bytes }); else if (f.attId) onOpen({ type: 'att', id: f.attId, name: f.name, size: f.size }) }
  const canOpen = !!bytes || !!f.attId
  return (
    <button className={clsx('relative border rounded-lg overflow-hidden bg-white/95 text-left', canOpen ? 'cursor-pointer hover:shadow' : 'cursor-default', f.status === 'error' ? 'border-red-300' : 'border-white/40')}
      title={f.status === 'error' ? `${f.name} — lỗi: ${f.error}` : `${f.name} — bấm để xem trước`} onClick={open} style={{ color: '#1c2030' }}>
      {image ? (bytes ? <LocalThumb file={{ name: f.name, size: f.size, bytes }} className="w-20 h-20" /> : f.attId ? <AttachImage id={f.attId} className="w-20 h-20 object-cover" /> : <span className="w-20 h-20 grid place-items-center text-2xl">🖼️</span>)
        : <span className="flex items-center gap-2 px-2.5 py-2 max-w-[200px]"><span className="text-xl">{FILE_ICON[extOf(f.name)] || '📎'}</span>
          <span className="min-w-0"><span className="block text-xs font-bold truncate">{f.name}</span><span className="block text-[10.5px] text-muted">{KIND_LABEL[kindOf(f.name)]} · {fmtBytes(f.size)}</span></span></span>}
      <span className="absolute top-1 right-1 bg-white rounded-sm p-0.5 shadow-sm">
        {f.status === 'saving' ? <Loader2 size={12} className="animate-spin text-brand-600" /> : f.status === 'saved' ? <CheckCircle2 size={12} className="text-green-600" /> : <AlertCircle size={12} className="text-red-600" />}</span>
    </button>)
}

export function Messages({ msgs, busy, onOpenItem, onPick, onAsk, compact }: { msgs: Msg[]; busy: boolean; onOpenItem: (id: number) => void; onPick: (q: string) => void; onAsk: (q: string, mode: AskMode) => void; compact?: boolean }) {
  const end = useRef<HTMLDivElement>(null)
  const feats = useChat((s) => s.status?.features)
  const [view, setView] = useState<FileSource | null>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs.length, busy])
  const { pathname } = useLocation()
  const itemId = routeItemId(pathname)
  const starters = itemId ? [`Tóm tắt nội dung mục #${itemId} và các lưu ý quan trọng`, ...STARTERS.slice(0, 2)] : STARTERS

  if (msgs.length === 0) return (
    <div className="m-auto text-center flex flex-col items-center gap-3 py-4 w-full">
      <span className="w-12 h-12 rounded-lg bg-brand-100 text-brand-600 grid place-items-center"><Sparkles size={24} /></span>
      <div><div className="font-extrabold text-ink">Tôi có thể giúp gì cho bạn?</div>
        <div className="text-xs text-muted mt-1 max-w-[320px] mx-auto">Hỏi theo tài liệu, hoặc <b>kéo thả / dán tệp & ảnh</b> vào khung chat để lưu thẳng vào kho tri thức — có xem trước ngay.</div></div>
      <div className="flex flex-col gap-2 w-full max-w-[420px]">{starters.map((x) => <button key={x} className="cat-chip" onClick={() => onPick(x)}>{x}</button>)}</div>
    </div>)

  return (
    <>
      {msgs.map((m) => m.role === 'sys' ? (
        <div key={m.id} className="rounded-lg border border-brand-200 bg-white px-3 py-2.5 text-[12.5px] flex items-start gap-2 shadow-sm">
          <Info size={15} className="text-brand-600 shrink-0 mt-0.5" /><div className="flex-1 leading-snug">{m.text}
            {m.itemId && <div className="mt-1.5"><button className="btn outline sm" onClick={() => onOpenItem(m.itemId!)}><ExternalLink size={12} />Mở mục #{m.itemId}</button></div>}</div>
        </div>
      ) : m.role === 'user' ? (
        <div key={m.id} className="msg user"><div className="flex flex-col items-end gap-1.5 min-w-0 max-w-[calc(100%-40px)]">
          {m.files && m.files.length > 0 && <div className="flex gap-2 flex-wrap justify-end">{m.files.map((f, i) => <ChatFileChip key={i} msgId={m.id} index={i} f={f} onOpen={setView} />)}</div>}
          {m.text && <div className="bubble u" style={{ maxWidth: '100%' }}>{m.text}</div>}
        </div><span className="av"><UserIcon size={15} /></span></div>
      ) : (
        <div key={m.id} className="msg ai"><span className="av"><Bot size={15} /></span>
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            {m.err ? <div className="bubble err">{m.err}</div> : (
              <div className="bubble a">
                <div className="mb-2 flex gap-1.5 flex-wrap">
                  {m.ans?.analysis
                    ? <Pill sm tone="soft"><Eye size={11} />{m.ans.analysis.kind === 'image' ? 'AI đọc ảnh' : 'AI đọc PDF'}: {m.ans.analysis.filename}</Pill>
                    : <Pill sm tone={m.ans?.mode === 'general' ? 'warn' : 'soft'}>{m.ans?.agentName ? KNOWLEDGE_LABEL[m.ans?.mode ?? 'documents'] : MODE_LABEL[m.ans?.mode ?? 'documents']}</Pill>}
                  {m.ans?.agentName && <Pill sm tone="soft"><Bot size={11} />Agent: {m.ans.agentName}</Pill>}
                  {m.ans?.fileChat && <Pill sm tone="soft"><Paperclip size={11} /><span className="truncate max-w-[320px]" title={m.ans.fileChat.files.map((f) => f.filename).join(', ')}>AI đã xem {m.ans.fileChat.files.slice(0, 2).map((f) => f.filename).join(', ')}{m.ans.fileChat.files.length > 2 ? ` +${m.ans.fileChat.files.length - 2} tệp` : ''}</span>{m.ans.fileChat.kb ? ' · đối chiếu tài liệu' : ''}</Pill>}
                  {m.ans?.cross_document && <Pill sm tone="soft">Đối chiếu nhiều tài liệu</Pill>}
                  {m.ans?.grounded === true && <Pill sm tone="ok"><ShieldCheck size={11} />Có nguồn tài liệu</Pill>}
                  {m.ans?.insufficient_info && <Pill tone="warn" sm><AlertTriangle size={11} />Không đủ thông tin trong kho tri thức</Pill>}
                </div>
                {m.ans?.fileChat?.skipped.slice(0, 3).map((s) => <div key={s.filename} className="mb-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 break-words"><b>{s.filename}</b>: {s.reason}</div>)}
                {(m.ans?.fileChat?.skipped.length || 0) > 3 && <div className="mb-2 text-xs text-amber-900">… và {m.ans!.fileChat!.skipped.length - 3} tệp khác bị bỏ qua</div>}
                {m.ans?.mode === 'hybrid' && <div className="text-[10.5px] font-bold uppercase text-muted mb-1 tracking-wide">Từ tài liệu của nhóm</div>}
                {m.ans?.web ? <WebText text={m.text} w={m.ans.web} /> : <Md citeIds={[...(m.ans?.sources || []).map((s) => s.id), ...(m.ans?.sourceIds || [])]}>{m.text}</Md>}
                {m.ans?.caveats && <div className="text-xs text-amber-800 mt-2 pt-2 border-t border-line flex gap-1"><b className="shrink-0">Lưu ý:</b><div className="min-w-0 flex-1"><Md citeIds={(m.ans.sources || []).map((s) => s.id)}>{m.ans.caveats}</Md></div></div>}
                {m.ans?.fileAsk && <FileAskBlock info={m.ans.fileAsk} onOpen={onOpenItem} />}
                {m.ans?.conflicts && m.ans.conflicts.length > 0 && <div className="mt-3"><ConflictList conflicts={m.ans.conflicts} onOpen={onOpenItem} /></div>}
                <MemoryUsed m={m.ans?.memory} />
                {m.ans?.retrieval?.excluded_by_policy ? <div className="mt-2 text-[11px] text-muted">{m.ans.retrieval.excluded_by_policy} tài liệu khớp nhưng bị loại do chính sách nguồn.</div> : null}
                {m.ans?.tools_used && m.ans.tools_used.length > 0 && (
                  <details className="mt-3 text-xs rounded-md border border-line-soft bg-brand-50 px-2.5 py-2">
                    <summary className="cursor-pointer font-bold text-brand-700 flex items-center gap-1.5"><Wrench size={12} />Agent đã làm gì ({m.ans.tools_used.length} thao tác{m.ans.steps ? ` · ${m.ans.steps} vòng` : ''})</summary>
                    <ol className="m-0 mt-2 pl-4 flex flex-col gap-1"><LimitedList items={m.ans.tools_used} first={5} noun="thao tác" className="contents" render={(t, i) => (
                      <li key={i}>{TOOL_LABEL[t.tool] || t.tool}: <code className="break-all">{Object.values(t.args || {}).join(', ')}</code> {t.ok ? '✓' : <span className="text-red-600">✗ lỗi</span>}</li>)} /></ol>
                    {m.ans.consulted && m.ans.consulted.length > 0 && <div className="mt-2 text-muted flex flex-wrap gap-1.5 items-center">Đã đọc: <LimitedList items={m.ans.consulted} first={12} noun="mục" className="contents" render={(id) => <button key={id} className="cat-chip !py-0.5 !px-2 !text-[11px]" onClick={() => onOpenItem(id)}>#{id}</button>} /></div>}
                  </details>)}
                {m.ans?.warnings?.map((w, i) => <div key={i} className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2 flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" /><div className="min-w-0 flex-1"><Md>{w}</Md></div></div>)}
                {m.ans?.analysis?.note && <div className="mt-2 text-[11px] text-muted flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-0.5" />{m.ans.analysis.note}</div>}
                {m.ans?.analysis && <button className="btn outline sm mt-2" onClick={() => onOpenItem(m.ans!.analysis!.item_id)}><ExternalLink size={12} />Mở mục #{m.ans.analysis.item_id}</button>}
                {m.ans?.general_knowledge && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5">
                    <div className="text-[10.5px] font-bold uppercase text-amber-800 mb-1 tracking-wide">Bổ sung từ kiến thức chung (không thuộc tài liệu nhóm)</div>
                    <Md>{m.ans.general_knowledge}</Md>
                  </div>)}
                {m.ans?.warning && <div className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2 flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{m.ans.warning}</div>}
                {m.ans?.suggests_documents && m.question && (
                  <button className="btn outline sm mt-2" onClick={() => onAsk(m.question!, 'documents')}>Câu hỏi này cần thông tin nội bộ — hỏi lại trong tài liệu</button>)}
                {m.ans?.insufficient_info && m.ans.mode !== 'web' && m.question && (!feats || feats.includes('web_search')) && (
                  <button className="btn outline sm mt-2" onClick={() => onAsk(m.question!, 'web')}>Tìm trên Internet (ưu tiên nguồn chính thống, có xác minh)</button>)}
                {m.ans?.web && <WebBlock w={m.ans.web} onAsk={(q) => onAsk(q, 'web')} onRate={(h) => void useChat.getState().rateWeb(m.id, h)} onOpenLearned={(id) => void useChat.getState().openLearned(id)} onRefresh={m.question ? () => onAsk(m.question!, 'web') : undefined} />}
              </div>)}
            {m.ans && m.ans.sources.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-[10.5px] font-bold uppercase text-muted flex items-center gap-1 tracking-wide"><ShieldCheck size={12} />Nguồn trích dẫn ({m.ans.sources.length})</div>
                <LimitedList items={m.ans.sources} first={3} noun="nguồn" className="flex flex-col gap-2" render={(s) => (
                  <div key={s.id} className="flex flex-col gap-1.5">
                    <button className="src" onClick={() => onOpenItem(s.id)}>
                      <Pill sm tone="soft">{TYPE_LABEL[s.type] || s.type}</Pill>{s.tier && <Pill sm tone={TIER_TONE[s.tier] || 'gray'}>{TIER_LABEL[s.tier] || s.tier}</Pill>}<b className="truncate flex-1">{s.title}</b>
                      {!compact && <><Pill sm tone="gray">{TRUST_LABEL[s.trust_label] || s.trust_label}</Pill><Pill sm tone={s.freshness === 'fresh' ? 'ok' : 'warn'}>{FRESH_LABEL[s.freshness] || s.freshness}</Pill><span className="text-muted">{dt(s.next_review_date, false)}</span></>}
                      <ExternalLink size={12} className="text-muted shrink-0" />
                    </button>
                    {s.passages && s.passages.length > 0 && (
                      <details className="pl-2 text-xs"><summary className="cursor-pointer text-brand-700 font-bold">Xem {s.passages.length} đoạn đã dùng (tệp, trang, mục)</summary>
                        <LimitedList items={s.passages} first={4} noun="đoạn" maxHeight="320px" className="flex flex-col gap-1.5 mt-1.5" render={(p, i) => (
                          <div key={i} className="border border-line-soft rounded-md bg-white px-2.5 py-2"><div className="text-[11px] text-muted mb-0.5">{[p.filename || 'Nội dung bài', p.page, p.section && `mục “${p.section}”`].filter(Boolean).join(' · ')}{p.ai_text_unverified && <span className="text-amber-700 font-bold"> · chữ AI chưa kiểm chứng</span>}</div>{p.excerpt}</div>)} /></details>)}
                    {/* Tệp/ảnh của mục nguồn hiện ngay dưới câu trả lời, bấm để xem trước */}
                    <div className="pl-2"><AttachStrip itemId={s.id} size={compact ? 44 : 56} max={compact ? 5 : 8} label={false} /></div>
                  </div>)} />
              </div>)}
            {m.ans && m.ans.sources.length === 0 && m.ans.sourceIds && m.ans.sourceIds.length > 0 && (
              <div className="flex gap-1.5 flex-wrap items-center text-xs text-muted"><ShieldCheck size={12} />Nguồn đã trích: <LimitedList items={m.ans.sourceIds} first={10} noun="tài liệu" className="contents" render={(id) => <button key={id} className="cat-chip !py-0.5 !px-2 !text-[11px]" onClick={() => onOpenItem(id)}>tài liệu #{id}</button>} /></div>)}
            {m.ans && <div className="text-[10.5px] text-muted">{m.ans.model} · ${m.ans.cost_usd}</div>}
          </div></div>))}
      {busy && <div className="msg ai"><span className="av"><Bot size={15} /></span><div className="bubble a"><span className="typing"><i /><i /><i /></span></div></div>}
      <div ref={end} />
      {view && <PreviewModal src={view} onClose={() => setView(null)} />}
    </>)
}

/** Chọn nói chuyện với trợ lý chung hay một Agent cá nhân hóa của mình / của đồng nghiệp. */
export function AgentBar() {
  const { agents, agentId, selectAgent, loadAgents, newConversation, status, msgs, askConvId } = useChat()
  const role = useAuth((s) => s.user?.role)
  const nav = useNavigate()
  useEffect(() => { void loadAgents() }, []) // eslint-disable-line
  if (!can(role, 'ask') || (status && !status.features.includes('agent'))) return null
  const cur = agents.find((a) => a.id === agentId)
  return (
    <div className="px-3 py-2 bg-white border-b border-line flex items-center gap-2">
      <Bot size={16} className="text-brand-600 shrink-0" />
      <select className="select !h-8 !text-xs flex-1 min-w-0" aria-label="Chọn Agent" value={agentId ?? ''} onChange={(e) => selectAgent(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Trợ lý chung (hỏi đáp tài liệu)</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.is_mine ? '' : '👥 '}{a.name}</option>)}
      </select>
      {(cur || askConvId) && <button className="btn ghost sm icon" title={cur ? 'Bắt đầu hội thoại mới với Agent' : `Bắt đầu hội thoại mới (đang ở hội thoại #${askConvId}; trợ lý nhớ các câu trước trong hội thoại này)`} onClick={newConversation}><Plus size={14} /></button>}
      {cur && <button className="btn ghost sm icon" title="Trang Agent đầy đủ" onClick={() => nav(`/agents/${cur.id}/chat`)}><ExternalLink size={14} /></button>}
      <button className="btn ghost sm icon" title="Quản lý Agent" onClick={() => nav('/agents')}><Settings2 size={14} /></button>
      <span className="hidden">{msgs.length}</span>
    </div>)
}

export function ModeSwitch() {
  const { mode, setMode, status, policy, setPolicy, deep, setDeep, webScope, setWebScope } = useChat()
  const feats = status?.features
  const agent = useChat((s) => s.agents.find((a) => a.id === s.agentId))
  if (agent) return <div className="px-3 pt-2.5 pb-1 bg-white border-t border-line text-[11px] text-muted leading-snug"><b className="text-brand-700">{agent.name}</b> · {KNOWLEDGE_LABEL[agent.knowledge_mode]} · {agent.skills.length} skill — tự tra cứu tài liệu, đọc tệp và xem ảnh/PDF theo quyền của bạn.</div>
  return (
    <div className="px-3 pt-2.5 pb-1 bg-white border-t border-line">
      <div className="seg sm w-full !flex" role="tablist" aria-label="Chế độ hỏi đáp">
        {(Object.keys(MODE_LABEL) as AskMode[]).map((m) => {
          const off = !!feats && !feats.includes(MODE_FEATURE[m])
          return <button key={m} role="tab" title={off ? 'Quản trị viên đã tắt chế độ này' : MODE_HINT[m]} disabled={off} style={off ? { opacity: .4, cursor: 'not-allowed' } : undefined}
            className={clsx('flex-1 !px-2', mode === m && 'on')} onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>
        })}
      </div>
      <div className="text-[11px] text-muted mt-1.5 leading-snug">{MODE_HINT[mode]}</div>
      {mode === 'web' && <div className="flex items-center gap-2 mt-2"><span className="text-[11px] font-bold uppercase text-muted shrink-0">Phạm vi tìm</span>
        <select className="select !py-1 !text-xs" value={webScope} onChange={(e) => setWebScope(e.target.value as WebScope)}>{(Object.keys(WEB_SCOPE_LABEL) as WebScope[]).map((s) => <option key={s} value={s}>{WEB_SCOPE_LABEL[s]}</option>)}</select></div>}
      {mode !== 'general' && mode !== 'web' && <div className="flex items-center gap-2 mt-2"><span className="text-[11px] font-bold uppercase text-muted shrink-0">Nguồn dùng</span><PolicySelect value={policy} onChange={setPolicy} />
        <label className="check text-[11px] shrink-0" title="depth=deep: mở rộng qua thẻ liên quan, xét nhiều tài liệu hơn"><input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />Tìm sâu</label></div>}
    </div>)
}

/** Hook gắn vào khung chat để nhận tệp kéo-thả / dán. */
export function useChatDrop() {
  const addDraft = useChat((s) => s.addDraft)
  const { pathname } = useLocation()
  const [over, setOver] = useState(false)
  const addSmart = (list: Awaited<ReturnType<typeof fromBrowserFile>>[]) => {
    const st = useChat.getState(); const rid = routeItemId(pathname)
    if (st.draft.length === 0 && rid) st.setTarget({ kind: 'item', itemId: rid })
    addDraft(list)
  }
  const take = async (files: File[]) => { if (files.length) addSmart(await Promise.all(files.map(fromBrowserFile))) }
  return {
    over, take, addDraftSmart: addSmart,
    props: {
      onDragOver: (e: DragEvent) => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setOver(true) } },
      onDragLeave: (e: DragEvent) => { if (e.currentTarget === e.target) setOver(false) },
      onDrop: (e: DragEvent) => { e.preventDefault(); setOver(false); void take(Array.from(e.dataTransfer.files)) },
    },
  }
}

export const DropOverlay = ({ show }: { show: boolean }) => !show ? null : (
  <div className="absolute inset-0 z-20 bg-brand-600/90 text-white grid place-items-center text-center pointer-events-none border-4 border-dashed border-white/70 rounded-[10px]">
    <div><UploadCloud size={44} className="mx-auto" strokeWidth={1.5} /><div className="font-extrabold text-lg mt-2">Thả tệp / ảnh để lưu vào kho tri thức</div>
      <div className="text-sm opacity-90 mt-1">pdf, docx, xlsx, pptx, ảnh (png, jpg, jfif, webp, heic…), txt, md, csv · tối đa {UPLOAD_MB} MB</div></div></div>)

function DraftTray() {
  const { draft, removeDraft, target, setTarget, vision, setVision, status } = useChat()
  const spaces = useAuth((s) => s.spaces)
  const canWrite = can(useAuth((s) => s.user?.role), 'write')
  const askFileOn = !status || status.features.includes('ask_file')
  const [view, setView] = useState<FileSource | null>(null)
  if (!draft.length) return null
  return (
    <div className="px-3 pt-2.5 pb-2 bg-brand-50 border-t border-line flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        {draft.map((f, i) => (
          <div key={i} className="relative border border-line rounded-lg bg-white flex items-center gap-2 pr-2 overflow-hidden">
            <button className="border-0 bg-transparent p-0 cursor-pointer" title="Xem trước" onClick={() => f.bytes && setView({ type: 'local', name: f.name, bytes: f.bytes })}><LocalThumb file={f} className="w-11 h-11 !rounded-none !border-0" /></button>
            <div className="min-w-0 max-w-[120px]"><div className="text-xs font-bold truncate">{f.name}</div><div className="text-[10.5px] text-muted">{fmtBytes(f.size)}</div></div>
            <button className="border-0 bg-transparent cursor-pointer text-muted hover:text-red-600 p-0.5" aria-label="Bỏ tệp" onClick={() => removeDraft(i)}><X size={14} /></button>
          </div>))}
      </div>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="font-bold uppercase text-muted tracking-wide">Tệp dùng để</span>
        <Seg sm value={target.kind} onChange={(k) => setTarget(k === 'ask' ? { kind: 'ask' } : k === 'new' ? { kind: 'new' } : { kind: 'item', itemId: routeItemId(window.location.hash.replace('#', '')) })}
          options={[...(askFileOn ? [{ value: 'ask' as const, label: 'Chỉ hỏi, không lưu' }] : []), ...(canWrite ? [{ value: 'new' as const, label: 'Lưu: mục nháp mới' }, { value: 'item' as const, label: 'Lưu: mục có sẵn' }] : [])]} />
        {target.kind === 'ask' ? null : target.kind === 'new' ? (
          <select className="select !h-8 !w-auto !text-xs" value={target.spaceId ?? ''} onChange={(e) => setTarget({ kind: 'new', spaceId: e.target.value ? Number(e.target.value) : undefined })} aria-label="Mảng nội dung">
            <option value="">Mảng: {spaces[0]?.name ?? '—'} (mặc định)</option>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        ) : (
          <input className="input !h-8 !w-28 !text-xs" inputMode="numeric" placeholder="Mã mục" value={target.itemId ?? ''} onChange={(e) => setTarget({ kind: 'item', itemId: Number(e.target.value.replace(/\D/g, '')) || undefined })} />)}
      </div>
      {target.kind !== 'ask' && draft.some((f) => isAiVisionName(f.name)) && (!status || status.features.includes('vision')) && (
        <label className="check text-xs"><input type="checkbox" checked={vision} onChange={(e) => setVision(e.target.checked)} />Nhờ AI xem ảnh / PDF và trả lời ngay (dùng nội dung bạn gõ làm câu hỏi)</label>)}
      <div className="text-[11px] text-muted leading-snug">{target.kind === 'ask'
        ? 'Tối đa 5 tệp. AI đọc tệp (cả ảnh, PDF quét), đối chiếu kho tri thức rồi trả lời kèm nguồn và chỉ ra chỗ tệp lệch so với tài liệu. Tệp không được lưu; ảnh/PDF được gửi cho nhà cung cấp AI để đọc.'
        : 'Tệp được lưu vào kho tri thức (mục nháp, chưa công khai). Hệ thống tự đọc chữ docx, xlsx, pptx, txt, md, csv…; ảnh/PDF cần “AI đọc chữ” để tìm kiếm được.'}</div>
      {view && <PreviewModal src={view} onClose={() => setView(null)} />}
    </div>)
}

export function Composer({ disabled, placeholder, drop }: { disabled?: boolean; placeholder?: string; drop: ReturnType<typeof useChatDrop> }) {
  const { send, busy, draft, fileCtx, removeFileCtx, clearFileCtx } = useChat()
  const agentId = useChat((s) => s.agentId)
  // Đang hỏi về tệp: câu nối tiếp ngắn vẫn được (AI vẫn thấy các tệp)
  const min = agentId || fileCtx.length ? 1 : 5; const max = agentId || fileCtx.length ? 2000 : 500
  const role = useAuth((s) => s.user?.role)
  const writer = can(role, 'write')
  const [q, setQ] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)
  const t = q.trim()
  const tooShort = t.length > 0 && t.length < min && draft.length === 0
  const canSend = !busy && !disabled && (draft.length > 0 || t.length >= min)
  const doSend = () => { if (!canSend) return; setQ(''); void send(t); if (ta.current) ta.current.style.height = 'auto' }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() } }
  const onPaste = async (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files)
    if (!files.length) return
    e.preventDefault()
    const named = files.map((f, i) => new File([f], f.name && f.name !== 'image.png' ? f.name : `anh-dan-${Date.now()}-${i + 1}.${f.type.includes('jpeg') ? 'jpg' : 'png'}`, { type: f.type }))
    await drop.take(named)
  }
  async function pick() { try { drop.addDraftSmart(await pickLocalFiles(false)) } catch (e) { toast.error(e) } }
  return (
    <>
      <ModeSwitch />
      {fileCtx.length > 0 && (
        <div className="px-3 pt-2 flex items-center gap-1.5 flex-wrap text-[11.5px]"><span className="font-bold text-muted">AI đang xem:</span>
          {fileCtx.map((f, i) => <span key={`${f.name}|${f.size}`} className="pill sm soft !pr-1"><Paperclip size={10} />{f.name}<button className="ml-0.5 border-0 bg-transparent cursor-pointer p-0 leading-none" onClick={() => removeFileCtx(i)} aria-label={`Bỏ ${f.name}`}>×</button></span>)}
          <button className="border-0 bg-transparent text-brand-700 font-bold cursor-pointer underline p-0" onClick={clearFileCtx}>Xong với tệp</button></div>)}
      <DraftTray />
      <div className="chat-foot !border-t-0 !pt-1.5">
        <button className="btn outline icon" style={{ height: 40, width: 40 }} disabled={disabled || busy} onClick={pick} aria-label="Đính kèm tệp hoặc ảnh"
          title={writer ? 'Đính kèm tệp / ảnh (hoặc kéo thả, dán Ctrl+V)' : 'Cần quyền Người đóng góp để tải tệp'}><Paperclip size={17} /></button>
        <textarea ref={ta} rows={1} value={q} disabled={disabled} maxLength={max} placeholder={placeholder ?? (draft.length ? 'Thêm ghi chú hoặc câu hỏi (không bắt buộc)…' : 'Nhập câu hỏi, kéo thả hoặc dán tệp/ảnh…')}
          onChange={(e) => { setQ(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(110, e.target.scrollHeight) + 'px' }} onKeyDown={onKey} onPaste={onPaste} />
        <button className="btn icon" style={{ height: 40, width: 40 }} disabled={!canSend} onClick={doSend} aria-label="Gửi">{draft.length ? <FileUp size={16} /> : <Send size={16} />}</button>
      </div>
      {tooShort && <div className="px-3 pb-2 text-[11px] text-amber-700 font-semibold bg-white">Câu hỏi cần ít nhất {min} ký tự (tối đa {max}).</div>}
    </>)
}

export default function ChatWidget() {
  const user = useAuth((s) => s.user)
  const c = useChat()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const drop = useChatDrop()
  const allowed = can(user?.role, 'ask')

  useEffect(() => { if (allowed) void c.loadStatus() }, [allowed]) // eslint-disable-line
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); c.toggle() }
      if (e.key === 'Escape' && c.open && !document.querySelector('.modal-backdrop')) c.setOpen(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [c.open]) // eslint-disable-line

  if (!allowed || pathname === '/ai') return null
  const ready = c.status?.ready !== false

  return (
    <>
      {c.open && (
        <div className={`chat-panel ${c.wide ? 'wide' : ''}`} role="dialog" aria-label="Trợ lý AI" {...drop.props}>
          <DropOverlay show={drop.over} />
          <div className="chat-head">
            <span className="ico"><Sparkles size={18} /></span>
            <div><div className="ttl">Trợ lý AI</div><div className="sub"><span className={`dot ${ready ? '' : 'off'}`} />{ready ? 'Sẵn sàng' : 'AI chưa sẵn sàng'}</div></div>
            <span className="spacer" />
            <button title="Xóa hội thoại" onClick={c.clear}><Trash2 size={15} /></button>
            <button title="Mở trang đầy đủ" onClick={() => { c.setOpen(false); nav('/ai') }}><ExternalLink size={15} /></button>
            <button title={c.wide ? 'Thu nhỏ' : 'Mở rộng'} onClick={() => c.setWide(!c.wide)}>{c.wide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
            <button title="Đóng (Esc)" onClick={() => c.setOpen(false)}><X size={17} /></button>
          </div>
          {!ready && <div className="px-3 py-2 text-xs bg-amber-50 text-amber-900 border-b border-amber-200 font-semibold">Quản trị viên cần bật AI, khóa API, chính sách dữ liệu và ngân sách.</div>}
          <AgentBar />
          <div className="chat-body">
            <Messages msgs={c.msgs} busy={c.busy} compact={!c.wide} onPick={(q) => void c.ask(q)} onAsk={(q, m) => void c.ask(q, m)} onOpenItem={(id) => nav(`/items/${id}`)} />
          </div>
          <Composer drop={drop} />
        </div>)}
      <button className="chat-fab" onClick={c.toggle} aria-label="Trợ lý AI (Ctrl+J)">
        <span className="tip">Trợ lý AI · Ctrl+J</span>
        {c.open ? <X size={24} /> : <Sparkles size={25} />}
        {!c.open && c.unseen > 0 && <span className="badge">{c.unseen}</span>}
      </button>
    </>)
}
