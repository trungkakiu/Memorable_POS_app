import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { create } from 'zustand'
import {
  AlertTriangle, BadgeCheck, BookOpenCheck, ChevronDown, ClipboardCopy, Eye, FileText, GitCompare, Loader2, Paperclip, Pencil, Plus, RefreshCw, ScanText, ShieldAlert, ShieldCheck, Sparkles, Trash2, X,
} from 'lucide-react'
import { ApiError, get, post, put } from '../lib/api'
import { can } from '../lib/permissions'
import { dt, INGEST_LABEL, INGEST_METHOD, INGEST_TONE, POLICY_LABEL, TEXT_REVIEW_LABEL, TEXT_REVIEW_TONE, TIER_FLAG, TIER_LABEL, TIER_PLAIN, TIER_TONE } from '../lib/format'
import type { AgentMemoryUse, AskFileInfo, Attachment, CompareResult, IngestInfo, ItemRow, KPassage, SourcePolicy } from '../lib/types'
import { useAuth } from '../store/auth'
import { toast } from '../store/ui'
import { Md, plainWords } from './shared'
import { Field, Modal, Pill, Seg } from './ui'
import { LimitedList } from './ShowMore'

const errMsg = (e: unknown) => (e instanceof ApiError ? e.full : String(e))

// ---------------------------------------------------------------- Danh sách mục là nguồn chính thống
interface OfficialStore { ids: Set<number>; loaded: boolean; load: () => Promise<void>; set: (id: number, on: boolean) => void }
export const useOfficial = create<OfficialStore>((set, getS) => ({
  ids: new Set(), loaded: false,
  load: async () => {
    if (getS().loaded) return
    set({ loaded: true })
    try {
      const ids = new Set<number>()
      for (let p = 1; p <= 5; p++) {
        const r = await get<{ items: { id: number }[]; pages: number }>('/items', { is_official: true, limit: 100, page: p })
        r.items.forEach((i) => ids.add(i.id)); if (p >= r.pages) break
      }
      set({ ids })
    } catch { set({ loaded: false }) }
  },
  set: (id, on) => set((s) => { const n = new Set(s.ids); if (on) n.add(id); else n.delete(id); return { ids: n } }),
}))
export function useIsOfficial(id?: number) {
  const ids = useOfficial((s) => s.ids)
  useEffect(() => { void useOfficial.getState().load() }, [])
  return id != null && ids.has(id)
}

export const OfficialPill = ({ id }: { id: number }) => (useIsOfficial(id) ? <Pill sm tone="ok"><ShieldCheck size={11} />Chính thống</Pill> : null)

// ---------------------------------------------------------------- Chọn chính sách nguồn
export function PolicySelect({ value, onChange, plain, auto = true }: { value: string; onChange: (v: never) => void; plain?: boolean; auto?: boolean }) {
  const opts: [string, string, string][] = plain
    ? [['auto', 'Tự động', 'Theo cài đặt của công ty'], ['reviewed', 'Nguồn đã kiểm duyệt', 'Bỏ qua tài liệu chưa ai kiểm tra'], ['official', 'Chỉ nguồn chính thống', 'Chỉ dùng tài liệu chính thống']]
    : [...(auto ? [['auto', 'Mặc định hệ thống', 'Theo cài đặt ai_source_policy_default']] : []), ['all', POLICY_LABEL.all, 'Dùng cả nguồn chưa kiểm duyệt (ưu tiên hạng cao)'], ['reviewed', POLICY_LABEL.reviewed, 'Chỉ nguồn chính thống hoặc đã kiểm duyệt'], ['official', POLICY_LABEL.official, 'Chỉ nguồn chính thống']] as [string, string, string][]
  return (
    <select className="select !h-9 !text-[13px]" value={value} onChange={(e) => onChange(e.target.value as never)} aria-label="Nguồn được dùng" title={opts.find((o) => o[0] === value)?.[2]}>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>)
}

// ---------------------------------------------------------------- Làm nổi từ khóa
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function Highlight({ text, q }: { text: string; q?: string }) {
  const tokens = useMemo(() => (q || '').split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2), [q])
  if (!tokens.length) return <>{text}</>
  const re = new RegExp(`(${tokens.map(esc).join('|')})`, 'gi')
  return <>{text.split(re).map((part, i) => (i % 2 === 1 ? <mark key={i} className="bg-yellow-200 text-ink rounded-[3px] px-0.5">{part}</mark> : <span key={i}>{part}</span>))}</>
}

