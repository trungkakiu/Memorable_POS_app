// Điền mẫu tự động: thư viện mẫu Word/Excel/CSV (mẫu hay dùng xếp trước, tìm theo ý), AI điền từ thông tin dán vào và tệp gửi kèm,
// xem lại từng ô (độ chắc chắn, chỗ lấy ra, số tiền bằng chữ tự tính), tải tệp đã điền giữ nguyên định dạng, điền lại như lần trước.
// Dùng chung cho giao diện Người đọc (lời lẽ đơn giản, nút to) và giao diện quản trị (thêm số liệu kỹ thuật).
import { ClipboardEvent as ReactClipboardEvent, DragEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ClipboardPaste, Download, Eye, FilePlus2, FileSpreadsheet, FileText, History, Info, Loader2,
  Lock, Paperclip, Pencil, Plus, RotateCcw, ScanLine, Search, Settings2, Share2, Sparkles, Trash2, UploadCloud, UserRound, Users, Wand2, X,
} from 'lucide-react'
import { ApiError, LocalFile, deskApi, del, download, fromBrowserFile, get, getToken, patch, pickLocalFiles, post, postFiles } from '../lib/api'
import { base64ToBytes } from '../lib/preview'
import { can } from '../lib/permissions'
import { amountInWords, formatAmount, parseSpokenAmount } from '../lib/vnNumber'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { confirmDialog, toast } from '../store/ui'
import { AttachTray, useAttachments } from './FileKit'
import { takeTemplate } from '../reader/fileQueue'
import { ProfileCard, SaveToProfile, useProfile } from './AutofillProfile'
import { PreviewModal, openExternally } from './FileViewer'
import { Modal, PageHeader } from './ui'

// ---------------------------------------------------------------- Kiểu dữ liệu (khớp API /fill)
type FieldType = 'text' | 'long_text' | 'date' | 'number' | 'money' | 'money_words' | 'phone' | 'email' | 'id_number' | 'choice' | 'checkbox'
interface FillField { key: string; label: string; type: FieldType; type_label?: string; hint?: string; example?: string; derived_from?: string }
interface FillTemplate {
  id: number; name: string; description: string | null; category: string | null; kind: 'docx' | 'xlsx' | 'csv'; mode: 'placeholders' | 'slots' | 'table'
  filename: string; filesize: number; visibility: 'private' | 'team'; owner_id: number; fields: FillField[]; slot_count?: number
  use_count: number; last_used_at: string | null; created_at: string; updated_at: string
  my_uses?: number; my_last_used?: string | null; reason?: string; match?: number | null
  can_edit?: boolean; last_run?: { id: number; title: string; created_at: string } | null
}
type Source = 'ai' | 'profile' | 'today' | 'account'
interface Cell { value: string; confidence: number; evidence: string; computed?: boolean; source?: Source; profile_key?: string }
interface Extracted {
  values: Record<string, Cell>; rows: string[][]; missing: string[]; notes: string; model?: string; sources: { filename: string; method: string }[]
  skipped: { filename: string; reason: string }[]; used_previous: boolean; masked_personal_data?: number; cost_usd: number; matches?: Record<string, string>; ai?: boolean
}
interface Prefill { values: Record<string, Cell>; matches: Record<string, string>; missing: string[]; filled: number; total: number }
interface FillRunRow { id: number; title: string; values: Record<string, string> | null; rows: string[][] | null; row_count: number | null; sources: { filename: string }[] | null; created_at: string }

const TYPE_LABEL: Record<FieldType, string> = { text: 'Chữ', long_text: 'Đoạn văn', date: 'Ngày', number: 'Số', money: 'Số tiền', money_words: 'Số tiền bằng chữ', phone: 'Điện thoại', email: 'Email', id_number: 'Số giấy tờ', choice: 'Lựa chọn', checkbox: 'Đánh dấu' }
const TEMPLATE_EXT = ['docx', 'xlsx', 'csv']
const MIME_FILTER: Record<string, { name: string; extensions: string[] }> = { docx: { name: 'Word', extensions: ['docx'] }, xlsx: { name: 'Excel', extensions: ['xlsx'] }, csv: { name: 'CSV', extensions: ['csv'] } }
const extOf = (n: string) => (n.split('.').pop() || '').toLowerCase()
const today = () => new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
const KindIcon = ({ kind, size = 22 }: { kind: string; size?: number }) => (kind === 'docx' ? <FileText size={size} /> : <FileSpreadsheet size={size} />)
const KIND_NAME: Record<string, string> = { docx: 'Word', xlsx: 'Excel', csv: 'CSV' }

type Variant = 'reader' | 'admin'
const UI = {
  reader: { card: 'rd-card p-5', btn: 'rd-btn', btn2: 'rd-btn secondary sm', big: 'rd-btn lg', input: 'af-input', warn: 'rd-callout warn', bad: 'rd-callout bad', info: 'rd-callout info !py-3 text-[0.92em]', h: 'text-[1.15em] font-black' },
  admin: {
    card: 'card !p-4', btn: 'btn', btn2: 'btn outline sm', big: 'btn', input: 'input',
    warn: 'rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2.5 flex gap-2 text-sm', bad: 'rounded-lg bg-red-50 border border-red-200 text-red-800 px-3 py-2.5 flex gap-2 text-sm',
    info: 'rounded-lg bg-brand-50 border border-line-soft text-ink-2 px-3 py-2.5 flex gap-2 text-[13px]', h: 'text-[15px] font-bold',
  },
}
type Cls = typeof UI.reader

