import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ClipboardCopy, Clock, Download, Eye, FileText, FolderOpen, Frown, Info, ListChecks, Loader2, MessageCircleQuestion, Phone, Play, Printer,
  RotateCcw, GitCompare, ShieldAlert, ShieldCheck, BookOpenText, SkipForward, Sparkles, Undo2, User as UserIcon, XCircle,
} from 'lucide-react'
import { ApiError, download, get, isAudioName, patch, post } from '../lib/api'
import { bytes as fmtBytes, FILE_ICON, SEVERITY_LABEL } from '../lib/format'
import { KIND_LABEL, extOf, kindOf } from '../lib/preview'
import { can } from '../lib/permissions'
import type { Attachment, ItemDetail, ItemRow, ItemType, PromptVar, RelatedItem, RunbookStep } from '../lib/types'
import { AttachImage } from '../components/Attachments'
import { AnalyzeModal, useAiFeature } from '../components/AttachAi'
import { PreviewModal } from '../components/FileViewer'
import { Md } from '../components/shared'
import { MarkdownModal, useIsOfficial } from '../components/Knowledge'
import { INGEST_LABEL } from '../lib/format'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { toast } from '../store/ui'
import { TYPE_ICON, TYPE_PLAIN, friendlyDate } from './common'
import { FavStar, MiniRow } from './Pages'
import { DOC_ACTIONS, runDocAction } from './aiAgent'
import { RunState, useReaderCtx, useWorkspace } from './workspace'

// bài đã tự gỡ khỏi danh sách cá nhân trong phiên này (để câu báo không mất khi hiệu ứng chạy lại)
const forgotten = new Set<number>()
const arr = <T,>(v: unknown): T[] => { if (Array.isArray(v)) return v as T[]; if (typeof v === 'string') { try { const x = JSON.parse(v); return Array.isArray(x) ? x : [] } catch { return [] } } return [] }
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

// ====================================================================
//  Tệp đính kèm: thẻ lớn, xem trước và tải về chỉ một bấm
// ====================================================================
function ReaderFiles({ atts }: { atts: Attachment[] }) {
  const role = useAuth((s) => s.user?.role)
  const vision = useAiFeature('vision')
  const [view, setView] = useState<Attachment | null>(null)
  const [ask, setAsk] = useState<Attachment | null>(null)
  const [text, setText] = useState<Attachment | null>(null)
  async function dl(a: Attachment) { try { const r = await download(`/attachments/${a.id}/download`, undefined, a.filename); if (r.ok) toast.ok('Đã tải tệp về máy') } catch (e) { toast.error(e) } }
  const KIND_PLAIN: Record<string, string> = { image: 'Ảnh', pdf: 'Tệp PDF', text: 'Văn bản', md: 'Văn bản', csv: 'Bảng tính', docx: 'Tài liệu Word', xlsx: 'Bảng tính Excel', pptx: 'Bài thuyết trình', archive: 'Tệp nén', office: 'Tài liệu', other: 'Tệp' }
  return (
    <>
      <div className="grid md:grid-cols-2 gap-3">
        {atts.map((a) => {
          const image = kindOf(a.filename) === 'image'
          return (
            <div key={a.id} className="rd-card p-3.5 flex flex-col gap-3" style={{ boxShadow: 'none' }}>
              <div className="flex items-center gap-3.5">
                {image ? <button className="shrink-0 border-0 p-0 bg-transparent cursor-zoom-in" onClick={() => setView(a)} aria-label={`Xem ${a.filename}`}><AttachImage id={a.id} alt={a.filename} className="w-[72px] h-[72px] object-cover rounded-md border border-line" /></button>
                  : <span className="rd-ico md text-3xl" style={{ width: 56, height: 56 }}>{FILE_ICON[extOf(a.filename)] || '📎'}</span>}
                <div className="min-w-0 flex-1"><div className="font-bold leading-snug break-words">{a.filename}</div><div className="text-[0.82em] text-muted mt-0.5">{KIND_PLAIN[kindOf(a.filename)] || KIND_LABEL[kindOf(a.filename)]} · {fmtBytes(a.filesize)}{a.page_count ? ` · ${a.page_count} trang` : ''}</div></div>
              </div>
              {(a.text_review === 'unreviewed' || a.text_review === 'verified' || a.ingest_status === 'pending' || a.ingest_status === 'processing' || a.ingest_status === 'failed') && (
                <div className="flex gap-2 flex-wrap">
                  {a.text_review === 'unreviewed' && <span className="rd-chip warn" title="Chữ này do máy đọc ra từ ảnh/tệp quét, chưa ai đối chiếu">Chữ do máy đọc, chưa kiểm tra</span>}
                  {a.text_review === 'verified' && <span className="rd-chip ok"><CheckCircle2 size={14} />Chữ đã được kiểm tra</span>}
                  {(a.ingest_status === 'pending' || a.ingest_status === 'processing') && <span className="rd-chip gray"><Loader2 size={13} className="animate-spin" />Hệ thống đang đọc tệp này</span>}
                  {a.ingest_status === 'failed' && <span className="rd-chip gray">{INGEST_LABEL.failed}</span>}
                </div>)}
              <div className="flex gap-2 flex-wrap">
                <button className="rd-btn sm" onClick={() => setView(a)}><Eye size={17} />Xem</button>
                <button className="rd-btn secondary sm" onClick={() => dl(a)}><Download size={17} />Tải về</button>
                {(a.ingest_status === 'done' || a.text_extracted) && <button className="rd-btn secondary sm" onClick={() => setText(a)}><BookOpenText size={17} />Đọc chữ trong tệp</button>}
                {a.ai_readable && !isAudioName(a.filename) && vision && can(role, 'ask') && <button className="rd-btn secondary sm" onClick={() => setAsk(a)}><MessageCircleQuestion size={17} />Nhờ trợ lý xem</button>}
              </div>
            </div>)
        })}
      </div>
      {view && <PreviewModal src={{ type: 'att', id: view.id, name: view.filename, size: view.filesize, att: view }} onClose={() => setView(null)} />}
      {ask && <AnalyzeModal att={ask} onClose={() => setAsk(null)} />}
      {text && <MarkdownModal att={text} onClose={() => setText(null)} />}
    </>)
}

