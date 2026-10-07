import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Eye, Headset, ListChecks, Loader2, LifeBuoy, ShieldAlert, Siren, Sparkles, UserRound } from 'lucide-react'
import { ApiError, get, patch, post } from '../lib/api'
import { STATUS_TEXT, STATUS_TONE, ago, type IncidentRow, type RunbookSuggestion, type Severity } from '../lib/incident'
import { toast } from '../store/ui'

// Mức độ nói bằng lời thường để người đọc chọn dễ
const IMPACT: { v: Severity; t: string; d: string }[] = [
  { v: 'low', t: 'Vẫn làm việc được', d: 'Hơi bất tiện' },
  { v: 'medium', t: 'Bị chậm việc', d: 'Một phần công việc' },
  { v: 'high', t: 'Không làm việc được', d: 'Cần xử lý sớm' },
  { v: 'critical', t: 'Ảnh hưởng nhiều người', d: 'Cả phòng / cả hệ thống' },
]
const SYSTEMS = ['Máy tính', 'Máy in', 'Mạng / Wi-Fi', 'Email', 'Phần mềm bán hàng', 'Website', 'Điện thoại', 'Tài khoản đăng nhập']

const titleOf = (text: string) => { const t = text.trim().split(/\n|[.!?](\s|$)/)[0].trim(); return (t.length >= 3 ? t : text.trim()).slice(0, 120) }

function Suggestion({ s, busy, onFollow }: { s: RunbookSuggestion; busy: boolean; onFollow: () => void }) {
  const nav = useNavigate()
  return (
    <div className="rd-card ih-sugg">
      <span className="rd-ico md g"><ListChecks size={22} /></span>
      <div className="min-w-0 flex-1">
        <div className="font-black leading-snug">{s.title}</div>
        {s.summary && <div className="text-muted text-[0.9em] mt-1 line-clamp-2">{s.summary}</div>}
        <div className="ih-meta">
          <span><ListChecks size={14} />{s.steps} bước</span>
          {s.used_for_similar > 0 && <span className="ok"><CheckCircle2 size={14} />Đã giúp {s.used_for_similar} lần</span>}
          {s.dangerous_steps > 0 && <span className="warn"><ShieldAlert size={14} />{s.dangerous_steps} bước cần cẩn thận</span>}
          {s.reasons.slice(0, 2).map((r) => <span key={r} className="why">{r}</span>)}
        </div>
      </div>
      <div className="ih-sugg-act">
        <button className="rd-btn" disabled={busy} onClick={onFollow}>{busy ? <Loader2 size={18} className="animate-spin" /> : null}Làm theo từng bước<ArrowRight size={18} /></button>
        <button className="rd-btn secondary sm" onClick={() => nav(`/items/${s.id}`)}><Eye size={16} />Xem trước</button>
      </div>
    </div>)
}

function ReportTab({ onReported }: { onReported: () => void }) {
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [system, setSystem] = useState('')
  const [sev, setSev] = useState<Severity>('medium')
  const [sugg, setSugg] = useState<RunbookSuggestion[] | null>(null)
  const [looking, setLooking] = useState(false)
  const [busy, setBusy] = useState<number | 'report' | null>(null)
  const ready = text.trim().length >= 5

  // Gợi ý hướng dẫn ngay khi gõ (tìm theo nội dung, ưu tiên cách đã từng xử lý được lỗi tương tự)
  useEffect(() => {
    if (!ready) { setSugg(null); return }
    setLooking(true)
    const h = setTimeout(() => {
      get<RunbookSuggestion[]>('/incidents/suggest-runbooks', { text: `${system} ${text}`.trim().slice(0, 900), system: system.trim() || undefined, limit: 4 })
        .then(setSugg).catch(() => setSugg([])).finally(() => setLooking(false))
    }, 450)
    return () => clearTimeout(h)
  }, [text, system]) // eslint-disable-line

  async function create() {
    return post<{ id: number }>('/incidents', { title: titleOf(text), description: text.trim(), system: system.trim() || 'Chưa rõ', severity: sev })
  }
  async function follow(rb: RunbookSuggestion) {
    setBusy(rb.id)
    try { const inc = await create(); nav(`/items/${rb.id}?run=1&incident=${inc.id}`) } catch (e) { toast.error(e instanceof ApiError ? e.full : e) } finally { setBusy(null) }
  }
  async function report() {
    setBusy('report')
    try { await create(); toast.ok('Đã gửi tới bộ phận kỹ thuật'); setText(''); setSystem(''); setSev('medium'); onReported() } catch (e) { toast.error(e instanceof ApiError ? e.full : e) } finally { setBusy(null) }
  }

  return (
    <div className="ih-grid">
      <div className="rd-card ih-form">
        <div className="ih-step"><b>1</b>Chuyện gì đang xảy ra?</div>
        <textarea className="input ih-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} autoFocus
          placeholder="Ví dụ: Máy in tầng 2 báo kẹt giấy, đã lấy giấy ra nhưng vẫn không in được." />
        <div className="ih-step"><b>2</b>Lỗi ở đâu? <span className="text-muted font-semibold text-[0.85em]">(không bắt buộc)</span></div>
        <input className="input !h-[50px] !text-[1em]" value={system} onChange={(e) => setSystem(e.target.value)} maxLength={100} placeholder="Gõ hoặc chọn bên dưới" />
        <div className="flex gap-2 flex-wrap">{SYSTEMS.map((s) => <button key={s} className={clsx('rd-chip ih-pick', system === s && 'on')} onClick={() => setSystem(system === s ? '' : s)}>{s}</button>)}</div>
        <div className="ih-step"><b>3</b>Ảnh hưởng thế nào?</div>
        <div className="ih-impact">{IMPACT.map((i) => (
          <button key={i.v} className={clsx('ih-imp', `s-${i.v}`, sev === i.v && 'on')} onClick={() => setSev(i.v)} aria-pressed={sev === i.v}>
            <b>{i.t}</b><span>{i.d}</span></button>))}</div>
      </div>

      <div className="flex flex-col gap-3.5 min-w-0">
        <div className="ih-side-h"><Sparkles size={18} />Cách xử lý gợi ý cho bạn</div>
        {!ready && <div className="rd-card ih-empty"><LifeBuoy size={36} className="text-brand-300" /><b>Mô tả lỗi để nhận gợi ý</b><span>Hệ thống tìm các hướng dẫn phù hợp, ưu tiên cách đã từng xử lý được lỗi tương tự.</span></div>}
        {ready && looking && !sugg && <div className="rd-card ih-empty"><Loader2 size={30} className="animate-spin text-brand-500" />Đang tìm hướng dẫn phù hợp…</div>}
        {ready && sugg && sugg.length === 0 && <div className="rd-card ih-empty"><Headset size={36} className="text-brand-300" /><b>Chưa có hướng dẫn khớp</b><span>Hãy báo bộ phận kỹ thuật, họ sẽ liên hệ bạn.</span></div>}
        {ready && sugg?.map((s) => <Suggestion key={s.id} s={s} busy={busy === s.id} onFollow={() => void follow(s)} />)}
        <div className="rd-card ih-report">
          <div className="min-w-0 flex-1"><b className="block">Không tự xử lý được?</b><span className="text-muted text-[0.9em]">Gửi mô tả này cho bộ phận kỹ thuật. Bạn theo dõi kết quả ở “Sự cố của tôi”.</span></div>
          <button className="rd-btn secondary" disabled={!ready || busy != null} onClick={() => void report()}>{busy === 'report' ? <Loader2 size={18} className="animate-spin" /> : <Headset size={18} />}Báo bộ phận kỹ thuật</button>
        </div>
      </div>
    </div>)
}

