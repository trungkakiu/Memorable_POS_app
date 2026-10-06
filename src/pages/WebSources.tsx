// Quản trị nguồn Internet: danh mục nguồn chính thống / đáng tin / bị chặn, kiểm tra một đường dẫn, và câu trả lời Internet hệ thống đã học.
import { FormEvent, ReactNode, useMemo, useState } from 'react'
import clsx from 'clsx'
import { BadgeCheck, EyeOff, Eye, Loader2, Plus, RotateCcw, Search, ShieldAlert, ShieldCheck, Timer, Trash2, CircleHelp } from 'lucide-react'
import { ApiError, del, get, patch, post, useGet } from '../lib/api'
import { Field, Modal, PageHeader, Pill, Seg } from '../components/ui'
import { Md, Pager } from '../components/shared'
import { SourceCard, VerifyMeter, linkWebCites } from '../components/WebAnswer'
import { confirmDialog, toast } from '../store/ui'
import type { WebCitation, WebVerification } from '../store/chat'

type Tier = 'official' | 'trusted' | 'blocked'
interface Source { id: number; domain: string; name: string; tier: Tier; tier_label: string; category: string; note: string | null; active: boolean; cited_count: number; last_cited_at: string | null; created_at: string }
interface SourceList { rows: Source[]; suffix_rules: { suffix: string; name: string }[]; tiers: Tier[]; categories: string[] }
interface Learned {
  id: number; question: string; topic: string; type_label: string; answer: string; sources: WebCitation[]; verification: WebVerification | null; learned_at: string; expires_at: string
  hits: number; helpful: number; unhelpful: number; status: 'active' | 'hidden'; learned_from: 'auto' | 'feedback'; times_learned: number; scope_used: string | null; expired: boolean
}
interface Classified { host: string; tier: string; tier_label: string; name: string | null; category: string | null; rule: 'registry' | 'suffix' | 'none' }

const TIER_TONE: Record<string, 'ok' | 'soft' | 'bad' | 'gray'> = { official: 'ok', trusted: 'soft', blocked: 'bad', unverified: 'gray' }
const TIER_ICON: Record<string, ReactNode> = { official: <BadgeCheck size={12} />, trusted: <ShieldCheck size={12} />, blocked: <ShieldAlert size={12} />, unverified: <CircleHelp size={12} /> }
const CAT_LABEL: Record<string, string> = {
  government: 'Cơ quan nhà nước', law: 'Pháp luật', tax_finance: 'Thuế, tài chính', statistics: 'Thống kê', health: 'Y tế', education: 'Giáo dục', standards: 'Tiêu chuẩn',
  international: 'Tổ chức quốc tế', tech_docs: 'Tài liệu chính hãng', news: 'Báo chí', reference: 'Tra cứu', community: 'Cộng đồng', other: 'Khác',
}
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString('vi-VN') : '—')

export default function WebSources() {
  const [tab, setTab] = useState<'sources' | 'learned'>('sources')
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Nguồn Internet" subtitle="Danh mục nguồn AI dùng khi tìm trên Internet (chính thống được tìm trước, bị chặn không bao giờ dùng) và các câu trả lời có nguồn tốt hệ thống đã học để gợi ý." />
      <Seg value={tab} onChange={setTab} options={[{ value: 'sources', label: 'Danh mục nguồn' }, { value: 'learned', label: 'Câu trả lời đã học' }]} />
      {tab === 'sources' ? <SourcesTab /> : <LearnedTab />}
    </div>)
}

