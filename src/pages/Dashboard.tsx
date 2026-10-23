import { ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertTriangle, ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, Clock, FileEdit, Hourglass, Layers, Search, Sparkles, Bell, CalendarClock, Siren, Loader2,
} from 'lucide-react'
import { ApiError, get } from '../lib/api'
import { can } from '../lib/permissions'
import { KPI_NAME } from './Reports'
import { dt, noticeText, noticeType, num, pct, ROLE_LABEL } from '../lib/format'
import { fmtMinutes, type IncidentStats } from '../lib/incident'
import type { ItemRow, Notice } from '../lib/types'
import { Empty, Pill, Seg, Stat } from '../components/ui'
import { ErrorBox, ItemBadges, Section } from '../components/shared'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useNotices } from '../store/notices'

const STATUSES = ['approved', 'pending', 'draft', 'overdue'] as const

interface KpiVal { numerator: number; denominator: number; value: number | null; target: number }
interface Kpi { K2_search_helpful: KpiVal; K5_weekly_active_users: KpiVal; K6_fresh_owned_items: KpiVal }
interface Stats { total: number; byStatus: Record<string, number>; dueSoon: number }
interface AiUse { spent_usd: number; budget_usd: number }
interface Gap { query: string; searches: number }

const greeting = () => { const h = new Date().getHours(); return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối' }
const today = () => new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Thẻ việc cần xử lý: bấm là đi thẳng tới danh sách; có việc tồn đọng thì đổi màu */
function Todo({ icon, label, value, hint, tone, to }: { icon: ReactNode; label: string; value: number | null | undefined; hint: string; tone: 'bad' | 'warn'; to: string }) {
  const nav = useNavigate()
  return (
    <button type="button" className={clsx('inc-stat click', !!value && tone)} onClick={() => nav(to)}>
      <span className="ic">{icon}</span>
      <span className="min-w-0"><span className="v">{value ?? <Loader2 size={18} className="animate-spin" />}</span><span className="l">{label}</span><span className="h">{value === 0 ? 'Không có' : hint}</span></span>
    </button>)
}

/** Chỉ số hiệu quả: số lớn, so với mục tiêu hoặc kỳ trước */
function Metric({ label, value, hint, pill, progress }: { label: string; value: string; hint?: ReactNode; pill?: ReactNode; progress?: number }) {
  return (
    <div className="border border-line rounded-lg p-4 bg-brand-50/40 flex flex-col">
      <div className="text-[11px] font-bold uppercase text-muted tracking-wide">{label}</div>
      <div className="flex items-end justify-between gap-2 mt-2 flex-wrap"><span className="text-3xl font-extrabold text-brand-600">{value}</span>{pill}</div>
      {progress != null && <div className="progress mt-3"><i style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} /></div>}
      {hint && <div className="text-xs text-muted mt-1.5">{hint}</div>}
    </div>)
}

const kpiMetric = (label: string, k: KpiVal | undefined, hint: string) => (
  <Metric key={label} label={label} value={k ? pct(k.value) : '—'} progress={k ? k.value ?? 0 : undefined}
    pill={k && <Pill sm tone={(k.value ?? 0) >= k.target ? 'ok' : 'warn'}>Mục tiêu {pct(k.target)}</Pill>}
    hint={k ? `${k.numerator}/${k.denominator} ${hint}` : undefined} />)