// ---------------------------------------------------------------- Trang chính
export default function AutofillWorkbench({ variant = 'reader' }: { variant?: Variant }) {
  const c = UI[variant]
  const admin = variant === 'admin'
  const role = useAuth((s) => s.user?.role)
  const status = useChat((s) => s.status)
  const loadStatus = useChat((s) => s.loadStatus)
  const aiOff = !!status && !status.features.includes('fill_extract')
  const scanOff = !!status && !status.features.includes('fill_profile_scan')
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<'all' | 'mine' | 'team'>('all')
  const [list, setList] = useState<FillTemplate[] | null>(null)
  const [listErr, setListErr] = useState('')
  const [sel, setSel] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [over, setOver] = useState(false)
  const seq = useRef(0)

  useEffect(() => { void loadStatus() }, [loadStatus])
  // Tệp mẫu chuyển từ khung trò chuyện: lưu vào thư viện ngay
  useEffect(() => { const f = takeTemplate(); if (f) void upload(f) }, []) // eslint-disable-line
  async function reload(query = q, sc = scope) {
    const id = ++seq.current
    try {
      const r = await get<FillTemplate[]>('/fill/templates', { q: query.trim() || undefined, scope: sc })
      if (id === seq.current) { setList(r); setListErr('') }
    } catch (e) { if (id === seq.current) setListErr((e as ApiError).full || (e as Error).message) }
  }
  // Tìm theo ý: chờ người dùng gõ xong rồi mới hỏi máy chủ
  useEffect(() => { const t = setTimeout(() => void reload(q, scope), q.trim() ? 450 : 0); return () => clearTimeout(t) }, [q, scope]) // eslint-disable-line

  async function upload(f: LocalFile) {
    if (!TEMPLATE_EXT.includes(extOf(f.name))) return toast.warn('Mẫu phải là tệp Word (.docx), Excel (.xlsx) hoặc .csv. Tệp .doc/.xls cũ: hãy mở bằng Word/Excel rồi "Lưu thành" định dạng mới.')
    if (!f.bytes) return toast.warn('Không đọc được tệp')
    setUploading(true)
    try {
      const r = await postFiles<{ template: FillTemplate; duplicate: boolean; ai?: boolean }>('/fill/templates', [f], {}, 1)
      if (r.duplicate) toast.info(`Mẫu này đã có trong thư viện: “${r.template.name}”. Mở mẫu đó cho bạn.`)
      else toast.ok(`Đã thêm mẫu “${r.template.name}” — ${r.template.fields.length} chỗ cần điền${r.ai === false ? ' (AI tạm không dùng được nên tên các ô lấy theo chữ trong mẫu, bạn có thể sửa)' : ''}`)
      setQ(''); await reload('', scope); setSel(r.template.id)
    } catch (e) { toast.error((e as ApiError).full || e) } finally { setUploading(false) }
  }
  async function pickTemplate() { try { const [f] = await pickLocalFiles(false); if (f) await upload(f) } catch (e) { toast.error(e) } }
  async function onDrop(e: DragEvent) { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) await upload(await fromBrowserFile(f)) }

  const mine = list?.filter((t) => (t.my_uses || 0) > 0) || []
  const showHabit = !q.trim() && mine.length > 0

  return (
    <div className={clsx('af', admin && 'af-admin')}>
      <ProfileCard admin={admin} scanOff={scanOff} />
      {aiOff && <div className={c.warn}><AlertTriangle size={20} className="shrink-0 mt-0.5" /><div>Tính năng <b>AI điền giúp</b> đang tắt: vẫn điền được từ hồ sơ và điền tay. {admin ? 'Bật lại ở Quản trị › Cài đặt AI (ai_feature_fill_extract).' : 'Hãy báo quản trị viên để bật.'}</div></div>}
      <div className="af-grid">
        {/* ---- Thư viện mẫu ---- */}
        <aside className={clsx(c.card, 'af-lib', sel && 'has-sel')} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true) } }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }} onDrop={(e) => void onDrop(e)}>
          <div className="flex items-center gap-2">
            <div className={clsx(c.h, 'mr-auto')}>Thư viện mẫu</div>
            <button className={c.btn2} disabled={uploading} onClick={() => void pickTemplate()}>{uploading ? <Loader2 size={16} className="animate-spin" /> : <FilePlus2 size={16} />}Thêm mẫu</button>
          </div>
          <label className="af-search"><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bạn cần làm giấy tờ gì? VD: giấy đề nghị tạm ứng" aria-label="Tìm mẫu" />{q && <button onClick={() => setQ('')} aria-label="Xóa tìm kiếm"><X size={15} /></button>}</label>
          <div className="af-tabs" role="tablist">
            {([['all', 'Tất cả'], ['mine', 'Của tôi'], ['team', 'Dùng chung']] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={scope === k} className={clsx(scope === k && 'on')} onClick={() => setScope(k)}>{t}</button>)}
          </div>
          {uploading && <div className="af-uploading"><Loader2 size={18} className="animate-spin" />AI đang đọc mẫu và tìm các chỗ cần điền…</div>}
          {listErr && <div className={c.bad}><AlertTriangle size={18} className="shrink-0" /><div>{listErr}</div></div>}
          {!list && !listErr && <div className="af-empty"><Loader2 size={22} className="animate-spin" /></div>}
          {list && list.length === 0 && (
            <div className="af-empty">
              <UploadCloud size={30} />
              <b>{q.trim() ? 'Chưa có mẫu nào hợp' : 'Thư viện còn trống'}</b>
              <span>{q.trim() ? 'Thử cách gọi khác, hoặc thêm mẫu mới.' : 'Kéo tệp Word, Excel hoặc CSV vào đây để lưu làm mẫu. Lần sau chỉ cần chọn mẫu và dán thông tin.'}</span>
              <button className={c.btn2} onClick={() => void pickTemplate()}><FilePlus2 size={16} />Chọn tệp mẫu</button>
            </div>)}
          {list && list.length > 0 && (
            <div className="af-list">
              {showHabit && <div className="af-sec"><History size={14} />Bạn hay dùng</div>}
              {list.map((t, i) => (
                <div key={t.id} className="contents">
                  {showHabit && i === mine.length && <div className="af-sec">Các mẫu khác</div>}
                  {q.trim() && i === 0 && <div className="af-sec"><Sparkles size={14} />Mẫu hợp nhất với “{q.trim()}”</div>}
                  <TemplateCard t={t} on={sel === t.id} admin={admin} onClick={() => setSel(t.id)} />
                </div>))}
            </div>)}
          {over && <div className="af-drop"><UploadCloud size={30} />Thả tệp để lưu làm mẫu</div>}
          <div className="af-tip"><Info size={14} className="shrink-0 mt-0.5" /><span>Mẫu Word: đánh dấu chỗ cần điền bằng <code>{'{{ten}}'}</code> hoặc để trống dạng <code>……</code>, <code>____</code>. Excel/CSV: dòng đầu là tên cột.</span></div>
        </aside>

        {/* ---- Bàn làm việc ---- */}
        <section className="min-w-0">
          {sel ? <FillDesk key={sel} id={sel} c={c} admin={admin} aiOff={aiOff} canShare={can(role, 'write')} onBack={() => setSel(null)} onChanged={() => void reload()} onDeleted={() => { setSel(null); void reload() }} />
            : <Welcome c={c} hasTemplates={!!list?.length} onPick={() => void pickTemplate()} />}
        </section>
      </div>
    </div>)
}

