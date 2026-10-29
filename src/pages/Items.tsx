import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, RefreshCw, FilterX, Search, Sparkles, X } from 'lucide-react'
import { useGet } from '../lib/api'
import { can } from '../lib/permissions'
import { dt, FRESH_LABEL, RISK_LABEL, STATUS_LABEL, TYPE_LABEL } from '../lib/format'
import type { ItemRow } from '../lib/types'
import { Empty, PageHeader, Seg } from '../components/ui'
import { ErrorBox, ItemBadges, Loading, Pager, Tags } from '../components/shared'
import { OfficialPill } from '../components/Knowledge'
import { useAuth } from '../store/auth'
import { loadView, saveView } from '../lib/viewState'

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
    q: sp.get('q') || '',
  }
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); setPage(1) }
  // Ô tìm: gõ xong 300ms mới lọc, giữ trong URL để quay lại vẫn còn
  const [kw, setKw] = useState(f.q)
  // Nhớ bộ lọc lần trước: mở Kho tri thức không kèm bộ lọc thì khôi phục; mở từ liên kết có bộ lọc riêng thì giữ nguyên
  useEffect(() => {
    if (![...sp.keys()].length) { const saved = loadView<string>('items'); if (saved) { const n = new URLSearchParams(saved); setSp(n, { replace: true }); setKw(n.get('q') || '') } }
  }, []) // eslint-disable-line
  useEffect(() => { saveView('items', sp.toString()) }, [sp])
  useEffect(() => { const t = setTimeout(() => { if (kw.trim() !== f.q) set('q', kw.trim()) }, 300); return () => clearTimeout(t) }, [kw]) // eslint-disable-line
  const { data, loading, error, reload } = useGet<Resp>('/items', { ...f, q: f.q || undefined, page, limit: 20 })
  const dirty = Object.entries(f).some(([k, v]) => v && !(k === 'sort' && v === 'updated'))
  // Các bộ lọc đang bật, mỗi cái có nút bỏ riêng (trạng thái đã có hàng nút bên trên nên không lặp lại)
  const chips = ([
    f.q && { k: 'q', l: `Từ khóa: “${f.q}”` },
    f.type && { k: 'type', l: `Loại: ${TYPE_LABEL[f.type] || f.type}` },
    f.space_id && { k: 'space_id', l: `Mảng: ${spaces.find((s) => String(s.id) === f.space_id)?.name || f.space_id}` },
    f.risk_level && { k: 'risk_level', l: `Rủi ro: ${RISK_LABEL[f.risk_level] || f.risk_level}` },
    f.freshness && { k: 'freshness', l: `Hạn rà soát: ${FRESH_LABEL[f.freshness] || f.freshness}` },
    f.tag && { k: 'tag', l: `Thẻ: #${tags.find((t) => String(t.id) === f.tag)?.name || f.tag}` },
    f.owner_id && { k: 'owner_id', l: f.owner_id === String(user.id) ? 'Của tôi' : `Chủ sở hữu #${f.owner_id}` },
    f.is_official && { k: 'is_official', l: 'Nguồn chính thống' },
  ].filter(Boolean)) as { k: string; l: string }[]
  const statusOpts = [{ value: '', label: 'Tất cả' }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Kho tri thức" subtitle="Tài liệu, bài viết, câu lệnh AI và quy trình xử lý của nhóm"
        actions={<>
          <button className="btn outline" onClick={reload}><RefreshCw size={15} />Tải lại</button>
          {can(user.role, 'write') && <button className="btn outline" onClick={() => nav('/items/new')}><Plus size={16} />Tạo thủ công</button>}
          {can(user.role, 'write') && <button className="btn" onClick={() => nav('/import-knowledge')}><Sparkles size={16} />Nhập tri thức (AI)</button>}
        </>} />
      <div className="card !p-4 flex flex-col gap-3">
      <div className="flex items-center gap-4 flex-wrap">
      <label className="search-box flex-1 min-w-[240px]"><Search size={17} /><input className="input" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Tìm theo tên hoặc tóm tắt…" aria-label="Tìm trong kho tri thức" /></label>
        <div className="flex items-center gap-4 shrink-0 flex-wrap">
          <label className="check text-sm whitespace-nowrap" title="Chỉ mục đã được kiểm duyệt xác nhận là nguồn chính thống"><input type="checkbox" checked={f.is_official === 'true'} onChange={(e) => set('is_official', e.target.checked ? 'true' : '')} />Chính thống</label>
          <label className="check text-sm whitespace-nowrap"><input type="checkbox" checked={f.owner_id === String(user.id)} onChange={(e) => set('owner_id', e.target.checked ? String(user.id) : '')} />Của tôi</label>
          {dirty && <button className="btn ghost sm" onClick={() => { setSp({}); setKw(''); setPage(1) }}><FilterX size={14} />Xóa lọc</button>}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap"><span className="text-xs font-bold uppercase tracking-wide text-muted">Trạng thái</span><Seg sm value={f.status} onChange={(v) => set('status', v)} options={statusOpts} /></div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 items-end">
        <div className="field"><label>Loại</label><select className="select" value={f.type} onChange={(e) => set('type', e.target.value)}><option value="">Tất cả</option>{opt(TYPE_LABEL)}</select></div>
        <div className="field"><label>Mảng</label><select className="select" value={f.space_id} onChange={(e) => set('space_id', e.target.value)}><option value="">Tất cả</option>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label>Mức rủi ro</label><select className="select" value={f.risk_level} onChange={(e) => set('risk_level', e.target.value)}><option value="">Tất cả</option>{opt(RISK_LABEL)}</select></div>
        <div className="field"><label>Hạn rà soát</label><select className="select" value={f.freshness} onChange={(e) => set('freshness', e.target.value)}><option value="">Tất cả</option>{opt(FRESH_LABEL)}</select></div>
        <div className="field"><label>Thẻ</label><select className="select" value={f.tag} onChange={(e) => set('tag', e.target.value)}><option value="">Tất cả</option>{tags.map((t) => <option key={t.id} value={t.id}>#{t.name}</option>)}</select></div>
        <div className="field"><label>Sắp xếp</label><select className="select" value={f.sort} onChange={(e) => set('sort', e.target.value)}><option value="updated">Mới cập nhật</option><option value="title">Tiêu đề A→Z</option><option value="next_review">Hạn rà soát</option></select></div>
      </div>
      {chips.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center text-xs"><span className="text-muted font-semibold">Đang lọc:</span>
          {chips.map((c) => <button key={c.k} className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-800 border border-brand-200 px-2.5 py-1 font-semibold cursor-pointer hover:bg-brand-100" title="Bỏ bộ lọc này" onClick={() => { if (c.k === 'q') setKw(''); set(c.k, '') }}>{c.l}<X size={12} /></button>)}
        </div>)}
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
                  {it.summary && <div className="text-muted text-xs line-clamp-1">{it.summary}</div>}<Tags tags={it.tags} max={4} /></td>
                <td>{it.space?.name}</td><td>{it.owner?.name}</td><td><div className="flex gap-1.5 flex-wrap"><ItemBadges it={it} compact /><OfficialPill id={it.id} /></div></td>
                <td>{dt(it.next_review_date, false)}</td><td className="whitespace-nowrap">{dt(it.updated_at)}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
    </div>
  )
}
