import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Bot, GitMerge, Network, Pencil, Plus, Share2, Trash2, User } from 'lucide-react'
import { ApiError, del, post, put, useGet } from '../lib/api'
import { can } from '../lib/permissions'
import type { Tag, TagGraph, TagKind } from '../lib/types'
import { Empty, Field, Modal, PageHeader, Pill, Seg, Stat } from '../components/ui'
import { ErrorBox, Loading, useBusy } from '../components/shared'
import { useAuth } from '../store/auth'
import { confirmDialog, toast } from '../store/ui'
import { useClientPage } from '../components/ShowMore'
import { Pager } from '../components/shared'

export const TAG_KIND_LABEL: Record<TagKind, string> = { category: 'Nhóm kiến thức', topic: 'Chủ đề' }
const ORIGIN_LABEL: Record<string, string> = { manual: 'Người tạo', ai: 'AI tạo' }

interface TagForm { id?: number; name: string; description: string; kind: TagKind }
interface RelatedTag { id: number; name: string; kind: TagKind; origin?: string; shared_items: number }

// ---------------------------------------------------------------- Thẻ liên quan (cùng xuất hiện)
function RelatedModal({ tag, onClose }: { tag: Tag; onClose: () => void }) {
  const { data, loading, error } = useGet<{ related: RelatedTag[] }>(`/tags/${tag.id}/related`, { limit: 20 })
  const max = Math.max(1, ...(data?.related || []).map((r) => r.shared_items))
  return (
    <Modal title={`Thẻ hay đi cùng #${tag.name}`} size="md" onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : !data?.related.length ? <Empty text="Chưa có thẻ nào cùng xuất hiện" /> : (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs text-muted">Số mục dùng chung cả hai thẻ — dùng để phát hiện liên kết giữa các nhóm kiến thức và thẻ trùng nghĩa cần gộp.</p>
          {data.related.map((r) => (
            <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_120px_40px] items-center gap-3">
              <div className="truncate"><b>#{r.name}</b> <Pill sm tone={r.kind === 'category' ? 'soft' : 'gray'}>{TAG_KIND_LABEL[r.kind] || r.kind}</Pill></div>
              <div className="progress"><i style={{ width: `${(r.shared_items / max) * 100}%` }} /></div>
              <div className="text-right font-mono text-sm">{r.shared_items}</div>
            </div>))}
        </div>)}
    </Modal>)
}