function MineTab() {
  const [rows, setRows] = useState<IncidentRow[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const load = () => get<{ incidents: IncidentRow[] }>('/incidents', { mine: true, limit: 50 }).then((r) => setRows(r.incidents)).catch((e) => setErr((e as ApiError).full))
  useEffect(() => { void load() }, [])
  async function fixed(r: IncidentRow) {
    setBusy(r.id)
    try { await patch(`/incidents/${r.id}`, { status: 'resolved', conclusion: 'Người báo xác nhận lỗi đã hết.' }); toast.ok('Đã đóng sự cố'); await load() } catch (e) { toast.error(e instanceof ApiError ? e.full : e) } finally { setBusy(null) }
  }
  if (err) return <div className="rd-callout warn"><AlertTriangle size={20} />{err}</div>
  if (!rows) return <div className="rd-card ih-empty"><Loader2 size={30} className="animate-spin text-brand-500" />Đang tải…</div>
  if (rows.length === 0) return <div className="rd-card ih-empty"><CheckCircle2 size={38} className="text-emerald-400" /><b>Bạn chưa báo sự cố nào</b><span>Khi gặp lỗi, mô tả ở thẻ “Báo sự cố” để được gợi ý cách xử lý.</span></div>
  return (
    <div className="flex flex-col gap-3">{rows.map((r) => (
      <div key={r.id} className="rd-card ih-mine">
        <span className={clsx('ih-st', STATUS_TONE[r.status])}>{STATUS_TEXT[r.status]}</span>
        <div className="min-w-0 flex-1">
          <div className="font-black leading-snug">{r.title}</div>
          <div className="ih-meta">
            <span><Clock size={14} />{ago(r.detected_at)}</span>
            {r.system && <span>{r.system}</span>}
            {r.assignee && <span><UserRound size={14} />{r.assignee.name} đang phụ trách</span>}
          </div>
          {r.status === 'resolved' && r.conclusion && <div className="ih-concl"><CheckCircle2 size={16} />{r.conclusion}</div>}
        </div>
        {r.status !== 'resolved' && <button className="rd-btn secondary sm" disabled={busy === r.id} onClick={() => void fixed(r)}>{busy === r.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}Lỗi đã hết</button>}
      </div>))}</div>)
}

export default function IncidentHelp() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') === 'mine' ? 'mine' : 'report'
  const go = (t: string) => setSp(t === 'report' ? {} : { tab: t }, { replace: true })
  return (
    <div className="flex flex-col gap-6">
      <div className="ih-hero">
        <span className="ih-hero-ic"><Siren size={28} /></span>
        <div className="min-w-0 flex-1"><h1 className="rd-h2 !text-[1.8em] !mb-1">Gặp sự cố?</h1><p className="rd-sub !mb-0">Mô tả lỗi, làm theo hướng dẫn từng bước. Nếu không được, bộ phận kỹ thuật sẽ hỗ trợ bạn.</p></div>
      </div>
      <div className="flex gap-2.5 flex-wrap">
        <button className={clsx('rd-btn sm', tab !== 'report' && 'secondary')} onClick={() => go('report')}><LifeBuoy size={17} />Báo sự cố</button>
        <button className={clsx('rd-btn sm', tab !== 'mine' && 'secondary')} onClick={() => go('mine')}><ListChecks size={17} />Sự cố của tôi</button>
      </div>
      {tab === 'report' ? <ReportTab onReported={() => go('mine')} /> : <MineTab />}
    </div>)
}
