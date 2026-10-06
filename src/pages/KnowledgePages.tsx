import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BadgeCheck, BookOpenCheck, DatabaseZap, FileSearch, Loader2, RefreshCw, ScanSearch, Search } from 'lucide-react'
import { ApiError, get, useGet } from '../lib/api'
import { can } from '../lib/permissions'
import { INGEST_LABEL, INGEST_METHOD, INGEST_TONE, TEXT_REVIEW_LABEL, TEXT_REVIEW_TONE, TIER_LABEL, TIER_TONE, bytes } from '../lib/format'
import type { ItemDetail, KSearchResult, KSource, KStats } from '../lib/types'
import { ComparePanel, IngestModal, MarkdownModal, PassageCard, PolicySelect, ReviewTextModal } from '../components/Knowledge'
import { Empty, Field, PageHeader, Pill, Stat } from '../components/ui'
import { ErrorBox, Loading, Pager } from '../components/shared'
import { useAuth } from '../store/auth'
import { toast } from '../store/ui'

// ---------------------------------------------------------------- Thanh số liệu đọc & ghi nhớ (dùng ở Nguồn tri thức và Tổng quan)
export function KnowledgeStats({ compact }: { compact?: boolean }) {
  const { data, error } = useGet<KStats>('/knowledge/stats')
  if (error) return error.status === 403 ? null : <ErrorBox error={error} />
  if (!data) return null
  const ing = data.attachments_by_ingest_status || {}; const rev = data.attachments_by_text_review || {}
  const pending = (ing.pending || 0) + (ing.processing || 0)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <Stat label="Bài đã ghi nhớ" value={data.items_indexed} icon={<DatabaseZap size={18} />} hint={`${data.official_items} bài chính thống`} />
        <Stat label="Đoạn nội dung" value={data.chunks.total} hint={`${data.chunks.embedded} có vector`} />
        <Stat label="Tệp đang chờ đọc" value={pending} hint={data.worker.enabled ? `bộ xử lý nền: ${data.worker.running} chạy · ${data.worker.waiting} chờ` : 'bộ xử lý nền đang tắt'} hintTone={!data.worker.enabled && pending ? 'down' : undefined} />
        <Stat label="Tệp đọc lỗi" value={ing.failed || 0} hintTone={ing.failed ? 'down' : undefined} hint={ing.failed ? 'cần đọc lại' : 'không có lỗi'} />
        <Stat label="Chữ AI chờ kiểm chứng" value={rev.unreviewed || 0} hintTone={rev.unreviewed ? 'down' : undefined} hint={`${rev.verified || 0} đã kiểm chứng`} />
        <Stat label="Đoạn bị chặn (bí mật)" value={data.chunks.blocked_by_secrets} hint={data.chunks.missing_embedding ? `${data.chunks.missing_embedding} thiếu vector` : 'đầy đủ vector'} />
      </div>
      {!compact && <div className="text-xs text-muted">Mô hình vector: <code>{data.embed_model}</code> · chỉ mục: {data.vector_index_size} đoạn{data.chunks.other_embedding_model ? ` · ${data.chunks.other_embedding_model} đoạn dùng mô hình cũ (cần lập lại chỉ mục)` : ''}</div>}
    </div>)
}