function TemplateCard({ t, on, admin, onClick }: { t: FillTemplate; on: boolean; admin: boolean; onClick: () => void }) {
  return (
    <button className={clsx('af-card', on && 'on')} onClick={onClick}>
      <span className={clsx('af-kind', t.kind)}><KindIcon kind={t.kind} /></span>
      <span className="min-w-0 flex-1">
        <b className="af-name">{t.name}</b>
        <small className="af-meta">
          {t.category && <span>{t.category}</span>}
          <span>{t.fields.length} ô cần điền</span>
          {t.visibility === 'team' && <span className="inline-flex items-center gap-1"><Users size={12} />dùng chung</span>}
          {admin && t.match != null && <span>khớp {Math.round(t.match * 100)}%</span>}
        </small>
        {t.reason && (t.my_uses || 0) > 0 && <small className="af-reason"><History size={12} />{t.reason}</small>}
      </span>
      <ArrowRight size={16} className="af-go" />
    </button>)
}

function Welcome({ c, hasTemplates, onPick }: { c: Cls; hasTemplates: boolean; onPick: () => void }) {
  const steps = [
    { i: <FilePlus2 size={22} />, t: 'Lưu mẫu một lần', d: 'Hợp đồng, giấy đề nghị, phiếu, bảng kê… bằng Word, Excel hoặc CSV. AI tự tìm các chỗ cần điền.' },
    { i: <UserRound size={22} />, t: 'Tự điền từ hồ sơ', d: 'Họ tên, CCCD, địa chỉ, ngày làm đơn… lấy từ hồ sơ của bạn, không tốn AI. Phần còn lại: dán thông tin hoặc gửi ảnh, AI điền giúp.' },
    { i: <CheckCircle2 size={22} />, t: 'Xem lại rồi tải về', d: 'Ô nào AI chưa chắc được tô màu để bạn kiểm tra. Số tiền bằng chữ tự tính. Tệp giữ nguyên định dạng mẫu.' },
  ]
  return (
    <div className={clsx(c.card, 'af-welcome')}>
      <span className="af-hero"><Wand2 size={30} /></span>
      <div className={clsx(c.h, '!text-[1.3em]')}>Điền giấy tờ tự động bằng AI</div>
      <p className="text-muted max-w-[560px]">{hasTemplates ? 'Chọn một mẫu ở bên trái để bắt đầu, hoặc gõ loại giấy tờ bạn cần — trợ lý gợi ý mẫu hợp nhất, ưu tiên mẫu bạn đã dùng.' : 'Thêm mẫu đầu tiên của bạn để bắt đầu.'}</p>
      <div className="af-steps">{steps.map((s, i) => <div key={s.t} className="af-step"><span className="n">{i + 1}</span><span className="ic">{s.i}</span><b>{s.t}</b><small>{s.d}</small></div>)}</div>
      {!hasTemplates && <button className={c.big} onClick={onPick}><UploadCloud size={20} />Chọn tệp mẫu đầu tiên</button>}
      <div className="af-privacy"><Lock size={14} /><span>Số điện thoại, email, số CCCD trong chữ bạn dán được <b>che trước khi gửi AI</b> và chỉ điền lại trên máy chủ công ty.</span></div>
    </div>)
}

