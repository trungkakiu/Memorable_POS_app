import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCheck, Plus, Siren } from 'lucide-react'
import { patch, post, useGet } from '../lib/api'
import { can } from '../lib/permissions'
import { dt, fromLocalInput, toLocalInput } from '../lib/format'
import type { Incident } from '../lib/types'
import { Empty, Field, Modal, PageHeader, Pill, SearchBox } from '../components/ui'
import { ErrorBox, Loading, Pager, useBusy } from '../components/shared'
import { useAuth } from '../store/auth'

export default function Incidents() {
  const nav = useNavigate()
  const user = useAuth((s) => s.user)!
  const w = can(user.role, 'write')
  const [page, setPage] = useState(1)
  const [system, setSystem] = useState('')
  const [group, setGroup] = useState('')
  const { data, loading, error, reload } = useGet<{ incidents: Incident[]; total: number; page: number; pages: number }>('/incidents', { page, limit: 20, system, error_group: group })
  const { busy, run } = useBusy()
  const [form, setForm] = useState<{ id?: number; title: string; system: string; error_group: string; detected_at: string; resolved_at: string; runbook_id: string; conclusion: string } | null>(null)

  const open = (i?: Incident) => setForm(i
    ? { id: i.id, title: i.title, system: i.system, error_group: i.error_group, detected_at: toLocalInput(i.detected_at), resolved_at: i.resolved_at ? toLocalInput(i.resolved_at) : '', runbook_id: i.runbook_id ? String(i.runbook_id) : '', conclusion: i.conclusion || '' }
    : { title: '', system: '', error_group: '', detected_at: toLocalInput(), resolved_at: '', runbook_id: '', conclusion: '' })
  async function save() {
    if (!form) return
    const body: Record<string, unknown> = form.id
      ? { resolved_at: form.resolved_at ? fromLocalInput(form.resolved_at) : undefined, runbook_id: form.runbook_id ? Number(form.runbook_id) : undefined, conclusion: form.conclusion || undefined }
      : { title: form.title, system: form.system, error_group: form.error_group, detected_at: fromLocalInput(form.detected_at), resolved_at: form.resolved_at ? fromLocalInput(form.resolved_at) : undefined, runbook_id: form.runbook_id ? Number(form.runbook_id) : undefined, conclusion: form.conclusion || undefined }
    const r = await run(() => (form.id ? patch(`/incidents/${form.id}`, body) : post('/incidents', body)), form.id ? 'Đã cập nhật sự cố' : 'Đã ghi sự cố')
    if (r) { setForm(null); reload() }
  }
  const valid = form && (form.id || (form.title.trim() && form.system.trim() && form.error_group.trim()))
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Sổ sự cố" subtitle="Ghi nhận sự cố và đo thời gian xử lý trung bình (MTTR)" actions={w && <button className="btn" onClick={() => open()}><Plus size={16} />Ghi sự cố</button>} />
      <div className="card !p-4 flex gap-3 flex-wrap"><SearchBox className="w-64" value={system} onChange={(v) => { setSystem(v); setPage(1) }} placeholder="Lọc theo hệ thống…" /><SearchBox className="w-64" value={group} onChange={(v) => { setGroup(v); setPage(1) }} placeholder="Lọc theo nhóm lỗi…" /></div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Sự cố</th><th>Hệ thống</th><th>Nhóm lỗi</th><th>Phát hiện</th><th>Trạng thái</th><th className="num">MTTR</th><th>Runbook</th><th /></tr></thead><tbody>
        {loading && !data && <tr><td colSpan={8}><Loading /></td></tr>}
        {data && data.incidents.length === 0 && <tr><td colSpan={8}><Empty text="Chưa có sự cố nào" icon={<Siren size={42} strokeWidth={1.4} />} /></td></tr>}
        {data?.incidents.map((i) => (
          <tr key={i.id}><td className="max-w-[300px]"><div className="font-bold truncate">{i.title}</div>{i.conclusion && <div className="text-xs text-muted line-clamp-1">{i.conclusion}</div>}</td>
            <td>{i.system}</td><td><Pill sm tone="soft">{i.error_group}</Pill></td><td className="whitespace-nowrap">{dt(i.detected_at)}</td>
            <td>{i.resolved_at ? <Pill sm tone="ok"><CheckCheck size={11} />Đã xử lý</Pill> : <Pill sm tone="bad">Đang mở</Pill>}</td>
            <td className="num font-bold">{i.mttr_minutes != null ? `${i.mttr_minutes} phút` : '—'}</td>
            <td>{i.runbook_id ? <button className="btn ghost sm" onClick={() => nav(`/items/${i.runbook_id}`)}>#{i.runbook_id}</button> : '—'}</td>
            <td className="num">{w && <button className="btn outline sm" onClick={() => open(i)}>{i.resolved_at ? 'Sửa' : 'Cập nhật / đóng'}</button>}</td></tr>))}
      </tbody></table></div>
      {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      {form && <Modal title={form.id ? `Cập nhật sự cố #${form.id}` : 'Ghi sự cố mới'} size="md" onClose={() => setForm(null)} footer={<><button className="btn outline" onClick={() => setForm(null)}>Hủy</button><button className="btn" disabled={busy || !valid} onClick={save}>Lưu</button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tiêu đề *" className="col-span-2"><input className="input" disabled={!!form.id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Hệ thống *"><input className="input" disabled={!!form.id} value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })} placeholder="payment" /></Field>
          <Field label="Nhóm lỗi *"><input className="input" disabled={!!form.id} value={form.error_group} onChange={(e) => setForm({ ...form, error_group: e.target.value })} placeholder="thanh-toan" /></Field>
          <Field label="Thời điểm phát hiện *"><input type="datetime-local" className="input" disabled={!!form.id} value={form.detected_at} onChange={(e) => setForm({ ...form, detected_at: e.target.value })} /></Field>
          <Field label="Thời điểm xử lý xong"><input type="datetime-local" className="input" value={form.resolved_at} onChange={(e) => setForm({ ...form, resolved_at: e.target.value })} /></Field>
          <Field label="Mã runbook đã dùng"><input className="input" inputMode="numeric" value={form.runbook_id} onChange={(e) => setForm({ ...form, runbook_id: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Kết luận" className="col-span-2"><textarea className="textarea" rows={3} value={form.conclusion} onChange={(e) => setForm({ ...form, conclusion: e.target.value })} /></Field>
        </div></Modal>}
    </div>
  )
}
