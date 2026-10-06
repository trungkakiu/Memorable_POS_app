import { FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SearchX, ThumbsDown, ThumbsUp } from 'lucide-react'
import { ApiError, get, post } from '../lib/api'
import { dt, FRESH_LABEL, STATUS_LABEL, TRUST_LABEL, TYPE_LABEL } from '../lib/format'
import type { ItemRow } from '../lib/types'
import { Empty, Modal, PageHeader, SearchBox } from '../components/ui'
import { AttachStrip } from '../components/Attachments'
import { ErrorBox, FreshPill, Loading, Pager, StatusPill, TypePill, useBusy } from '../components/shared'
import { useAuth } from '../store/auth'
import { toast } from '../store/ui'
import { Pill } from '../components/ui'

interface Hit extends ItemRow { score: number; snippet?: string }
interface Resp { session_id: number; query: string; results: Hit[]; total: number; page: number; pages: number }

export default function Search() {
  const nav = useNavigate()
  const { spaces, tags } = useAuth()
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState(sp.get('q') || '')
  const [f, setF] = useState({ type: '', space_id: '', status: '', freshness: '', tag: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [fb, setFb] = useState<{ helpful: boolean } | null>(null)
  const [reason, setReason] = useState('')
  const [req, setReq] = useState(false)
  const [sent, setSent] = useState(false)
  const { busy, run } = useBusy()
  const inputRef = useRef<HTMLInputElement>(null)

  async function search(p = 1, query = q) {
    if (!query.trim()) return
    setLoading(true); setError(null); setSent(false); setPage(p)
    setSp({ q: query }, { replace: true })
    try { setData(await get<Resp>('/search', { q: query.trim(), page: p, limit: 20, ...f })) } catch (e) { setError(e as ApiError) } finally { setLoading(false) }
  }
  useEffect(() => { inputRef.current?.focus(); if (sp.get('q')) search(1, sp.get('q')!) }, []) // eslint-disable-line
  const submit = (e: FormEvent) => { e.preventDefault(); search(1) }

  async function sendFeedback() {
    if (!data || !fb) return
    const r = await run(() => post(`/search/${data.session_id}/feedback`, { helpful: fb.helpful, reason: reason.trim() || undefined, content_request: req || undefined }), 'Cảm ơn phản hồi của bạn')
    if (r !== undefined) { setFb(null); setReason(''); setReq(false); setSent(true) }
  }

  return (
    <div className="flex flex-col gap-4 max-w-[1100px]">
      <PageHeader title="Tìm kiếm tri thức" subtitle="Gõ có dấu hoặc không dấu đều được; mã lỗi như ERR_504 khớp chính xác và lên đầu" />
      <form onSubmit={submit} className="card !p-4 flex flex-col gap-3">
        <div className="flex gap-3">
          <SearchBox inputRef={inputRef} className="flex-1" value={q} onChange={setQ} placeholder="Ví dụ: loi thanh toan, ERR_504, sao lưu dữ liệu…" />
          <button className="btn lg" disabled={!q.trim() || loading}>Tìm kiếm</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">Mọi loại</option>{Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select className="select" value={f.space_id} onChange={(e) => setF({ ...f, space_id: e.target.value })}><option value="">Mọi mảng</option>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Mọi trạng thái</option>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select className="select" value={f.freshness} onChange={(e) => setF({ ...f, freshness: e.target.value })}><option value="">Mọi độ tươi</option>{Object.entries(FRESH_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select className="select" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}><option value="">Mọi thẻ</option>{tags.map((t) => <option key={t.id} value={t.id}>#{t.name}</option>)}</select>
        </div>
      </form>
      <ErrorBox error={error} />
      {loading && <Loading text="Đang tìm…" />}
      {!loading && data && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="font-bold">{data.total.toLocaleString('vi-VN')} kết quả cho “{data.query}”</div>
            {!sent ? <div className="flex items-center gap-2 text-sm"><span className="text-muted">Kết quả có hữu ích?</span>
              <button className="btn outline sm" onClick={() => setFb({ helpful: true })}><ThumbsUp size={13} />Có</button>
              <button className="btn outline sm" onClick={() => setFb({ helpful: false })}><ThumbsDown size={13} />Không</button></div> : <Pill tone="ok" sm>Đã gửi phản hồi</Pill>}
          </div>
          {data.results.length === 0 ? <Empty text="Không có kết quả — thử từ khóa khác hoặc gửi “yêu cầu nội dung”" icon={<SearchX size={42} strokeWidth={1.4} />} /> : (
            <div className="flex flex-col gap-3">{data.results.map((r) => (
              <div key={r.id} className="card !p-4 cursor-pointer hover:border-brand-500 transition" onClick={() => nav(`/items/${r.id}`)}>
                <div className="flex items-center gap-2 flex-wrap"><TypePill t={r.type} /><StatusPill s={r.status} /><FreshPill f={r.freshness} />
                  <Pill sm tone="gray">{TRUST_LABEL[r.trust_label || ''] || r.trust_label}</Pill><span className="text-xs text-muted ml-auto">Điểm {r.score?.toFixed(1)}</span></div>
                <div className="font-extrabold text-lg mt-2 text-brand-800">{r.title}</div>
                {r.snippet && <div className="text-sm text-ink/80 mt-1" dangerouslySetInnerHTML={undefined}>{r.snippet}</div>}
                <div className="text-xs text-muted mt-2">{r.space?.name} · Hạn rà soát {dt(r.next_review_date, false)}</div>
                <div className="mt-2" onClick={(e) => e.stopPropagation()}><AttachStrip itemId={r.id} size={52} max={6} /></div>
              </div>))}</div>)}
          <Pager page={page} pages={data.pages} onPage={(p) => search(p)} />
        </>)}
      {fb && (
        <Modal title={fb.helpful ? 'Kết quả hữu ích' : 'Kết quả chưa hữu ích'} size="sm" onClose={() => setFb(null)} footer={<><button className="btn outline" onClick={() => setFb(null)}>Hủy</button><button className="btn" disabled={busy} onClick={sendFeedback}>Gửi</button></>}>
          <div className="grid gap-3"><textarea className="textarea" rows={3} placeholder="Lý do / bạn đang cần tìm gì? (tùy chọn)" value={reason} onChange={(e) => setReason(e.target.value)} />
            {!fb.helpful && <label className="check"><input type="checkbox" checked={req} onChange={(e) => setReq(e.target.checked)} />Đề nghị bổ sung nội dung này vào kho tri thức</label>}</div>
        </Modal>)}
      {!data && !loading && !error && <Empty text="Nhập từ khóa để bắt đầu (Ctrl+K từ bất kỳ đâu)" />}
      <div className="hidden">{toast.info.length}</div>
    </div>
  )
}