// ---------------------------------------------------------------- Bàn điền một mẫu
type Step = 'input' | 'review' | 'done'
function FillDesk({ id, c, admin, aiOff, canShare, onBack, onChanged, onDeleted }: { id: number; c: Cls; admin: boolean; aiOff: boolean; canShare: boolean; onBack: () => void; onChanged: () => void; onDeleted: () => void }) {
  const nav = useNavigate()
  const [t, setT] = useState<FillTemplate | null>(null)
  const [err, setErr] = useState('')
  const [runs, setRuns] = useState<FillRunRow[]>([])
  const [step, setStep] = useState<Step>('input')
  const [text, setText] = useState('')
  const att = useAttachments(5)
  const [busy, setBusy] = useState(false)
  const [ex, setEx] = useState<Extracted | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [rows, setRows] = useState<string[][]>([])
  const [manualWords, setManualWords] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('')
  const [saved, setSaved] = useState<{ id: number; filename: string } | null>(null)
  const [saving, setSaving] = useState<null | 'download' | 'preview' | 'word'>(null)
  const [edit, setEdit] = useState(false)
  const [preview, setPreview] = useState<{ name: string; bytes: Uint8Array } | null>(null)
  const [pre, setPre] = useState<Prefill | null>(null)
  const [missingSnap, setMissingSnap] = useState<Set<string> | null>(null)
  const profileAt = useProfile((s) => s.data?.updated_at)
  const openProfile = useProfile((s) => s.open)

  // Điền sẵn từ hồ sơ và ngày hôm nay (không dùng AI); làm lại khi hồ sơ đổi
  useEffect(() => { post<Prefill>(`/fill/templates/${id}/prefill`).then(setPre).catch(() => setPre(null)) }, [id, profileAt])

  async function load() {
    try {
      const [tt, rr] = await Promise.all([get<FillTemplate>(`/fill/templates/${id}`), get<FillRunRow[]>(`/fill/templates/${id}/runs`)])
      setT(tt); setRuns(rr); setErr('')
    } catch (e) { setErr((e as ApiError).full || (e as Error).message) }
  }
  useEffect(() => { void load() }, [id]) // eslint-disable-line

  const table = t?.mode === 'table'
  const blankRow = () => (t ? t.fields.map(() => '') : [])

  function startReview(vals: Record<string, string>, rws: string[][], extracted: Extracted | null) {
    setValues(vals); setRows(rws.length ? rws : [blankRow()]); setEx(extracted); setManualWords(new Set()); setSaved(null); setMissingSnap(null)
    setTitle(`${t!.name} ${today()}`); setStep('review')
  }
  async function runAi() {
    if (!t || busy) return
    if (!text.trim() && !att.files.length) return toast.warn('Hãy dán thông tin hoặc gửi kèm tệp để AI lấy dữ liệu điền vào mẫu')
    setBusy(true)
    try {
      const r = att.files.length
        ? await postFiles<Extracted>(`/fill/templates/${t.id}/extract`, att.files, { text: text.trim() || undefined })
        : await post<Extracted>(`/fill/templates/${t.id}/extract`, { text: text.trim() })
      const vals = Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, v.value]))
      startReview(vals, r.rows, r)
      const miss = r.missing.length
      toast.ok(miss ? `Đã điền ${t.fields.length - miss}/${t.fields.length} ô. Các ô còn trống được tô đỏ để bạn bổ sung.` : 'Đã điền đủ các ô. Hãy xem lại trước khi tải về.')
    } catch (e) { toast.error((e as ApiError).full || e) } finally { setBusy(false) }
  }
  const fromRun = (r: FillRunRow) => startReview(r.values || {}, r.rows || [], null)
  // Chỉ dùng hồ sơ (không gọi AI)
  function fromProfile() {
    const v = pre?.values || {}
    startReview(Object.fromEntries(Object.entries(v).map(([k, c]) => [k, c.value])), [], { values: v, rows: [], missing: pre?.missing || [], notes: '', sources: [], skipped: [], used_previous: false, cost_usd: 0, matches: pre?.matches || {}, ai: false })
  }

  // Số tiền bằng chữ đi theo số tiền (trừ khi người dùng tự sửa ô bằng chữ)
  function setValue(key: string, v: string) {
    setValues((cur) => {
      const next = { ...cur, [key]: v }
      for (const f of t!.fields.filter((x) => x.type === 'money_words' && !manualWords.has(x.key))) {
        const src = t!.fields.find((x) => x.key === f.derived_from && x.type === 'money') || t!.fields.find((x) => x.type === 'money')
        if (src && src.key === key) next[f.key] = parseSpokenAmount(v) !== null ? amountInWords(v) : ''
      }
      return next
    })
  }

  async function save(open: 'download' | 'preview' | 'word') {
    if (!t || saving) return
    setSaving(open)
    try {
      let run = saved
      if (!run) {
        const body = table
          ? { title, rows: rows.filter((r) => r.some((x) => x.trim())), sources: ex?.sources }
          : { title, values, sources: ex?.sources }
        run = await post<{ id: number; filename: string }>(`/fill/templates/${t.id}/runs`, body)
        setSaved(run); void load(); onChanged()
      }
      if (open === 'download') {
        const r = await download(`/fill/runs/${run.id}/download`, undefined, run.filename, [MIME_FILTER[t.kind]])
        if (!r.canceled) { toast.ok('Đã lưu tệp đã điền'); setStep('done') }
      } else {
        const b = await deskApi().blob({ path: `/fill/runs/${run.id}/download`, token: getToken() })
        if (!b.ok || !b.data?.ok || !b.data.base64) throw new ApiError(b.data?.error || b.error || 'Không tạo được tệp', b.data?.status || 0)
        const bytes = base64ToBytes(b.data.base64)
        if (open === 'preview') setPreview({ name: run.filename, bytes })
        else await openExternally({ type: 'local', name: run.filename, bytes }, b.data.base64)
        setStep('done')
      }
    } catch (e) { toast.error((e as ApiError).full || e) } finally { setSaving(null) }
  }

  async function remove() {
    if (!t) return
    if (!(await confirmDialog('Xóa mẫu?', `Mẫu “${t.name}” và lịch sử các lần điền sẽ bị xóa khỏi thư viện. Tệp bạn đã tải về vẫn còn.`, { danger: true, okText: 'Xóa mẫu' }))) return
    try { await del(`/fill/templates/${t.id}`); toast.ok('Đã xóa mẫu'); onDeleted() } catch (e) { toast.error((e as ApiError).full || e) }
  }
  async function share(team: boolean) {
    if (!t) return
    try { const r = await patch<FillTemplate>(`/fill/templates/${t.id}`, { visibility: team ? 'team' : 'private' }); setT({ ...t, ...r }); onChanged(); toast.ok(team ? 'Cả nhóm đã dùng được mẫu này' : 'Mẫu chỉ còn mình bạn thấy') } catch (e) { toast.error((e as ApiError).full || e) }
  }

  if (err) return <div className={c.bad}><AlertTriangle size={20} className="shrink-0" /><div>{err} <button className="underline font-bold" onClick={() => void load()}>Thử lại</button></div></div>
  if (!t) return <div className={clsx(c.card, 'af-empty')}><Loader2 size={24} className="animate-spin" /></div>

  const missing = new Set(ex?.missing || [])
  const hasInput = !!text.trim() || att.files.length > 0
  const filledN = t.fields.filter((f) => (values[f.key] || '').trim()).length
  const shown = missingSnap ? t.fields.filter((f) => missingSnap.has(f.key)) : t.fields
  return (
    <div className="flex flex-col gap-4">
      {/* Đầu mẫu */}
      <div className={clsx(c.card, 'af-head')}>
        <button className="af-back" onClick={onBack} aria-label="Về thư viện mẫu"><ArrowLeft size={18} /></button>
        <span className={clsx('af-kind lg', t.kind)}><KindIcon kind={t.kind} size={26} /></span>
        <div className="min-w-0 flex-1">
          <div className={clsx(c.h, 'break-words')}>{t.name}</div>
          <div className="af-meta mt-0.5">
            <span>{KIND_NAME[t.kind]} · {t.filename}</span>
            {t.category && <span>{t.category}</span>}
            <span>{table ? `${t.fields.length} cột, điền nhiều dòng` : `${t.fields.length} ô cần điền`}</span>
            {t.visibility === 'team' ? <span className="inline-flex items-center gap-1"><Users size={12} />Dùng chung</span> : <span className="inline-flex items-center gap-1"><Lock size={12} />Riêng tôi</span>}
            {admin && <span>mode={t.mode} · đã dùng {t.use_count} lần</span>}
          </div>
          {t.description && <div className="text-muted text-[0.9em] mt-1">{t.description}</div>}
        </div>
        <div className="af-head-actions">
          <button className={c.btn2} onClick={() => void download(`/fill/templates/${t.id}/download`, undefined, t.filename, [MIME_FILTER[t.kind]]).catch((e) => toast.error(e))} title="Tải tệp mẫu gốc"><Download size={16} />Mẫu gốc</button>
          {t.can_edit && <button className={c.btn2} onClick={() => setEdit(true)} title="Sửa tên mẫu, tên và kiểu các ô"><Settings2 size={16} />Sửa mẫu</button>}
          {t.can_edit && canShare && <button className={c.btn2} onClick={() => void share(t.visibility !== 'team')} title={t.visibility === 'team' ? 'Thôi chia sẻ' : 'Cho cả nhóm dùng mẫu này'}><Share2 size={16} />{t.visibility === 'team' ? 'Thôi chia sẻ' : 'Chia sẻ nhóm'}</button>}
          {t.can_edit && <button className={c.btn2} onClick={() => void remove()} aria-label="Xóa mẫu" title="Xóa mẫu"><Trash2 size={16} /></button>}
        </div>
      </div>

      <Stepper step={step} onGo={(s) => { if (s === 'input' || (s === 'review' && step !== 'input')) setStep(s) }} />

      {/* Bước 1: nguồn thông tin (hồ sơ + thông tin thêm) */}
      {step === 'input' && (
        <div className="af-in-grid">
          <div className="flex flex-col gap-4 min-w-0">
            {!table && <PrefillBox pre={pre} fields={t.fields} c={c} onProfile={() => openProfile('edit')} onScan={() => openProfile('scan')} />}
            <div className={clsx(c.card, 'flex flex-col gap-3')} {...att.dropProps}>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="af-step-n">{table ? 1 : 2}</span>
                <div className={c.h}>{table ? 'Thông tin để điền' : 'Thông tin thêm cho lần này'}</div>
                {!table && <span className="af-pill">Không bắt buộc</span>}
              </div>
              <div className="text-muted text-[0.92em]">{table
                ? 'Dán danh sách (email, tin nhắn, bảng chép từ nơi khác) hoặc gửi kèm ảnh, PDF, Word, Excel (tối đa 5 tệp). Mỗi người/mục thành một dòng.'
                : 'Những gì hồ sơ không có: nội dung, số tiền, bên kia hợp đồng… Dán email, tin nhắn, hoặc gửi kèm ảnh chụp, PDF, Word, Excel, ghi âm (tối đa 5 tệp). AI chỉ lấy thông tin có trong đó, không tự bịa.'}</div>
              <div className={clsx('af-source', att.over && 'over')}>
                <AttachTray files={att.files} onRemove={att.remove} onOpen={(f) => f.bytes && setPreview({ name: f.name, bytes: f.bytes })} />
                <textarea value={text} onChange={(e) => setText(e.target.value)} onPaste={(e: ReactClipboardEvent) => att.onPaste(e)} rows={6} maxLength={20000}
                  placeholder={table ? 'VD: Danh sách nhân viên: Nguyễn Văn An, 0901 234 567, 7.500.000; Trần Thị Bình…' : 'VD: Đề nghị thanh toán tiền mua văn phòng phẩm tháng 9, tổng 3,25 triệu, chuyển khoản…'} aria-label="Thông tin để điền" />
                <div className="af-source-bar">
                  <button className="af-ico" onClick={() => void att.pick()} title="Gửi kèm tệp" aria-label="Gửi kèm tệp"><Paperclip size={18} /></button>
                  <span className="text-[0.82em] text-muted">Kéo thả hoặc dán ảnh (Ctrl+V)</span>
                  <span className="ml-auto text-[0.8em] text-muted">{text.length.toLocaleString('vi-VN')}/20.000</span>
                </div>
                {att.over && <div className="fc-drop-over"><UploadCloud size={30} />Thả tệp vào đây</div>}
              </div>
              <div className="af-cta">
                {hasInput
                  ? <button className={c.big} disabled={busy || aiOff} onClick={() => void runAi()}>{busy ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}{busy ? 'AI đang đọc và điền…' : 'AI điền giúp'}</button>
                  : <button className={c.big} disabled={busy} onClick={fromProfile}>{pre?.filled && !table ? 'Tiếp tục với hồ sơ' : 'Điền tay'}<ArrowRight size={20} /></button>}
                {hasInput && !busy && <button className={c.btn2} onClick={fromProfile}>Bỏ qua AI, chỉ dùng hồ sơ</button>}
                <span className="af-cost">{busy
                  ? (att.files.length ? 'Đang xem các tệp gửi kèm… thường mất 10–40 giây' : 'Thường mất 5–15 giây')
                  : hasInput ? (aiOff ? <><AlertTriangle size={14} />AI đang tắt: hãy chọn "Bỏ qua AI"</> : <><Sparkles size={14} />AI đọc thông tin bạn gửi, phần còn lại lấy từ hồ sơ</>)
                    : <><Check size={14} />Không dùng AI, không tốn chi phí</>}</span>
              </div>
              <div className="af-privacy"><Lock size={14} /><span>Số điện thoại, email, số định danh trong chữ và trong hồ sơ được <b>che bằng mã</b> trước khi gửi AI rồi điền lại trên máy chủ. Ảnh gửi kèm thì AI xem trực tiếp.</span></div>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className={clsx(c.card, 'flex flex-col gap-2.5')}>
              <div className="font-bold flex items-center gap-2"><CheckCircle2 size={17} />Mẫu này cần {t.fields.length} ô</div>
              <div className="af-need">{t.fields.map((f) => {
                const pv = pre?.values[f.key]
                return <span key={f.key} className={clsx(pv && 'have')} title={pv ? `${pv.evidence}: ${pv.value}` : f.hint || TYPE_LABEL[f.type]}>{pv && <Check size={12} />}{f.label}</span>
              })}</div>
              {!!pre?.filled && !table && <small className="text-muted">Ô có dấu ✓ đã có sẵn từ hồ sơ hoặc ngày hôm nay.</small>}
            </div>
            {runs.length > 0 && (
              <div className={clsx(c.card, 'flex flex-col gap-2')}>
                <div className="font-bold flex items-center gap-2"><History size={17} />Lần điền trước</div>
                {runs.slice(0, 5).map((r) => (
                  <div key={r.id} className="af-run">
                    <span className="min-w-0 flex-1"><b className="truncate block">{r.title}</b><small>{new Date(r.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}{r.row_count != null ? ` · ${r.row_count} dòng` : ''}</small></span>
                    <button className="af-mini" onClick={() => fromRun(r)} title="Mở lại các giá trị của lần này để sửa và điền tiếp"><RotateCcw size={14} />Điền lại</button>
                    <button className="af-mini" onClick={() => void download(`/fill/runs/${r.id}/download`, undefined, `${r.title}.${t.kind}`, [MIME_FILTER[t.kind]]).catch((e) => toast.error(e))} title="Tải lại tệp" aria-label="Tải lại tệp"><Download size={14} /></button>
                  </div>))}
                <small className="text-muted">AI cũng tự tham khảo lần gần nhất cho thông tin hay lặp lại (tên công ty, địa chỉ, MST…).</small>
              </div>)}
          </aside>
        </div>)}

      {/* Bước 2: xem lại */}
      {step !== 'input' && (
        <div className={clsx(c.card, 'flex flex-col gap-4')}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className={clsx(c.h, 'mr-auto')}>Xem lại và sửa</div>
            {!table && <label className="af-toggle"><input type="checkbox" checked={!!missingSnap} onChange={(e) => setMissingSnap(e.target.checked ? new Set(t.fields.filter((f) => !(values[f.key] || '').trim()).map((f) => f.key)) : null)} />Chỉ hiện ô còn trống</label>}
          </div>
          {!table && (
            <div className="af-progress" aria-label={`Đã điền ${filledN} trên ${t.fields.length} ô`}>
              <div className="af-bar"><i style={{ width: `${Math.round((filledN / Math.max(1, t.fields.length)) * 100)}%` }} /></div>
              <b>{filledN}/{t.fields.length}</b><span>ô đã có giá trị</span>
            </div>)}
          {ex && <Summary ex={ex} total={t.fields.length} table={table} admin={admin} />}
          {ex?.skipped.length ? <div className={c.warn}><AlertTriangle size={18} className="shrink-0 mt-0.5" /><div>Không dùng được: {ex.skipped.map((s) => `${s.filename} (${s.reason})`).join('; ')}</div></div> : null}
          {ex?.notes && <div className={c.info}><Info size={18} className="shrink-0 mt-0.5" /><div>{ex.notes}</div></div>}

          {table
            ? <TableEditor fields={t.fields} rows={rows} setRows={setRows} />
            : (
              <div className="af-form">
                {shown.length === 0 && <div className="af-allset"><CheckCircle2 size={20} />Không còn ô nào trống.</div>}
                {shown.map((f) => (
                  <FieldInput key={f.key} f={f} value={values[f.key] ?? ''} cell={ex?.values[f.key]} missing={!!ex && missing.has(f.key) && !(values[f.key] || '').trim()} admin={admin}
                    auto={f.type === 'money_words' && !manualWords.has(f.key)}
                    onChange={(v) => { if (f.type === 'money_words') setManualWords((s) => new Set(s).add(f.key)); setValue(f.key, v); setSaved(null) }}
                    onAuto={() => { setManualWords((s) => { const n = new Set(s); n.delete(f.key); return n }); const src = t.fields.find((x) => x.key === f.derived_from && x.type === 'money') || t.fields.find((x) => x.type === 'money'); if (src) setValues((cur) => ({ ...cur, [f.key]: amountInWords(cur[src.key] || '') })); setSaved(null) }} />))}
              </div>)}

          {!table && <SaveToProfile fields={t.fields} values={values} matches={ex?.matches || pre?.matches || {}} />}

          <div className="af-out sticky">
            <label className="flex flex-col gap-1.5 flex-1 min-w-[220px]"><span className="font-bold text-[0.9em]">Tên tệp</span>
              <input className={c.input} value={title} maxLength={200} onChange={(e) => { setTitle(e.target.value); setSaved(null) }} /></label>
            <div className="flex gap-2 flex-wrap items-end">
              <button className={c.btn2} disabled={!!saving} onClick={() => void save('preview')}>{saving === 'preview' ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}Xem trước</button>
              {t.kind !== 'csv' && <button className={c.btn2} disabled={!!saving} onClick={() => void save('word')}>{saving === 'word' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}Mở bằng {t.kind === 'docx' ? 'Word' : 'Excel'}</button>}
              <button className={c.big} disabled={!!saving} onClick={() => void save('download')}>{saving === 'download' ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}Tải tệp đã điền</button>
            </div>
          </div>
          {step === 'done' && (
            <div className="af-done"><CheckCircle2 size={22} /><div className="flex-1"><b>Xong!</b> Lần điền này đã được lưu để lần sau “Điền lại” nhanh hơn.</div>
              <button className={c.btn2} onClick={() => { setStep('input'); setText(''); att.clear(); setEx(null) }}><Plus size={16} />Điền bộ khác</button>
              <button className={c.btn2} onClick={() => nav('/')}>Về trang chủ</button></div>)}
        </div>)}

      {edit && <EditTemplate t={t} c={c} onClose={() => setEdit(false)} onSaved={(n) => { setT({ ...t, ...n }); setEdit(false); onChanged() }} />}
      {preview && <PreviewModal src={{ type: 'local', name: preview.name, bytes: preview.bytes }} onClose={() => setPreview(null)} />}
    </div>)
}

