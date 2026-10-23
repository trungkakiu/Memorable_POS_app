import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, MessageSquareWarning, FilePlus2 } from 'lucide-react'
import { fmtMinutes } from '../lib/incident'
import { download, useGet } from '../lib/api'
import { COST_ITEM, dt, money, num, pct, todayStr, WORK_TYPE } from '../lib/format'
import { DateRange, Empty, PageHeader, Pill, Seg, Stat } from '../components/ui'
import { ErrorBox, Loading, Section } from '../components/shared'
import { toast } from '../store/ui'
import { Pager } from '../components/shared'
import AiUsage from '../components/AiUsage'
import { Benchmarks, Costs } from './Measure'

type Tab = 'kpi' | 'time' | 'cost' | 'bench' | 'ai' | 'fresh' | 'gaps'
const TABS: Tab[] = ['kpi', 'time', 'cost', 'bench', 'ai', 'fresh', 'gaps']
// Tên chỉ số bằng lời thường (mã K1–K6 chỉ dùng nội bộ trong API)
export const KPI_NAME = {
  K1: 'Thời gian làm xong tác vụ mẫu', K2: 'Tìm kiếm có ích', K3: 'Thời gian khắc phục sự cố: có và không có quy trình',
  K4: 'Câu lệnh AI đã kiểm thử đạt', K5: 'Người dùng hoạt động hằng tuần', K6: 'Bài còn trong hạn rà soát',
}
type K3Row = { error_group: string; median_minutes_with_runbook: number | null; median_minutes_without_runbook: number | null; incidents_with_runbook: number; incidents_without_runbook: number; reduction: number | null }
type FeedbackRow = { reason: string | null; created_at: string; session_id?: string | null }

function K3Table({ rows }: { rows: K3Row[] }) {
  const chart = rows.map((r) => ({ name: r.error_group, 'Có quy trình': r.median_minutes_with_runbook, 'Không có quy trình': r.median_minutes_without_runbook }))
  return (<>
    <div className="h-56"><ResponsiveContainer><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="#eee8fb" vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} /><YAxis tickLine={false} axisLine={false} fontSize={12} width={36} /><Tooltip formatter={(v) => (v == null ? '—' : fmtMinutes(Number(v)))} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="Có quy trình" fill="#12a150" radius={[5, 5, 0, 0]} barSize={26} /><Bar dataKey="Không có quy trình" fill="#b4a3d8" radius={[5, 5, 0, 0]} barSize={26} /></BarChart></ResponsiveContainer></div>
    <div className="tbl-wrap mt-3"><table className="tbl"><thead><tr><th>Nhóm lỗi</th><th className="num">Có quy trình</th><th className="num">Không có quy trình</th><th className="num">Nhanh hơn</th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.error_group}><td className="font-bold">{r.error_group}</td>
        <td className="num">{fmtMinutes(r.median_minutes_with_runbook)} <span className="text-muted text-xs">({r.incidents_with_runbook} vụ)</span></td>
        <td className="num">{fmtMinutes(r.median_minutes_without_runbook)} <span className="text-muted text-xs">({r.incidents_without_runbook} vụ)</span></td>
        <td className="num font-bold">{r.reduction == null ? <span className="text-muted font-normal">chưa đủ dữ liệu</span> : pct(r.reduction)}</td></tr>)}
    </tbody></table></div>
  </>)
}

function FeedbackList({ rows, icon, empty }: { rows: FeedbackRow[]; icon: React.ReactNode; empty: string }) {
  return <div className="flex flex-col gap-2 max-h-96 overflow-auto">{rows.map((r, i) => (
    <div key={i} className="flex gap-2 p-2.5 rounded-lg border border-line text-sm">{icon}<div className="min-w-0 flex-1"><div className={r.reason ? '' : 'text-muted italic'}>{r.reason || empty}</div><div className="text-xs text-muted mt-0.5">{dt(r.created_at)}</div></div></div>))}</div>
}
const csvOf = async (path: string, q: Record<string, unknown>, name: string) => {
  try { const r = await download(path, { ...q, format: 'csv' }, name, [{ name: 'CSV', extensions: ['csv'] }]); if (r.ok) toast.ok('Đã xuất CSV') } catch (e) { toast.error(e) }
}

