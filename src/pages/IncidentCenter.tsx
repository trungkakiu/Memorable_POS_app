// Trung tâm xử lý sự cố (quản lý): số liệu nhanh, danh sách theo trạng thái / mức độ, báo sự cố, chi tiết sự cố với
// gợi ý quy trình (không dùng AI), làm theo quy trình gắn với sự cố, phân công, đóng sự cố có kết luận, dòng thời gian.
import { ReactNode, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertTriangle, ArrowRight, BookOpenCheck, CheckCircle2, Clock, FileUp, Flame, Hand, History, ListChecks, Loader2, Play, Plus, RefreshCw, Search, Siren, Timer, UserRound,
} from 'lucide-react'
import { ApiError, get, patch, post, useGet } from '../lib/api'
import { can } from '../lib/permissions'
import { dt, fromLocalInput, toLocalInput } from '../lib/format'
import {
  IncidentDetail, IncidentRow, IncidentStats, IncidentStatus, RunbookSuggestion, Severity, SEVERITY_COLOR, SEVERITY_LIST, SEVERITY_TEXT, STATUS_TEXT, STATUS_TONE, ago, fmtMinutes,
} from '../lib/incident'
import { Empty, Field, Modal, PageHeader, Pill } from '../components/ui'
import { ErrorBox, Loading, Pager, useBusy } from '../components/shared'
import { useAuth } from '../store/auth'
import { toast } from '../store/ui'

const TABS: { k: '' | IncidentStatus; t: string }[] = [{ k: '', t: 'Tất cả' }, { k: 'open', t: 'Mới báo' }, { k: 'investigating', t: 'Đang xử lý' }, { k: 'resolved', t: 'Đã khắc phục' }]

export function SeverityDot({ s, label }: { s: Severity | null; label?: boolean }) {
  if (!s) return label ? <span className="text-muted text-xs">Chưa đánh giá</span> : null
  return <span className="inc-sev" style={{ ['--c' as string]: SEVERITY_COLOR[s] }}><i />{label !== false && SEVERITY_TEXT[s]}</span>
}