/** Bước 1: các ô đã tự điền từ hồ sơ, ngày hôm nay (không dùng AI) */
function PrefillBox({ pre, fields, c, onProfile, onScan }: { pre: Prefill | null; fields: FillField[]; c: Cls; onProfile: () => void; onScan: () => void }) {
  const total = fields.length
  const n = pre?.filled || 0
  const pct = Math.round((n / Math.max(1, total)) * 100)
  const have = fields.filter((f) => pre?.values[f.key])
  // Ô ứng với thông tin hồ sơ nhưng hồ sơ chưa có: gợi ý bổ sung
  const lack = fields.filter((f) => pre?.matches[f.key] && !pre?.values[f.key])
  return (
    <div className={clsx(c.card, 'af-prefill', n > 0 && 'has')}>
      <div className="flex items-center gap-3">
        <span className="af-step-n">1</span>
        <div className="flex-1 min-w-0">
          <div className={c.h}>Tự điền từ hồ sơ của bạn</div>
          <div className="text-muted text-[0.9em]">{!pre ? 'Đang kiểm tra hồ sơ…' : n ? `Đã điền sẵn ${n} trên ${total} ô, không dùng AI.` : 'Chưa có ô nào lấy được từ hồ sơ.'}</div>
        </div>
        <div className="af-ring" style={{ background: `conic-gradient(#12b76a ${pct}%, #e4e7ec 0)` }} aria-label={`${n}/${total} ô`}><span>{n}/{total}</span></div>
      </div>
      {have.length > 0 && (
        <div className="af-filled">{have.map((f) => {
          const v = pre!.values[f.key]
          return <span key={f.key} className={v.source} title={v.evidence}>{v.source === 'today' ? <CalendarDays size={13} /> : <UserRound size={13} />}<em>{f.label}</em><b>{v.value}</b></span>
        })}</div>)}
      {lack.length > 0 && (
        <div className="af-lack">
          <span className="min-w-0 flex-1">Hồ sơ còn thiếu: <b>{lack.map((f) => f.label).join(', ')}</b>. Bổ sung một lần, các mẫu sau tự điền.</span>
          <button className="af-mini" onClick={onScan}><ScanLine size={14} />Quét CCCD</button>
          <button className="af-mini" onClick={onProfile}><Pencil size={13} />Bổ sung hồ sơ</button>
        </div>)}
    </div>)
}

