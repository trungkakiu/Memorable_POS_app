import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { del, post, put, useGet } from '../lib/api'
import { can } from '../lib/permissions'
import { COST_ITEM, dt, money, num, thisPeriod, todayStr, WORK_TYPE } from '../lib/format'
import type { Benchmark, Cost, TimeLog } from '../lib/types'
import { Empty, Field, Modal, MoneyInput, PageHeader, Pill, Stat } from '../components/ui'
import { ErrorBox, Loading, Pager, useBusy } from '../components/shared'
import { useAuth } from '../store/auth'
import { confirmDialog } from '../store/ui'
import { DateRange } from '../components/ui'

export function TimeLogs() {
  const [page, setPage] = useState(1)
  const [range, setRange] = useState({ from: todayStr().slice(0, 8) + '01', to: todayStr() })
  const { data, loading, error, reload } = useGet<{ time_logs: TimeLog[]; total: number; page: number; pages: number }>('/time-logs', { page, limit: 20, from: range.from, to: range.to })
  const { busy, run } = useBusy()
  const [open, setOpen] = useState(false)
  const blank = { log_date: todayStr(), work_type: 'development', hours: 1, claude_supported: false, notes: '' }
  const [f, setF] = useState(blank)
  const total = data?.time_logs.reduce((a, b) => a + Number(b.hours), 0) ?? 0
  async function save() {
    const r = await run(() => post('/time-logs', { ...f, hours: Number(f.hours), notes: f.notes || undefined }), 'Đã ghi giờ công')
    if (r) { setOpen(false); setF(blank); reload() }
  }
  async function rm(t: TimeLog) { if (await confirmDialog('Xóa giờ công', `Xóa dòng ${dt(t.log_date, false)} · ${WORK_TYPE[t.work_type]} · ${t.hours}h?`, { danger: true, okText: 'Xóa' })) { await run(() => del(`/time-logs/${t.id}`), 'Đã xóa'); reload() } }
  const bad = f.log_date > todayStr() || Number(f.hours) < 0.25 || Number(f.hours) > 24
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Giờ công của tôi" subtitle="Ghi giờ cuối ngày (khoảng 2 phút). Tổng một ngày không quá 24 giờ, không ghi ngày tương lai." actions={<button className="btn" onClick={() => setOpen(true)}><Plus size={16} />Ghi giờ công</button>} />
      <div className="card !p-4 flex items-center justify-between gap-4 flex-wrap"><DateRange value={range} onChange={(r) => { setRange(r); setPage(1) }} /><Pill>Trang này: {num(total, 2)} giờ</Pill></div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Ngày</th><th>Loại việc</th><th className="num">Số giờ</th><th>Có AI hỗ trợ</th><th>Ghi chú</th><th /></tr></thead><tbody>
        {loading && !data && <tr><td colSpan={6}><Loading /></td></tr>}
        {data && data.time_logs.length === 0 && <tr><td colSpan={6}><Empty text="Chưa có giờ công trong khoảng này" /></td></tr>}
        {data?.time_logs.map((t) => (<tr key={t.id}><td className="font-bold">{dt(t.log_date, false)}</td><td>{WORK_TYPE[t.work_type] || t.work_type}</td><td className="num font-bold">{num(t.hours, 2)}</td><td>{t.claude_supported ? <Pill sm tone="ok">Có</Pill> : <Pill sm tone="gray">Không</Pill>}</td><td className="max-w-[320px] truncate">{t.notes || '—'}</td>
          <td className="num"><button className="btn ghost icon" onClick={() => rm(t)}><Trash2 size={15} /></button></td></tr>))}
      </tbody></table></div>
      {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      {open && <Modal title="Ghi giờ công" size="sm" onClose={() => setOpen(false)} footer={<><button className="btn outline" onClick={() => setOpen(false)}>Hủy</button><button className="btn" disabled={busy || bad} onClick={save}>Ghi</button></>}>
        <div className="grid gap-4">
          <Field label="Ngày làm việc"><input type="date" className="input" max={todayStr()} value={f.log_date} onChange={(e) => setF({ ...f, log_date: e.target.value })} /></Field>
          <Field label="Loại việc"><select className="select" value={f.work_type} onChange={(e) => setF({ ...f, work_type: e.target.value })}>{Object.entries(WORK_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Số giờ (0,25 – 24)"><input type="number" className="input" min={0.25} max={24} step={0.25} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value as unknown as number })} /></Field>
          <label className="check"><input type="checkbox" checked={f.claude_supported} onChange={(e) => setF({ ...f, claude_supported: e.target.checked })} />Có dùng trợ lý AI hỗ trợ</label>
          <Field label="Ghi chú"><textarea className="textarea" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div></Modal>}
    </div>
  )
}

export function Costs() {
  const user = useAuth((s) => s.user)!
  const w = can(user.role, 'moderate')
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useGet<{ costs: Cost[]; total: number; page: number; pages: number }>('/costs', { page, limit: 20 })
  const { busy, run } = useBusy()
  const blank = { cost_item: 'hosting', amount: 0, period: thisPeriod(), source: '', notes: '' }
  const [f, setF] = useState<(typeof blank & { id?: number }) | null>(null)
  async function save() {
    if (!f) return
    const r = await run(() => (f.id ? put(`/costs/${f.id}`, { amount: f.amount, source: f.source, notes: f.notes || undefined }) : post('/costs', { ...f, notes: f.notes || undefined })), 'Đã lưu chi phí')
    if (r) { setF(null); reload() }
  }
  const pageTotal = data?.costs.reduce((a, b) => a + Number(b.amount), 0) ?? 0
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Chi phí" subtitle="Chi phí thực tế theo tháng (hosting, gói Claude, API, tên miền…)" actions={w && <button className="btn" onClick={() => setF(blank)}><Plus size={16} />Ghi chi phí</button>} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4"><Stat label="Tổng số bản ghi" value={num(data?.total)} /><Stat label="Tổng trang này" value={money(pageTotal)} /></div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Kỳ</th><th>Khoản mục</th><th className="num">Số tiền</th><th>Nguồn</th><th>Ghi chú</th><th /></tr></thead><tbody>
        {loading && !data && <tr><td colSpan={6}><Loading /></td></tr>}
        {data && data.costs.length === 0 && <tr><td colSpan={6}><Empty text="Chưa có chi phí" /></td></tr>}
        {data?.costs.map((c) => (<tr key={c.id}><td className="font-bold">{c.period}</td><td><Pill sm tone="soft">{COST_ITEM[c.cost_item] || c.cost_item}</Pill></td><td className="num font-bold">{money(c.amount)}</td><td>{c.source}</td><td className="max-w-[260px] truncate">{c.notes || '—'}</td>
          <td className="num">{w && <button className="btn outline sm" onClick={() => setF({ id: c.id, cost_item: c.cost_item, amount: Number(c.amount), period: c.period, source: c.source, notes: c.notes || '' })}><Pencil size={13} />Sửa</button>}</td></tr>))}
      </tbody></table></div>
      {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      {f && <Modal title={f.id ? `Sửa chi phí #${f.id}` : 'Ghi chi phí'} size="sm" onClose={() => setF(null)} footer={<><button className="btn outline" onClick={() => setF(null)}>Hủy</button><button className="btn" disabled={busy || !f.source.trim() || f.amount < 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(f.period)} onClick={save}>Lưu</button></>}>
        <div className="grid gap-4">
          <Field label="Khoản mục"><select className="select" disabled={!!f.id} value={f.cost_item} onChange={(e) => setF({ ...f, cost_item: e.target.value })}>{Object.entries(COST_ITEM).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Kỳ (YYYY-MM)"><input type="month" className="input" disabled={!!f.id} value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} /></Field>
          <Field label="Số tiền (VNĐ)"><MoneyInput value={f.amount} onChange={(n) => setF({ ...f, amount: n })} /></Field>
          <Field label="Nguồn số liệu *"><input className="input" maxLength={100} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="Hóa đơn 0012" /></Field>
          <Field label="Ghi chú"><textarea className="textarea" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div></Modal>}
    </div>
  )
}

export function Benchmarks() {
  const user = useAuth((s) => s.user)!
  const w = can(user.role, 'moderate')
  const [page, setPage] = useState(1)
  const [batch, setBatch] = useState('')
  const { data, loading, error, reload } = useGet<{ benchmarks: Benchmark[]; total: number; page: number; pages: number }>('/benchmarks', { page, limit: 20, batch })
  const { busy, run } = useBusy()
  const blank = { batch: 'baseline', task_code: '', performer_id: user.id, minutes: 10, success: true, notes: '' }
  const [f, setF] = useState<typeof blank | null>(null)
  async function save() { if (!f) return; const r = await run(() => post('/benchmarks', { ...f, performer_id: Number(f.performer_id), minutes: Number(f.minutes), notes: f.notes || undefined }), 'Đã ghi bài đo'); if (r) { setF(null); reload() } }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Bài đo baseline" subtitle="Đo thời gian hoàn thành tác vụ mẫu để tính KPI K1" actions={w && <button className="btn" onClick={() => setF(blank)}><Plus size={16} />Ghi bài đo</button>} />
      <div className="card !p-4"><input className="input !w-64" placeholder="Lọc theo đợt đo (batch)…" value={batch} onChange={(e) => { setBatch(e.target.value); setPage(1) }} /></div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Đợt</th><th>Mã tác vụ</th><th>Người thực hiện</th><th className="num">Phút</th><th>Kết quả</th><th>Ghi chú</th><th>Đo lúc</th></tr></thead><tbody>
        {loading && !data && <tr><td colSpan={7}><Loading /></td></tr>}
        {data && data.benchmarks.length === 0 && <tr><td colSpan={7}><Empty text="Chưa có bài đo" /></td></tr>}
        {data?.benchmarks.map((b) => (<tr key={b.id}><td><Pill sm tone="soft">{b.batch}</Pill></td><td className="font-bold">{b.task_code}</td><td>#{b.performer_id}</td><td className="num font-bold">{num(b.minutes, 2)}</td><td>{b.success ? <Pill sm tone="ok">Thành công</Pill> : <Pill sm tone="bad">Thất bại</Pill>}</td><td className="max-w-[240px] truncate">{b.notes || '—'}</td><td>{dt(b.measured_at)}</td></tr>))}
      </tbody></table></div>
      {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      {f && <Modal title="Ghi bài đo baseline" size="sm" onClose={() => setF(null)} footer={<><button className="btn outline" onClick={() => setF(null)}>Hủy</button><button className="btn" disabled={busy || !f.batch.trim() || !f.task_code.trim()} onClick={save}>Ghi</button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Đợt đo *"><input className="input" value={f.batch} onChange={(e) => setF({ ...f, batch: e.target.value })} /></Field>
          <Field label="Mã tác vụ *"><input className="input" value={f.task_code} onChange={(e) => setF({ ...f, task_code: e.target.value })} placeholder="T01" /></Field>
          <Field label="Mã người thực hiện"><input className="input" inputMode="numeric" value={f.performer_id} onChange={(e) => setF({ ...f, performer_id: e.target.value.replace(/\D/g, '') as unknown as number })} /></Field>
          <Field label="Số phút"><input type="number" className="input" min={0} step={0.5} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value as unknown as number })} /></Field>
          <label className="check col-span-2"><input type="checkbox" checked={f.success} onChange={(e) => setF({ ...f, success: e.target.checked })} />Hoàn thành thành công</label>
          <Field label="Ghi chú" className="col-span-2"><textarea className="textarea" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div></Modal>}
    </div>
  )
}