// ---------------------------------------------------------------- Một đoạn trích có nguồn gốc rõ ràng
export function PassageCard({ p, q, plain, scores, onOpen }: { p: KPassage; q?: string; plain?: boolean; scores?: boolean; onOpen: (id: number) => void }) {
  const s = p.source
  const where = [s.kind === 'attachment' ? (s.filename || 'Tệp đính kèm') : 'Nội dung bài', s.page_start ? (s.page_end && s.page_end !== s.page_start ? `trang ${s.page_start}–${s.page_end}` : `trang ${s.page_start}`) : '', s.heading_path ? `mục “${s.heading_path}”` : ''].filter(Boolean).join(' · ')
  return (
    <div className="border border-line rounded-lg bg-white p-4 flex flex-col gap-2.5">
      <div className="flex items-start gap-2 flex-wrap">
        <button className="font-bold text-left text-brand-800 bg-transparent border-0 p-0 cursor-pointer hover:underline flex-1 min-w-0 leading-snug" onClick={() => onOpen(p.item_id)}>{p.item_title}</button>
        <Pill sm tone={TIER_TONE[p.tier] || 'gray'}>{(plain ? TIER_PLAIN : TIER_LABEL)[p.tier] || p.tier}</Pill>
      </div>
      <div className="leading-relaxed border-l-4 border-brand-300 pl-3 text-ink-2"><Highlight text={p.text} q={q} /></div>
      <div className="text-xs text-muted flex gap-x-3 gap-y-1 flex-wrap items-center">
        <span className="flex items-center gap-1.5">{s.kind === 'attachment' ? <Paperclip size={12} /> : <FileText size={12} />}{where}</span>
        {p.flags?.includes('ai_text_unverified') && <Pill sm tone="warn">Chữ do AI đọc, chưa ai kiểm chứng</Pill>}
        {scores && <span className="font-mono">điểm {p.score?.toFixed(3)}{p.vector_score != null && ` · nghĩa ${p.vector_score.toFixed(2)}`}{p.lexical_score != null && ` · từ khóa ${p.lexical_score.toFixed(1)}`}{p.rerank != null && ` · chấm lại ${p.rerank}`}</span>}
      </div>
    </div>)
}

// ---------------------------------------------------------------- Mâu thuẫn giữa các tài liệu
interface Conf { topic?: string; detail?: string; item_ids?: number[]; resolution?: string; positions?: { item_id: number; statement: string }[]; values?: unknown; [k: string]: unknown }
export function ConflictList({ conflicts, plain, onOpen, docLabel }: { conflicts?: unknown[]; plain?: boolean; onOpen?: (id: number) => void; docLabel?: (id: number) => string }) {
  const lbl = docLabel || ((id: number) => (plain ? `bài #${id}` : `tài liệu #${id}`))
  if (!conflicts || conflicts.length === 0) return null
  return (
    <LimitedList items={conflicts} first={3} noun="mâu thuẫn" className="flex flex-col gap-2.5" render={(raw, i) => {
        const c: Conf = typeof raw === 'string' ? { topic: raw } : (raw as Conf)
        const ids = (c.item_ids || (c.positions || []).map((x) => x.item_id) || []) as number[]
        return (
          <div key={i} className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-red-900 flex gap-2.5 text-[0.93em] leading-relaxed">
            <ShieldAlert size={18} className="shrink-0 mt-0.5" />
            <div className="min-w-0">
              <b className="block">{plain ? 'Các tài liệu đang nói khác nhau' : 'Phát hiện mâu thuẫn'}{c.topic ? `: ${c.topic}` : ''}</b>
              {c.detail && <div>{c.detail}</div>}
              {c.positions && c.positions.length > 0 && <ul className="m-0 mt-1 pl-5">{c.positions.map((p, j) => <li key={j}><b>{lbl(p.item_id)}</b>: {p.statement}</li>)}</ul>}
              {!c.detail && !c.positions && c.values != null && <div className="font-mono text-xs mt-1">{typeof c.values === 'string' ? c.values : JSON.stringify(c.values)}</div>}
              {c.resolution && <div className="mt-1.5 text-green-900 bg-green-50 border border-green-200 rounded-md px-2.5 py-1.5"><b>Nên tin:</b> {c.resolution}</div>}
              {onOpen && ids.length > 0 && <div className="flex gap-1.5 flex-wrap mt-2">{ids.map((id) => <button key={id} className="cat-chip !py-0.5 !px-2 !text-[11px]" onClick={() => onOpen(id)}>Mở {lbl(id)}</button>)}</div>}
            </div>
          </div>)
      }} />)
}