// ====================================================================
//  Làm theo từng bước (có nhớ tiến độ để làm tiếp)
// ====================================================================
interface RunData { run_id: number; steps: RunState['steps']; verification?: string; rollback?: string }
function RunWizard({ itemId, title, verification, rollback, contact, resume, incidentId, onExit }: { itemId: number; title: string; verification: string; rollback: string; contact: string; resume?: RunState; incidentId?: number | null; onExit: () => void }) {
  const navTo = useNavigate()
  // Đang xử lý một sự cố đã báo: hỏi kết quả sau khi làm xong để đóng sự cố hoặc báo cần hỗ trợ
  const [outcome, setOutcome] = useState<null | 'fixed' | 'help' | 'saving'>(null)
  async function report(fixed: boolean) {
    if (!incidentId) return
    setOutcome('saving')
    try {
      await patch(`/incidents/${incidentId}`, fixed ? { status: 'resolved', conclusion: `Đã khắc phục theo hướng dẫn “${title}”.` } : { description: `Đã làm theo hướng dẫn “${title}” nhưng lỗi vẫn còn, cần bộ phận kỹ thuật hỗ trợ.` })
      setOutcome(fixed ? 'fixed' : 'help')
    } catch (e) { setOutcome(null); setErr((e as ApiError).full) }
  }
  const ws = useWorkspace()
  const [run, setRun] = useState<{ run_id: number; steps: RunState['steps'] } | null>(resume ? { run_id: resume.runId, steps: resume.steps } : null)
  const [idx, setIdx] = useState(resume?.idx ?? 0)
  const [res, setRes] = useState<RunState['results']>(resume?.results ?? {})
  const [sure, setSure] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [failed, setFailed] = useState(false)
  const [end, setEnd] = useState<{ duration_minutes: number | null } | null>(null)

  const persist = (r: { run_id: number; steps: RunState['steps'] }, i: number, results: RunState['results']) =>
    ws.saveRun({ itemId, title, runId: r.run_id, idx: i, total: r.steps.length, steps: r.steps, results, at: Date.now(), verification, rollback, contact })

  useEffect(() => {
    if (resume) return
    post<RunData>(`/items/${itemId}/runs`, incidentId ? { incident_id: incidentId } : {}).then((r) => { setRun({ run_id: r.run_id, steps: r.steps }); persist({ run_id: r.run_id, steps: r.steps }, 0, {}); void post('/usage-events', { event_type: 'run_runbook', item_id: itemId }).catch(() => undefined) })
      .catch((e) => setErr(e instanceof ApiError && e.status === 409 ? 'Hướng dẫn này chưa có bước nào.' : (e as ApiError).full))
  }, [itemId]) // eslint-disable-line

  async function finish() { setBusy(true); try { setEnd(await patch<{ duration_minutes: number | null }>(`/runs/${run!.run_id}`, { finish: true })); ws.clearRun(itemId) } catch (e) { setErr((e as ApiError).full) } finally { setBusy(false) } }
  async function mark(st: 'done' | 'skipped' | 'failed') {
    if (!run) return
    const step = run.steps[idx]; setBusy(true); setErr('')
    try {
      await patch(`/runs/${run.run_id}`, { step_index: step.index, step_status: st, confirmed_dangerous: step.dangerous && st === 'done' ? true : undefined, note: note.trim() || undefined })
      const results = { ...res, [idx]: st }; setRes(results); setNote(''); setSure(false)
      if (st === 'failed') { setFailed(true); persist(run, idx, results); return }
      if (idx + 1 >= run.steps.length) void finish(); else { setIdx(idx + 1); persist(run, idx + 1, results) }
    } catch (e) { setErr((e as ApiError).full) } finally { setBusy(false) }
  }
  function next() { setFailed(false); if (!run) return; if (idx + 1 >= run.steps.length) void finish(); else { setIdx(idx + 1); persist(run, idx + 1, res) } }
  function restart() { ws.clearRun(itemId); setRun(null); setEnd(null); setRes({}); setIdx(0); setFailed(false); setOutcome(null); post<RunData>(`/items/${itemId}/runs`, incidentId ? { incident_id: incidentId } : {}).then((r) => { setRun({ run_id: r.run_id, steps: r.steps }); persist({ run_id: r.run_id, steps: r.steps }, 0, {}) }) }

  if (err && !run) return <div className="rd-callout bad"><Frown size={22} /><div><b className="block">Chưa bắt đầu được</b>{err}<div className="mt-3"><button className="rd-btn secondary sm" onClick={onExit}>Quay lại</button></div></div></div>
  if (!run) return <div className="rd-card p-10 flex flex-col items-center gap-3 text-muted"><Loader2 size={30} className="animate-spin text-brand-500" />Đang chuẩn bị các bước…</div>

  if (end) {
    const vs = Object.values(res); const done = vs.filter((x) => x === 'done').length; const skipped = vs.filter((x) => x === 'skipped').length; const bad = vs.filter((x) => x === 'failed').length
    return (
      <div className="flex flex-col gap-5">
        <div className={clsx('rd-callout !p-6', bad ? 'warn' : 'ok')}>
          {bad ? <AlertTriangle size={30} className="shrink-0" /> : <CheckCircle2 size={30} className="shrink-0" />}
          <div><b className="block text-[1.3em]">{bad ? 'Đã đi hết các bước — còn việc chưa làm được' : 'Bạn đã làm xong tất cả các bước!'}</b>
            <div className="mt-1">Đã làm: <b>{done}</b> · Bỏ qua: <b>{skipped}</b> · Không làm được: <b>{bad}</b>{end.duration_minutes != null && <> · Mất khoảng <b>{end.duration_minutes}</b> phút</>}</div></div>
        </div>
        {verification && <div className="rd-callout info"><CheckCircle2 size={22} className="shrink-0 mt-0.5" /><div><b className="block mb-1">Kiểm tra xem đã xử lý xong chưa</b><div className="whitespace-pre-wrap">{verification}</div></div></div>}
        {(bad > 0 && contact) && <div className="rd-callout warn"><Phone size={22} className="shrink-0 mt-0.5" /><div><b className="block mb-1">Cần hỗ trợ thêm? Hãy liên hệ</b>{contact}</div></div>}
        {rollback && <div className="rd-callout warn"><Undo2 size={22} className="shrink-0 mt-0.5" /><div><b className="block mb-1">Nếu bạn lỡ làm sai — cách quay lại như cũ</b><div className="whitespace-pre-wrap">{rollback}</div></div></div>}
        {incidentId && (
          <div className="rd-card p-5 flex flex-col gap-3 border-2 !border-[#7a2ee6]">
            {outcome === 'fixed' ? <div className="flex gap-3 items-start"><CheckCircle2 size={24} className="text-emerald-600 shrink-0" /><div><b className="block text-[1.1em]">Tuyệt vời! Sự cố đã được đóng.</b>Cảm ơn bạn đã tự xử lý. Kết quả đã được ghi lại cho bộ phận kỹ thuật.</div></div>
              : outcome === 'help' ? <div className="flex gap-3 items-start"><Phone size={24} className="text-amber-600 shrink-0" /><div><b className="block text-[1.1em]">Đã báo bộ phận kỹ thuật</b>Sự cố vẫn mở, người phụ trách sẽ tiếp tục xử lý. Bạn theo dõi ở mục <b>Sự cố của tôi</b>.</div></div>
                : (<>
                  <b className="text-[1.15em]">Lỗi đã hết chưa?</b>
                  <div className="text-muted text-[0.92em]">Câu trả lời của bạn giúp đóng sự cố #{incidentId} hoặc báo bộ phận kỹ thuật vào hỗ trợ.</div>
                  <div className="flex gap-3 flex-wrap">
                    <button className="rd-btn good" disabled={outcome === 'saving'} onClick={() => void report(true)}>{outcome === 'saving' ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={20} />}Đã hết lỗi</button>
                    <button className="rd-btn secondary" disabled={outcome === 'saving'} onClick={() => void report(false)}><Phone size={18} />Vẫn còn lỗi, cần hỗ trợ</button>
                  </div>
                </>)}
          </div>)}
        <div className="flex gap-3 flex-wrap"><button className="rd-btn" onClick={incidentId ? () => navTo('/su-co') : onExit}>{incidentId ? 'Về trang xử lý sự cố' : 'Hoàn tất'}</button><button className="rd-btn secondary" onClick={restart}><RotateCcw size={18} />Làm lại từ đầu</button></div>
      </div>)
  }

  const step = run.steps[idx]
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[1.1em] font-black">Làm theo từng bước <span className="text-muted font-bold">· bước {idx + 1}/{run.steps.length}</span></div>
        <button className="rd-btn secondary sm" onClick={onExit} title="Tiến độ được lưu, bạn có thể làm tiếp sau">Tạm dừng, làm tiếp sau</button>
      </div>
      <div className="rd-stepper" aria-hidden>{run.steps.map((_, i) => <span key={i} className={clsx('dot', res[i] === 'done' && 'done', res[i] === 'skipped' && 'skip', res[i] === 'failed' && 'fail', i === idx && !res[i] && 'now')} />)}</div>
      <div className={clsx('rd-step-card', step.dangerous && 'danger')}>
        <div className="flex gap-5 items-start"><span className="num">{idx + 1}</span>
          <div className="flex-1 min-w-0">
            {step.dangerous && <div className="rd-chip bad mb-3"><ShieldAlert size={16} />Bước nguy hiểm — hãy làm thật cẩn thận</div>}
            <div className="act">{step.action}</div>
            {step.expected && <div className="exp"><b>Làm đúng thì bạn sẽ thấy:</b> {step.expected}</div>}
          </div></div>
      </div>
      {failed ? (
        <div className="flex flex-col gap-4">
          <div className="rd-callout warn"><AlertTriangle size={24} className="shrink-0" /><div><b className="block mb-1">Không sao — hãy dừng lại ở đây</b>Đừng cố làm tiếp nếu bạn chưa chắc chắn.{contact && <> Hãy liên hệ: <b>{contact}</b>.</>}</div></div>
          <div className="flex gap-3 flex-wrap"><button className="rd-btn secondary" onClick={next}>Vẫn muốn tiếp tục</button><button className="rd-btn" onClick={() => void finish()}>Dừng và kết thúc</button></div>
        </div>
      ) : (
        <>
          {step.dangerous && <label className="flex items-start gap-3 cursor-pointer rd-callout bad !py-4 font-semibold select-none"><input type="checkbox" className="w-6 h-6 accent-[#d92d20] mt-0.5" checked={sure} onChange={(e) => setSure(e.target.checked)} />Tôi hiểu đây là bước nguy hiểm và chắc chắn muốn thực hiện.</label>}
          <input className="w-full border-2 border-line rounded-md px-4 h-[52px] text-[1em] font-[inherit] focus:outline-none focus:border-[#7a2ee6]" placeholder="Ghi chú cho bước này (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          {err && <div className="text-red-700 font-semibold">{err}</div>}
          <div className="flex gap-3 flex-wrap">
            <button className="rd-btn good lg" disabled={busy || (step.dangerous && !sure)} onClick={() => void mark('done')}>{busy ? <Loader2 size={20} className="animate-spin" /> : <Check size={22} />}Xong, sang bước tiếp theo</button>
            <button className="rd-btn secondary lg" disabled={busy} onClick={() => void mark('skipped')}><SkipForward size={20} />Bỏ qua bước này</button>
            <button className="rd-btn secondary lg" style={{ color: '#d92d20', borderColor: '#fda29b' }} disabled={busy} onClick={() => void mark('failed')}><XCircle size={20} />Mình không làm được</button>
          </div>
        </>)}
    </div>)
}