// ---------------------------------------------------------------- Danh mục nguồn
function SourcesTab() {
  const [tier, setTier] = useState<'' | Tier>('')
  const [q, setQ] = useState('')
  const { data, loading, reload } = useGet<SourceList>('/ai/web/sources', { tier: tier || undefined, q: q.trim() || undefined })
  const [edit, setEdit] = useState<Partial<Source> | null>(null)
  const rows = data?.rows || []
  const counts = useMemo(() => ({ official: rows.filter((r) => r.tier === 'official').length, trusted: rows.filter((r) => r.tier === 'trusted').length, blocked: rows.filter((r) => r.tier === 'blocked').length }), [rows])

  async function toggle(r: Source) { try { await patch(`/ai/web/sources/${r.id}`, { active: !r.active }); void reload() } catch (e) { toast.error(e) } }
  async function remove(r: Source) {
    if (!(await confirmDialog('Xóa nguồn', `Xóa ${r.domain} khỏi danh mục? Muốn chặn hẳn trang này thì nên đổi hạng thành "Bị chặn".`, { danger: true, okText: 'Xóa' }))) return
    try { await del(`/ai/web/sources/${r.id}`); toast.ok('Đã xóa'); void reload() } catch (e) { toast.error(e) }
  }
  async function restore() { try { const r = await post<{ added: number }>('/ai/web/sources/restore-defaults'); toast.ok(r.added ? `Đã thêm lại ${r.added} nguồn mặc định` : 'Danh mục đã đủ nguồn mặc định'); void reload() } catch (e) { toast.error(e) } }

  return (
    <div className="grid xl:grid-cols-[1fr_340px] gap-4 items-start">
      <div className="card !p-4 flex flex-col gap-3 min-w-0">
        <div className="flex gap-2 flex-wrap items-center">
          <Seg sm value={tier} onChange={setTier} options={[{ value: '', label: 'Tất cả' }, { value: 'official', label: 'Chính thống' }, { value: 'trusted', label: 'Đáng tin' }, { value: 'blocked', label: 'Bị chặn' }]} />
          <div className="relative flex-1 min-w-[180px]"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-9" placeholder="Tìm tên miền hoặc tên…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button className="btn" onClick={() => setEdit({ tier: 'official', category: 'government', active: true })}><Plus size={15} />Thêm nguồn</button>
          <button className="btn outline" onClick={() => void restore()} title="Thêm lại các nguồn mặc định còn thiếu"><RotateCcw size={15} />Khôi phục mặc định</button>
        </div>
        {!tier && !q && <div className="text-xs text-muted">{counts.official} chính thống · {counts.trusted} đáng tin · {counts.blocked} bị chặn. Bộ lọc tìm kiếm dùng tối đa 100 nguồn chính thống, ưu tiên nguồn được trích dẫn nhiều.</div>}
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Tên miền</th><th>Tên</th><th>Hạng</th><th>Nhóm</th><th className="num">Được trích</th><th>Lần cuối</th><th /></tr></thead>
          <tbody>
            {loading && !rows.length && <tr><td colSpan={7} className="center"><Loader2 className="animate-spin inline" size={16} /></td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className={clsx(!r.active && 'opacity-50')}>
                <td className="font-mono text-[12.5px]">{r.domain}{!r.active && <Pill sm tone="gray">tắt</Pill>}</td>
                <td>{r.name}{r.note && <div className="text-[11.5px] text-muted">{r.note}</div>}</td>
                <td><Pill sm tone={TIER_TONE[r.tier]}>{TIER_ICON[r.tier]}{r.tier_label}</Pill></td>
                <td className="text-[12.5px]">{CAT_LABEL[r.category] || r.category}</td>
                <td className="num">{r.cited_count}</td>
                <td className="text-[12.5px] text-muted">{d(r.last_cited_at)}</td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn ghost sm" onClick={() => setEdit(r)}>Sửa</button>
                  <button className="btn ghost sm icon" title={r.active ? 'Tạm tắt' : 'Bật lại'} onClick={() => void toggle(r)}>{r.active ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  <button className="btn ghost sm icon" title="Xóa" onClick={() => void remove(r)}><Trash2 size={14} /></button>
                </td>
              </tr>))}
          </tbody></table></div>
      </div>
      <div className="flex flex-col gap-4">
        <ClassifyCard />
        {data?.suffix_rules && (
          <div className="card !p-4 flex flex-col gap-2 text-[13px]">
            <b>Tự coi là chính thống theo đuôi tên miền</b>
            <div className="text-muted text-xs">Trang thuộc các đuôi dưới đây được xếp “Chính thống” dù chưa có trong danh mục.</div>
            <div className="flex flex-wrap gap-1.5">{data.suffix_rules.map((s) => <span key={s.suffix} className="pill sm soft" title={s.name}>.{s.suffix}</span>)}</div>
          </div>)}
      </div>
      {edit && <SourceModal src={edit} categories={data?.categories || Object.keys(CAT_LABEL)} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void reload() }} />}
    </div>)
}

