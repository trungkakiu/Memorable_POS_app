import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AlertTriangle, ArrowRight, Bot, BookOpen, CheckCircle2, ClipboardCheck, Clock, FileEdit, Hourglass, Layers, Plus, Search, Sparkles, Timer, Bell, CalendarClock,
} from 'lucide-react'
import { get } from '../lib/api'
import { can } from '../lib/permissions'
import { dt, num, pct, ROLE_LABEL, STATUS_LABEL, TYPE_LABEL } from '../lib/format'
import type { ItemRow, Notice } from '../lib/types'
import { Empty, Pill, Seg, Stat } from '../components/ui'
import { ItemBadges, Section } from '../components/shared'
import { KnowledgeStats } from './KnowledgePages'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useNotices } from '../store/notices'

const STATUSES = ['approved', 'pending', 'draft', 'overdue', 'archived'] as const
const TYPES = ['document', 'article', 'prompt', 'runbook'] as const
const STATUS_COLOR: Record<string, string> = { approved: '#12a150', pending: '#f59e0b', draft: '#94a3b8', overdue: '#ef4444', archived: '#64748b' }

interface KpiVal { numerator: number; denominator: number; value: number | null; target: number }
interface Kpi { K2_search_helpful: KpiVal; K4_prompts_with_passing_tests: KpiVal; K5_weekly_active_users: KpiVal; K6_fresh_owned_items: KpiVal }
interface Stats { total: number; byStatus: Record<string, number>; byType: Record<string, number>; dueSoon: number }