// ---------------------------------------------------------------- Gộp thẻ trùng nghĩa
function MergeModal({ tag, all, onClose, onDone }: { tag: Tag; all: Tag[]; onClose: () => void; onDone: () => void }) {
  const [into, setInto] = useState<number | ''>('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const opts = all.filter((t) => t.id !== tag.id && t.name.toLowerCase().includes(q.toLowerCase())).slice(0, 200)
  const target = all.find((t) => t.id === into)
  async function go() {
    if (!into) return
    setBusy(true)
    try { const r = await post<Record<string, unknown>>(`/tags/${tag.id}/merge`, { into_id: into }); toast.ok(`Đã gộp #${tag.name} vào #${target?.name}${r && typeof r.moved === 'number' ? ` (${r.moved} mục)` : ''}`); onDone(); onClose() }
    catch (e) { toast.error(e instanceof ApiError ? e.full : String(e)) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Gộp thẻ #${tag.name}`} size="md" onClose={onClose}
      footer={<><button className="btn outline" onClick={onClose}>Hủy</button><button className="btn" disabled={busy || !into} onClick={go}><GitMerge size={15} />Gộp vào #{target?.name || '…'}</button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="m-0">Mọi mục đang gắn <b>#{tag.name}</b> sẽ chuyển sang thẻ đích. Tên cũ được giữ làm <b>bí danh</b> nên tìm kiếm và AI vẫn nhận ra. Không hoàn tác được.</p>
        <Field label="Tìm thẻ đích"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="gõ để lọc…" /></Field>
        <select className="select" size={8} value={into} onChange={(e) => setInto(Number(e.target.value))}>
          {opts.map((t) => <option key={t.id} value={t.id}>#{t.name} · {TAG_KIND_LABEL[t.kind || 'topic']} · {t.uses ?? 0} mục{t.origin === 'ai' ? ' · AI tạo' : ''}</option>)}
        </select>
      </div>
    </Modal>)
}

// ---------------------------------------------------------------- Bản đồ liên kết thẻ (đồ thị đồng xuất hiện)
function TagGraphView() {
  const nav = useNavigate()
  const [minShared, setMinShared] = useState(1)
  const { data, loading, error } = useGet<TagGraph>('/knowledge/tag-graph', { min_shared: minShared, limit: 300 })
  const [hover, setHover] = useState<number | null>(null)
  const layout = useMemo(() => {
    if (!data) return null
    const nodes = data.nodes.slice(0, 60)
    const ids = new Set(nodes.map((n) => n.id))
    const cats = nodes.filter((n) => n.kind === 'category'); const tops = nodes.filter((n) => n.kind !== 'category')
    const W = 760, H = 560, cx = W / 2, cy = H / 2
    const pos = new Map<number, { x: number; y: number }>()
    cats.forEach((n, i) => { const a = (i / Math.max(1, cats.length)) * Math.PI * 2 - Math.PI / 2; pos.set(n.id, { x: cx + Math.cos(a) * 120, y: cy + Math.sin(a) * 120 }) })
    tops.forEach((n, i) => { const a = (i / Math.max(1, tops.length)) * Math.PI * 2 - Math.PI / 2; pos.set(n.id, { x: cx + Math.cos(a) * 245, y: cy + Math.sin(a) * 235 }) })
    const edges = data.edges.filter((e) => ids.has(e.from) && ids.has(e.to))
    const maxItems = Math.max(1, ...nodes.map((n) => n.items)); const maxW = Math.max(1, ...edges.map((e) => e.shared_items))
    return { nodes, edges, pos, W, H, maxItems, maxW }
  }, [data])
  const near = (id: number) => !hover || id === hover || layout?.edges.some((e) => (e.from === hover && e.to === id) || (e.to === hover && e.from === id))
  return (
    <div className="flex flex-col gap-3">
      <div className="card !p-3 flex items-center gap-4 flex-wrap text-sm">
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#7a2ee6]" />Nhóm kiến thức (vòng trong)</span>
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#0891b2]" />Chủ đề (vòng ngoài)</span>
        <span className="text-muted">Cạnh = số mục dùng chung · rê chuột để làm nổi liên kết</span>
        <label className="ml-auto flex items-center gap-2">Tối thiểu mục chung<select className="select !h-8 !w-20" value={minShared} onChange={(e) => setMinShared(Number(e.target.value))}>{[1, 2, 3, 5, 10].map((n) => <option key={n}>{n}</option>)}</select></label>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} /> : !layout || !layout.nodes.length ? <Empty text="Chưa đủ dữ liệu để vẽ bản đồ" icon={<Network size={40} strokeWidth={1.4} />} /> : (
        <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
          <div className="card !p-2 overflow-auto"><svg viewBox={`0 0 ${layout.W} ${layout.H}`} className="w-full h-auto" role="img" aria-label="Bản đồ liên kết thẻ">
            {layout.edges.map((e, i) => { const a = layout.pos.get(e.from)!, b = layout.pos.get(e.to)!; const on = !hover || e.from === hover || e.to === hover
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? '#a78bfa' : '#ece7f8'} strokeOpacity={on ? 0.75 : 0.5} strokeWidth={0.8 + (e.shared_items / layout.maxW) * 4} /> })}
            {layout.nodes.map((n) => { const p = layout.pos.get(n.id)!; const r = 5 + Math.sqrt(n.items / layout.maxItems) * 13; const c = n.kind === 'category' ? '#7a2ee6' : '#0891b2'
              return (
                <g key={n.id} opacity={near(n.id) ? 1 : 0.25} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => nav(`/items?tag=${n.id}`)} style={{ cursor: 'pointer' }}>
                  <circle cx={p.x} cy={p.y} r={r} fill={c} fillOpacity={0.85} stroke="#fff" strokeWidth={2} />
                  <text x={p.x} y={p.y + r + 12} textAnchor="middle" fontSize={11} fontWeight={700} fill="#3b4254">{n.name.length > 18 ? n.name.slice(0, 17) + '…' : n.name}</text>
                  <title>{`#${n.name} · ${n.items} mục`}</title>
                </g>) })}
          </svg></div>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3"><Stat label="Nhóm kiến thức" value={data!.categories} /><Stat label="Chủ đề" value={data!.topics} /></div>
            <div className="card !p-3"><div className="text-[11px] font-bold uppercase text-muted mb-2">Cặp thẻ liên kết mạnh nhất</div>
              {[...layout.edges].sort((a, b) => b.shared_items - a.shared_items).slice(0, 10).map((e, i) => { const n = (id: number) => layout.nodes.find((x) => x.id === id)?.name
                return <div key={i} className="flex justify-between gap-2 text-sm py-1 border-b border-line-soft last:border-0"><span className="truncate">#{n(e.from)} ↔ #{n(e.to)}</span><b className="font-mono">{e.shared_items}</b></div> })}
            </div>
          </div>
        </div>)}
    </div>)
}

// ---------------------------------------------------------------- Trang quản lý thẻ
export function Tags() {
  const user = useAuth((s) => s.user)!
  const loadCatalog = useAuth((s) => s.loadCatalog)
  const w = can(user.role, 'moderate')
  const [tab, setTab] = useState<'list' | 'graph'>('list')
  const [kind, setKind] = useState<TagKind | ''>('')
  const [origin, setOrigin] = useState<'' | 'manual' | 'ai'>('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'uses' | 'name'>('uses')
  const { data, loading, error, reload } = useGet<Tag[]>('/tags')
  const { busy, run } = useBusy()
  const [f, setF] = useState<TagForm | null>(null)
  const [rel, setRel] = useState<Tag | null>(null)
  const [merge, setMerge] = useState<Tag | null>(null)
  const all = data || []
  const list = all.filter((t) => (!kind || (t.kind || 'topic') === kind) && (!origin || t.origin === origin) && t.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort === 'uses' ? (b.uses ?? 0) - (a.uses ?? 0) : a.name.localeCompare(b.name, 'vi')))
  const pg = useClientPage(list, 50)
  const stat = { total: all.length, cat: all.filter((t) => t.kind === 'category').length, ai: all.filter((t) => t.origin === 'ai').length, unused: all.filter((t) => !t.uses).length }
  const refresh = () => { reload(); void loadCatalog() }

  async function save() {
    if (!f) return
    const body = { name: f.name.trim(), description: f.description || undefined, kind: f.kind }
    const r = await run(() => (f.id ? put(`/tags/${f.id}`, body) : post('/tags', body)), f.id ? 'Đã lưu thẻ' : 'Đã tạo thẻ')
    if (r) { setF(null); refresh() }
  }
  async function rm(t: Tag) { if (await confirmDialog('Xóa thẻ', `Xóa thẻ “#${t.name}”? Thẻ sẽ bị gỡ khỏi ${t.uses ?? 0} mục đang dùng. Nếu thẻ trùng nghĩa với thẻ khác, nên dùng “Gộp” để giữ bí danh.`, { danger: true, okText: 'Xóa' })) { await run(() => del(`/tags/${t.id}`), 'Đã xóa thẻ'); refresh() } }
  async function confirmAi(t: Tag) { const r = await run(() => put(`/tags/${t.id}`, { kind: t.kind || 'topic' }), `Đã xác nhận thẻ #${t.name}`); if (r) refresh() }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Thẻ và nhóm kiến thức" subtitle="Thẻ phân 2 loại: nhóm kiến thức (rộng, ổn định) và chủ đề (cụ thể). AI tự gắn và có thể tạo thẻ mới — kiểm duyệt viên xác nhận, gộp hoặc xóa."
        actions={<>{w && <button className="btn" onClick={() => setF({ name: '', description: '', kind: 'topic' })}><Plus size={16} />Tạo thẻ</button>}</>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Tổng số thẻ" value={stat.total} /><Stat label="Nhóm kiến thức" value={stat.cat} hint={`${stat.total - stat.cat} chủ đề`} />
        <Stat label="AI tạo, chưa xác nhận" value={stat.ai} hintTone={stat.ai ? 'down' : undefined} hint={stat.ai ? 'cần xem xét' : 'đã xác nhận hết'} /><Stat label="Chưa mục nào dùng" value={stat.unused} />
      </div>
      <Seg value={tab} onChange={setTab} options={[{ value: 'list', label: 'Danh mục thẻ' }, { value: 'graph', label: 'Bản đồ liên kết' }]} />
      {tab === 'graph' ? <TagGraphView /> : (<>
        <div className="card !p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <Field label="Tìm thẻ" className="col-span-2"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="tên thẻ…" /></Field>
          <Field label="Loại"><select className="select" value={kind} onChange={(e) => setKind(e.target.value as TagKind | '')}><option value="">Tất cả</option><option value="category">Nhóm kiến thức</option><option value="topic">Chủ đề</option></select></Field>
          <Field label="Nguồn gốc"><select className="select" value={origin} onChange={(e) => setOrigin(e.target.value as '' | 'manual' | 'ai')}><option value="">Tất cả</option><option value="manual">Người tạo</option><option value="ai">AI tạo</option></select></Field>
          <Field label="Sắp xếp"><select className="select" value={sort} onChange={(e) => setSort(e.target.value as 'uses' | 'name')}><option value="uses">Nhiều mục nhất</option><option value="name">Tên A→Z</option></select></Field>
        </div>
        <ErrorBox error={error} onRetry={reload} />
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Thẻ</th><th>Loại</th><th>Nguồn gốc</th><th className="num">Số mục</th><th>Mô tả</th><th /></tr></thead><tbody>
          {loading && !data && <tr><td colSpan={6}><Loading /></td></tr>}
          {data && list.length === 0 && <tr><td colSpan={6}><Empty text="Không có thẻ khớp bộ lọc" /></td></tr>}
          {pg.rows.map((t) => (
            <tr key={t.id}>
              <td className="font-extrabold text-brand-700 whitespace-nowrap">#{t.name}</td>
              <td><Pill sm tone={t.kind === 'category' ? 'soft' : 'gray'}>{TAG_KIND_LABEL[t.kind || 'topic']}</Pill></td>
              <td><span className={clsx('inline-flex items-center gap-1 text-xs font-semibold', t.origin === 'ai' ? 'text-amber-700' : 'text-muted')}>{t.origin === 'ai' ? <Bot size={13} /> : <User size={13} />}{ORIGIN_LABEL[t.origin || 'manual']}</span></td>
              <td className="num font-mono">{t.uses ?? '—'}</td>
              <td className="text-sm text-muted" title={t.description || ''}><div className="max-w-[320px] truncate">{t.description || '—'}</div></td>
              <td className="num"><div className="flex gap-1 justify-end">
                <button className="btn ghost sm icon" title="Xem mục gắn thẻ" onClick={() => window.location.assign(`#/items?tag=${t.id}`)}><Share2 size={14} /></button>
                <button className="btn ghost sm icon" title="Thẻ hay đi cùng" onClick={() => setRel(t)}><Network size={14} /></button>
                {w && t.origin === 'ai' && <button className="btn outline sm" disabled={busy} title="Xác nhận thẻ do AI tạo" onClick={() => void confirmAi(t)}>Xác nhận</button>}
                {w && <button className="btn ghost sm icon" title="Gộp vào thẻ khác" onClick={() => setMerge(t)}><GitMerge size={14} /></button>}
                {w && <button className="btn ghost sm icon" title="Sửa" onClick={() => setF({ id: t.id, name: t.name, description: t.description || '', kind: t.kind || 'topic' })}><Pencil size={14} /></button>}
                {w && <button className="btn ghost sm icon" title="Xóa" onClick={() => void rm(t)}><Trash2 size={14} /></button>}
              </div></td>
            </tr>))}
        </tbody></table></div>
        <Pager page={pg.page} pages={pg.pages} total={pg.total} onPage={pg.setPage} />
      </>)}
      {f && <Modal title={f.id ? 'Sửa thẻ' : 'Tạo thẻ'} size="sm" onClose={() => setF(null)} footer={<><button className="btn outline" onClick={() => setF(null)}>Hủy</button><button className="btn" disabled={busy || !f.name.trim()} onClick={save}>Lưu</button></>}>
        <div className="grid gap-4">
          <Field label="Tên thẻ *" hint="Ngắn gọn, viết thường. VD: thanh-toan"><input className="input" autoFocus maxLength={50} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Loại"><Seg value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: 'category', label: 'Nhóm kiến thức' }, { value: 'topic', label: 'Chủ đề' }]} /></Field>
          <Field label="Mô tả" hint="Mô tả giúp AI gắn thẻ chính xác hơn"><textarea className="textarea" rows={2} maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        </div></Modal>}
      {rel && <RelatedModal tag={rel} onClose={() => setRel(null)} />}
      {merge && <MergeModal tag={merge} all={all} onClose={() => setMerge(null)} onDone={refresh} />}
    </div>)
}