export default function Reports() {
  // Tab nằm trong địa chỉ (?tab=cost) để các trang cũ như Chi phí, Dùng AI chuyển thẳng được tới đây
  const [sp, setSp] = useSearchParams()
  const want = sp.get('tab') as Tab
  const tab: Tab = TABS.includes(want) ? want : 'kpi'
  const setTab = (t: Tab) => setSp(t === 'kpi' ? {} : { tab: t }, { replace: true })
  const [range, setRange] = useState({ from: todayStr().slice(0, 8) + '01', to: todayStr() })
  const [batch, setBatch] = useState('')
  const q = { from: range.from, to: range.to, batch: batch || undefined }
  const ranged = tab === 'kpi' || tab === 'time' || tab === 'cost' || tab === 'gaps'
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Báo cáo & chỉ số" subtitle="Dành cho kiểm duyệt viên, quản trị và người bảo trợ" />
      <div className="card !p-3 flex items-center justify-between gap-3 flex-wrap">
        <Seg value={tab} onChange={setTab} options={[{ value: 'kpi', label: 'Chỉ số' }, { value: 'time', label: 'Giờ công' }, { value: 'cost', label: 'Chi phí' }, { value: 'bench', label: 'Đo tác vụ mẫu' }, { value: 'ai', label: 'Dùng AI' }, { value: 'fresh', label: 'Hạn rà soát' }, { value: 'gaps', label: 'Khoảng trống tìm kiếm' }]} />
        {ranged && <div className="flex gap-3 items-center flex-wrap"><DateRange value={range} onChange={setRange} />{tab === 'kpi' && <input className="input !w-36 !py-1.5" placeholder="Lọc theo đợt đo" title="Tên đợt đo thời gian làm tác vụ mẫu, VD: truoc-khi-dung" value={batch} onChange={(e) => setBatch(e.target.value)} />}</div>}
      </div>
      {tab === 'kpi' && <Kpi q={q} />}{tab === 'time' && <TimeReport q={q} />}{tab === 'cost' && <><CostReport q={q} /><Costs embedded /></>}{tab === 'bench' && <Benchmarks embedded />}{tab === 'ai' && <AiUsage />}{tab === 'fresh' && <Fresh />}{tab === 'gaps' && <Gaps q={q} />}
    </div>
  )
}

function KpiCard({ label, k, hint }: { label: string; k?: { numerator: number; denominator: number; value: number | null; target: number }; hint?: string }) {
  if (!k) return null
  const ok = (k.value ?? 0) >= k.target
  return (
    <div className="card">
      <div className="pill block mb-3">{label}</div>
      <div className="flex items-end justify-between"><div className="text-4xl font-black text-brand-600">{pct(k.value)}</div><Pill tone={ok ? 'ok' : 'warn'} sm>Mục tiêu {pct(k.target)}</Pill></div>
      <div className="progress my-3"><i style={{ width: `${Math.min(100, (k.value ?? 0) * 100)}%` }} /></div>
      <div className="text-xs text-muted">{k.numerator} / {k.denominator} {hint}</div>
    </div>)
}

function Kpi({ q }: { q: Record<string, unknown> }) {
  const { data, loading, error, reload } = useGet<any>('/reports/kpi', q)
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null
  const k1 = (data.K1_benchmark || []) as { batch: string; runs: number; median_minutes: number; success_rate: number }[]
  const k3 = (data.K3_incident_resolution || []) as K3Row[]
  return (
    <>
      <div className="flex justify-between items-center"><span className="text-xs text-muted">Tạo lúc {dt(data.generated_at)}</span><button className="btn outline sm" onClick={() => csvOf('/reports/kpi', q, 'kpi.csv')}><Download size={13} />CSV</button></div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label={KPI_NAME.K2} k={data.K2_search_helpful} hint="lượt tìm được đánh giá có ích" />
        <KpiCard label={KPI_NAME.K5} k={data.K5_weekly_active_users} hint="người dùng có hoạt động trong tuần" />
        <KpiCard label={KPI_NAME.K6} k={data.K6_fresh_owned_items} hint="bài còn trong hạn rà soát" />
        <KpiCard label={KPI_NAME.K4} k={data.K4_prompts_with_passing_tests} hint="câu lệnh AI có kiểm thử đạt" />
      </div>
      <div className="grid xl:grid-cols-2 gap-5">
        <Section title={KPI_NAME.K1} sub="Đo trước và sau khi dùng hệ thống để thấy thời gian tiết kiệm">
          {k1.length === 0 ? <Empty text="Chưa có bài đo" /> : (<>
            <div className="h-56"><ResponsiveContainer><BarChart data={k1}><CartesianGrid strokeDasharray="3 3" stroke="#eee8fb" vertical={false} /><XAxis dataKey="batch" tickLine={false} axisLine={false} fontSize={12} /><YAxis tickLine={false} axisLine={false} fontSize={12} width={36} /><Tooltip formatter={(v) => [`${v} phút`, 'Trung vị']} /><Bar dataKey="median_minutes" fill="#7a2ee6" radius={[5, 5, 0, 0]} barSize={40} /></BarChart></ResponsiveContainer></div>
            <div className="tbl-wrap mt-3"><table className="tbl"><thead><tr><th>Đợt</th><th className="num">Lượt đo</th><th className="num">Trung vị (phút)</th><th className="num">Tỷ lệ thành công</th></tr></thead><tbody>{k1.map((r) => <tr key={r.batch}><td className="font-bold">{r.batch}</td><td className="num">{r.runs}</td><td className="num">{num(r.median_minutes, 1)}</td><td className="num">{pct(r.success_rate)}</td></tr>)}</tbody></table></div></>)}
        </Section>
        <Section title={KPI_NAME.K3} sub="Thời gian khắc phục trung vị theo nhóm lỗi, so sánh có và không làm theo quy trình">
          {k3.length === 0 ? <Empty text="Chưa có sự cố đã đóng" /> : <K3Table rows={k3} />}
        </Section>
      </div>
    </>)
}