function Stepper({ step, onGo }: { step: Step; onGo: (s: Step) => void }) {
  const items: { k: Step; t: string }[] = [{ k: 'input', t: 'Thông tin' }, { k: 'review', t: 'Xem lại' }, { k: 'done', t: 'Tải về' }]
  const at = items.findIndex((x) => x.k === step)
  return (
    <ol className="af-stepper">
      {items.map((s, i) => <li key={s.k} className={clsx(i < at && 'past', i === at && 'cur')}><button onClick={() => onGo(s.k)} disabled={i > at}><span>{i < at ? <Check size={14} /> : i + 1}</span>{s.t}</button></li>)}
    </ol>)
}

function Summary({ ex, total, table, admin }: { ex: Extracted; total: number; table: boolean; admin: boolean }) {
  const vals = Object.values(ex.values)
  const ai = vals.filter((v) => v.value && (!v.source || v.source === 'ai'))
  const sure = ai.filter((v) => v.confidence >= 0.8).length
  const check = ai.filter((v) => v.confidence < 0.8).length
  const prof = vals.filter((v) => v.value && (v.source === 'profile' || v.source === 'account')).length
  const day = vals.filter((v) => v.value && v.source === 'today').length
  return (
    <div className="af-summary">
      {table ? <span className="ok"><CheckCircle2 size={14} />{ex.rows.length} dòng</span> : <>
        {prof > 0 && <span className="prof"><UserRound size={14} />{prof} từ hồ sơ</span>}
        {day > 0 && <span className="day"><CalendarDays size={14} />{day} ngày hôm nay</span>}
        {sure > 0 && <span className="ok"><Sparkles size={14} />{sure} AI chắc chắn</span>}
        {check > 0 && <span className="warn"><AlertTriangle size={14} />{check} nên xem lại</span>}
        {ex.missing.length > 0 && <span className="bad"><Pencil size={14} />{ex.missing.length}/{total} cần bạn điền</span>}
      </>}
      {ex.used_previous && <span title="AI tham khảo lần điền trước cho thông tin hay lặp lại"><History size={14} />dùng lần trước</span>}
      {!!ex.masked_personal_data && <span title="Giá trị đã được che trước khi gửi AI"><Lock size={14} />đã che {ex.masked_personal_data} dữ liệu cá nhân</span>}
      {admin && <span>{ex.model} · ${ex.cost_usd}</span>}
    </div>)
}