export default function Dashboard() {
  const user = useAuth((s) => s.user)!
  const nav = useNavigate()
  const notices = useNotices()
  const chat = useChat()
  const [tab, setTab] = useState<'sys' | 'me'>('sys')
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<ItemRow[]>([])
  const [mine, setMine] = useState<{ total: number; draft: number; pending: number } | null>(null)
  const [kpi, setKpi] = useState<Kpi | null>(null)
  const [queue, setQueue] = useState<number | null>(null)
  const [rbDrafts, setRbDrafts] = useState<number | null>(null)
  const [inc, setInc] = useState<IncidentStats | null>(null)
  const [aiUse, setAiUse] = useState<AiUse | null>(null)
  const [gaps, setGaps] = useState<Gap[] | null>(null)
  const [tasks, setTasks] = useState<{ id: number; due_date: string; item: { id: number; title: string } }[]>([])
  // Lỗi tải số liệu: báo rõ thay vì hiện như thể "chưa có dữ liệu"
  const [loadErr, setLoadErr] = useState<ApiError | string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const fail = (e: unknown) => setLoadErr((cur) => cur || (e instanceof ApiError ? e : 'Không tải được số liệu trang chủ. Kiểm tra kết nối máy chủ rồi thử lại.'))
  const report = can(user.role, 'report'); const write = can(user.role, 'write'); const moderate = can(user.role, 'moderate')

  useEffect(() => {
    setLoadErr(null)
    const count = async (q: Record<string, unknown>) => (await get<{ total: number }>('/items', { limit: 1, ...q })).total
    ;(async () => {
      try {
        const [total, ...rest] = await Promise.all([count({}), ...STATUSES.map((s) => count({ status: s })), count({ freshness: 'due_soon' })])
        const byStatus: Record<string, number> = {}
        STATUSES.forEach((s, i) => (byStatus[s] = rest[i]))
        setStats({ total, byStatus, dueSoon: rest[rest.length - 1] })
      } catch (e) { fail(e) }
      get<{ items: ItemRow[] }>('/items', { limit: 6, sort: 'updated' }).then((r) => setRecent(r.items)).catch(fail)
      Promise.all([count({ owner_id: user.id }), count({ owner_id: user.id, status: 'draft' }), count({ owner_id: user.id, status: 'pending' })])
        .then(([t, d, p]) => setMine({ total: t, draft: d, pending: p })).catch(fail)
      get<IncidentStats>('/incidents/stats').then(setInc).catch(fail)
      get<typeof tasks>('/reviews/tasks').then(setTasks).catch(fail)
      if (moderate) get<{ total: number }>('/reviews/queue', { limit: 1 }).then((r) => setQueue(r.total)).catch(fail)
      if (write) count({ type: 'runbook', status: 'draft' }).then(setRbDrafts).catch(fail)
      if (report) {
        get<Kpi>('/reports/kpi').then(setKpi).catch(fail)
        get<AiUse>('/ai/usage').then(setAiUse).catch(() => setAiUse(null)) // phụ: lỗi ở đây chỉ làm trống ô chi phí AI
        get<{ zero_result_queries: Gap[] }>('/reports/search-gaps', { from: isoDate(new Date(Date.now() - 30 * 86400000)), to: isoDate(new Date()) }).then((r) => setGaps(r.zero_result_queries)).catch(fail)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  const openInc = inc ? inc.open + inc.investigating : null
  const mttr = inc?.last_30_days.mttr_minutes ?? null
  const prevMttr = inc?.previous_30_days?.mttr_minutes ?? null
  const trend = mttr != null && prevMttr != null && prevMttr > 0 ? (mttr - prevMttr) / prevMttr : null
  const aiRatio = aiUse && aiUse.budget_usd > 0 ? aiUse.spent_usd / aiUse.budget_usd : null

  return (
    <>
      <ErrorBox error={loadErr} onRetry={() => setReloadKey((k) => k + 1)} />
      <div className="rounded-[10px] text-white p-6 flex items-center justify-between gap-6 flex-wrap relative overflow-hidden" style={{ background: 'linear-gradient(120deg,#8b45f5 0%,#6422c8 55%,#45177f 100%)' }}>
        <div className="absolute -right-10 -top-16 w-64 h-64 rounded-[10px] bg-white/10 rotate-12" />
        <div className="absolute right-40 -bottom-20 w-48 h-48 rounded-[10px] bg-white/10 -rotate-6" />
        <div className="relative">
          <div className="text-white/75 text-xs font-bold uppercase tracking-wide capitalize">{today()}</div>
          <h2 className="m-0 mt-1 text-[26px] font-extrabold leading-tight">{greeting()}, {user.name}</h2>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-md bg-white/20 text-xs font-bold uppercase">{ROLE_LABEL[user.role]}</span>
            <span className="text-white/85 text-sm">{notices.unread > 0 ? `Bạn có ${notices.unread} thông báo chưa đọc` : 'Không có thông báo mới'}{tasks.length > 0 ? ` · ${tasks.length} việc rà soát` : ''}</span>
          </div>
        </div>
        <div className="relative flex gap-3 flex-wrap">
          <button className="h-10 px-4 rounded-lg bg-white/15 text-white font-bold text-[13px] uppercase cursor-pointer border border-white/40 flex items-center gap-2 hover:bg-white/25" onClick={() => nav('/search')}><Search size={16} />Tìm kiếm</button>
          {can(user.role, 'ask') && <button className="h-10 px-4 rounded-lg bg-white/15 text-white font-bold text-[13px] uppercase cursor-pointer border border-white/40 flex items-center gap-2 hover:bg-white/25" onClick={() => chat.setOpen(true)}><Sparkles size={16} />Hỏi trợ lý AI</button>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Seg value={tab} onChange={setTab} options={[{ value: 'sys', label: 'Tổng quan' }, { value: 'me', label: 'Việc của tôi' }]} />
      </div>

      {tab === 'me' ? (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <Stat icon={<BookOpen size={17} />} label="Mục của tôi" value={num(mine?.total)} hint="Tổng số mục bạn sở hữu" />
            <Stat icon={<FileEdit size={17} />} label="Đang là nháp" value={num(mine?.draft)} hint="Chưa gửi duyệt" />
            <Stat icon={<Hourglass size={17} />} label="Chờ duyệt" value={num(mine?.pending)} hint="Đang chờ kiểm duyệt viên" />
            <Stat icon={<Bell size={17} />} label="Thông báo chưa đọc" value={num(notices.unread)} hint="Bấm chuông ở góc trên để xem" />
          </div>
          <div className="grid xl:grid-cols-2 gap-4">
            <Section title="Việc rà soát định kỳ giao cho tôi" right={<Pill tone="soft" sm>{tasks.length}</Pill>}>
              {tasks.length === 0 ? <Empty text="Không có việc rà soát nào" icon={<CalendarClock size={34} strokeWidth={1.5} />} /> : (
                <div className="flex flex-col gap-2">{tasks.slice(0, 6).map((t) => (
                  <button key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-line bg-white hover:bg-brand-50 cursor-pointer text-left" onClick={() => nav(`/items/${t.item.id}`)}>
                    <b className="flex-1 truncate">{t.item.title}</b><Pill sm tone="warn">Hạn {dt(t.due_date, false)}</Pill><ArrowRight size={15} className="text-muted" /></button>))}
                  {tasks.length > 6 && <button className="btn outline sm self-start" onClick={() => nav('/tasks')}>Xem tất cả {tasks.length} việc<ArrowRight size={13} /></button>}</div>)}
            </Section>
            <Section title="Thông báo gần đây" right={<button className="btn outline sm" onClick={() => nav('/notifications')}>Xem tất cả</button>}>
              {notices.items.length === 0 ? <Empty text="Không có thông báo" icon={<Bell size={34} strokeWidth={1.5} />} /> : (
                <div className="flex flex-col gap-2">{notices.items.slice(0, 6).map((n: Notice) => (
                  <div key={n.id} className="p-3 rounded-lg bg-brand-50 border border-line-soft text-sm">
                    <div className="flex justify-between gap-2"><b>{noticeType(n.type)}</b><span className="text-muted text-xs">{dt(n.created_at)}</span></div><div className="mt-0.5">{noticeText(n.content)}</div></div>))}</div>)}
            </Section>
          </div>
        </>
      ) : (
        <>
          <Section title="Cần xử lý ngay" sub="Bấm vào từng thẻ để đi thẳng tới danh sách việc">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <Todo icon={<Siren size={18} />} label="Sự cố đang mở" value={openInc} hint={inc?.open ? `${inc.open} chưa ai nhận` : 'đang có người xử lý'} tone={inc?.open ? 'bad' : 'warn'} to="/incidents" />
              {moderate && <Todo icon={<ClipboardCheck size={18} />} label="Chờ bạn duyệt" value={queue} hint="trong hàng đợi duyệt" tone="warn" to="/reviews" />}
              {write && <Todo icon={<FileEdit size={18} />} label="Quy trình chưa gửi duyệt" value={rbDrafts} hint="nhân viên chưa dùng được" tone="warn" to="/items?type=runbook&status=draft" />}
              <Todo icon={<AlertTriangle size={18} />} label="Quá hạn rà soát" value={stats?.byStatus.overdue} hint="cần rà soát gấp" tone="bad" to="/items?freshness=overdue" />
              <Todo icon={<Clock size={18} />} label="Sắp đến hạn rà soát" value={stats?.dueSoon} hint="trong 14 ngày tới" tone="warn" to="/items?freshness=due_soon" />
              <Todo icon={<CalendarClock size={18} />} label="Việc rà soát của tôi" value={tasks.length} hint="được giao cho bạn" tone="warn" to="/tasks" />
            </div>
          </Section>

          {report && (
            <Section title="Hiệu quả vận hành" sub="Số liệu 30 ngày gần nhất" right={<button className="btn outline sm" onClick={() => nav('/reports')}>Báo cáo chi tiết</button>}>
              <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-4">
                <Metric label="Thời gian khắc phục sự cố" value={fmtMinutes(mttr)}
                  pill={trend != null && <Pill sm tone={trend <= 0 ? 'ok' : 'warn'}>{trend <= 0 ? 'Nhanh hơn' : 'Chậm hơn'} {Math.round(Math.abs(trend) * 100)}%</Pill>}
                  hint={inc ? `${inc.last_30_days.resolved} sự cố đã khắc phục, ${inc.last_30_days.with_runbook} làm theo quy trình${trend == null ? ' · chưa đủ dữ liệu để so với 30 ngày trước' : ' · so với 30 ngày trước'}` : undefined} />
                {kpiMetric(KPI_NAME.K5, kpi?.K5_weekly_active_users, 'người dùng hoạt động trong tuần')}
                {kpiMetric(KPI_NAME.K2, kpi?.K2_search_helpful, 'lượt tìm được đánh giá có ích')}
                {kpiMetric(KPI_NAME.K6, kpi?.K6_fresh_owned_items, 'bài còn trong hạn rà soát')}
                <Metric label="Chi phí AI tháng này" value={aiUse ? `$${aiUse.spent_usd}` : '—'} progress={aiRatio ?? undefined}
                  pill={aiRatio != null && <Pill sm tone={aiRatio >= 0.8 ? 'warn' : 'ok'}>{Math.round(aiRatio * 100)}% ngân sách</Pill>}
                  hint={aiUse ? `trên ngân sách $${aiUse.budget_usd}` : undefined} />
              </div>
            </Section>
          )}

          <div className={clsx('grid gap-4', report ? 'xl:grid-cols-2' : '')}>
            {report && (
              <Section title="Người dùng tìm mà chưa có" sub="30 ngày qua: nội dung nên bổ sung vào kho" right={<button className="btn outline sm" onClick={() => nav('/reports?tab=gaps')}>Xem tất cả</button>}>
                {!gaps ? <Empty text="Đang tải…" /> : gaps.length === 0 ? <Empty text="Chưa có từ khóa nào tìm không ra. Tốt!" icon={<CheckCircle2 size={34} strokeWidth={1.5} />} /> : (
                  <div className="flex flex-col gap-2">{gaps.slice(0, 5).map((g) => (
                    <div key={g.query} className="flex items-center gap-3 p-2.5 rounded-lg border border-line bg-white"><Search size={15} className="text-muted shrink-0" /><span className="font-bold flex-1 min-w-0 truncate">{g.query}</span><Pill sm tone="bad">{g.searches} lần</Pill></div>))}</div>)}
              </Section>
            )}
            <Section title="Kho tri thức" right={<button className="btn outline sm" onClick={() => nav('/items')}>Xem danh sách</button>}>
              <div className="grid grid-cols-2 gap-4">
                <Stat icon={<Layers size={17} />} label="Tổng số mục" value={num(stats?.total)} hint="Đang trong kho" />
                <Stat icon={<CheckCircle2 size={17} />} label="Đã duyệt" value={num(stats?.byStatus.approved)} hint="Đang hiệu lực" />
                <Stat icon={<Hourglass size={17} />} label="Chờ duyệt" value={num(stats?.byStatus.pending)} hint="Đang xử lý" />
                <Stat icon={<FileEdit size={17} />} label="Bản nháp" value={num(stats?.byStatus.draft)} hint="Chưa gửi duyệt" />
              </div>
            </Section>
          </div>

          <Section title="Cập nhật gần đây" right={<button className="btn outline sm" onClick={() => nav('/items')}>Xem tất cả</button>}>
            <div className="tbl-wrap !shadow-none"><table className="tbl">
              <thead><tr><th>Tiêu đề</th><th>Mảng</th><th>Chủ sở hữu</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead>
              <tbody>
                {recent.length === 0 && <tr><td colSpan={5}><Empty text="Chưa có mục nào" /></td></tr>}
                {recent.map((it) => (
                  <tr key={it.id} className="clickable" onClick={() => nav(`/items/${it.id}`)}>
                    <td className="font-bold"><div className="max-w-[420px] truncate">{it.title}</div></td><td>{it.space?.name}</td><td>{it.owner?.name}</td>
                    <td><ItemBadges it={it} compact /></td><td className="whitespace-nowrap">{dt(it.updated_at)}</td></tr>))}
              </tbody></table></div>
          </Section>
        </>
      )}
    </>
  )
}