// ---------------------------------------------------------------- Markdown của một tệp (xem / sửa)
interface AttMd { id: number; filename: string; item_id: number; markdown: string; body_markdown: string; chars: number; text_source?: string; text_review?: string; ingest_method?: string }
export function MarkdownModal({ att, canEdit, onClose, onSaved }: { att: Pick<Attachment, 'id' | 'filename'>; canEdit?: boolean; onClose: () => void; onSaved?: () => void }) {
  const [d, setD] = useState<AttMd | null>(null)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<'read' | 'raw' | 'edit'>('read')
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [masked, setMasked] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { get<AttMd>(`/attachments/${att.id}/markdown`).then((r) => { setD(r); setText(r.body_markdown) }).catch((e) => setErr(e instanceof ApiError && e.status === 404 ? 'Tệp chưa được đọc xong, hoặc bạn không có quyền xem.' : errMsg(e))) }, [att.id])
  async function save() {
    setBusy(true)
    try { const r = await put<{ warnings?: string[] }>(`/attachments/${att.id}/markdown`, { markdown: text, note: note.trim() || undefined, confirm_masked: masked || undefined }); toast.ok('Đã lưu — chữ cần người kiểm duyệt khác kiểm chứng lại'); if (r?.warnings?.length) toast.warn(r.warnings.join(' · ')); onSaved?.(); onClose() }
    catch (e) { toast.error((e instanceof ApiError && e.status === 409 ? 'Tệp đang được xử lý, thử lại sau. ' : e instanceof ApiError && e.status === 422 ? 'Nội dung rỗng hoặc chứa bí mật. ' : '') + errMsg(e)) } finally { setBusy(false) }
  }
  const tabs = [{ value: 'read', label: 'Đọc' }, { value: 'raw', label: 'Mã Markdown' }, ...(canEdit ? [{ value: 'edit', label: 'Sửa chữ' }] : [])] as { value: 'read' | 'raw' | 'edit'; label: string }[]
  return (
    <Modal title={`Nội dung chữ: ${att.filename}`} size="xl" onClose={onClose}
      footer={mode === 'edit' ? <><button className="btn outline" onClick={() => setMode('read')}>Hủy sửa</button><button className="btn" disabled={busy || !text.trim()} onClick={save}>Lưu bản sửa</button></> : <button className="btn" onClick={onClose}>Đóng</button>}>
      {err ? <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 p-4">{err}</div> : !d ? <div className="empty"><Loader2 className="animate-spin" /></div> : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap items-center">
            <Pill sm tone={TEXT_REVIEW_TONE[d.text_review || 'not_needed']}>{TEXT_REVIEW_LABEL[d.text_review || 'not_needed']}</Pill>
            {d.ingest_method && <Pill sm tone="soft">{INGEST_METHOD[d.ingest_method] || d.ingest_method}</Pill>}
            <Pill sm tone="gray">{d.chars.toLocaleString('vi-VN')} ký tự</Pill>
            <div className="ml-auto flex gap-2"><Seg sm value={mode} onChange={setMode} options={tabs} />
              <button className="btn outline sm" onClick={() => { void navigator.clipboard.writeText(d.markdown); toast.ok('Đã sao chép Markdown') }}><ClipboardCopy size={13} />Sao chép</button></div>
          </div>
          {d.text_source === 'ai' && d.text_review !== 'verified' && <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 text-sm flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />Chữ này do AI đọc từ ảnh/PDF và chưa có người kiểm duyệt đối chiếu với tệp gốc. Chỗ AI chưa chắc được đánh dấu <code>[?…]</code>.</div>}
          {mode === 'read' && <div className="border border-line rounded-lg p-5 bg-white max-h-[58vh] overflow-auto"><Md>{d.markdown}</Md></div>}
          {mode === 'raw' && <pre className="m-0 text-[12.5px] whitespace-pre-wrap font-mono bg-[#1f1b2e] text-[#eae6f7] rounded-lg p-4 max-h-[58vh] overflow-auto">{d.markdown}</pre>}
          {mode === 'edit' && (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-xs text-muted">Sửa chữ AI đọc sai (số, tên, ô bảng…). Sau khi lưu, chữ về trạng thái <b>chưa kiểm chứng</b> và cần một người kiểm duyệt khác xác nhận lại. Bản sửa tay không bị ghi đè khi hệ thống đọc lại (trừ khi dùng “đọc lại từ tệp gốc”).</p>
              <textarea className="textarea font-mono text-[13px]" rows={16} value={text} maxLength={900000} onChange={(e) => setText(e.target.value)} />
              <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end"><Field label="Ghi chú sửa (tùy chọn)"><input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Đã sửa số tiền ở trang 2" /></Field>
                <label className="check text-sm pb-2"><input type="checkbox" checked={masked} onChange={(e) => setMasked(e.target.checked)} />Đã che thông tin nhạy cảm</label></div>
            </div>)}
        </div>)}
    </Modal>)
}