function SourceModal({ src, categories, onClose, onSaved }: { src: Partial<Source>; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ domain: src.domain || '', name: src.name || '', tier: (src.tier || 'official') as Tier, category: src.category || 'other', note: src.note || '', active: src.active !== false })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const body = { ...f, note: f.note.trim() || undefined }
      if (src.id) await patch(`/ai/web/sources/${src.id}`, body); else await post('/ai/web/sources', body)
      toast.ok(src.id ? 'Đã lưu' : 'Đã thêm nguồn'); onSaved()
    } catch (er) { setErr((er as ApiError).full ?? String(er)) } finally { setBusy(false) }
  }
  return (
    <Modal title={src.id ? `Sửa nguồn: ${src.domain}` : 'Thêm nguồn'} size="md" onClose={onClose}
      footer={<><button className="btn outline" onClick={onClose}>Hủy</button><button className="btn" form="src-form" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}Lưu</button></>}>
      <form id="src-form" className="flex flex-col gap-3" onSubmit={(e) => void save(e)}>
        <Field label="Tên miền" hint="Ví dụ mpi.gov.vn. Khớp cả tên miền con. Dán cả đường dẫn cũng được."><input className="input font-mono" required value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} /></Field>
        <Field label="Tên hiển thị"><input className="input" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hạng"><select className="select" value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value as Tier })}><option value="official">Chính thống (tìm trước)</option><option value="trusted">Đáng tin (nên đối chiếu)</option><option value="blocked">Bị chặn (không dùng)</option></select></Field>
          <Field label="Nhóm"><select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{categories.map((c) => <option key={c} value={c}>{CAT_LABEL[c] || c}</option>)}</select></Field>
        </div>
        <Field label="Ghi chú" hint="Lý do xếp hạng hoặc chặn (không bắt buộc)"><input className="input" maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Đang dùng</label>
        {err && <div className="text-sm text-red-700">{err}</div>}
      </form>
    </Modal>)
}

function ClassifyCard() {
  const [url, setUrl] = useState('')
  const [r, setR] = useState<Classified | null>(null)
  const [busy, setBusy] = useState(false)
  async function run(e: FormEvent) {
    e.preventDefault(); if (!url.trim()) return
    setBusy(true)
    try { setR(await get<Classified>('/ai/web/sources/classify', { url: url.trim() })) } catch (er) { toast.error(er) } finally { setBusy(false) }
  }
  return (
    <form className="card !p-4 flex flex-col gap-2.5" onSubmit={(e) => void run(e)}>
      <b className="text-[13.5px]">Kiểm tra một đường dẫn</b>
      <div className="flex gap-2"><input className="input" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} /><button className="btn" disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}</button></div>
      {r && (
        <div className="text-[13px] flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap"><span className="font-mono">{r.host}</span><Pill sm tone={TIER_TONE[r.tier] || 'gray'}>{TIER_ICON[r.tier]}{r.tier_label}</Pill></div>
          <div className="text-muted text-xs">{r.rule === 'registry' ? `Có trong danh mục: ${r.name}` : r.rule === 'suffix' ? `Theo đuôi tên miền: ${r.name}` : 'Chưa có trong danh mục, không thuộc đuôi chính thống.'}</div>
        </div>)}
    </form>)
}