export default function IncidentCenter() {
  const user = useAuth((s) => s.user)!
  const manage = can(user.role, 'write')
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<'' | IncidentStatus>('')
  const [severity, setSeverity] = useState('')
  const [q, setQ] = useState('')
  const [mine, setMine] = useState(false)
  const [report, setReport] = useState(false)
  const openId = Number(sp.get('open')) || null
  const stats = useGet<IncidentStats>('/incidents/stats')
  const { data, loading, error, reload } = useGet<{ incidents: IncidentRow[]; total: number; page: number; pages: number }>('/incidents', { page, limit: 20, status: status || undefined, severity: severity || undefined, q: q.trim() || undefined, mine: mine || undefined })
  const refresh = () => { reload(); stats.reload() }
  const openDetail = (id: number | null) => { const n = new URLSearchParams(sp); if (id) n.set('open', String(id)); else n.delete('open'); setSp(n, { replace: true }) }
  const s = stats.data

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Trung tâm xử lý sự cố" subtitle="Báo sự cố, chọn quy trình xử lý phù hợp, làm theo từng bước, đóng sự cố và theo dõi thời gian khắc phục (MTTR)."
        actions={<>
          {manage && <button className="btn outline" onClick={() => nav('/runbooks/import')}><FileUp size={16} />Nhập quy trình xử lý</button>}
          <button className="btn" onClick={() => setReport(true)}><Plus size={16} />Báo sự cố</button>
        </>} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard tone="bad" icon={<Siren size={18} />} label="Mới báo, chưa ai nhận" value={s?.open} onClick={() => { setStatus('open'); setPage(1) }} />
        <StatCard tone="warn" icon={<Flame size={18} />} label="Đang xử lý" value={s?.investigating} onClick={() => { setStatus('investigating'); setPage(1) }} />
        <StatCard tone="ok" icon={<CheckCircle2 size={18} />} label="Đã khắc phục (30 ngày)" value={s?.last_30_days.resolved} hint={s ? `${s.last_30_days.with_runbook} có dùng quy trình` : ''} />
        <StatCard icon={<Timer size={18} />} label="Thời gian khắc phục TB (30 ngày)" value={s ? fmtMinutes(s.last_30_days.mttr_minutes) : undefined} hint={s?.last_30_days.top_error_groups[0] ? `Hay gặp: ${s.last_30_days.top_error_groups.slice(0, 2).map((g) => g.name).join(', ')}` : ''} />
      </div>

      <div className="card !p-3 flex items-center gap-3 flex-wrap">
        <div className="inc-tabs" role="tablist">
          {TABS.map((t) => <button key={t.k} role="tab" aria-selected={status === t.k} className={clsx(status === t.k && 'on')} onClick={() => { setStatus(t.k); setPage(1) }}>{t.t}{t.k === 'open' && s?.open ? <b>{s.open}</b> : t.k === 'investigating' && s?.investigating ? <b>{s.investigating}</b> : null}</button>)}
        </div>
        <select className="select !w-auto" value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1) }} aria-label="Lọc mức độ"><option value="">Mọi mức độ</option>{SEVERITY_LIST.map((x) => <option key={x} value={x}>{SEVERITY_TEXT[x]}</option>)}</select>
        <label className="search-box !w-64"><Search size={17} /><input className="input" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Tìm theo tên sự cố…" /></label>
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer"><input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1) }} />Của tôi</label>
        <button className="btn ghost sm ml-auto" onClick={refresh} title="Tải lại"><RefreshCw size={15} /></button>
      </div>

      <ErrorBox error={error} onRetry={reload} />
      <div className="tbl-wrap"><table className="tbl inc-tbl"><thead><tr><th>Sự cố</th><th>Mức độ</th><th>Trạng thái</th><th>Hệ thống</th><th>Người báo / xử lý</th><th>Phát hiện</th><th className="num">Khắc phục sau</th></tr></thead><tbody>
        {loading && !data && <tr><td colSpan={7}><Loading /></td></tr>}
        {data && data.incidents.length === 0 && <tr><td colSpan={7}><Empty text={status || severity || q || mine ? 'Không có sự cố khớp bộ lọc' : 'Chưa có sự cố nào. Tuyệt vời!'} icon={<Siren size={42} strokeWidth={1.4} />} /></td></tr>}
        {data?.incidents.map((i) => (
          <tr key={i.id} className="clickable" onClick={() => openDetail(i.id)}>
            <td><div className="max-w-[360px]"><div className="font-bold truncate">{i.title}</div><div className="text-xs text-muted truncate">{i.description || i.error_group}</div></div></td>
            <td><SeverityDot s={i.severity} label /></td>
            <td><Pill sm tone={STATUS_TONE[i.status]}>{STATUS_TEXT[i.status]}</Pill></td>
            <td><div className="max-w-[160px] truncate">{i.system}</div></td>
            <td className="text-xs"><div>{i.reporter?.name || '—'}</div><div className="text-muted">{i.assignee ? `→ ${i.assignee.name}` : 'Chưa ai nhận'}</div></td>
            <td className="whitespace-nowrap text-xs" title={dt(i.detected_at)}>{ago(i.detected_at)}</td>
            <td className="num font-bold whitespace-nowrap">{i.resolved_at ? fmtMinutes(i.mttr_minutes) : <span className="text-muted font-normal">đang mở {fmtMinutes((Date.now() - new Date(i.detected_at).getTime()) / 60000)}</span>}</td>
          </tr>))}
      </tbody></table></div>
      {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}

      {report && <ReportIncident manage={manage} onClose={() => setReport(false)} onDone={(id) => { setReport(false); refresh(); openDetail(id) }} />}
      {openId && <IncidentDrawer id={openId} manage={manage} meId={user.id} onClose={() => openDetail(null)} onChanged={refresh} />}
    </div>)
}

function StatCard({ icon, label, value, hint, tone, onClick }: { icon: ReactNode; label: string; value?: number | string; hint?: string; tone?: 'bad' | 'warn' | 'ok'; onClick?: () => void }) {
  return (
    <button type="button" className={clsx('inc-stat', tone, onClick && 'click')} onClick={onClick} disabled={!onClick}>
      <span className="ic">{icon}</span>
      <span className="min-w-0"><span className="v">{value ?? <Loader2 size={18} className="animate-spin" />}</span><span className="l">{label}</span>{hint && <span className="h">{hint}</span>}</span>
    </button>)
}