function FieldInput({ f, value, cell, missing, admin, auto, onChange, onAuto }: { f: FillField; value: string; cell?: Cell; missing: boolean; admin: boolean; auto: boolean; onChange: (v: string) => void; onAuto: () => void }) {
  const level = !cell || !cell.value ? null : cell.confidence >= 0.8 ? 'ok' : 'warn'
  const src = cell?.value ? cell.source || 'ai' : null
  const changed = !!cell && cell.value !== value
  const words = f.type === 'money' && value && parseSpokenAmount(value) !== null ? amountInWords(value) : ''
  const common = { value, onChange: (e: { target: { value: string } }) => onChange(e.target.value), 'aria-label': f.label, placeholder: f.example ? `VD: ${f.example}` : f.hint || '' }
  return (
    <div className={clsx('af-field', f.type === 'long_text' && 'wide', missing && 'missing', !changed && (src === 'profile' || src === 'account' || src === 'today' ? 'prof' : level))}>
      <div className="af-label">
        <span className="font-bold">{f.label}</span>
        <span className="af-type">{TYPE_LABEL[f.type]}</span>
        {admin && <code className="af-key">{f.key}</code>}
        {!changed && src === 'profile' && <span className="af-conf prof" title="Lấy từ hồ sơ của bạn"><UserRound size={12} />Hồ sơ</span>}
        {!changed && src === 'account' && <span className="af-conf prof" title="Lấy từ tài khoản đăng nhập"><UserRound size={12} />Tài khoản</span>}
        {!changed && src === 'today' && <span className="af-conf day" title="Ngày làm đơn: hôm nay"><CalendarDays size={12} />Hôm nay</span>}
        {!changed && src === 'ai' && level === 'ok' && <span className="af-conf ok" title={`AI điền, độ chắc chắn ${Math.round(cell!.confidence * 100)}%`}><Sparkles size={12} />AI · chắc chắn</span>}
        {!changed && src === 'ai' && level === 'warn' && <span className="af-conf warn" title={`AI điền, độ chắc chắn ${Math.round(cell!.confidence * 100)}%`}><AlertTriangle size={12} />AI · nên xem lại</span>}
        {missing && <span className="af-conf bad">Chưa có thông tin</span>}
        {changed && cell && <span className="af-conf edited"><Pencil size={11} />Bạn đã sửa</span>}
      </div>
      {f.type === 'long_text' ? <textarea className="af-input" rows={3} {...common} />
        : f.type === 'checkbox' ? (
          <label className="af-check"><input type="checkbox" checked={/^(x|☒|✓|✔|có|yes|true|1)$/i.test(value.trim())} onChange={(e) => onChange(e.target.checked ? '☒' : '☐')} />{value.trim() && /^(x|☒|✓|✔|có|yes|true|1)$/i.test(value.trim()) ? 'Có đánh dấu' : 'Không đánh dấu'}</label>)
          : <div className="relative flex items-center gap-2">
            <input className={clsx('af-input', ['phone', 'id_number', 'email', 'number', 'money'].includes(f.type) && 'mono')} inputMode={f.type === 'money' || f.type === 'number' ? 'decimal' : undefined}
              onBlur={() => { if (f.type === 'money' && value && parseSpokenAmount(value) !== null) onChange(formatAmount(value)) }} {...common} />
            {f.type === 'date' && <button className="af-mini" onClick={() => onChange(today())} title="Điền ngày hôm nay">Hôm nay</button>}
            {f.type === 'money_words' && !auto && <button className="af-mini" onClick={onAuto} title="Tự tính lại từ số tiền"><RotateCcw size={13} />Tự tính</button>}
          </div>}
      {f.type === 'money_words' && auto && <small className="af-help"><Sparkles size={12} />Tự tính từ số tiền, luôn đúng chính tả</small>}
      {words && <small className="af-help">Bằng chữ: {words}</small>}
      {cell?.evidence && !changed && src === 'ai' && <small className="af-evidence" title={cell.evidence}>Lấy từ: “{cell.evidence}”</small>}
      {!cell?.evidence && f.hint && <small className="af-help">{f.hint}</small>}
    </div>)
}