// ---------------------------------------------------------------- Nguồn tri thức (sổ tệp, hạng tin cậy, trạng thái đọc)
export function KnowledgeSources() {
  const nav = useNavigate()
  const role = useAuth((s) => s.user?.role)
  const [sp, setSp] = useSearchParams()
  const tier = sp.get('tier') || ''; const ingest = sp.get('ingest_status') || ''; const itemId = sp.get('item_id') || ''
  const [page, setPage] = useState(1)
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); setPage(1) }
  const { data, loading, error, reload } = useGet<{ sources: KSource[]; total: number; pages: number }>('/knowledge/sources', { page, limit: 20, ...(tier ? { tier } : {}), ...(ingest ? { ingest_status: ingest } : {}), ...(itemId ? { item_id: itemId } : {}) })
  const [sub, setSub] = useState<{ kind: 'ingest' | 'md' | 'review'; s: KSource } | null>(null)
  const open = (kind: 'ingest' | 'md' | 'review', s: KSource) => setSub({ kind, s })
  const att = (s: KSource) => ({ id: s.attachment_id, filename: s.filename })
  // tự làm mới khi còn tệp đang đọc
  const pending = data?.sources.some((s) => s.ingest_status === 'pending' || s.ingest_status === 'processing')
  useEffect(() => { if (!pending) return; const t = setInterval(reload, 6000); return () => clearInterval(t) }, [pending, reload])
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Nguồn tri thức" subtitle="Mọi tệp đính kèm mà hệ thống đã đọc và ghi nhớ — kèm hạng tin cậy, trạng thái đọc và chữ do AI đọc đã được kiểm chứng chưa." />
      {can(role, 'report') && <KnowledgeStats />}
      <div className="card !p-4 grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <Field label="Hạng tin cậy"><select className="select" value={tier} onChange={(e) => set('tier', e.target.value)}><option value="">Tất cả</option>{Object.entries(TIER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Trạng thái đọc"><select className="select" value={ingest} onChange={(e) => set('ingest_status', e.target.value)}><option value="">Tất cả</option>{Object.entries(INGEST_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Mã mục"><input className="input" inputMode="numeric" value={itemId} placeholder="Ví dụ 12" onChange={(e) => set('item_id', e.target.value.replace(/\D/g, ''))} /></Field>
        <button className="btn outline" onClick={reload}><RefreshCw size={15} />Làm mới</button>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Tệp</th><th>Thuộc mục</th><th>Hạng tin cậy</th><th>Trạng thái đọc</th><th>Chữ</th><th className="num">Đoạn</th><th /></tr></thead><tbody>
        {loading && !data && <tr><td colSpan={7}><Loading /></td></tr>}
        {data && data.sources.length === 0 && <tr><td colSpan={7}><Empty text="Chưa có tệp nào khớp bộ lọc" icon={<FileSearch size={42} strokeWidth={1.4} />} /></td></tr>}
        {data?.sources.map((s) => (
          <tr key={s.attachment_id}>
            <td className="max-w-[260px]"><div className="font-bold truncate" title={s.filename}>{s.filename}</div><div className="text-xs text-muted">{s.filetype.toUpperCase()} · {bytes(s.filesize)}{s.pages ? ` · ${s.pages} trang` : ''}{s.doc_type ? ` · ${s.doc_type}` : ''}</div></td>
            <td className="max-w-[240px]"><button className="bg-transparent border-0 p-0 text-left font-semibold text-brand-800 cursor-pointer hover:underline truncate block max-w-full" onClick={() => nav(`/items/${s.item.id}`)}>{s.item.title}</button>
              {s.item.is_official && <Pill sm tone="ok">Chính thống</Pill>}</td>
            <td><Pill sm tone={TIER_TONE[s.tier] || 'gray'}>{TIER_LABEL[s.tier] || s.tier}</Pill>{s.tier_flags?.length > 0 && <div className="text-[11px] text-amber-700 mt-1">{s.tier_flags.includes('ai_text_unverified') ? 'chữ AI chưa kiểm chứng' : s.tier_flags.join(', ')}</div>}</td>
            <td><Pill sm tone={INGEST_TONE[s.ingest_status] || 'gray'}>{(s.ingest_status === 'processing' || s.ingest_status === 'pending') && <Loader2 size={11} className="animate-spin" />}{INGEST_LABEL[s.ingest_status] || s.ingest_status}</Pill>{s.ingest_method && <div className="text-[11px] text-muted mt-1">{INGEST_METHOD[s.ingest_method] || s.ingest_method}</div>}
              {s.ingest_error && <div className="text-[11px] text-red-700 mt-1 max-w-[200px] truncate" title={s.ingest_error}>{s.ingest_error}</div>}</td>
            <td><Pill sm tone={TEXT_REVIEW_TONE[s.text_review] || 'gray'}>{TEXT_REVIEW_LABEL[s.text_review] || s.text_review}</Pill></td>
            <td className="num">{s.chunks}</td>
            <td className="num"><div className="flex gap-1 justify-end">
              <button className="btn outline sm" title="Hệ thống hiểu gì về tệp" onClick={() => open('ingest', s)}><ScanSearch size={13} />Chi tiết</button>
              <button className="btn outline sm" title="Xem chữ đã đọc" onClick={() => open('md', s)}><BookOpenCheck size={13} /></button>
              {can(role, 'moderate') && s.text_review === 'unreviewed' && <button className="btn sm" title="Kiểm chứng chữ AI đọc" onClick={() => open('review', s)}><BadgeCheck size={13} />Kiểm chứng</button>}
            </div></td>
          </tr>))}
      </tbody></table></div>
      {data && <Pager page={page} pages={data.pages} total={data.total} onPage={setPage} />}
      {sub?.kind === 'ingest' && <IngestModal att={att(sub.s)} onClose={() => setSub(null)} onChanged={reload} />}
      {sub?.kind === 'md' && <MarkdownModal att={att(sub.s)} canEdit={can(role, 'write')} onClose={() => setSub(null)} onSaved={reload} />}
      {sub?.kind === 'review' && <ReviewTextModal att={att(sub.s)} onClose={() => setSub(null)} onDone={reload} />}
    </div>)
}