// ---------------------------------------------------------------- Kiểm chứng chữ AI đọc
export function ReviewTextModal({ att, onClose, onDone }: { att: Pick<Attachment, 'id' | 'filename'>; onClose: () => void; onDone?: () => void }) {
  const [decision, setDecision] = useState<'verify' | 'reject'>('verify')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true)
    try { const r = await post<{ tier_label: string }>(`/attachments/${att.id}/review-text`, { decision, note: note.trim() || undefined }); toast.ok(decision === 'verify' ? `Đã kiểm chứng — nguồn hiện là: ${r.tier_label}` : 'Đã từ chối — AI sẽ không dùng tệp này nữa'); onDone?.(); onClose() }
    catch (e) { const er = e as ApiError; toast.error(er.status === 403 ? 'Chủ sở hữu hoặc người đã sửa chữ không tự kiểm chứng được. ' + er.message : er.status === 409 ? 'Tệp này do hệ thống tự đọc hoặc chưa có chữ nên không cần kiểm chứng.' : errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Kiểm chứng chữ: ${att.filename}`} size="md" onClose={onClose} footer={<><button className="btn outline" onClick={onClose}>Hủy</button><button className={clsx('btn', decision === 'reject' && 'danger')} disabled={busy} onClick={go}>{decision === 'verify' ? 'Xác nhận chữ đúng' : 'Từ chối chữ này'}</button></>}>
      <div className="flex flex-col gap-4 text-sm leading-relaxed">
        <p className="m-0">Hãy mở tệp gốc và đối chiếu với chữ AI đã đọc (nút “Nội dung chữ”). Bạn phải <b>khác chủ sở hữu</b> mục và <b>khác người đã sửa chữ</b>.</p>
        <Seg value={decision} onChange={setDecision} options={[{ value: 'verify', label: 'Chữ đã đúng' }, { value: 'reject', label: 'Chữ sai' }]} />
        <div className={clsx('rounded-lg px-3 py-2.5 border', decision === 'verify' ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900')}>{decision === 'verify' ? 'Nguồn được lên hạng theo mục (ví dụ mục chính thống thì tệp này cũng là nguồn chính thống).' : 'AI sẽ không dùng tệp này nữa. Chủ sở hữu được thông báo.'}</div>
        <Field label="Ghi chú (tùy chọn)"><textarea className="textarea" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>)
}

// ---------------------------------------------------------------- "Hệ thống đã hiểu gì về tệp này"
export function IngestModal({ att, onClose, onChanged }: { att: Pick<Attachment, 'id' | 'filename'>; onClose: () => void; onChanged?: () => void }) {
  const role = useAuth((s) => s.user?.role)
  const [d, setD] = useState<IngestInfo | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [force, setForce] = useState(false)
  const [sub, setSub] = useState<'md' | 'edit' | 'review' | null>(null)
  const load = useCallback(() => get<IngestInfo>(`/attachments/${att.id}/ingest`).then(setD).catch((e) => setErr(errMsg(e))), [att.id])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (d && (d.ingest_status === 'pending' || d.ingest_status === 'processing')) { const t = setTimeout(load, 4000); return () => clearTimeout(t) } }, [d, load])
  async function reingest() {
    setBusy(true)
    try { await post(`/attachments/${att.id}/ingest`, { force: force || undefined }); toast.ok('Đã xếp hàng đọc lại ở nền'); await load(); onChanged?.() }
    catch (e) { toast.error(e instanceof ApiError && e.status === 409 ? 'Tệp đang được xử lý hoặc bộ xử lý nền không chạy. ' + e.message : errMsg(e)) } finally { setBusy(false) }
  }
  const ins = d?.insights
  const Chips = ({ items }: { items: ReactNode[] }) => <div className="flex gap-1.5 flex-wrap">{items}</div>
  return (
    <Modal title={`Hệ thống đã đọc & ghi nhớ: ${att.filename}`} size="lg" onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>
      {err ? <div className="text-red-700">{err}</div> : !d ? <div className="empty"><Loader2 className="animate-spin" /></div> : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 flex-wrap items-center">
            <Pill tone={TIER_TONE[d.tier]}>{TIER_LABEL[d.tier] || d.tier}</Pill>
            <Pill tone={INGEST_TONE[d.ingest_status]}>{d.ingest_status === 'processing' && <Loader2 size={12} className="animate-spin" />}{INGEST_LABEL[d.ingest_status] || d.ingest_status}</Pill>
            <Pill tone={TEXT_REVIEW_TONE[d.text_review]}>{TEXT_REVIEW_LABEL[d.text_review] || d.text_review}</Pill>
            {d.ingest_method && <Pill sm tone="soft">{INGEST_METHOD[d.ingest_method] || d.ingest_method}</Pill>}
            {d.page_count != null && <Pill sm tone="gray">{d.page_count} trang</Pill>}{d.language && <Pill sm tone="gray">{d.language.toUpperCase()}</Pill>}{d.doc_type && <Pill sm tone="gray">{d.doc_type}</Pill>}
          </div>
          {d.ingest_error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">Lỗi khi đọc: {d.ingest_error}</div>}
          {d.tier_flags?.length > 0 && <div className="flex gap-1.5 flex-wrap">{d.tier_flags.map((f) => <Pill key={f} sm tone="warn">{TIER_FLAG[f] || f}</Pill>)}</div>}
          <div className="grid grid-cols-3 gap-3"><div className="kv"><span className="k">Đoạn đã chia</span><span className="v">{d.chunks}</span></div><div className="kv"><span className="k">Đoạn có vector</span><span className="v">{d.embedded_chunks}/{d.chunks}</span></div><div className="kv"><span className="k">Đoạn bị chặn (bí mật)</span><span className="v">{d.blocked_chunks}</span></div></div>
          {d.summary && <div className="rounded-lg border border-line-soft bg-brand-50 p-3"><div className="text-[11px] font-bold uppercase text-muted mb-1">Tóm tắt</div>{d.summary}</div>}
          {ins?.key_facts && ins.key_facts.length > 0 && <div><div className="text-[11px] font-bold uppercase text-muted mb-1">Dữ kiện chính</div><ul className="m-0 pl-5 leading-relaxed"><LimitedList items={ins.key_facts} first={8} noun="dữ kiện" className="contents" render={(f, i) => <li key={i}>{f}</li>} /></ul></div>}
          {ins?.entities && ins.entities.length > 0 && <div><div className="text-[11px] font-bold uppercase text-muted mb-1">Thực thể</div><div className="flex gap-1.5 flex-wrap items-center"><LimitedList items={ins.entities} first={12} noun="thực thể" className="contents" render={(e, i) => <Pill key={i} sm tone="soft">{e.value}<span className="opacity-60 font-normal normal-case ml-1">{e.type}</span></Pill>} /></div></div>}
          {ins?.suggested_tags && ins.suggested_tags.length > 0 && <div><div className="text-[11px] font-bold uppercase text-muted mb-1">Thẻ gợi ý</div><Chips items={ins.suggested_tags.map((t) => <Pill key={t.id} sm tone="ok">#{t.name}</Pill>)} /></div>}
          {ins?.questions && ins.questions.length > 0 && <div><div className="text-[11px] font-bold uppercase text-muted mb-1">Tài liệu này trả lời được</div><ul className="m-0 pl-5 leading-relaxed"><LimitedList items={ins.questions} first={6} noun="câu hỏi" className="contents" render={(q, i) => <li key={i}>{q}</li>} /></ul></div>}
          {ins?.uncertain && ins.uncertain.length > 0 && <div className="rounded-lg bg-amber-50 border border-amber-200 p-3"><div className="font-bold text-amber-900 mb-1 flex items-center gap-1.5"><AlertTriangle size={15} />Chỗ AI chưa chắc — cần đối chiếu với tệp gốc</div><ul className="m-0 pl-5 text-sm">{ins.uncertain.map((u, i) => <li key={i}>{u.page ? `Trang ${u.page}: ` : ''}<code>{u.text}</code></li>)}</ul></div>}
          {ins?.conflicts && ins.conflicts.length > 0 && <div><div className="text-[11px] font-bold uppercase text-muted mb-1">Mâu thuẫn với tài liệu khác</div><ConflictList conflicts={ins.conflicts} /></div>}
          {ins?.conflicts_checked_at && <div className="text-xs text-muted">Đã đối chiếu với {ins.conflicts_checked ?? 0} tài liệu lúc {dt(ins.conflicts_checked_at)}.</div>}
          {ins?.quality_notes && ins.quality_notes.length > 0 && <div className="text-xs text-muted">Ghi chú chất lượng: {ins.quality_notes.join(' · ')}</div>}
          {d.review?.reviewed_at && <div className="text-xs text-muted">Kiểm chứng lúc {dt(d.review.reviewed_at)}{d.review.note ? ` — “${d.review.note}”` : ''}.</div>}
          <div className="flex gap-2 flex-wrap items-center border-t border-line-soft pt-3">
            <button className="btn outline sm" onClick={() => setSub('md')}><BookOpenCheck size={13} />Xem nội dung chữ</button>
            {can(role, 'write') && <button className="btn outline sm" onClick={() => setSub('edit')}><Pencil size={13} />Sửa chữ</button>}
            {can(role, 'moderate') && d.text_review === 'unreviewed' && <button className="btn sm" onClick={() => setSub('review')}><BadgeCheck size={13} />Kiểm chứng chữ</button>}
            {can(role, 'write') && <><button className="btn outline sm" disabled={busy || d.ingest_status === 'processing'} onClick={reingest}><RefreshCw size={13} />Đọc lại</button>
              <label className="check text-xs"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />Từ tệp gốc (bỏ bản sửa tay)</label></>}
          </div>
        </div>)}
      {sub === 'md' && <MarkdownModal att={att} onClose={() => setSub(null)} />}
      {sub === 'edit' && <MarkdownModal att={att} canEdit onClose={() => setSub(null)} onSaved={() => { void load(); onChanged?.() }} />}
      {sub === 'review' && <ReviewTextModal att={att} onClose={() => setSub(null)} onDone={() => { void load(); onChanged?.() }} />}
    </Modal>)
}

// ---------------------------------------------------------------- So sánh 2–5 tài liệu
const SKIP_VI: [RegExp, string][] = [
  [/not found|not available/i, 'không tìm thấy hoặc bạn không được xem'], [/only approved|non-restricted/i, 'bài chưa được duyệt hoặc thuộc loại hạn chế'],
  [/secret/i, 'bài có thông tin bí mật nên không gửi cho AI'],
]
const skipReason = (r?: string) => (r ? SKIP_VI.find(([re]) => re.test(r))?.[1] || r : 'không đủ điều kiện')

export function ComparePanel({ initial = [], onOpen, plain }: { initial?: { id: number; title: string }[]; onOpen: (id: number) => void; plain?: boolean }) {
  const [docs, setDocs] = useState<{ id: number; title: string }[]>(initial)
  const [q, setQ] = useState('')
  const [sugg, setSugg] = useState<ItemRow[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<CompareResult | null>(null)
  const [err, setErr] = useState('')
  const title = (id: number) => docs.find((d) => d.id === id)?.title || res?.documents.find((d) => d.id === id)?.title || `Tài liệu #${id}`
  // Người đọc: gọi các bài là Bài A, Bài B… (tên bài có thể trùng nhau); quản trị: giữ mã #ID
  const letter = (id: number) => { const i = (res?.documents || docs).findIndex((d) => d.id === id); return i >= 0 ? String.fromCharCode(65 + i) : '' }
  const docLabel = (id: number) => (plain ? (letter(id) ? `Bài ${letter(id)}` : `bài #${id}`) : `#${id}`)
  const fmt = (s?: string | null) => {
    if (!s) return s || ''
    const out = s.replace(/\[(?:doc:)?(\d+)\]|\b(?:tài liệu|mục|item)\s*#(\d+)/gi, (_m, a: string, b: string) => docLabel(Number(a || b)))
    return plain ? plainWords(out.replace(/\bapproved\b/gi, 'đã duyệt').replace(/\bOCR\b/g, 'đọc chữ từ ảnh')) : out
  }
  const view = useMemo(() => {
    if (!res) return null
    const map = (v: unknown): unknown => (typeof v === 'string' ? fmt(v) : Array.isArray(v) ? v.map(map) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, k === 'title' || k.endsWith('_id') || k === 'id' || k === 'item_ids' ? x : map(x)])) : v)
    return { ...res, summary: fmt(res.summary), recommendation: fmt(res.recommendation), gaps: res.gaps.map((g) => fmt(g)), conflicts: map(res.conflicts) as CompareResult['conflicts'], common_points: map(res.common_points) as CompareResult['common_points'], differences: map(res.differences) as CompareResult['differences'] }
  }, [res, plain]) // eslint-disable-line
  useEffect(() => {
    const t = q.trim(); if (t.length < 2) { setSugg([]); return }
    const h = setTimeout(() => { get<{ results: ItemRow[] }>('/search', { q: t, limit: 6 }).then((r) => setSugg((r.results || []).filter((x) => !docs.some((d) => d.id === x.id)))).catch(() => setSugg([])) }, 260)
    return () => clearTimeout(h)
  }, [q, docs])
  const add = (d: { id: number; title: string }) => { if (docs.length >= 5) return toast.warn('Chỉ so sánh tối đa 5 tài liệu'); setDocs((x) => [...x, d]); setQ(''); setSugg([]); setRes(null) }
  async function run() {
    setBusy(true); setErr(''); setRes(null)
    try { setRes(await post<CompareResult>('/knowledge/compare', { item_ids: docs.map((d) => d.id), question: question.trim() || undefined })) }
    catch (e) {
      const er = e as ApiError
      setErr(er.status === 422 ? `Chưa đủ 2 tài liệu hợp lệ để so sánh (chỉ so sánh bài đã duyệt, không hạn chế, bạn được xem và không chứa bí mật). ${(er.errors as { skipped?: { reason?: string }[] } | undefined)?.skipped ? '' : ''}${er.message}` : er.status === 429 ? 'Đã hết hạn mức AI.' : er.status === 503 ? 'AI chưa bật hoặc tính năng so sánh đang bị tắt.' : errMsg(e))
    } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="border border-line rounded-lg bg-white p-4 flex flex-col gap-3">
        <div className="font-bold">{plain ? 'Chọn các bài muốn so sánh (từ 2 đến 5 bài)' : 'Tài liệu cần đối chiếu (2–5)'}</div>
        <div className="flex gap-2 flex-wrap">
          {docs.map((d) => <span key={d.id} className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-md pl-3 pr-1.5 py-1.5 text-sm font-semibold max-w-full"><span className="truncate max-w-[320px]">{d.title}</span>
            <button className="border-0 bg-transparent cursor-pointer text-muted hover:text-red-600 p-0.5" aria-label="Bỏ" onClick={() => { setDocs((x) => x.filter((y) => y.id !== d.id)); setRes(null) }}><X size={15} /></button></span>)}
          {docs.length === 0 && <span className="text-muted text-sm">Chưa chọn bài nào — gõ tên bài vào ô bên dưới để thêm.</span>}
        </div>
        <div className="relative">
          <input className="input !h-11" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ tên bài để thêm vào so sánh…" disabled={docs.length >= 5} />
          {sugg.length > 0 && <div className="absolute left-0 right-0 top-12 z-20 bg-white border border-line rounded-lg shadow-lg overflow-hidden">{sugg.map((s) => <button key={s.id} className="flex items-center gap-2 w-full text-left px-3 py-2.5 border-0 border-b border-line-soft bg-white hover:bg-brand-50 cursor-pointer" onClick={() => add({ id: s.id, title: s.title })}><Plus size={15} className="text-brand-600" /><span className="font-semibold truncate">{s.title}</span></button>)}</div>}
        </div>
        <Field label={plain ? 'Bạn muốn so sánh điều gì? (không bắt buộc)' : 'Vấn đề cần đối chiếu (tùy chọn)'}><input className="input !h-11" maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ví dụ: Hạn mức chi một lần là bao nhiêu?" /></Field>
        <div><button className={plain ? 'rd-btn lg' : 'btn'} disabled={busy || docs.length < 2} onClick={() => void run()}>{busy ? <Loader2 size={18} className="animate-spin" /> : <GitCompare size={18} />}So sánh {docs.length >= 2 ? `${docs.length} tài liệu` : '(chọn ít nhất 2)'}</button></div>
      </div>
      {err && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 flex gap-2.5"><AlertTriangle size={18} className="shrink-0 mt-0.5" />{err}</div>}
      {res && view && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 flex-wrap">{res.documents.map((d) => <button key={d.id} className="inline-flex items-center gap-2 border border-line rounded-md bg-white px-3 py-2 text-sm cursor-pointer hover:bg-brand-50" onClick={() => onOpen(d.id)}><span className="inline-grid place-items-center min-w-[26px] h-[22px] px-1.5 rounded-md bg-brand-600 text-white text-xs font-black">{plain ? letter(d.id) : `#${d.id}`}</span><span className="font-bold max-w-[260px] truncate">{d.title}</span><Pill sm tone={TIER_TONE[d.tier]}>{(plain ? TIER_PLAIN : TIER_LABEL)[d.tier] || d.tier}</Pill>{d.effective_date && <span className="text-xs text-muted">hiệu lực {dt(d.effective_date, false)}</span>}</button>)}</div>
          {res.skipped?.length > 0 && <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 text-sm">{plain ? 'Không so sánh được' : 'Bỏ qua'} {res.skipped.length} {plain ? 'bài' : 'tài liệu'}: {res.skipped.map((s) => `${plain ? title(Number(s.id ?? s.item_id)) : '#' + (s.id ?? s.item_id)} (${skipReason(s.reason || s.message)})`).join('; ')}</div>}
          <div className="rounded-lg border border-brand-300 bg-brand-50 p-4"><div className="text-[11px] font-bold uppercase text-muted mb-1">Tóm lại</div><div className="leading-relaxed">{view.summary}</div></div>
          {res.conflicts.length > 0 && <div><h3 className="m-0 mb-2 text-[15px] font-extrabold flex items-center gap-2"><ShieldAlert size={18} className="text-red-600" />{plain ? 'Chỗ các tài liệu nói khác nhau' : 'Mâu thuẫn'} ({res.conflicts.length})</h3><ConflictList conflicts={view.conflicts} plain={plain} onOpen={onOpen} docLabel={docLabel} /></div>}
          {view.common_points.length > 0 && <div><h3 className="m-0 mb-2 text-[15px] font-extrabold flex items-center gap-2"><ShieldCheck size={18} className="text-green-600" />Điểm chung</h3>
            <div className="flex flex-col gap-2">{view.common_points.map((c, i) => <div key={i} className="border border-line rounded-lg bg-white px-3.5 py-2.5 flex gap-2 items-start"><span className="flex-1">{c.point}</span><span className="text-xs text-muted shrink-0">{c.item_ids.map((id) => docLabel(id)).join(', ')}</span></div>)}</div></div>}
          {view.differences.length > 0 && <div><h3 className="m-0 mb-2 text-[15px] font-extrabold flex items-center gap-2"><Eye size={18} className="text-brand-600" />Điểm khác nhau</h3>
            <div className="flex flex-col gap-3">{view.differences.map((d, i) => (
              <div key={i} className="border border-line rounded-lg bg-white overflow-hidden"><div className="px-3.5 py-2 bg-brand-50 font-bold border-b border-line-soft">{d.topic}</div>
                <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(d.positions.length, 3)}, minmax(0, 1fr))` }}>{d.positions.map((p, j) => <div key={j} className="px-3.5 py-3 border-r border-line-soft last:border-r-0 text-sm"><div className="text-xs font-bold text-brand-700 mb-1">{plain ? `${docLabel(p.item_id)} · ` : ''}{title(p.item_id)}</div>{p.statement}</div>)}</div></div>))}</div></div>}
          {view.gaps.length > 0 && <div><h3 className="m-0 mb-2 text-[15px] font-extrabold">Chỗ còn thiếu</h3><ul className="m-0 pl-5 leading-relaxed">{view.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>}
          {res.recommendation && <div className="rounded-lg border border-green-200 bg-green-50 text-green-900 p-4 flex gap-2.5"><Sparkles size={18} className="shrink-0 mt-0.5" /><div><b className="block mb-0.5">{plain ? 'Nên làm gì' : 'Khuyến nghị'}</b>{view.recommendation}</div></div>}
          <div className="text-xs text-muted">{plain ? 'Đây chỉ là công cụ hỗ trợ đọc — việc quan trọng hãy mở bài gốc để đối chiếu.' : <>{res.note ? 'Đây chỉ là công cụ hỗ trợ đọc — hãy đối chiếu điểm quan trọng với bản gốc. ' : ''}{res.model} {res.cost_usd != null && `· $${res.cost_usd}`}</>}</div>
        </div>)}
    </div>)
}

export { ChevronDown, ScanText, Trash2 }

// ---------------------------------------------------------------- Kết quả "hỏi bằng tệp": tệp đã đọc, chỗ lệch so với tài liệu, bài liên quan
const METHOD_PLAIN: Record<string, string> = { ai_ocr: 'AI đọc ảnh/PDF', ai_ocr_proofread: 'AI đọc 2 lượt', parsed: 'Đọc trực tiếp', text: 'Văn bản' }
export function FileAskBlock({ info, plain, onOpen }: { info: AskFileInfo; plain?: boolean; onOpen?: (id: number) => void }) {
  return (
    <div className="flex flex-col gap-2.5 mt-3 text-[0.92em]">
      {info.uploaded.length > 0 && (
        <details className="rounded-lg border border-line bg-white px-3 py-2">
          <summary className="cursor-pointer font-bold text-brand-700 flex items-center gap-1.5"><FileText size={14} />{plain ? 'Trợ lý đã đọc' : 'Tệp đã đọc'} {info.uploaded.length} tệp{info.need ? ` · hiểu là bạn cần: ${info.need.slice(0, 90)}${info.need.length > 90 ? '…' : ''}` : ''}</summary>
          <div className="flex flex-col gap-2 mt-2">
            {info.uploaded.map((u, i) => (
              <div key={i} className="border-t border-line-soft pt-2 first:border-0 first:pt-0">
                <div className="font-bold break-all">{u.filename}</div>
                <div className="text-xs text-muted">{[METHOD_PLAIN[u.method || ''] || u.method, u.pages ? `${u.pages} trang` : '', u.chars ? `${u.chars.toLocaleString('vi-VN')} ký tự` : ''].filter(Boolean).join(' · ')}</div>
                {u.summary && <div className="mt-1 leading-relaxed">{u.summary}</div>}
                {!!u.uncertain && <div className="text-xs text-amber-700 font-semibold mt-1">Có {u.uncertain} chỗ AI đọc chưa chắc — nên đối chiếu với tệp gốc.</div>}
              </div>))}
            {info.key_facts && info.key_facts.length > 0 && <div className="text-xs text-muted">Thông tin chính trong tệp: {info.key_facts.slice(0, 12).join(' · ')}{info.key_facts.length > 12 ? ` · và ${info.key_facts.length - 12} thông tin khác` : ''}</div>}
          </div>
        </details>)}
      {info.discrepancies.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-amber-950">
          <div className="font-bold flex items-center gap-1.5 mb-1.5"><AlertTriangle size={16} />{plain ? 'Tệp của bạn khác với tài liệu của công ty' : `Tệp lệch so với tài liệu (${info.discrepancies.length})`}</div>
          <LimitedList items={info.discrepancies} first={5} noun="chỗ lệch" maxHeight="360px" className="flex flex-col gap-1.5" render={(d, i) => (
            <div key={i} className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-t border-amber-200 pt-1.5 first:border-0 first:pt-0">
              <div className="md:col-span-2 font-semibold">{d.topic}</div>
              <div><span className="text-xs text-amber-800">Tệp của bạn ghi:</span> {d.uploaded_says}</div>
              <div><span className="text-xs text-green-800">Tài liệu ghi:</span> <b>{d.source_says}</b>{d.item_id && onOpen ? <button className="ml-1.5 text-brand-700 underline bg-transparent border-0 p-0 cursor-pointer text-xs" onClick={() => onOpen(d.item_id!)}>{plain ? 'xem bài gốc' : `mở #${d.item_id}`}</button> : null}</div>
            </div>)} />
        </div>)}
      {info.related.length > 0 && onOpen && (
        <div className="flex gap-1.5 flex-wrap items-center"><span className="text-xs text-muted font-semibold">{plain ? 'Có thể bạn cần xem:' : 'Liên quan:'}</span>
          <LimitedList items={info.related} first={6} noun="bài" className="contents" render={(r) => <button key={r.id} className="cat-chip !py-1 !px-2.5 !text-[12px] max-w-full truncate" title={r.title} onClick={() => onOpen(r.id)}>{r.title}{r.tier ? ` · ${(plain ? TIER_PLAIN : TIER_LABEL)[r.tier] || r.tier}` : ''}</button>} /></div>)}
      {info.skipped.length > 0 && <div className="text-xs text-red-700">Bỏ qua: {info.skipped.slice(0, 5).map((s) => `${s.filename || 'tệp'} (${s.reason || s.message || 'không đọc được'})`).join('; ')}{info.skipped.length > 5 ? ` và ${info.skipped.length - 5} tệp khác` : ''}</div>}
      <div className="text-[11px] text-muted flex items-center gap-1.5"><ShieldCheck size={12} />Tệp chỉ được đọc để trả lời câu này, không lưu vào kho.</div>
    </div>)
}

// ---------------------------------------------------------------- Trợ lý đã nhớ gì cho lượt trả lời này
export function MemoryUsed({ m, plain }: { m?: AgentMemoryUse; plain?: boolean }) {
  if (!m || !m.enabled || (!m.recalled.length && !m.earlier_conversations.length)) return null
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-brand-700 font-bold">{plain ? 'Trợ lý nhớ ra' : 'Đã dùng trí nhớ'}: {m.recalled.length} điều{m.earlier_conversations.length ? ` · ${m.earlier_conversations.length} cuộc trò chuyện trước` : ''}</summary>
      <ul className="m-0 mt-1.5 pl-5 flex flex-col gap-1 text-ink-2 leading-relaxed">
        {m.recalled.map((r) => <li key={r.id}>{r.text}</li>)}
        {m.earlier_conversations.map((c) => <li key={'c' + c.conversation_id} className="text-muted">Trò chuyện trước: “{c.title}”</li>)}
      </ul>
    </details>)
}