// ====================================================================
//  Câu lệnh mẫu cho AI: điền thông tin rồi sao chép
// ====================================================================
function PromptTool({ id, vars, guide, exIn, exOut, limits }: { id: number; vars: PromptVar[]; guide: string; exIn: string; exOut: string; limits: string }) {
  const [vals, setVals] = useState<Record<string, string | boolean>>({})
  const [out, setOut] = useState<{ text: string; missing_variables: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  async function make() {
    const values: Record<string, unknown> = {}
    vars.forEach((v) => { const r = vals[v.name]; if (r === undefined || r === '') return; values[v.name] = v.type === 'number' ? Number(r) : v.type === 'boolean' ? !!r : r })
    setBusy(true)
    try { setOut(await post<NonNullable<typeof out>>(`/items/${id}/prompt/render`, { values })); setCopied(false) } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  async function copy() { if (!out) return; await navigator.clipboard.writeText(out.text); setCopied(true); toast.ok('Đã sao chép — bạn có thể dán vào trợ lý AI'); void post('/usage-events', { event_type: 'copy_prompt', item_id: id }).catch(() => undefined) }
  const inp = 'w-full border-2 border-line rounded-md px-4 text-[1em] font-[inherit] focus:outline-none focus:border-[#7a2ee6] bg-white'
  return (
    <div className="flex flex-col gap-5">
      {guide && <div className="rd-callout info"><Info size={22} className="shrink-0 mt-0.5" /><div><b className="block mb-1">Cách dùng</b><div className="whitespace-pre-wrap">{guide}</div></div></div>}
      <div className="rd-card p-6 flex flex-col gap-5" style={{ boxShadow: 'none' }}>
        <div className="text-[1.15em] font-black">{vars.length ? 'Điền thông tin của bạn' : 'Câu lệnh này không cần điền gì thêm'}</div>
        {vars.map((v) => (
          <label key={v.name} className="flex flex-col gap-1.5">
            <span className="font-bold">{v.description || v.name}</span>
            {v.type === 'boolean' ? <span className="flex items-center gap-3"><input type="checkbox" className="w-6 h-6 accent-[#7a2ee6]" checked={!!vals[v.name]} onChange={(e) => setVals({ ...vals, [v.name]: e.target.checked })} />Có</span>
              : v.type === 'text' ? <textarea className={clsx(inp, 'py-3 min-h-[110px]')} placeholder={v.example ? `Ví dụ: ${v.example}` : ''} value={String(vals[v.name] ?? '')} onChange={(e) => setVals({ ...vals, [v.name]: e.target.value })} />
                : <input className={clsx(inp, 'h-[52px]')} type={v.type === 'number' ? 'number' : 'text'} placeholder={v.example ? `Ví dụ: ${v.example}` : ''} value={String(vals[v.name] ?? '')} onChange={(e) => setVals({ ...vals, [v.name]: e.target.value })} />}
          </label>))}
        <div><button className="rd-btn lg" disabled={busy} onClick={make}>{busy ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}Tạo câu lệnh cho tôi</button></div>
      </div>
      {out && (
        <div className="rd-card p-6 flex flex-col gap-4" style={{ borderColor: '#7a2ee6', borderWidth: 2 }}>
          {out.missing_variables.length > 0 && <div className="rd-callout warn !p-3"><AlertTriangle size={20} className="shrink-0" />Bạn chưa điền: <b>{out.missing_variables.join(', ')}</b></div>}
          <div className="text-[1.1em] font-black">Câu lệnh của bạn đã sẵn sàng</div>
          <pre className="m-0 whitespace-pre-wrap font-[inherit] bg-brand-50 border border-line rounded-md p-5 leading-relaxed max-h-[360px] overflow-auto">{out.text}</pre>
          <div><button className={clsx('rd-btn lg', copied && 'good')} onClick={() => void copy()}>{copied ? <Check size={22} /> : <ClipboardCopy size={22} />}{copied ? 'Đã sao chép!' : 'Sao chép câu lệnh'}</button></div>
        </div>)}
      {(exIn || exOut) && <div className="grid md:grid-cols-2 gap-4">{exIn && <div className="rd-card p-4" style={{ boxShadow: 'none' }}><b className="block mb-1.5">Ví dụ đầu vào tốt</b><div className="whitespace-pre-wrap text-ink-2 leading-relaxed">{exIn}</div></div>}
        {exOut && <div className="rd-card p-4" style={{ boxShadow: 'none' }}><b className="block mb-1.5">Kết quả mong đợi</b><div className="whitespace-pre-wrap text-ink-2 leading-relaxed">{exOut}</div></div>}</div>}
      {limits && <div className="rd-callout warn !p-4"><AlertTriangle size={20} className="shrink-0 mt-0.5" /><div><b className="block mb-1">Lưu ý</b>{limits}</div></div>}
    </div>)
}

// ====================================================================
//  Trang đọc
// ====================================================================
export default function ReaderRead() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const chat = useChat()
  const ws = useWorkspace()
  const setCtx = useReaderCtx((s) => s.setItem)
  const [it, setIt] = useState<ItemDetail | null>(null)
  const [err, setErr] = useState('')
  const [guided, setGuided] = useState(false)
  const [related, setRelated] = useState<{ id: number; title: string; type: ItemType; why?: string }[]>([])
  const saved = ws.runs[Number(id)]
  const official = useIsOfficial(Number(id))
  const [whole, setWhole] = useState<{ markdown: string } | 'loading' | null>(null)

  useEffect(() => {
    setIt(null); setErr(''); setGuided(false); setRelated([]); setWhole(null)
    get<ItemDetail>(`/items/${id}`).then((d) => {
      setIt(d)
      ws.addRecent({ id: d.id, title: d.title, type: d.type })
      setCtx({ id: d.id, title: d.title, type: d.type, hasFiles: (d.attachments?.length ?? 0) > 0 })
      // Bài liên quan: chung nhóm/chủ đề hoặc nội dung gần giống; máy chủ cũ thì tìm theo tiêu đề
      get<{ related: RelatedItem[] }>(`/items/${d.id}/related`, { limit: 6 })
        .then((r) => setRelated((r.related || []).map((x) => ({ id: x.id, title: x.title, type: x.type, why: x.shared_tags.length ? `Cùng chủ đề: ${x.shared_tags.slice(0, 2).map((s) => s.name).join(', ')}` : x.semantic_score != null ? 'Nội dung gần giống' : undefined }))))
        .catch(() => get<{ results: ItemRow[] }>('/search', { q: d.title.slice(0, 80), limit: 6 }).then((r) => setRelated((r.results || []).filter((x) => x.id !== d.id).slice(0, 4))).catch(() => undefined))
      if (sp.get('resume') === '1' && useWorkspace.getState().runs[d.id]) setGuided(true)
      if (sp.get('run') === '1' && d.type === 'runbook') setGuided(true) // mở từ trang Xử lý sự cố: vào thẳng chế độ làm theo từng bước
    }).catch((e) => {
      if (e instanceof ApiError && e.status === 404) {
        // bài đã bị gỡ: dọn khỏi các danh sách cá nhân để không gặp lại lỗi này
        if (useWorkspace.getState().forgetItem(Number(id))) forgotten.add(Number(id))
        const n = forgotten.has(Number(id))
        setErr(`Bài này không còn trong thư viện (có thể đã bị gỡ hoặc bạn không còn quyền xem).${n ? ' Mình đã bỏ bài này khỏi danh sách Đã lưu / Đã xem của bạn.' : ''}`)
      } else setErr(e instanceof ApiError ? e.full : String(e))
    })
    void post('/usage-events', { event_type: 'view', item_id: Number(id) }).catch(() => undefined)
    return () => setCtx(null)
  }, [id]) // eslint-disable-line

  const x = useMemo(() => (it?.detail || {}) as Record<string, unknown>, [it])
  const content = it?.content?.trim() || ''
  const headings = useMemo(() => Array.from(content.matchAll(/^#{2,3}\s+(.+)$/gm)).map((m) => m[1].replace(/[*_`]/g, '').trim()).slice(0, 12), [content])
  if (err) return <div className="flex flex-col gap-4"><button className="rd-btn secondary sm w-fit" onClick={() => nav(-1)}><ArrowLeft size={16} />Quay lại</button><div className="rd-callout bad"><Frown size={24} /><div><b className="block">Không mở được bài</b>{err}</div></div></div>
  if (!it) return <div className="rd-card p-12 flex flex-col items-center gap-3 text-muted"><Loader2 size={34} className="animate-spin text-brand-500" />Đang mở bài…</div>

  const Ico = TYPE_ICON[it.type]
  const old = it.freshness === 'overdue' || it.status === 'overdue'
  const unofficial = it.status !== 'approved' && !old
  const steps = arr<RunbookStep>(x.steps)
  const vars = arr<PromptVar>(x.variables)
  const atts = it.attachments || []
  const copyAll = async () => { await navigator.clipboard.writeText(`${it.title}\n\n${it.summary ? it.summary + '\n\n' : ''}${content}`); toast.ok('Đã sao chép nội dung bài') }
  const jump = (h: string) => { const el = Array.from(document.querySelectorAll('.md-body h2, .md-body h3')).find((e) => (e.textContent || '').trim() === h); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const ctx = { id: it.id, title: it.title, type: it.type }
  async function toggleWhole() {
    if (whole) { setWhole(null); return }
    setWhole('loading')
    try { const r = await get<{ markdown: string }>(`/items/${it!.id}/markdown`, { attachments: true }); setWhole({ markdown: r.markdown }) } catch (e) { setWhole(null); toast.error(e) }
  }

  return (
    <div className="flex flex-col gap-5 max-w-[900px] mx-auto w-full">
      <div className="flex items-center gap-3 flex-wrap">
        <button className="rd-btn secondary sm" onClick={() => nav(-1)}><ArrowLeft size={16} />Quay lại</button>
        {it.space?.name && <button className="rd-btn secondary sm" onClick={() => nav(`/browse/space/${it.space!.id}`)}><FolderOpen size={16} />{it.space.name}</button>}
      </div>
      <article className="rd-paper flex flex-col gap-6">
        <header className="flex flex-col gap-4">
          <div className="flex gap-2.5 flex-wrap items-center"><span className="rd-chip"><Ico size={16} />{TYPE_PLAIN[it.type]}</span>
            {official && !old && <span className="rd-chip ok" title="Đã được người kiểm duyệt xác nhận là bản chính thức"><ShieldCheck size={15} />Nguồn chính thống</span>}
            {!official && !old && !unofficial && <span className="rd-chip ok"><CheckCircle2 size={15} />Đã được kiểm duyệt</span>}</div>
          <div className="flex items-start gap-4"><h1 className="doc flex-1 !mb-0">{it.title}</h1><FavStar it={ctx} /></div>
          {(it.tags?.length ?? 0) > 0 && (
            <div className="flex gap-2 flex-wrap items-center text-[0.9em]"><span className="text-muted font-semibold">Thuộc:</span>
              {[...(it.tags || [])].sort((a, b) => (a.kind === 'category' ? 0 : 1) - (b.kind === 'category' ? 0 : 1)).map((tg) => (
                <button key={tg.id} className={clsx('rd-chip', tg.kind === 'category' ? '' : 'gray')} style={{ cursor: 'pointer', border: 0 }} title={tg.kind === 'category' ? 'Nhóm kiến thức — bấm để xem các bài cùng nhóm' : 'Chủ đề — bấm để xem các bài cùng chủ đề'} onClick={() => nav(`/browse/tag/${tg.id}`)}>{tg.name}</button>))}
            </div>)}
          <div className="flex gap-x-6 gap-y-2 flex-wrap text-muted text-[0.92em]">
            {it.owner?.name && <span className="flex items-center gap-2"><UserIcon size={16} />Người phụ trách: <b className="text-ink">{it.owner.name}</b></span>}
            {it.updated_at && <span className="flex items-center gap-2"><Clock size={16} />Cập nhật {friendlyDate(it.updated_at)}</span>}
          </div>
          <div className="flex gap-2.5 flex-wrap">
            <button className="rd-btn sm" onClick={() => { chat.setOpen(true); void runDocAction(ctx, DOC_ACTIONS[0]) }}><Sparkles size={17} />Trợ lý tóm tắt bài này</button>
            <button className="rd-btn secondary sm" onClick={() => chat.setOpen(true)}><MessageCircleQuestion size={17} />Hỏi về bài này</button>
            {(atts.length > 0 || content) && <button className={clsx('rd-btn sm', whole ? '' : 'secondary')} onClick={() => void toggleWhole()}><BookOpenText size={17} />{whole ? 'Về cách xem thường' : 'Xem cả bài + nội dung tệp'}</button>}
            <button className="rd-btn secondary sm" onClick={() => nav(`/compare?ids=${it.id}`)}><GitCompare size={17} />So sánh với bài khác</button>
            <button className="rd-btn secondary sm" onClick={() => void copyAll()}><ClipboardCopy size={17} />Sao chép</button>
            <button className="rd-btn secondary sm" onClick={() => window.print()}><Printer size={17} />In</button>
          </div>
        </header>

        {old && <div className="rd-callout warn"><AlertTriangle size={24} className="shrink-0" /><div><b className="block mb-1">Bài này đã lâu chưa được kiểm tra lại</b>Nội dung có thể không còn đúng. Hãy hỏi {it.owner?.name ? <b>{it.owner.name}</b> : 'người phụ trách'} trước khi làm theo.</div></div>}
        {unofficial && <div className="rd-callout info"><Info size={24} className="shrink-0" /><div><b className="block mb-1">Bài này chưa được duyệt chính thức</b>Hãy xem đây là bản tham khảo.</div></div>}
        {it.summary && <div className="rd-callout info"><FileText size={22} className="shrink-0 mt-0.5" /><div><b className="block mb-1">Tóm tắt nhanh</b>{it.summary}</div></div>}
        {headings.length >= 3 && it.type !== 'runbook' && <div className="flex flex-col gap-2"><div className="text-[0.8em] font-bold uppercase tracking-wide text-muted flex items-center gap-1.5"><ListChecks size={14} />Trong bài này</div><div className="rd-toc">{headings.map((h) => <button key={h} onClick={() => jump(h)}>{h}</button>)}</div></div>}

        {whole && (
          <section className="flex flex-col gap-3">
            <div className="rd-callout info !py-3 text-[0.92em]"><BookOpenText size={20} className="shrink-0 mt-0.5" />Đây là toàn bộ bài và chữ trong các tệp đính kèm gộp thành một văn bản; mỗi nguồn được tách riêng và ghi rõ.</div>
            {whole === 'loading' ? <div className="flex items-center gap-3 text-muted"><Loader2 size={20} className="animate-spin" />Đang gộp nội dung…</div> : <Md>{whole.markdown}</Md>}
          </section>)}
        {atts.length > 0 && <section className="flex flex-col gap-3"><h2 className="rd-h2 !mb-0">Tệp đính kèm ({atts.length})</h2><ReaderFiles atts={atts} /></section>}

        {it.type === 'runbook' && (
          <>
            {(str(x.symptom) || str(x.affected_system) || str(x.severity_level)) && (
              <section className="flex flex-col gap-3">
                <h2 className="rd-h2">Khi nào dùng hướng dẫn này?</h2>
                {str(x.symptom) && <div className="rd-callout info"><Eye size={22} className="shrink-0 mt-0.5" /><div><b className="block mb-1">Dấu hiệu nhận biết</b><div className="whitespace-pre-wrap">{str(x.symptom)}</div></div></div>}
                <div className="flex gap-2.5 flex-wrap">{str(x.affected_system) && <span className="rd-chip gray">Hệ thống liên quan: {str(x.affected_system)}</span>}
                  {str(x.severity_level) && <span className={clsx('rd-chip', x.severity_level === 'critical' || x.severity_level === 'high' ? 'bad' : 'warn')}>Mức độ: {SEVERITY_LABEL[str(x.severity_level)] || str(x.severity_level)}</span>}</div>
                {str(x.prerequisites) && <div className="rd-callout warn"><Info size={22} className="shrink-0 mt-0.5" /><div><b className="block mb-1">Cần chuẩn bị trước</b><div className="whitespace-pre-wrap">{str(x.prerequisites)}</div></div></div>}
              </section>)}
            {steps.length > 0 && (
              <section className="flex flex-col gap-4">
                {guided ? <RunWizard itemId={it.id} title={it.title} verification={str(x.verification)} rollback={str(x.rollback)} contact={str(x.contact_info)} resume={sp.get('incident') ? undefined : saved} incidentId={Number(sp.get('incident')) || null} onExit={() => setGuided(false)} /> : (<>
                  {saved && (
                    <div className="rd-card rd-resume p-5 flex items-center gap-5 flex-wrap"><span className="rd-ico md g"><Play size={24} /></span>
                      <div className="flex-1 min-w-[220px]"><div className="font-black">Bạn đang làm dở hướng dẫn này</div><div className="text-[0.9em] text-muted mt-1">Đã làm {Object.keys(saved.results).length}/{saved.total} bước · {friendlyDate(new Date(saved.at).toISOString())}</div></div>
                      <button className="rd-btn" onClick={() => setGuided(true)}>Làm tiếp</button><button className="rd-btn secondary" onClick={() => ws.clearRun(it.id)}>Bỏ, làm lại từ đầu</button></div>)}
                  <div className="flex items-center justify-between gap-4 flex-wrap"><h2 className="rd-h2 !mb-0">Các bước thực hiện ({steps.length})</h2>
                    {!saved && <button className="rd-btn lg" onClick={() => setGuided(true)}><Play size={22} />Bắt đầu làm theo từng bước</button>}</div>
                  <ol className="rd-checklist m-0 p-0">{steps.map((s, i) => (
                    <li key={i} className={clsx(s.dangerous && 'danger')}><div className="min-w-0"><div className="font-bold leading-snug">{s.action}{s.dangerous && <span className="rd-chip bad ml-2"><ShieldAlert size={14} />Nguy hiểm</span>}</div>
                      {s.expected && <div className="text-muted text-[0.92em] mt-1">Làm đúng thì sẽ thấy: {s.expected}</div>}</div></li>))}</ol>
                  {str(x.verification) && <div className="rd-callout ok"><CheckCircle2 size={22} className="shrink-0 mt-0.5" /><div><b className="block mb-1">Làm xong, kiểm tra thế nào?</b><div className="whitespace-pre-wrap">{str(x.verification)}</div></div></div>}
                  {str(x.rollback) && <div className="rd-callout warn"><Undo2 size={22} className="shrink-0 mt-0.5" /><div><b className="block mb-1">Nếu lỡ làm sai</b><div className="whitespace-pre-wrap">{str(x.rollback)}</div></div></div>}
                  {str(x.contact_info) && <div className="rd-callout info"><Phone size={22} className="shrink-0 mt-0.5" /><div><b className="block mb-1">Cần giúp đỡ? Liên hệ</b>{str(x.contact_info)}</div></div>}
                </>)}
              </section>)}
          </>)}

        {it.type === 'prompt' && <section><h2 className="rd-h2 mb-3">Dùng câu lệnh này</h2>
          <PromptTool id={it.id} vars={vars} guide={str(x.usage_guide)} exIn={str(x.example_input)} exOut={str(x.example_output)} limits={str(x.limitations)} /></section>}

        {content && !whole && <section>{(it.type === 'runbook' || it.type === 'prompt') && <h2 className="rd-h2 mb-3">{it.type === 'prompt' ? 'Nội dung câu lệnh gốc' : 'Chi tiết thêm'}</h2>}<Md>{content}</Md></section>}
        {!content && it.type !== 'runbook' && it.type !== 'prompt' && <div className="rd-callout info"><Info size={22} />Bài này chưa có nội dung chi tiết{atts.length ? ' — hãy xem các tệp đính kèm ở trên.' : '.'}</div>}

        {it.owner?.name && <div className="rd-callout info"><UserIcon size={22} className="shrink-0 mt-0.5" /><div><b className="block mb-0.5">Cần hỏi thêm?</b>Hãy liên hệ <b>{it.owner.name}</b> — người phụ trách bài này.</div></div>}
      </article>

      {related.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="rd-h2">Có thể bạn cũng cần xem</h2>
          <div className="rd-card p-2 grid md:grid-cols-2 gap-x-2">{related.map((r) => <div key={r.id}><MiniRow id={r.id} title={r.title} type={r.type} />{r.why && <div className="text-[0.78em] text-muted -mt-1.5 pb-1.5 pl-[62px]">{r.why}</div>}</div>)}</div>
        </section>)}
    </div>)
}
