import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Eye, FileSearch, Loader2, ScanSearch, ScanText, ShieldCheck, ShieldAlert, Sparkles } from 'lucide-react'
import { ApiError, get, post } from '../lib/api'
import { can } from '../lib/permissions'
import type { Attachment } from '../lib/types'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { forgetPreview } from './FileViewer'
import { Field, Modal, Pill } from './ui'
import { Md } from './shared'
import { IngestModal } from './Knowledge'
import { toast } from '../store/ui'

/** AI có bật tính năng này không? (chưa tải trạng thái thì coi như có, máy chủ sẽ trả 503 nếu tắt) */
export function useAiFeature(name: string) {
  const status = useChat((s) => s.status)
  useEffect(() => { if (!useChat.getState().status) void useChat.getState().loadStatus() }, [])
  return !status || status.features.includes(name)
}

const visionErr = (e: unknown) => {
  const er = e as ApiError
  const m = er.full || String(e)
  switch (er.status) {
    case 415: return `Loại tệp này AI chưa đọc được. ${m}`
    case 422: return `Không thực hiện được: ${m}`
    case 429: return 'Đã hết hạn mức AI (trong ngày hoặc trong tháng).'
    case 503: return 'AI chưa bật hoặc quản trị đã tắt tính năng đọc ảnh/PDF.'
    case 500: return `Tệp trên máy chủ không khớp mã băm (có thể bị hỏng): ${m}`
    case 403: return `Không đủ quyền: ${m}`
    default: return m
  }
}

/** Trạng thái chữ của tệp: để tìm kiếm và AI dùng. */
export function TextBadge({ att }: { att: Attachment }) {
  const has = att.text_extracted ?? att.has_text
  const st = att.ingest_status
  if (st === 'pending' || st === 'processing') return <Pill sm tone="soft"><Loader2 size={11} className="animate-spin" />Đang đọc</Pill>
  if (st === 'failed') return <Pill sm tone="bad">Đọc lỗi</Pill>
  if (has) return <>
    <Pill sm tone="ok">{att.text_source === 'ai' ? 'Chữ do AI đọc' : 'Đã trích chữ'}</Pill>
    {att.text_review === 'unreviewed' && <Pill sm tone="warn">Chờ kiểm chứng</Pill>}
    {att.text_review === 'verified' && <Pill sm tone="ok">Đã kiểm chứng</Pill>}
    {att.text_review === 'rejected' && <Pill sm tone="bad">Chữ bị từ chối</Pill>}
    {att.page_count ? <Pill sm tone="gray">{att.page_count} trang</Pill> : null}
  </>
  if (att.ai_readable) return <Pill sm tone="warn">Chưa có chữ · nhờ AI đọc</Pill>
  if (att.kind === 'archive') return <Pill sm tone="gray">Chỉ lưu trữ</Pill>
  return <Pill sm tone="gray">Không trích chữ</Pill>
}

const PRESETS = ['Mô tả và tóm tắt nội dung tệp', 'Đọc toàn bộ chữ trong tệp', 'Trích các bảng / số liệu chính', 'Giải thích sơ đồ hoặc biểu đồ']

interface Analysis { attachment_id: number; filename: string; item_id: number; kind: string; answer: string; note?: string; model: string; cost_usd: number }
interface Turn { q: string; a?: Analysis; err?: string }