/** Báo sự cố (người quản lý ghi thêm được nhóm lỗi, thời điểm phát hiện) */
export function ReportIncident({ manage, onClose, onDone }: { manage: boolean; onClose: () => void; onDone: (id: number) => void }) {
  const [f, setF] = useState({ title: '', system: '', severity: 'medium' as Severity, description: '', error_group: '', detected_at: toLocalInput() })
  const { busy, run } = useBusy()
  const [sugg, setSugg] = useState<RunbookSuggestion[]>([])
  useEffect(() => {
    const text = `${f.title} ${f.description}`.trim()
    if (text.length < 4) { setSugg([]); return }
    const t = setTimeout(() => { get<RunbookSuggestion[]>('/incidents/suggest-runbooks', { text: text.slice(0, 900), system: f.system || undefined, limit: 3 }).then(setSugg).catch(() => setSugg([])) }, 400)
    return () => clearTimeout(t)
  }, [f.title, f.description, f.system])
  async function save() {
    const r = await run(() => post<IncidentDetail>('/incidents', { title: f.title.trim(), system: f.system.trim(), severity: f.severity, description: f.description.trim() || undefined, error_group: f.error_group.trim() || undefined, detected_at: manage ? fromLocalInput(f.detected_at) : undefined }), 'Đã ghi nhận sự cố')
    if (r) onDone(r.id)
  }
  const ok = f.title.trim().length >= 3 && f.system.trim()
  return (
    <Modal title="Báo sự cố" size="lg" onClose={onClose} footer={<><button className="btn outline" onClick={onClose}>Hủy</button><button className="btn" disabled={!ok || busy} onClick={() => void save()}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Siren size={15} />}Ghi nhận sự cố</button></>}>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Chuyện gì đang xảy ra? *" className="md:col-span-2"><input className="input" value={f.title} maxLength={255} autoFocus onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="VD: Website báo lỗi 502, khách không đặt hàng được" /></Field>
        <Field label="Hệ thống bị ảnh hưởng *"><input className="input" value={f.system} maxLength={100} onChange={(e) => setF({ ...f, system: e.target.value })} placeholder="VD: Website bán hàng, máy in tầng 2" /></Field>
        <Field label="Mức độ"><div className="inc-sev-pick">{SEVERITY_LIST.slice().reverse().map((s) => <button key={s} type="button" className={clsx(f.severity === s && 'on')} style={{ ['--c' as string]: SEVERITY_COLOR[s] }} onClick={() => setF({ ...f, severity: s })}>{SEVERITY_TEXT[s]}</button>)}</div></Field>
        <Field label="Mô tả thêm" className="md:col-span-2" hint="Thấy lỗi gì, từ lúc nào, ảnh hưởng tới ai. Không ghi mật khẩu."><textarea className="textarea" rows={3} maxLength={5000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {manage && <>
          <Field label="Nhóm lỗi"><input className="input" value={f.error_group} maxLength={100} onChange={(e) => setF({ ...f, error_group: e.target.value })} placeholder="VD: Gián đoạn dịch vụ, Thiết bị" /></Field>
          <Field label="Thời điểm phát hiện"><input type="datetime-local" className="input" value={f.detected_at} onChange={(e) => setF({ ...f, detected_at: e.target.value })} /></Field>
        </>}
      </div>
      {sugg.length > 0 && (
        <div className="inc-hint mt-4">
          <div className="font-bold text-sm flex items-center gap-2"><BookOpenCheck size={16} />Có sẵn quy trình xử lý có thể dùng:</div>
          {sugg.map((s) => <div key={s.id} className="text-sm flex items-center gap-2"><ArrowRight size={13} className="text-brand-600 shrink-0" /><span className="truncate">{s.title}</span><span className="text-muted text-xs shrink-0">{s.steps} bước</span></div>)}
          <div className="text-xs text-muted">Ghi nhận sự cố xong, mở sự cố để bắt đầu làm theo quy trình.</div>
        </div>)}
    </Modal>)
}