function TableEditor({ fields, rows, setRows }: { fields: FillField[]; rows: string[][]; setRows: (fn: (r: string[][]) => string[][]) => void }) {
  const set = (i: number, j: number, v: string) => setRows((r) => r.map((row, a) => (a === i ? row.map((x, b) => (b === j ? v : x)) : row)))
  // Dán nhiều dòng từ Excel (cột cách nhau bằng Tab) vào một ô: trải ra các ô bên phải và các dòng bên dưới
  function onPaste(e: ReactClipboardEvent<HTMLInputElement>, i: number, j: number) {
    const txt = e.clipboardData.getData('text/plain')
    if (!/[\t\n]/.test(txt)) return
    e.preventDefault()
    const lines = txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'))
    setRows((r) => {
      const out = r.map((x) => [...x])
      lines.forEach((cells, di) => {
        while (out.length <= i + di) out.push(fields.map(() => ''))
        cells.forEach((v, dj) => { if (j + dj < fields.length) out[i + di][j + dj] = v.trim() })
      })
      return out
    })
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="af-table-wrap">
        <table className="af-table">
          <thead><tr><th className="w-10">#</th>{fields.map((f) => <th key={f.key} title={f.hint || TYPE_LABEL[f.type]}>{f.label}</th>)}<th className="w-10" /></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="text-muted text-center">{i + 1}</td>
                {fields.map((f, j) => <td key={f.key}><input value={row[j] ?? ''} onChange={(e) => set(i, j, e.target.value)} onPaste={(e) => onPaste(e, i, j)} aria-label={`${f.label} dòng ${i + 1}`} className={clsx(['phone', 'id_number', 'number', 'money'].includes(f.type) && 'mono', !(row[j] ?? '').trim() && row.some((x) => x.trim()) && 'empty')} title={!(row[j] ?? '').trim() ? 'Ô còn trống' : undefined} /></td>)}
                <td><button className="af-x" onClick={() => setRows((r) => (r.length > 1 ? r.filter((_, a) => a !== i) : [fields.map(() => '')]))} aria-label={`Xóa dòng ${i + 1}`}><X size={14} /></button></td>
              </tr>))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button className="af-mini" onClick={() => setRows((r) => [...r, fields.map(() => '')])}><Plus size={14} />Thêm dòng</button>
        <small className="text-muted">Mẹo: chép nhiều dòng từ Excel rồi dán vào một ô để điền nhanh. {rows.length} dòng.</small>
      </div>
    </div>)
}

function EditTemplate({ t, c, onClose, onSaved }: { t: FillTemplate; c: Cls; onClose: () => void; onSaved: (t: FillTemplate) => void }) {
  const [name, setName] = useState(t.name)
  const [category, setCategory] = useState(t.category || '')
  const [description, setDescription] = useState(t.description || '')
  const [fields, setFields] = useState<FillField[]>(t.fields.map((f) => ({ ...f })))
  const [busy, setBusy] = useState(false)
  const up = (i: number, p: Partial<FillField>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...p } : f)))
  const changed = useMemo(() => fields.filter((f, i) => JSON.stringify(f) !== JSON.stringify(t.fields[i])), [fields, t.fields])
  async function save() {
    setBusy(true)
    try {
      const r = await patch<FillTemplate>(`/fill/templates/${t.id}`, {
        name: name.trim() || t.name, category: category.trim(), description: description.trim(),
        ...(changed.length ? { fields: changed.map((f) => ({ key: f.key, label: f.label.trim() || f.key, type: f.type, hint: f.hint || '', example: f.example || '' })) } : {}),
      })
      toast.ok('Đã lưu mẫu'); onSaved(r)
    } catch (e) { toast.error((e as ApiError).full || e) } finally { setBusy(false) }
  }
  return (
    <Modal title="Sửa mẫu" size="xl" onClose={onClose} footer={<><button className="btn outline" onClick={onClose}>Hủy</button><button className="btn" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}Lưu</button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid md:grid-cols-[2fr_1fr] gap-3">
          <label className="field"><span className="font-semibold text-sm">Tên mẫu</span><input className="input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span className="font-semibold text-sm">Nhóm</span><input className="input" value={category} maxLength={100} placeholder="VD: Kế toán, Nhân sự" onChange={(e) => setCategory(e.target.value)} /></label>
        </div>
        <label className="field"><span className="font-semibold text-sm">Mô tả</span><input className="input" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} /></label>
        <div className="text-sm text-muted">Đổi tên, kiểu và gợi ý của từng ô cho dễ điền. Vị trí điền trong tệp giữ nguyên.</div>
        <div className="af-table-wrap max-h-[48vh]">
          <table className="af-table edit">
            <thead><tr><th>Tên ô</th><th className="w-[170px]">Kiểu</th><th>Gợi ý cách điền</th><th className="w-[160px]">Ví dụ</th></tr></thead>
            <tbody>{fields.map((f, i) => (
              <tr key={f.key}>
                <td><input value={f.label} maxLength={200} onChange={(e) => up(i, { label: e.target.value })} aria-label="Tên ô" /><small className="block text-muted font-mono text-[11px] px-2">{f.key}</small></td>
                <td><select value={f.type} onChange={(e) => up(i, { type: e.target.value as FieldType })} aria-label="Kiểu">{(Object.keys(TYPE_LABEL) as FieldType[]).map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}</select></td>
                <td><input value={f.hint || ''} maxLength={500} onChange={(e) => up(i, { hint: e.target.value })} aria-label="Gợi ý" /></td>
                <td><input value={f.example || ''} maxLength={300} onChange={(e) => up(i, { example: e.target.value })} aria-label="Ví dụ" /></td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className={c.info}><Info size={16} className="shrink-0 mt-0.5" /><div>Kiểu <b>Số tiền bằng chữ</b> được tự tính từ ô <b>Số tiền</b> nên luôn đúng chính tả.</div></div>
      </div>
    </Modal>)
}

// ---------------------------------------------------------------- Trang bọc
function Hint({ children }: { children: ReactNode }) { return <p className="rd-sub !mb-0 !mt-1">{children}</p> }

/** Trang người đọc */
export function ReaderAutofillPage() {
  return (
    <div className="flex flex-col gap-5 max-w-[1240px] mx-auto w-full">
      <div><h1 className="rd-h2 !text-[1.6em] !mb-0"><Wand2 size={26} className="text-brand-600" />Điền mẫu tự động</h1>
        <Hint>Lưu mẫu giấy tờ một lần. Thông tin của bạn tự điền từ hồ sơ; phần còn lại dán thông tin hoặc gửi ảnh để AI điền, xem lại rồi tải về.</Hint></div>
      <AutofillWorkbench variant="reader" />
    </div>)
}

/** Trang quản trị */
export function AdminAutofillPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Điền mẫu tự động (AI)" subtitle="/fill · mẫu Word/Excel/CSV · AI hiểu mẫu và trích giá trị · dữ liệu cá nhân được che trước khi gửi AI · tệp xuất giữ định dạng" />
      <AutofillWorkbench variant="admin" />
    </div>)
}

/** Tệp dùng được làm mẫu điền (Word, Excel, CSV) */
export const isTemplateName = (n: string) => TEMPLATE_EXT.includes(extOf(n))