/** Hỏi AI về ảnh / PDF (POST /ai/analyze) — AI nhìn trực tiếp vào tệp, không lưu gì. */
export function AnalyzeModal({ att, onClose, initialQuestion }: { att: Pick<Attachment, 'id' | 'filename'>; onClose: () => void; initialQuestion?: string }) {
  const [q, setQ] = useState(initialQuestion || '')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  async function run(question: string) {
    setBusy(true)
    const body: Record<string, unknown> = { attachment_id: att.id }
    if (question.trim()) body.question = question.trim().slice(0, 500)
    try { const a = await post<Analysis>('/ai/analyze', body); setTurns((t) => [...t, { q: question.trim() || 'Mô tả và tóm tắt tệp', a }]) }
    catch (e) { setTurns((t) => [...t, { q: question.trim() || 'Mô tả và tóm tắt tệp', err: visionErr(e) }]) }
    finally { setBusy(false); setQ('') }
  }
  return (
    <Modal title={`Hỏi AI về tệp: ${att.filename}`} size="lg" onClose={onClose}
      footer={<button className="btn outline" onClick={onClose}>Đóng</button>}>
      <div className="flex flex-col gap-4">
        <div className="text-xs text-muted leading-relaxed rounded-lg bg-brand-50 border border-line-soft px-3 py-2">AI nhìn trực tiếp vào ảnh/PDF (đọc chữ, bảng, biểu đồ, sơ đồ, ảnh chụp màn hình). Câu trả lời <b>không được lưu</b>; muốn lưu chữ để tìm kiếm hãy dùng “AI đọc chữ”. Tệp của mục “Hạn chế” không bao giờ gửi cho AI.</div>
        <div className="flex gap-2 flex-wrap">{PRESETS.map((p) => <button key={p} className="cat-chip" disabled={busy} onClick={() => void run(p)}>{p}</button>)}</div>
        <div className="flex flex-col gap-3 max-h-[46vh] overflow-auto">
          {turns.map((t, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="self-end bg-brand-600 text-white rounded-lg px-3 py-2 text-sm max-w-[85%]">{t.q}</div>
              {t.err ? <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm flex gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" />{t.err}</div>
                : t.a && <div className="rounded-lg border border-line bg-white px-4 py-3"><Md>{t.a.answer}</Md>
                  <div className="text-[11px] text-muted mt-2 pt-2 border-t border-line-soft">{t.a.note} · {t.a.model} · ${t.a.cost_usd}</div></div>}
            </div>))}
          {busy && <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin text-brand-500" />AI đang xem tệp…</div>}
        </div>
        <form className="flex gap-2 items-end" onSubmit={(e) => { e.preventDefault(); void run(q) }}>
          <Field label="Câu hỏi về tệp (bỏ trống = mô tả và tóm tắt)" className="flex-1"><input className="input" maxLength={500} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ví dụ: Tổng số sự cố tháng 9 là bao nhiêu?" /></Field>
          <button className="btn" disabled={busy}><Sparkles size={15} />Hỏi AI</button>
        </form>
      </div>
    </Modal>)
}

interface Extract { id: number; filename: string; text_source: string; chars: number; truncated: boolean; preview: string; warnings: string[]; note?: string; model: string; cost_usd: number }

/** AI đọc chữ trong ảnh/PDF và lưu lại (POST /attachments/{id}/ai-extract) để tìm kiếm và để AI dùng. */
export function ExtractModal({ att, onClose, onDone }: { att: Pick<Attachment, 'id' | 'filename' | 'text_source' | 'text_extracted'>; onClose: () => void; onDone?: () => void }) {
  const [masked, setMasked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<Extract | null>(null)
  const [err, setErr] = useState('')
  async function run() {
    setBusy(true); setErr('')
    try {
      const r = await post<Extract>(`/attachments/${att.id}/ai-extract`, masked ? { confirm_masked: true } : {})
      setRes(r); forgetPreview(att.id); toast.ok('Đã đọc và lưu chữ của tệp'); onDone?.()
    } catch (e) {
      const er = e as ApiError
      setErr(er.status === 409 ? 'Hệ thống đã tự đọc được văn bản của tệp này, không cần nhờ AI.' : er.status === 422 ? `Không lưu được: ${er.full}. Nếu chữ chứa thông tin nhạy cảm, hãy che rồi thử lại.` : visionErr(e))
    } finally { setBusy(false) }
  }
  const again = att.text_source === 'ai'
  return (
    <Modal title={`AI đọc chữ: ${att.filename}`} size="md" onClose={onClose}
      footer={<><button className="btn outline" onClick={onClose}>{res ? 'Đóng' : 'Hủy'}</button>{!res && <button className="btn" disabled={busy} onClick={run}>{busy ? <Loader2 size={15} className="animate-spin" /> : <ScanText size={15} />}{again ? 'Đọc lại' : 'Bắt đầu đọc'}</button>}</>}>
      {!res ? (
        <div className="flex flex-col gap-3 text-sm leading-relaxed">
          <p className="m-0">AI sẽ đọc chữ trong {again ? 'tệp (đọc lại, thay bản cũ)' : 'tệp'} và <b>lưu làm văn bản của tệp</b>, từ đó <b>tìm kiếm</b> và <b>hỏi đáp AI / Agent</b> dùng được. Phần sơ đồ, ảnh chụp được mô tả thêm ở mục “[Mô tả hình ảnh]”.</p>
          <ul className="m-0 pl-5 text-muted">
            <li>Chữ do AI đọc có thể sai — hãy đối chiếu chi tiết quan trọng với tệp gốc.</li>
            <li>Tệp dài có thể chỉ đọc phần đầu. Văn bản đọc ra được quét bí mật; nếu có bí mật sẽ bị chặn và không lưu.</li>
            <li><b>Tốn chi phí AI.</b> Chỉ chủ sở hữu mục (hoặc quản trị) được thực hiện.</li>
          </ul>
          <label className="check"><input type="checkbox" checked={masked} onChange={(e) => setMasked(e.target.checked)} />Chữ trong tệp đã che thông tin nhạy cảm (confirm_masked)</label>
          {err && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-3 py-2 flex gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" />{err}</div>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap"><Pill tone="ok"><CheckCircle2 size={13} />Đã lưu {res.chars.toLocaleString('vi-VN')} ký tự</Pill>{res.truncated && <Pill tone="warn">Chỉ đọc phần đầu</Pill>}<Pill tone="gray">${res.cost_usd}</Pill></div>
          {res.warnings?.length > 0 && <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 text-sm">{res.warnings.join(' · ')}</div>}
          <pre className="m-0 text-[13px] whitespace-pre-wrap font-sans bg-brand-50 border border-line-soft rounded-lg p-3 max-h-[40vh] overflow-auto">{res.preview}</pre>
          <div className="text-xs text-muted">{res.note} · {res.model}</div>
        </div>)}
    </Modal>)
}

interface Verify { id: number; ok: boolean; missing: boolean; algorithm: string; expected_hash: string; actual_hash: string | null; expected_size: number; actual_size: number | null }
export function VerifyModal({ att, onClose }: { att: Pick<Attachment, 'id' | 'filename'>; onClose: () => void }) {
  const [v, setV] = useState<Verify | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { get<Verify>(`/attachments/${att.id}/verify`).then(setV).catch((e) => setErr((e as ApiError).full)) }, [att.id])
  return (
    <Modal title={`Kiểm tra toàn vẹn: ${att.filename}`} size="sm" onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>
      {err ? <div className="text-red-700">{err}</div> : !v ? <div className="empty"><Loader2 className="animate-spin" /></div> : (
        <div className="flex flex-col gap-3">
          <div className={clsx('rounded-lg px-3 py-3 flex items-center gap-3 font-bold', v.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200')}>
            {v.ok ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}{v.ok ? 'Tệp toàn vẹn — mã băm và dung lượng khớp' : v.missing ? 'Tệp bị thiếu trên máy chủ' : 'Tệp bị hỏng hoặc bị sửa'}
          </div>
          {!v.ok && <div className="text-sm text-muted">Cần khôi phục tệp từ bản sao lưu.</div>}
          <div className="grid gap-2 text-xs font-mono bg-brand-50 rounded-lg p-3 border border-line-soft break-all">
            <div><b>{v.algorithm.toUpperCase()} dự kiến:</b> {v.expected_hash}</div><div><b>SHA-256 thực tế:</b> {v.actual_hash ?? '—'}</div>
            <div><b>Dung lượng:</b> {v.expected_size} / {v.actual_size ?? '—'} byte</div></div>
        </div>)}
    </Modal>)
}

/** Nhóm nút AI/kiểm tra cho một tệp đính kèm. */
export function AttachAiActions({ att, onChanged, size = 'sm' }: { att: Attachment; onChanged?: () => void; size?: 'sm' }) {
  const role = useAuth((s) => s.user?.role)
  const hasVision = useAiFeature('vision')
  const hasExtract = useAiFeature('vision_extract')
  const [modal, setModal] = useState<'ask' | 'extract' | 'verify' | 'ingest' | null>(null)
  const canAsk = att.ai_readable && can(role, 'ask') && hasVision
  const canExtract = att.ai_readable && can(role, 'write') && hasExtract && !(att.text_extracted && att.text_source !== 'ai')
  void size
  return (
    <>
      {canAsk && <button className="btn outline sm" title="AI nhìn tệp và trả lời câu hỏi (không lưu)" onClick={() => setModal('ask')}><Eye size={13} />Hỏi AI</button>}
      {canExtract && <button className="btn outline sm" title="AI đọc chữ rồi lưu để tìm kiếm và để AI dùng" onClick={() => setModal('extract')}><ScanText size={13} />{att.text_source === 'ai' ? 'Đọc lại' : 'AI đọc chữ'}</button>}
      {(att.text_extracted ?? att.has_text) || att.ingest_status ? <button className="btn outline sm" title="Hệ thống đã đọc, hiểu và ghi nhớ gì về tệp này" onClick={() => setModal('ingest')}><ScanSearch size={13} />Đã hiểu</button> : null}
      <button className="btn ghost sm icon" title="Kiểm tra toàn vẹn (SHA-256)" aria-label="Kiểm tra toàn vẹn" onClick={() => setModal('verify')}><FileSearch size={14} /></button>
      {modal === 'ask' && <AnalyzeModal att={att} onClose={() => setModal(null)} />}
      {modal === 'extract' && <ExtractModal att={att} onClose={() => setModal(null)} onDone={onChanged} />}
      {modal === 'ingest' && <IngestModal att={att} onClose={() => setModal(null)} onChanged={onChanged} />}
      {modal === 'verify' && <VerifyModal att={att} onClose={() => setModal(null)} />}
    </>)
}
