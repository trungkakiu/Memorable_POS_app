import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react'
import { post, useGet } from '../lib/api'
import { dt } from '../lib/format'
import type { Notice } from '../lib/types'
import { Empty, Field, Modal, PageHeader, Pill } from '../components/ui'
import { ErrorBox, Loading, Pager, RiskPill, TypePill, useBusy } from '../components/shared'
import { itemIdOf, useNotices } from '../store/notices'
import { get } from '../lib/api'
import { toast } from '../store/ui'

interface QItem { id: number; type: string; title: string; risk_level: string; owner: { id: number; name: string }; version: number; waiting_business_days: number; sla_days: number; sla_breached: boolean; approvals: number; approvals_needed: number; approved_by_me: boolean }

export function ReviewQueue() {
  const nav = useNavigate()
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useGet<{ items: QItem[]; total: number; page: number; pages: number }>('/reviews/queue', { page, limit: 20 })
  const { busy, run } = useBusy()
  const [rej, setRej] = useState<QItem | null>(null)
  const [reason, setReason] = useState('')
  async function approve(it: QItem) {
    const r = await run(() => post<{ status: string; approvals: number; needed: number }>(`/items/${it.id}/approve`, {}))
    if (r) { toast.ok(r.status === 'approved' ? `Đã duyệt & xuất bản “${it.title}”` : `Đã ghi nhận (${r.approvals}/${r.needed}) — cần thêm người duyệt`); reload() }
  }
  async function reject() {
    if (!rej || !reason.trim()) return toast.warn('Nhập lý do trả lại')
    const r = await run(() => post(`/items/${rej.id}/reject`, { reason: reason.trim() }), 'Đã trả mục về nháp')
    if (r !== undefined) { setRej(null); setReason(''); reload() }
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Hàng đợi duyệt" subtitle="Mục chờ duyệt kèm hạn xử lý (SLA, tính theo ngày làm việc). Bạn không thể duyệt mục của chính mình." />
      <ErrorBox error={error} onRetry={reload} />
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Tiêu đề</th><th>Loại</th><th>Rủi ro</th><th>Chủ sở hữu</th><th>Đã chờ</th><th>Duyệt</th><th /></tr></thead><tbody>
        {loading && !data && <tr><td colSpan={7}><Loading /></td></tr>}
        {data && data.items.length === 0 && <tr><td colSpan={7}><Empty text="Hàng đợi trống — không có mục nào chờ duyệt" icon={<ClipboardCheck size={42} strokeWidth={1.4} />} /></td></tr>}
        {data?.items.map((it) => (
          <tr key={it.id}>
            <td className="font-bold max-w-[360px] truncate cursor-pointer text-brand-800" onClick={() => nav(`/items/${it.id}`)}>{it.title} <span className="text-muted font-normal">v{it.version}</span></td>
            <td><TypePill t={it.type} /></td><td><RiskPill r={it.risk_level} /></td><td>{it.owner?.name}</td>
            <td><Pill sm tone={it.sla_breached ? 'bad' : 'ok'}>{it.waiting_business_days}/{it.sla_days} ngày{it.sla_breached ? ' · quá SLA' : ''}</Pill></td>
            <td>{it.approvals}/{it.approvals_needed} {it.approved_by_me && <Pill sm tone="soft">bạn đã duyệt</Pill>}</td>
            <td className="num"><div className="flex gap-1 justify-end">
              <button className="btn success sm" disabled={busy || it.approved_by_me} onClick={() => approve(it)}><CheckCircle2 size={13} />Duyệt</button>
              <button className="btn danger sm" disabled={busy} onClick={() => setRej(it)}><XCircle size={13} />Trả lại</button></div></td></tr>))}
      </tbody></table></div>
      {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      {rej && <Modal title={`Trả lại: ${rej.title}`} size="sm" onClose={() => setRej(null)} footer={<><button className="btn outline" onClick={() => setRej(null)}>Hủy</button><button className="btn danger" disabled={busy} onClick={reject}>Trả lại</button></>}>
        <Field label="Lý do (bắt buộc)"><textarea className="textarea" autoFocus rows={4} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></Modal>}
    </div>
  )
}

export function Tasks() {
  const nav = useNavigate()
  const { data, loading, error, reload } = useGet<{ id: number; item_id: number; due_date: string; status: string; item: { id: number; title: string; type: string; status: string } }[]>('/reviews/tasks')
  return (
    <div className="flex flex-col gap-4 max-w-[1000px]">
      <PageHeader title="Việc rà soát của tôi" subtitle="Các mục bạn chịu trách nhiệm và đến hạn xác nhận nội dung còn đúng" />
      <ErrorBox error={error} onRetry={reload} />
      {loading && <Loading />}
      {data && data.length === 0 && <Empty text="Bạn không có việc rà soát nào" />}
      <div className="flex flex-col gap-3">{data?.map((t) => (
        <div key={t.id} className="card !p-4 flex items-center gap-4 cursor-pointer hover:border-brand-500" onClick={() => nav(`/items/${t.item.id}`)}>
          <TypePill t={t.item.type} /><div className="flex-1 font-extrabold truncate">{t.item.title}</div>
          <Pill sm tone={t.status === 'open' ? 'warn' : 'ok'}>{t.status === 'open' ? 'Đang mở' : t.status}</Pill><Pill sm tone="soft">Hạn {dt(t.due_date, false)}</Pill></div>))}</div>
    </div>
  )
}

export function Notifications() {
  const nav = useNavigate()
  const n = useNotices()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useGet<{ notifications: Notice[]; unread: number; total: number; page: number; pages: number }>('/notifications', { page, limit: 20, status })
  const { busy, run } = useBusy()
  async function open(x: Notice) {
    if (x.status === 'unread') { await post(`/notifications/${x.id}/read`).catch(() => undefined); n.refresh(); reload() }
    const id = itemIdOf(x.content); if (id) nav(`/items/${id}`)
  }
  async function readAll() { const r = await run(() => post<{ updated: number }>('/notifications/read-all'), undefined); if (r) { toast.ok(`Đã đánh dấu ${r.updated} thông báo`); n.refresh(); reload() } }
  return (
    <div className="flex flex-col gap-4 max-w-[1000px]">
      <PageHeader title="Thông báo" subtitle={data ? `${data.unread} chưa đọc` : ''} actions={<>
        <select className="select !w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}><option value="">Tất cả</option><option value="unread">Chưa đọc</option><option value="read">Đã đọc</option></select>
        <button className="btn" disabled={busy || !data?.unread} onClick={readAll}>Đánh dấu đã đọc tất cả</button></>} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && data.notifications.length === 0 && <Empty text="Không có thông báo" />}
      <div className="flex flex-col gap-2">{data?.notifications.map((x) => (
        <div key={x.id} onClick={() => open(x)} className={`card !p-4 flex items-start gap-3 cursor-pointer hover:border-brand-500 ${x.status === 'unread' ? '!border-brand-500 bg-brand-50/60' : ''}`}>
          <span className={`mt-1.5 w-2.5 h-2.5 rounded-md shrink-0 ${x.status === 'unread' ? 'bg-brand-600' : 'bg-slate-300'}`} />
          <div className="flex-1"><div className="font-bold">{x.content}</div><div className="text-xs text-muted mt-1">{x.type} · {dt(x.created_at)}</div></div>
          {x.status === 'unread' && <Pill sm tone="soft">Mới</Pill>}</div>))}</div>
      {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      <div className="hidden">{String(get).length}</div>
    </div>
  )
}