function TimeReport({ q }: { q: Record<string, unknown> }) {
  const { data, loading, error, reload } = useGet<{ rows: { user: string; work_type: string; hours: number; claude_supported_hours: number }[]; total_hours: number; F3_moderation_hours_per_published_item: number }>('/reports/time-logs', q)
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null
  const byType = Object.values(data.rows.reduce<Record<string, { name: string; hours: number }>>((a, r) => { (a[r.work_type] ||= { name: WORK_TYPE[r.work_type] || r.work_type, hours: 0 }).hours += r.hours; return a }, {}))
  return (<>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4"><Stat label="Tổng giờ công" value={num(data.total_hours, 1)} unit="giờ" /><Stat label="Giờ kiểm duyệt cho mỗi bài xuất bản" value={num(data.F3_moderation_hours_per_published_item, 2)} unit="giờ" /><Stat label="Giờ có AI hỗ trợ" value={num(data.rows.reduce((a, r) => a + r.claude_supported_hours, 0), 1)} unit="giờ" /></div>
    <div className="grid xl:grid-cols-[1fr_1.2fr] gap-5">
      <Section title="Theo loại việc">{byType.length === 0 ? <Empty /> : <div className="h-64"><ResponsiveContainer><BarChart data={byType} layout="vertical" margin={{ left: 20 }}><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={140} tickLine={false} axisLine={false} fontSize={12} /><Tooltip /><Bar dataKey="hours" fill="#7a2ee6" radius={[0, 5, 5, 0]} barSize={16} /></BarChart></ResponsiveContainer></div>}</Section>
      <Section title="Chi tiết" right={<button className="btn outline sm" onClick={() => csvOf('/reports/time-logs', q, 'gio-cong.csv')}><Download size={13} />CSV</button>}>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Người dùng</th><th>Loại việc</th><th className="num">Giờ</th><th className="num">Giờ có AI</th></tr></thead><tbody>
          {data.rows.length === 0 && <tr><td colSpan={4}><Empty /></td></tr>}{data.rows.map((r, i) => <tr key={i}><td className="font-bold">{r.user}</td><td>{WORK_TYPE[r.work_type] || r.work_type}</td><td className="num">{num(r.hours, 2)}</td><td className="num">{num(r.claude_supported_hours, 2)}</td></tr>)}</tbody></table></div></Section>
    </div></>)
}

function CostReport({ q }: { q: Record<string, unknown> }) {
  const { data, loading, error, reload } = useGet<{ rows: { period: string; cost_item: string; amount: number }[]; total: number }>('/reports/costs', q)
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null
  const byPeriod = Object.values(data.rows.reduce<Record<string, { period: string; amount: number }>>((a, r) => { (a[r.period] ||= { period: r.period, amount: 0 }).amount += r.amount; return a }, {}))
  return (<>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4"><Stat label="Tổng chi phí" value={money(data.total)} /></div>
    <div className="grid xl:grid-cols-[1fr_1.2fr] gap-5">
      <Section title="Theo kỳ">{byPeriod.length === 0 ? <Empty /> : <div className="h-64"><ResponsiveContainer><BarChart data={byPeriod}><CartesianGrid strokeDasharray="3 3" stroke="#eee8fb" vertical={false} /><XAxis dataKey="period" tickLine={false} axisLine={false} fontSize={12} /><YAxis tickFormatter={(v) => `${Math.round(v / 1e6)}tr`} tickLine={false} axisLine={false} fontSize={12} width={44} /><Tooltip formatter={(v) => money(Number(v))} /><Bar dataKey="amount" fill="#7a2ee6" radius={[5, 5, 0, 0]} barSize={36} /></BarChart></ResponsiveContainer></div>}</Section>
      <Section title="Chi tiết" right={<button className="btn outline sm" onClick={() => csvOf('/reports/costs', q, 'chi-phi.csv')}><Download size={13} />CSV</button>}>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Kỳ</th><th>Khoản mục</th><th className="num">Số tiền</th></tr></thead><tbody>
          {data.rows.length === 0 && <tr><td colSpan={3}><Empty /></td></tr>}{data.rows.map((r, i) => <tr key={i}><td className="font-bold">{r.period}</td><td>{COST_ITEM[r.cost_item] || r.cost_item}</td><td className="num">{money(r.amount)}</td></tr>)}</tbody></table></div></Section>
    </div></>)
}