// ---------------------------------------------------------------- Câu trả lời đã học
function LearnedTab() {
  const [status, setStatus] = useState<'active' | 'hidden' | 'expired' | 'all'>('active')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const { data, loading, reload } = useGet<{ rows: Learned[]; total: number; pages: number; page: number }>('/ai/web/learned', { status, q: q.trim() || undefined, page })
  const [open, setOpen] = useState<Learned | null>(null)

  async function setRow(r: Learned, body: Record<string, unknown>, msg: string) { try { await patch(`/ai/web/learned/${r.id}`, body); toast.ok(msg); void reload() } catch (e) { toast.error(e) } }
  async function remove(r: Learned) {
    if (!(await confirmDialog('Xóa câu trả lời đã học', `Xóa hẳn “${r.question}”?`, { danger: true, okText: 'Xóa' }))) return
    try { await del(`/ai/web/learned/${r.id}`); toast.ok('Đã xóa'); setOpen(null); void reload() } catch (e) { toast.error(e) }
  }
  return (
    <div className="card !p-4 flex flex-col gap-3">
      <div className="text-[12.5px] text-muted leading-relaxed">Hệ thống tự học câu trả lời Internet đạt mức tin cậy <b>Cao</b> và có nguồn chính thống, hoặc khi người dùng bấm <b>Hữu ích</b>. Câu hỏi được AI khái quát (bỏ thông tin riêng) trước khi lưu; câu hỏi gốc không được lưu. Mỗi câu trả lời có hạn dùng, bị đánh giá “chưa đúng” nhiều lần thì tự ẩn.</div>
      <div className="flex gap-2 flex-wrap items-center">
        <Seg sm value={status} onChange={(v) => { setStatus(v); setPage(1) }} options={[{ value: 'active', label: 'Đang gợi ý' }, { value: 'hidden', label: 'Đã ẩn' }, { value: 'expired', label: 'Hết hạn' }, { value: 'all', label: 'Tất cả' }]} />
        <div className="relative flex-1 min-w-[200px]"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-9" placeholder="Tìm câu hỏi, chủ đề…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} /></div>
      </div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Câu hỏi đã khái quát</th><th>Chủ đề</th><th>Xác minh</th><th className="num">Nguồn</th><th className="num">Dùng</th><th className="num">👍/👎</th><th>Học từ</th><th>Hạn dùng</th><th /></tr></thead>
        <tbody>
          {loading && !data && <tr><td colSpan={9} className="center"><Loader2 className="animate-spin inline" size={16} /></td></tr>}
          {data?.rows.length === 0 && <tr><td colSpan={9} className="center text-muted">Chưa có câu trả lời nào</td></tr>}
          {data?.rows.map((r) => (
            <tr key={r.id} className={clsx((r.status === 'hidden' || r.expired) && 'opacity-60')}>
              <td><button className="text-left font-semibold text-brand-700 bg-transparent border-0 p-0 cursor-pointer hover:underline" onClick={() => setOpen(r)}>{r.question}</button></td>
              <td className="text-[12.5px]">{r.topic}<div className="text-[11px] text-muted">{r.type_label}</div></td>
              <td>{r.verification ? <Pill sm tone={r.verification.level === 'high' ? 'ok' : r.verification.level === 'medium' ? 'warn' : 'bad'}>{r.verification.score}/100</Pill> : '—'}</td>
              <td className="num">{r.sources.length}<span className="text-muted text-[11px]"> ({r.sources.filter((s) => s.tier === 'official').length} CT)</span></td>
              <td className="num">{r.hits}</td>
              <td className="num">{r.helpful}/{r.unhelpful}</td>
              <td className="text-[12px]">{r.learned_from === 'feedback' ? 'Người dùng' : 'Tự động'}{r.times_learned > 1 ? ` ×${r.times_learned}` : ''}</td>
              <td className="text-[12px]">{r.expired ? <span className="text-red-700">Hết {d(r.expires_at)}</span> : d(r.expires_at)}{r.status === 'hidden' && <div><Pill sm tone="gray">ẩn</Pill></div>}</td>
              <td className="whitespace-nowrap text-right">
                <button className="btn ghost sm icon" title="Gia hạn 30 ngày" onClick={() => void setRow(r, { extend_days: 30, status: 'active' }, 'Đã gia hạn 30 ngày')}><Timer size={14} /></button>
                <button className="btn ghost sm icon" title={r.status === 'hidden' ? 'Hiện lại' : 'Ẩn'} onClick={() => void setRow(r, { status: r.status === 'hidden' ? 'active' : 'hidden' }, r.status === 'hidden' ? 'Đã hiện lại' : 'Đã ẩn')}>{r.status === 'hidden' ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                <button className="btn ghost sm icon" title="Xóa" onClick={() => void remove(r)}><Trash2 size={14} /></button>
              </td>
            </tr>))}
        </tbody></table></div>
      {data && data.pages > 1 && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      {open && (
        <Modal title={open.question} size="lg" onClose={() => setOpen(null)} footer={<button className="btn" onClick={() => setOpen(null)}>Đóng</button>}>
          <div className="flex flex-col gap-3">
            <div className="flex gap-1.5 flex-wrap"><Pill sm tone="soft">{open.topic}</Pill><Pill sm tone="gray">{open.type_label}</Pill><Pill sm tone="gray">học {d(open.learned_at)} · hết hạn {d(open.expires_at)}</Pill>{open.scope_used && <Pill sm tone="gray">phạm vi {open.scope_used}</Pill>}</div>
            <div className="border border-line-soft rounded-lg p-3"><Md>{linkWebCites(open.answer, open.sources)}</Md></div>
            {open.verification && <VerifyMeter v={open.verification} />}
            <div className="flex flex-col gap-2">{open.sources.map((c) => <SourceCard key={c.n} c={c} />)}</div>
          </div>
        </Modal>)}
    </div>)
}