// ---------------------------------------------------------------- Tìm đoạn nội dung (kiểm tra RAG: điểm, vector, từ khóa, chính sách)
export function KnowledgeSearch() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [policy, setPolicy] = useState<'auto' | 'all' | 'reviewed' | 'official'>('auto')
  const [expand, setExpand] = useState(true)
  const [rerank, setRerank] = useState(false)
  const [limit, setLimit] = useState(8)
  const [depth, setDepth] = useState<'normal' | 'deep'>('normal')
  const [tagId, setTagId] = useState('')
  const [useTags, setUseTags] = useState(true)
  const allTags = useAuth((s) => s.tags)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<KSearchResult | null>(null)
  const [err, setErr] = useState('')
  async function run() {
    const t = q.trim(); if (t.length < 2) return toast.warn('Nhập ít nhất 2 ký tự')
    setBusy(true); setErr('')
    try { setRes(await get<KSearchResult>('/knowledge/search', { q: t, limit, expand, rerank, depth, tags: useTags, ...(tagId ? { tag_id: tagId } : {}), ...(policy !== 'auto' ? { source_policy: policy } : {}) })) }
    catch (e) { setRes(null); const er = e as ApiError; setErr(er.status === 429 ? 'Đã hết hạn mức AI (mở rộng câu hỏi/chấm lại dùng AI).' : er.full) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Tìm đoạn nội dung" subtitle="Tìm trong nội dung bên trong bài và tệp đính kèm (kết hợp ngữ nghĩa và từ khóa). Dùng để kiểm tra AI sẽ lấy những đoạn nào làm bằng chứng." />
      <form className="card !p-4 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void run() }}>
        <div className="flex gap-3 flex-wrap items-end">
          <Field label="Câu hỏi hoặc từ khóa" className="flex-1 min-w-[280px]"><input className="input !h-11" value={q} maxLength={300} placeholder="Ví dụ: hạn mức chi tối đa một lần" onChange={(e) => setQ(e.target.value)} /></Field>
          <button className="btn !h-11" disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}Tìm đoạn</button>
        </div>
        <div className="flex gap-x-5 gap-y-2 flex-wrap items-center text-sm">
          <span className="flex items-center gap-2 font-semibold">Nguồn dùng<span className="w-[210px]"><PolicySelect value={policy} onChange={setPolicy} /></span></span>
          <label className="check"><input type="checkbox" checked={expand} onChange={(e) => setExpand(e.target.checked)} />Mở rộng câu hỏi (AI)</label>
          <label className="check"><input type="checkbox" checked={rerank} onChange={(e) => setRerank(e.target.checked)} />AI chấm lại thứ tự (tốn thêm)</label>
          <label className="flex items-center gap-2">Độ sâu<select className="select !h-9 !w-36" value={depth} onChange={(e) => setDepth(e.target.value as 'normal' | 'deep')}><option value="normal">Thường</option><option value="deep">Sâu (qua thẻ liên quan)</option></select></label>
          <label className="flex items-center gap-2">Trong thẻ<select className="select !h-9 !w-44" value={tagId} onChange={(e) => setTagId(e.target.value)}><option value="">Mọi thẻ</option>{allTags.map((x) => <option key={x.id} value={x.id}>{x.kind === 'category' ? '▣ ' : '#'}{x.name}</option>)}</select></label>
          <label className="check"><input type="checkbox" checked={useTags} onChange={(e) => setUseTags(e.target.checked)} />Mở rộng theo thẻ</label>
          <label className="flex items-center gap-2">Số đoạn<select className="select !h-9 !w-20" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>{[5, 8, 12, 20].map((n) => <option key={n}>{n}</option>)}</select></label>
        </div>
      </form>
      {err && <ErrorBox error={err} />}
      {res && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 flex-wrap items-center text-sm">
            <Pill sm tone="soft">Chế độ: {res.stats.mode}</Pill><Pill sm tone="gray">{res.stats.candidates} ứng viên</Pill>
            {res.stats.expanded && <Pill sm tone="ok">đã mở rộng</Pill>}{res.stats.reranked && <Pill sm tone="ok">đã chấm lại</Pill>}
            {res.stats.excluded_by_policy > 0 && <Pill sm tone="warn">{res.stats.excluded_by_policy} đoạn bị loại do chính sách nguồn ({POLICY_NAME[res.source_policy] || res.source_policy})</Pill>}
          </div>
          {res.expanded_queries && res.expanded_queries.length > 0 && <div className="text-xs text-muted">Cách diễn đạt khác đã thử: {res.expanded_queries.map((x) => `“${x}”`).join(' · ')}</div>}
          {res.documents.length > 0 && <div className="flex gap-2 flex-wrap">{res.documents.map((d) => <button key={d.item_id} className="inline-flex items-center gap-2 border border-line rounded-md bg-white px-3 py-1.5 text-sm cursor-pointer hover:bg-brand-50" onClick={() => nav(`/items/${d.item_id}`)}><b className="max-w-[240px] truncate">{d.title}</b><Pill sm tone={TIER_TONE[d.tier] || 'gray'}>{TIER_LABEL[d.tier] || d.tier}</Pill><span className="text-xs text-muted">{d.passages} đoạn</span></button>)}</div>}
          {res.passages.length === 0 ? <Empty text="Không có đoạn nào khớp" /> : <div className="flex flex-col gap-3">{res.passages.map((p) => <PassageCard key={p.chunk_id} p={p} q={q} scores onOpen={(id) => nav(`/items/${id}`)} />)}</div>}
        </div>)}
    </div>)
}
const POLICY_NAME: Record<string, string> = { all: 'tất cả', reviewed: 'đã kiểm duyệt', official: 'chính thống' }

// ---------------------------------------------------------------- So sánh tài liệu
export function CompareDocs() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [initial, setInitial] = useState<{ id: number; title: string }[] | null>(null)
  useEffect(() => {
    const ids = (sp.get('ids') || '').split(',').map(Number).filter((n) => n > 0).slice(0, 5)
    if (!ids.length) { setInitial([]); return }
    Promise.all(ids.map((id) => get<ItemDetail>(`/items/${id}`).then((d) => ({ id, title: d.title })).catch(() => null))).then((r) => setInitial(r.filter(Boolean) as { id: number; title: string }[]))
  }, [sp])
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="So sánh tài liệu" subtitle="Đối chiếu 2–5 tài liệu đã duyệt: điểm chung, điểm khác, mâu thuẫn và nên tin bản nào. Bản chính thống và mới hơn được ưu tiên." />
      {initial ? <ComparePanel initial={initial} onOpen={(id) => nav(`/items/${id}`)} /> : <Loading />}
    </div>)
}