type FreshRow = { id: number; title: string; type?: string; owner?: { name: string } | string; next_review_date?: string; [k: string]: unknown }
function Fresh() {
  const nav = useNavigate()
  const { data, loading, error, reload } = useGet<{ overdue: FreshRow[]; due_soon: FreshRow[]; orphaned: FreshRow[]; review_queue_older_than_5_days: FreshRow[] }>('/reports/freshness')
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null
  const groups: [string, string, FreshRow[], 'bad' | 'warn' | 'gray'][] = [['Quá hạn rà soát', 'overdue', data.overdue, 'bad'], ['Sắp đến hạn', 'due_soon', data.due_soon, 'warn'], ['Mục mồ côi (không có người sở hữu hoạt động)', 'orphaned', data.orphaned, 'gray'], ['Chờ duyệt quá 5 ngày', 'q', data.review_queue_older_than_5_days, 'bad']]
  return (<>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">{groups.map(([l, k, rows]) => <Stat key={k} label={l.split(' (')[0]} value={rows.length} />)}</div>
    <div className="grid xl:grid-cols-2 gap-5">{groups.map(([l, k, rows, tone]) => (
      <Section key={k} title={l}>{rows.length === 0 ? <Empty text="Không có" /> : (
        <div className="flex flex-col gap-2 max-h-80 overflow-auto">{rows.map((r) => (
          <button key={r.id} className="text-left flex items-center gap-2 p-2.5 rounded-lg border border-line hover:bg-brand-50 cursor-pointer" onClick={() => nav(`/items/${r.id}`)}>
            <Pill sm tone={tone}>#{r.id}</Pill><b className="flex-1 truncate">{r.title}</b><span className="text-xs text-muted">{r.next_review_date ? dt(String(r.next_review_date), false) : ''}</span></button>))}</div>)}</Section>))}</div></>)
}

function Gaps({ q }: { q: Record<string, unknown> }) {
  const { data, loading, error, reload } = useGet<{ zero_result_queries: { query: string; searches: number }[]; unhelpful_feedback: FeedbackRow[]; content_requests: FeedbackRow[] }>('/reports/search-gaps', q)
  const [p, setP] = useState(1)
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null
  const pages = Math.max(1, Math.ceil(data.zero_result_queries.length / 10))
  return (<>
    <div className="flex justify-end"><button className="btn outline sm" onClick={() => csvOf('/reports/search-gaps', q, 'khoang-trong-tim-kiem.csv')}><Download size={13} />CSV</button></div>
    <div className="grid xl:grid-cols-3 gap-5">
      <Section title="Truy vấn không có kết quả">{data.zero_result_queries.length === 0 ? <Empty /> : (<><div className="flex flex-col gap-2">{data.zero_result_queries.slice((p - 1) * 10, p * 10).map((r) => <div key={r.query} className="flex items-center p-2.5 rounded-lg border border-line"><code className="font-bold flex-1">{r.query}</code><Pill sm tone="bad">{r.searches} lần</Pill></div>)}</div><Pager page={p} pages={pages} onPage={setP} /></>)}</Section>
      <Section title="Phản hồi không hữu ích">{data.unhelpful_feedback.length === 0 ? <Empty /> : <FeedbackList rows={data.unhelpful_feedback} icon={<MessageSquareWarning size={15} className="text-amber-600 shrink-0 mt-0.5" />} empty="Người dùng bấm “Chưa thấy” nhưng không ghi lý do" />}</Section>
      <Section title="Yêu cầu bổ sung nội dung">{data.content_requests.length === 0 ? <Empty /> : <FeedbackList rows={data.content_requests} icon={<FilePlus2 size={15} className="text-brand-600 shrink-0 mt-0.5" />} empty="Yêu cầu bổ sung không kèm mô tả" />}</Section>
    </div></>)
}