/** Chi tiết sự cố: thông tin, gợi ý quy trình, các lần xử lý, dòng thời gian, đóng sự cố */
function IncidentDrawer({ id, manage, meId, onClose, onChanged }: { id: number; manage: boolean; meId: number; onClose: () => void; onChanged: () => void }) {
  const nav = useNavigate()
  const [d, setD] = useState<IncidentDetail | null>(null)
  const [err, setErr] = useState('')
  const [sugg, setSugg] = useState<RunbookSuggestion[] | null>(null)
  const [conclusion, setConclusion] = useState('')
  const { busy, run } = useBusy()
  async function load() {
    try {
      const x = await get<IncidentDetail>(`/incidents/${id}`)
      setD(x); setErr(''); setConclusion(x.conclusion || '')
      if (x.status !== 'resolved') get<RunbookSuggestion[]>('/incidents/suggest-runbooks', { text: `${x.title} ${x.description || ''}`.slice(0, 900), system: x.system, error_group: x.error_group, limit: 4 }).then(setSugg).catch(() => setSugg([]))
    } catch (e) { setErr((e as ApiError).full) }
  }
  useEffect(() => { void load() }, [id]) // eslint-disable-line
  async function update(body: Record<string, unknown>, ok: string) {
    const r = await run(() => patch<IncidentDetail>(`/incidents/${id}`, body), ok)
    if (r) { setD(r); onChanged() }
  }
  const startRun = (rbId: number) => nav(`/items/${rbId}?tab=run&incident=${id}`)
  const resolved = d?.status === 'resolved'

  return (
    <Modal title={d ? <span className="inline-flex items-center gap-2 min-w-0"><Siren size={18} className="shrink-0" /><span className="truncate">Sự cố #{d.id}</span></span> : 'Sự cố'} size="xl" onClose={onClose}>
      {err && <div className="text-red-700 text-sm">{err}</div>}
      {!d && !err && <Loading />}
      {d && (
        <div className="inc-detail">
          <div className="flex flex-col gap-4 min-w-0">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1.5"><Pill tone={STATUS_TONE[d.status]}>{STATUS_TEXT[d.status]}</Pill><SeverityDot s={d.severity} label /><Pill sm tone="gray">{d.system}</Pill><Pill sm tone="soft">{d.error_group}</Pill></div>
              <h2 className="m-0 text-[19px] font-extrabold leading-snug">{d.title}</h2>
              {d.description && <p className="mt-1.5 mb-0 text-[13.5px] text-ink-2 whitespace-pre-wrap leading-relaxed">{d.description}</p>}
              <div className="text-xs text-muted mt-2 flex gap-x-4 gap-y-1 flex-wrap">
                <span><Clock size={12} className="inline -mt-0.5 mr-1" />Phát hiện {dt(d.detected_at)} ({ago(d.detected_at)})</span>
                <span><UserRound size={12} className="inline -mt-0.5 mr-1" />Báo bởi {d.reporter?.name || '—'}</span>
                {d.resolved_at && <span><CheckCircle2 size={12} className="inline -mt-0.5 mr-1" />Khắc phục sau {fmtMinutes(d.mttr_minutes)}</span>}
              </div>
            </div>

            {manage && (
              <div className="inc-actions">
                <div className="inc-seg" role="radiogroup" aria-label="Trạng thái">
                  {(['open', 'investigating', 'resolved'] as IncidentStatus[]).map((s) => <button key={s} role="radio" aria-checked={d.status === s} className={clsx(d.status === s && 'on', s)} disabled={busy || s === 'resolved'} onClick={() => void update({ status: s }, `Đã chuyển sang “${STATUS_TEXT[s]}”`)} title={s === 'resolved' ? 'Ghi kết luận bên dưới để đóng sự cố' : undefined}>{STATUS_TEXT[s]}</button>)}
                </div>
                {!resolved && d.assignee_id !== meId && <button className="btn outline sm" disabled={busy} onClick={() => void update({ assignee_id: meId, status: d.status === 'open' ? 'investigating' : undefined }, 'Bạn đã nhận xử lý sự cố này')}><Hand size={14} />Nhận xử lý</button>}
                <select className="select !w-auto !py-1.5" value={d.severity || ''} disabled={busy} onChange={(e) => void update({ severity: e.target.value }, 'Đã đổi mức độ')} aria-label="Mức độ"><option value="" disabled>Mức độ…</option>{SEVERITY_LIST.map((s) => <option key={s} value={s}>{SEVERITY_TEXT[s]}</option>)}</select>
                <span className="text-xs text-muted ml-auto">{d.assignee ? <>Phụ trách: <b className="text-ink">{d.assignee.name}</b></> : 'Chưa ai nhận xử lý'}</span>
              </div>)}

            {!resolved && (
              <section>
                <h3 className="inc-h"><BookOpenCheck size={16} />Quy trình xử lý gợi ý</h3>
                {sugg === null && <Loading text="" />}
                {sugg && sugg.length === 0 && <div className="inc-empty">Chưa có quy trình phù hợp. {manage && <button className="text-brand-700 font-bold bg-transparent border-0 p-0 cursor-pointer underline" onClick={() => nav('/runbooks/import')}>Nhập quy trình xử lý</button>}</div>}
                <div className="flex flex-col gap-2">
                  {sugg?.map((s) => (
                    <div key={s.id} className={clsx('inc-rb', d.runbook_id === s.id && 'on')}>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold truncate">{s.title}</div>
                        <div className="text-xs text-muted">{s.steps} bước{s.dangerous_steps ? ` · ${s.dangerous_steps} bước cần xác nhận` : ''}{s.affected_system ? ` · ${s.affected_system}` : ''}</div>
                        <div className="flex gap-1 flex-wrap mt-1">{s.reasons.map((r) => <span key={r} className="inc-reason">{r}</span>)}</div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button className="btn sm" onClick={() => startRun(s.id)}><Play size={13} />Làm theo</button>
                        <button className="btn ghost sm" onClick={() => nav(`/items/${s.id}`)}>Xem</button>
                      </div>
                    </div>))}
                </div>
              </section>)}

            {d.runs.length > 0 && (
              <section>
                <h3 className="inc-h"><ListChecks size={16} />Các lần xử lý theo quy trình</h3>
                <div className="flex flex-col gap-2">{d.runs.map((r) => (
                  <div key={r.id} className="inc-run">
                    <div className="flex items-center gap-2 flex-wrap"><b className="truncate">{r.runbook_title || `Quy trình #${r.runbook_id}`}</b><span className="text-xs text-muted">{r.user?.name} · {dt(r.started_at)}</span>
                      {r.finished_at ? <Pill sm tone="ok">Xong sau {fmtMinutes(r.duration_minutes)}</Pill> : <Pill sm tone="warn">Đang làm</Pill>}
                      {!resolved && !r.finished_at && <button className="btn ghost sm ml-auto" onClick={() => startRun(r.runbook_id)}>Tiếp tục</button>}</div>
                    <div className="inc-progress"><i style={{ width: `${r.steps_total ? Math.round((r.steps_done / r.steps_total) * 100) : 0}%` }} />{r.steps_failed > 0 && <em style={{ width: `${Math.round((r.steps_failed / Math.max(1, r.steps_total)) * 100)}%` }} />}</div>
                    <div className="text-xs text-muted">{r.steps_done}/{r.steps_total} bước xong{r.steps_failed ? ` · ${r.steps_failed} bước không thành công` : ''}</div>
                  </div>))}</div>
              </section>)}

            {manage && !resolved && (
              <section className="inc-close">
                <h3 className="inc-h"><CheckCircle2 size={16} />Đóng sự cố</h3>
                <textarea className="textarea" rows={3} maxLength={5000} value={conclusion} onChange={(e) => setConclusion(e.target.value)} placeholder="Kết luận: nguyên nhân, cách đã khắc phục, việc cần làm tiếp để không lặp lại…" />
                <div className="flex gap-2 items-center"><button className="btn" disabled={busy || conclusion.trim().length < 5} onClick={() => void update({ status: 'resolved', conclusion: conclusion.trim() }, 'Đã đóng sự cố')}><CheckCircle2 size={15} />Đã khắc phục, đóng sự cố</button><span className="text-xs text-muted">Thời điểm khắc phục ghi tự động để tính MTTR.</span></div>
              </section>)}
            {resolved && (
              <section className="inc-done"><CheckCircle2 size={18} className="shrink-0" /><div><b>Đã khắc phục</b>{d.conclusion && <div className="whitespace-pre-wrap text-sm mt-0.5">{d.conclusion}</div>}
                {manage && <button className="btn ghost sm mt-1 !px-0" disabled={busy} onClick={() => void update({ status: 'investigating' }, 'Đã mở lại sự cố')}><History size={13} />Mở lại sự cố</button>}</div></section>)}
          </div>

          <aside className="inc-timeline">
            <h3 className="inc-h"><History size={16} />Dòng thời gian</h3>
            <ol>{d.timeline.map((t, i) => <li key={i} className={t.kind}><time>{dt(t.at)}</time><span>{t.text}</span></li>)}</ol>
            {!d.timeline.length && <div className="text-xs text-muted">Chưa có hoạt động.</div>}
          </aside>
        </div>)}
      {d && !manage && !resolved && <div className="mt-3 text-xs text-muted flex items-center gap-1.5"><AlertTriangle size={13} />Bạn chỉ xem được; người quản lý sẽ phân công và đóng sự cố.</div>}
    </Modal>)
}
