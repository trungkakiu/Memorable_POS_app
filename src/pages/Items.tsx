import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, RefreshCw, FilterX, Sparkles } from 'lucide-react'
import { useGet } from '../lib/api'
import { can } from '../lib/permissions'
import { dt, FRESH_LABEL, RISK_LABEL, STATUS_LABEL, TYPE_LABEL } from '../lib/format'
import type { ItemRow } from '../lib/types'
import { Empty, PageHeader } from '../components/ui'
import { ErrorBox, ItemBadges, Loading, Pager, Tags } from '../components/shared'
import { OfficialPill } from '../components/Knowledge'
import { useAuth } from '../store/auth'

interface Resp { items: ItemRow[]; total: number; page: number; pages: number; limit: number }
const opt = (m: Record<string, string>) => Object.entries(m).map(([v, l]) => <option key={v} value={v}>{l}</option>)

export default function Items() {
  const nav = useNavigate()
  const user = useAuth((s) => s.user)!
  const { spaces, tags } = useAuth()
  const [sp, setSp] = useSearchParams()
  const [page, setPage] = useState(1)
  const f = {
    type: sp.get('type') || '', status: sp.get('status') || '', space_id: sp.get('space_id') || '', risk_level: sp.get('risk_level') || '',
    freshness: sp.get('freshness') || '', tag: sp.get('tag') || '', owner_id: sp.get('owner_id') || '', is_official: sp.get('is_official') || '', sort: sp.get('sort') || 'updated',
  }
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); setPage(1) }
  const { data, loading, error, reload } = useGet<Resp>('/items', { ...f, page, limit: 20 })
  const dirty = Object.entries(f).some(([k, v]) => v && !(k === 'sort' && v === 'updated'))

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Kho tri thức" subtitle="Tài liệu, bài viết, prompt và runbook của nhóm"
        actions={<>
          <button className="btn outline" onClick={reload}><RefreshCw size={15} />Tải lại</button>
          {can(user.role, 'write') && <button className="btn outline" onClick={() => nav('/items/new')}><Plus size={16} />Tạo thủ công</button>}
          {can(user.role, 'write') && <button className="btn" onClick={() => nav('/import-knowledge')}><Sparkles size={16} />Nhập tri thức (AI)</button>}
        </>} />
      <div className="card !p-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 items-end">
        <div className="field"><label>Loại</label><select className="select" value={f.type} onChange={(e) => set('type', e.target.value)}><option value="">Tất cả</option>{opt(TYPE_LABEL)}</select></div>
        <div className="field"><label>Trạng thái</label><select className="select" value={f.status} onChange={(e) => set('status', e.target.value)}><option value="">Tất cả</option>{opt(STATUS_LABEL)}</select></div>
        <div className="field"><label>Mảng</label><select className="select" value={f.space_id} onChange={(e) => set('space_id', e.target.value)}><option value="">Tất cả</option>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label>Mức rủi ro</label><select className="select" value={f.risk_level} onChange={(e) => set('risk_level', e.target.value)}><option value="">Tất cả</option>{opt(RISK_LABEL)}</select></div>
        <div className="field"><label>Độ tươi</label><select className="select" value={f.freshness} onChange={(e) => set('freshness', e.target.value)}><option value="">Tất cả</option>{opt(FRESH_LABEL)}</select></div>
        <div className="field"><label>Thẻ</label><select className="select" value={f.tag} onChange={(e) => set('tag', e.target.value)}><option value="">Tất cả</option>{tags.map((t) => <option key={t.id} value={t.id}>#{t.name}</option>)}</select></div>
        <div className="field"><label>Sắp xếp</label><select className="select" value={f.sort} onChange={(e) => set('sort', e.target.value)}><option value="updated">Mới cập nhật</option><option value="title">Tiêu đề A→Z</option><option value="next_review">Hạn rà soát</option></select></div>
        <div className="flex gap-2">
          <label className="check text-sm" title="Chỉ mục đã được kiểm duyệt xác nhận là nguồn chính thống"><input type="checkbox" checked={f.is_official === 'true'} onChange={(e) => set('is_official', e.target.checked ? 'true' : '')} />Chính thống</label>
          <label className="check text-sm"><input type="checkbox" checked={f.owner_id === String(user.id)} onChange={(e) => set('owner_id', e.target.checked ? String(user.id) : '')} />Của tôi</label>
          {dirty && <button className="btn ghost sm" onClick={() => { setSp({}); setPage(1) }}><FilterX size={14} />Xóa lọc</button>}
        </div>
      </div>

      <ErrorBox error={error} onRetry={reload} />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Tiêu đề</th><th>Mảng</th><th>Chủ sở hữu</th><th>Trạng thái</th><th>Hạn rà soát</th><th>Cập nhật</th></tr></thead>
          <tbody>
            {loading && !data && <tr><td colSpan={6}><Loading /></td></tr>}
            {data && data.items.length === 0 && <tr><td colSpan={6}><Empty text="Không có mục nào khớp bộ lọc" /></td></tr>}
            {data?.items.map((it) => (
              <tr key={it.id} className="clickable" onClick={() => nav(`/items/${it.id}`)}>
                <td className="max-w-[480px]"><div className="font-bold truncate">{it.title}</div>
                  {it.summary && <div className="text-muted text-xs line-clamp-1">{it.summary}</div>}<Tags tags={it.tags} /></td>
                <td>{it.space?.name}</td><td>{it.owner?.name}</td><td><div className="flex gap-1.5 flex-wrap"><ItemBadges it={it} /><OfficialPill id={it.id} /></div></td>
                <td>{dt(it.next_review_date, false)}</td><td className="whitespace-nowrap">{dt(it.updated_at)}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
    </div>
  )
}