const greeting = () => { const h = new Date().getHours(); return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối' }
const today = () => new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })

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
  const [tasks, setTasks] = useState<{ id: number; due_date: string; item: { id: number; title: string } }[]>([])

  useEffect(() => {
    const count = async (q: Record<string, unknown>) => (await get<{ total: number }>('/items', { limit: 1, ...q })).total
    ;(async () => {
      try {
        const [total, ...rest] = await Promise.all([
          count({}), ...STATUSES.map((s) => count({ status: s })), ...TYPES.map((t) => count({ type: t })), count({ freshness: 'due_soon' }),
        ])
        const byStatus: Record<string, number> = {}; const byType: Record<string, number> = {}
        STATUSES.forEach((s, i) => (byStatus[s] = rest[i]))
        TYPES.forEach((t, i) => (byType[t] = rest[STATUSES.length + i]))
        setStats({ total, byStatus, byType, dueSoon: rest[rest.length - 1] })
      } catch { /* hiển thị trạng thái rỗng */ }
      get<{ items: ItemRow[] }>('/items', { limit: 6, sort: 'updated' }).then((r) => setRecent(r.items)).catch(() => undefined)
      Promise.all([count({ owner_id: user.id }), count({ owner_id: user.id, status: 'draft' }), count({ owner_id: user.id, status: 'pending' })])
        .then(([t, d, p]) => setMine({ total: t, draft: d, pending: p })).catch(() => undefined)
      if (can(user.role, 'report')) get<Kpi>('/reports/kpi').then(setKpi).catch(() => undefined)
      if (can(user.role, 'moderate')) get<{ total: number }>('/reviews/queue', { limit: 1 }).then((r) => setQueue(r.total)).catch(() => undefined)
      get<typeof tasks>('/reviews/tasks').then(setTasks).catch(() => undefined)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const quick = [
    { icon: <Search size={18} />, label: 'Tìm kiếm tri thức', desc: 'Có dấu / không dấu, theo mã lỗi', to: '/search', cap: 'read' as const },
    { icon: <Plus size={18} />, label: 'Tạo mục mới', desc: 'Tài liệu, bài viết, prompt, runbook', to: '/items/new', cap: 'write' as const },
    { icon: <ClipboardCheck size={18} />, label: 'Hàng đợi duyệt', desc: 'Mục đang chờ bạn duyệt', to: '/reviews', cap: 'moderate' as const },
    { icon: <Bot size={18} />, label: 'Agent của tôi', desc: 'Trợ lý cá nhân hóa, tự tra cứu tài liệu', to: '/agents', cap: 'ask' as const },
    { icon: <Timer size={18} />, label: 'Ghi giờ công', desc: 'Cập nhật cuối ngày', to: '/timelogs', cap: 'timelog' as const },
  ].filter((q) => can(user.role, q.cap))

  const pie = STATUSES.map((s) => ({ name: STATUS_LABEL[s], value: stats?.byStatus[s] ?? 0, key: s })).filter((x) => x.value > 0)
  const bars = TYPES.map((t) => ({ name: TYPE_LABEL[t], value: stats?.byType[t] ?? 0 }))

  return (
    <>
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
          <button className="h-10 px-4 rounded-lg bg-white text-brand-700 font-bold text-[13px] uppercase cursor-pointer border-0 flex items-center gap-2 hover:bg-brand-50" onClick={() => nav('/search')}><Search size={16} />Tìm kiếm</button>
          <button className="h-10 px-4 rounded-lg bg-white/15 text-white font-bold text-[13px] uppercase cursor-pointer border border-white/40 flex items-center gap-2 hover:bg-white/25" onClick={() => chat.setOpen(true)}><Sparkles size={16} />Hỏi trợ lý AI</button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Seg value={tab} onChange={setTab} options={[{ value: 'sys', label: 'Tổng quan kho tri thức' }, { value: 'me', label: 'Dữ liệu cá nhân' }]} />
      </div>

      {tab === 'me' ? (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <Stat icon={<BookOpen size={17} />} label="Mục của tôi" value={num(mine?.total)} hint="Tổng số mục bạn sở hữu" />
            <Stat icon={<FileEdit size={17} />} label="Đang là nháp" value={num(mine?.draft)} hint="Chưa gửi duyệt" />
            <Stat icon={<Hourglass size={17} />} label="Chờ duyệt" value={num(mine?.pending)} hint="Đang chờ kiểm duyệt viên" />
            <Stat icon={<Bell size={17} />} label="Thông báo chưa đọc" value={num(notices.unread)} hint="Xem trong mục Thông báo" />
          </div>
          <div className="grid xl:grid-cols-2 gap-4">
            <Section title="Việc rà soát định kỳ giao cho tôi" right={<Pill tone="soft" sm>{tasks.length}</Pill>}>
              {tasks.length === 0 ? <Empty text="Không có việc rà soát nào" icon={<CalendarClock size={34} strokeWidth={1.5} />} /> : (
                <div className="flex flex-col gap-2">{tasks.map((t) => (
                  <button key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-line bg-white hover:bg-brand-50 cursor-pointer text-left" onClick={() => nav(`/items/${t.item.id}`)}>
                    <b className="flex-1 truncate">{t.item.title}</b><Pill sm tone="warn">Hạn {dt(t.due_date, false)}</Pill><ArrowRight size={15} className="text-muted" /></button>))}</div>)}
            </Section>
            <Section title="Thông báo gần đây" right={<button className="btn outline sm" onClick={() => nav('/notifications')}>Xem tất cả</button>}>
              {notices.items.length === 0 ? <Empty text="Không có thông báo" icon={<Bell size={34} strokeWidth={1.5} />} /> : (
                <div className="flex flex-col gap-2">{notices.items.slice(0, 6).map((n: Notice) => (
                  <div key={n.id} className="p-3 rounded-lg bg-brand-50 border border-line-soft text-sm">
                    <div className="flex justify-between gap-2"><b>{n.type}</b><span className="text-muted text-xs">{dt(n.created_at)}</span></div><div className="mt-0.5">{n.content}</div></div>))}</div>)}
            </Section>
          </div>
        </>
      ) : (
        <>
          {can(user.role, 'report') && <Section title="Đọc & ghi nhớ tri thức" right={<button className="btn outline sm" onClick={() => nav('/knowledge')}>Xem nguồn tri thức</button>}><KnowledgeStats compact /></Section>}
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            <Stat icon={<Layers size={17} />} label="Tổng số mục" value={num(stats?.total)} hint="Trong kho tri thức" />
            <Stat icon={<CheckCircle2 size={17} />} label="Đã duyệt" value={num(stats?.byStatus.approved)} hint="Đang hiệu lực" />
            <Stat icon={<Hourglass size={17} />} label="Chờ duyệt" value={num(stats?.byStatus.pending)} hint="Đang xử lý" />
            <Stat icon={<FileEdit size={17} />} label="Nháp" value={num(stats?.byStatus.draft)} hint="Chưa gửi duyệt" />
            <Stat icon={<AlertTriangle size={17} />} label="Quá hạn" value={num(stats?.byStatus.overdue)} hintTone={stats?.byStatus.overdue ? 'down' : undefined} hint={stats?.byStatus.overdue ? 'Cần rà soát gấp' : 'Không có'} />
            <Stat icon={<Clock size={17} />} label="Sắp đến hạn" value={num(stats?.dueSoon)} hint="Cần rà soát sớm" />
            <Stat icon={<ClipboardCheck size={17} />} label="Hàng đợi duyệt" value={queue == null ? '—' : num(queue)} hint={queue == null ? 'Dành cho kiểm duyệt viên' : 'Chờ bạn xử lý'} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Section title="Trạng thái nội dung">
              {pie.length === 0 ? <Empty text="Chưa có dữ liệu" /> : (
                <div className="flex items-center gap-4">
                  <div className="h-44 w-44 shrink-0"><ResponsiveContainer><PieChart>
                    <Pie data={pie} dataKey="value" nameKey="name" innerRadius={46} outerRadius={78} paddingAngle={3}>{pie.map((p) => <Cell key={p.key} fill={STATUS_COLOR[p.key]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
                  <div className="flex flex-col gap-2 text-sm flex-1">{pie.map((p) => <div key={p.key} className="flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: STATUS_COLOR[p.key] }} />{p.name}<b className="ml-auto pl-3">{p.value}</b></div>)}</div>
                </div>)}
            </Section>
            <Section title="Theo loại nội dung">
              <div className="h-44"><ResponsiveContainer><BarChart data={bars} margin={{ top: 18 }}>
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} /><YAxis hide allowDecimals={false} /><Tooltip cursor={{ fill: '#f4effe' }} />
                <Bar dataKey="value" fill="#7a2ee6" radius={[5, 5, 0, 0]} barSize={34} label={{ position: 'top', fontSize: 12, fontWeight: 800 }} /></BarChart></ResponsiveContainer></div>
            </Section>
            <Section title="Lối tắt">
              <div className="flex flex-col gap-2.5">
                {quick.map((x) => (
                  <button key={x.to} onClick={() => nav(x.to)} className="flex items-center gap-3 p-2.5 rounded-lg border border-line bg-white cursor-pointer hover:bg-brand-50 hover:border-brand-200 text-left">
                    <span className="w-9 h-9 rounded-lg bg-brand-100 text-brand-600 grid place-items-center shrink-0">{x.icon}</span>
                    <span className="flex-1 min-w-0"><span className="block font-bold text-[13px] uppercase text-ink">{x.label}</span><span className="block text-xs text-muted truncate">{x.desc}</span></span>
                    <ArrowRight size={15} className="text-muted shrink-0" /></button>))}
              </div>
            </Section>
          </div>

          {can(user.role, 'report') && (
            <Section title="Hiệu suất KPI" right={<button className="btn outline sm" onClick={() => nav('/reports')}>Báo cáo chi tiết</button>}>
              {!kpi ? <Empty text="Chưa có số liệu KPI" /> : (
                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {([['K2 · Tìm kiếm hữu ích', kpi.K2_search_helpful], ['K4 · Prompt có kiểm thử đạt', kpi.K4_prompts_with_passing_tests], ['K5 · Người dùng hoạt động tuần', kpi.K5_weekly_active_users], ['K6 · Mục còn trong hạn rà soát', kpi.K6_fresh_owned_items]] as [string, KpiVal][]).map(([l, k]) => (
                    <div key={l} className="border border-line rounded-lg p-4 bg-brand-50/40">
                      <div className="text-[11px] font-bold uppercase text-muted tracking-wide">{l}</div>
                      <div className="flex items-end justify-between mt-2"><span className="text-3xl font-extrabold text-brand-600">{pct(k.value)}</span>
                        <Pill sm tone={(k.value ?? 0) >= k.target ? 'ok' : 'warn'}>Mục tiêu {pct(k.target)}</Pill></div>
                      <div className="progress mt-3"><i style={{ width: `${Math.min(100, (k.value ?? 0) * 100)}%` }} /></div>
                      <div className="text-xs text-muted mt-1.5">{k.numerator}/{k.denominator} đạt yêu cầu</div>
                    </div>))}
                </div>)}
            </Section>
          )}

          <Section title="Cập nhật gần đây" right={<button className="btn outline sm" onClick={() => nav('/items')}>Xem tất cả</button>}>
            <div className="tbl-wrap !shadow-none"><table className="tbl">
              <thead><tr><th>Tiêu đề</th><th>Mảng</th><th>Chủ sở hữu</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead>
              <tbody>
                {recent.length === 0 && <tr><td colSpan={5}><Empty text="Chưa có mục nào" /></td></tr>}
                {recent.map((it) => (
                  <tr key={it.id} className="clickable" onClick={() => nav(`/items/${it.id}`)}>
                    <td className="font-bold max-w-[420px] truncate">{it.title}</td><td>{it.space?.name}</td><td>{it.owner?.name}</td>
                    <td><ItemBadges it={it} /></td><td className="whitespace-nowrap">{dt(it.updated_at)}</td></tr>))}
              </tbody></table></div>
          </Section>
        </>
      )}
    </>
  )
}
