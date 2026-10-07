// Nhập quy trình xử lý sự cố theo bước: tải tệp mẫu Word / CSV, gửi tệp (đúng mẫu: đọc thẳng không tốn AI; tệp tự do hoặc
// văn bản dán vào: AI đọc), xem lại và sửa từng quy trình (thông tin còn thiếu, bước nguy hiểm), rồi tạo hàng loạt; hoặc nhập tay.
import { DragEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertTriangle, ArrowDown, ArrowUp, Bot, CheckCircle2, ChevronDown, Download, ExternalLink, FileSpreadsheet, FileText, Info, Loader2, PenLine, Plus, ShieldAlert, Sparkles, Trash2, UploadCloud, Wand2, X,
} from 'lucide-react'
import { ApiError, LocalFile, download, fromBrowserFile, pickLocalFiles, post, postFiles } from '../lib/api'
import { CommitResult, DraftStep, ParseResult, RunbookDraft, SEVERITY_LIST, SEVERITY_TEXT } from '../lib/incident'
import { Field, PageHeader, Pill } from '../components/ui'
import { useAuth } from '../store/auth'
import { toast } from '../store/ui'

const FIELD_ROWS: { k: keyof RunbookDraft; l: string; rows?: number; ph?: string }[] = [
  { k: 'symptom', l: 'Dấu hiệu nhận biết', rows: 2, ph: 'Người dùng thấy gì khi gặp sự cố' },
  { k: 'prerequisites', l: 'Chuẩn bị trước', rows: 2, ph: 'Quyền truy cập, công cụ, ai cần được báo' },
  { k: 'verification', l: 'Cách xác nhận đã khắc phục', rows: 2, ph: 'Làm gì để chắc chắn lỗi đã hết' },
  { k: 'rollback', l: 'Cách hoàn tác', rows: 2, ph: 'Nếu bước nguy hiểm làm hỏng việc, quay lại thế nào (bắt buộc với R3)' },
  { k: 'contact_info', l: 'Liên hệ hỗ trợ', ph: 'Ai / số nào để gọi khi cần' },
  { k: 'summary', l: 'Tóm tắt', ph: 'Một câu mô tả quy trình' },
]
const REQUIRED: (keyof RunbookDraft)[] = ['title', 'affected_system', 'severity_level', 'symptom', 'prerequisites', 'contact_info', 'verification']

/** Kiểm tra lại ngay trên máy khi người dùng sửa (giống quy tắc runbook của máy chủ) */
const missingOf = (r: RunbookDraft) => {
  const m = REQUIRED.filter((k) => !String(r[k] || '').trim()).map((k) => k)
  if (!r.steps.length) m.push('steps')
  if (r.steps.some((s) => !s.action.trim() || !s.expected.trim())) m.push('steps.expected' as keyof RunbookDraft)
  if (r.risk_level === 'R3' && !r.rollback.trim()) m.push('rollback')
  return m as string[]
}
const LABEL: Record<string, string> = { title: 'Tên quy trình', affected_system: 'Hệ thống', severity_level: 'Mức độ', symptom: 'Dấu hiệu', prerequisites: 'Chuẩn bị trước', contact_info: 'Liên hệ', verification: 'Cách xác nhận', rollback: 'Cách hoàn tác', steps: 'Các bước', 'steps.expected': 'Việc làm / kết quả của bước' }
const emptyDraft = (): RunbookDraft => ({ title: '', summary: '', affected_system: '', severity_level: 'medium', error_group: '', symptom: '', prerequisites: '', verification: '', rollback: '', contact_info: '', risk_level: 'R2', steps: [{ action: '', expected: '', dangerous: false }] })

export default function RunbookImport() {
  const nav = useNavigate()
  const spaces = useAuth((s) => s.spaces)
  const [mode, setMode] = useState<'file' | 'text'>('file')
  const [text, setText] = useState('')
  const [file, setFile] = useState<LocalFile | null>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<ParseResult | null>(null)
  const [drafts, setDrafts] = useState<RunbookDraft[]>([])
  const [open, setOpen] = useState<number>(0)
  const [space, setSpace] = useState<number>(spaces[0]?.id || 0)
  const [submit, setSubmit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<CommitResult | null>(null)

  async function getTemplate(format: 'docx' | 'csv') {
    try { const r = await download('/runbooks/template', { format }, format === 'docx' ? 'mau-quy-trinh-xu-ly-su-co.docx' : 'mau-quy-trinh-xu-ly-su-co.csv', [{ name: format === 'docx' ? 'Word' : 'CSV', extensions: [format] }]); if (!r.canceled) toast.ok('Đã lưu tệp mẫu') } catch (e) { toast.error(e) }
  }
  async function choose() { try { const [f] = await pickLocalFiles(false); if (f) setFile(f) } catch (e) { toast.error(e) } }
  async function onDrop(e: DragEvent) { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(await fromBrowserFile(f)) }
  async function read(useAi: boolean) {
    if (busy) return
    setBusy(true); setDone(null)
    try {
      const r = mode === 'file' && file
        ? await postFiles<ParseResult>('/runbooks/import/parse', [file], { use_ai: useAi }, 1)
        : await post<ParseResult>('/runbooks/import/parse', { text: text.trim(), use_ai: true })
      setRes(r); setDrafts(r.runbooks); setOpen(0)
      toast.ok(`${r.method === 'template' ? 'Đọc theo tệp mẫu (không dùng AI)' : 'AI đã đọc'}: ${r.runbooks.length} quy trình`)
    } catch (e) {
      const er = e as ApiError
      if (er.status === 422 && !useAi && mode === 'file') toast.warn('Tệp không theo mẫu. Bấm "Nhờ AI đọc" để AI tự tách quy trình, hoặc tải tệp mẫu về điền.')
      else toast.error(er.full || e)
    } finally { setBusy(false) }
  }
  const up = (i: number, p: Partial<RunbookDraft>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)))
  const ready = drafts.filter((d) => missingOf(d).length === 0)
  async function commit(list: RunbookDraft[]) {
    if (!space) return toast.warn('Hãy chọn mảng nội dung để lưu quy trình')
    setSaving(true)
    try {
      const r = await post<CommitResult>('/runbooks/import/commit', { space_id: space, submit, runbooks: list.map(({ missing, notes, ready: _r, code, ...rest }) => ({ ...rest, steps: rest.steps.map(({ auto_dangerous, ...s }) => s) })) })
      setDone(r)
      // Giữ lại các quy trình lỗi để sửa và tạo lại
      const failedIdx = new Set(r.results.filter((x) => !x.ok).map((x) => x.index))
      setDrafts(list.filter((_, i) => failedIdx.has(i)))
      r.created ? toast.ok(`Đã tạo ${r.created} quy trình${r.failed ? `, ${r.failed} quy trình cần sửa` : ''}`) : toast.warn('Chưa tạo được quy trình nào, xem lỗi bên dưới')
    } catch (e) { toast.error((e as ApiError).full || e) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Nhập quy trình xử lý sự cố" subtitle="Nhập nhiều quy trình theo từng bước từ tệp mẫu Word / CSV (không tốn AI), từ tài liệu có sẵn (AI tự tách bước), hoặc nhập tay."
        actions={<button className="btn outline" onClick={() => nav('/items/new?type=runbook')}><PenLine size={16} />Nhập tay một quy trình</button>} />

      {/* Bước 1: tệp mẫu */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)] gap-3">
        <TplCard icon={<FileText size={22} />} color="#1a56db" title="Mẫu Word (.docx)" desc="Mỗi quy trình: dòng “QUY TRÌNH: tên”, bảng thông tin và bảng các bước. Hợp khi soạn tài liệu chuẩn." onClick={() => void getTemplate('docx')} />
        <TplCard icon={<FileSpreadsheet size={22} />} color="#0e7c3a" title="Mẫu CSV / Excel" desc="Mỗi dòng một bước; thông tin chung ghi ở dòng đầu của mỗi quy trình. Hợp khi nhập số lượng lớn." onClick={() => void getTemplate('csv')} />
        <div className="card !p-4 rb-tip">
          <div className="font-bold flex items-center gap-2"><Info size={16} className="text-brand-600" />Thông tin cần có cho mỗi quy trình</div>
          <div className="text-[12.5px] text-muted leading-relaxed">Tên, hệ thống, mức độ, dấu hiệu nhận biết, chuẩn bị trước, các bước (việc cần làm + kết quả mong đợi), cách xác nhận đã khắc phục, liên hệ hỗ trợ. Quy trình có bước nguy hiểm nên có <b>cách hoàn tác</b>.</div>
        </div>
      </div>

      {/* Bước 2: gửi nội dung */}
      <div className="card !p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-bold mr-auto">Gửi nội dung cần nhập</div>
          <div className="rb-seg" role="tablist">
            <button role="tab" aria-selected={mode === 'file'} className={clsx(mode === 'file' && 'on')} onClick={() => setMode('file')}><UploadCloud size={14} />Tệp</button>
            <button role="tab" aria-selected={mode === 'text'} className={clsx(mode === 'text' && 'on')} onClick={() => setMode('text')}><PenLine size={14} />Dán văn bản</button>
          </div>
        </div>
        {mode === 'file' ? (
          <div className={clsx('rb-drop', over && 'over', file && 'has')} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => void onDrop(e)}>
            {file ? (
              <div className="flex items-center gap-3 w-full">
                <span className="rb-file-ic">{/\.(csv|xlsx|tsv)$/i.test(file.name) ? <FileSpreadsheet size={22} /> : <FileText size={22} />}</span>
                <div className="min-w-0 flex-1"><div className="font-bold truncate">{file.name}</div><div className="text-xs text-muted">{(file.size / 1024).toFixed(0)} KB</div></div>
                <button className="btn ghost sm" onClick={() => { setFile(null); setRes(null); setDrafts([]) }} aria-label="Bỏ tệp"><X size={15} /></button>
              </div>
            ) : (
              <button className="rb-drop-btn" onClick={() => void choose()}>
                <UploadCloud size={30} /><b>Kéo tệp vào đây hoặc bấm để chọn</b>
                <small>Tệp mẫu Word, CSV, Excel: đọc ngay, không tốn AI. Tài liệu khác (Word, PDF, ảnh chụp quy trình): AI đọc và tách bước.</small>
              </button>)}
          </div>
        ) : (
          <textarea className="textarea" rows={7} maxLength={50000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Dán quy trình đang có (email, ghi chú, tài liệu…). AI sẽ tách thành từng quy trình, từng bước, và báo chỗ còn thiếu." />
        )}
        <div className="flex gap-2 flex-wrap items-center">
          {mode === 'file'
            ? <><button className="btn" disabled={!file || busy} onClick={() => void read(false)}>{busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}Đọc theo tệp mẫu</button>
              <button className="btn outline" disabled={!file || busy} onClick={() => void read(true)}><Sparkles size={15} />Nhờ AI đọc (tệp tự do)</button></>
            : <button className="btn" disabled={text.trim().length < 20 || busy} onClick={() => void read(true)}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}AI tách quy trình</button>}
          <span className="text-xs text-muted">{busy ? 'Đang đọc… tệp lớn có thể mất 10–40 giây' : 'Chưa lưu gì cho tới khi bạn bấm “Tạo quy trình”.'}</span>
        </div>
      </div>

      {/* Bước 3: xem lại */}
      {(drafts.length > 0 || done) && (
        <div className="card !p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-bold mr-auto flex items-center gap-2">Xem lại {drafts.length} quy trình {res && <Pill sm tone={res.method === 'template' ? 'ok' : 'soft'}>{res.method === 'template' ? 'Đọc theo mẫu · không tốn AI' : <><Bot size={11} />AI đọc · ${res.cost_usd}</>}</Pill>}</div>
            <span className="text-xs text-muted">{ready.length}/{drafts.length} sẵn sàng</span>
            <button className="btn ghost sm" onClick={() => { setDrafts((d) => [...d, emptyDraft()]); setOpen(drafts.length) }}><Plus size={14} />Thêm quy trình</button>
          </div>
          {res?.notes && <div className="text-xs text-muted flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" />{res.notes}</div>}
          {done && done.results.some((r) => r.ok) && (
            <div className="rb-done"><CheckCircle2 size={18} className="shrink-0" /><div className="min-w-0 flex-1"><b>Đã tạo {done.created} quy trình</b> ({submit ? 'đã gửi duyệt' : 'bản nháp'}):
              <div className="flex gap-1.5 flex-wrap mt-1">{done.results.filter((r) => r.ok).map((r) => <button key={r.id} className="cat-chip !py-0.5 !px-2 !text-[12px] max-w-full truncate" onClick={() => nav(`/items/${r.id}`)}>{r.title}<ExternalLink size={11} className="inline ml-1" /></button>)}</div></div></div>)}

          <div className="flex flex-col gap-2">
            {drafts.map((d, i) => {
              const miss = missingOf(d)
              const fail = done?.results.find((r) => !r.ok && r.title === d.title)
              return (
                <div key={i} className={clsx('rb-card', open === i && 'open', miss.length ? 'warn' : 'ok')}>
                  <button className="rb-head" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                    {miss.length ? <AlertTriangle size={17} className="text-amber-600 shrink-0" /> : <CheckCircle2 size={17} className="text-emerald-600 shrink-0" />}
                    <span className="min-w-0 flex-1 text-left"><b className="block truncate">{d.title || 'Quy trình chưa có tên'}</b>
                      <small className="text-muted">{d.steps.length} bước{d.steps.some((s) => s.dangerous) ? ` · ${d.steps.filter((s) => s.dangerous).length} bước nguy hiểm` : ''} · {SEVERITY_TEXT[d.severity_level as keyof typeof SEVERITY_TEXT] || 'chưa rõ mức độ'} · {d.risk_level}{miss.length ? ` · thiếu: ${miss.map((m) => LABEL[m] || m).join(', ')}` : ' · sẵn sàng'}</small></span>
                    <ChevronDown size={17} className={clsx('shrink-0 transition', open === i && 'rotate-180')} />
                  </button>
                  {fail && <div className="rb-fail"><ShieldAlert size={15} className="shrink-0 mt-0.5" /><div>{fail.status === 409 && fail.similar?.length ? <>Đã có mục tên gần giống: {fail.similar.map((s) => `#${s.id} ${s.title}`).join(', ')}. <label className="inline-flex items-center gap-1 font-bold cursor-pointer"><input type="checkbox" checked={!!d.allow_duplicate} onChange={(e) => up(i, { allow_duplicate: e.target.checked })} />Vẫn tạo</label></> : fail.error}</div></div>}
                  {open === i && <DraftEditor d={d} onChange={(p) => up(i, p)} onRemove={() => { setDrafts((ds) => ds.filter((_, j) => j !== i)); setOpen(-1) }} />}
                </div>)
            })}
          </div>

          {drafts.length > 0 && (
            <div className="rb-commit">
              <Field label="Lưu vào mảng"><select className="select" value={space} onChange={(e) => setSpace(Number(e.target.value))}><option value={0} disabled>Chọn mảng…</option>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer self-end pb-2"><input type="checkbox" checked={submit} onChange={(e) => setSubmit(e.target.checked)} />Gửi duyệt luôn</label>
              <div className="ml-auto flex gap-2 items-end">
                {ready.length < drafts.length && ready.length > 0 && <button className="btn outline" disabled={saving} onClick={() => void commit(ready)}>Chỉ tạo {ready.length} quy trình đủ thông tin</button>}
                <button className="btn" disabled={saving || ready.length === 0 || !space} onClick={() => void commit(ready.length === drafts.length ? drafts : ready)}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}Tạo {ready.length === drafts.length ? drafts.length : ready.length} quy trình</button>
              </div>
            </div>)}
        </div>)}
    </div>)
}

function TplCard({ icon, color, title, desc, onClick }: { icon: React.ReactNode; color: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button className="card !p-4 rb-tpl text-left" onClick={onClick} style={{ ['--c' as string]: color }}>
      <span className="ic">{icon}</span>
      <span className="min-w-0 flex-1"><b className="block">{title}</b><small className="block text-muted leading-relaxed mt-0.5">{desc}</small></span>
      <span className="dl"><Download size={15} />Tải mẫu</span>
    </button>)
}

function DraftEditor({ d, onChange, onRemove }: { d: RunbookDraft; onChange: (p: Partial<RunbookDraft>) => void; onRemove: () => void }) {
  const setStep = (i: number, p: Partial<DraftStep>) => onChange({ steps: d.steps.map((s, j) => (j === i ? { ...s, ...p, ...(p.dangerous !== undefined ? { auto_dangerous: false } : {}) } : s)) })
  const move = (i: number, dir: -1 | 1) => { const s = [...d.steps]; const j = i + dir; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; onChange({ steps: s }) }
  const miss = new Set(missingOf(d))
  const cls = (k: string) => clsx('input', miss.has(k) && 'rb-miss')
  return (
    <div className="rb-body">
      {d.notes && d.notes.length > 0 && <div className="rb-notes">{d.notes.map((n) => <div key={n} className="flex gap-1.5"><Sparkles size={13} className="shrink-0 mt-0.5 text-brand-600" />{n}</div>)}</div>}
      <div className="grid md:grid-cols-[2fr_1fr_1fr_1fr] gap-3">
        <Field label="Tên quy trình *"><input className={cls('title')} value={d.title} maxLength={255} onChange={(e) => onChange({ title: e.target.value })} placeholder="Hệ thống: sự cố, VD Máy in: không in được" /></Field>
        <Field label="Hệ thống *"><input className={cls('affected_system')} value={d.affected_system} maxLength={255} onChange={(e) => onChange({ affected_system: e.target.value })} /></Field>
        <Field label="Mức độ *"><select className={clsx('select', miss.has('severity_level') && 'rb-miss')} value={d.severity_level} onChange={(e) => onChange({ severity_level: e.target.value })}><option value="">Chọn…</option>{SEVERITY_LIST.map((s) => <option key={s} value={s}>{SEVERITY_TEXT[s]}</option>)}</select></Field>
        <Field label="Mức rủi ro" hint={d.risk_level === 'R3' ? '2 người duyệt' : '1 người duyệt'}><select className="select" value={d.risk_level} onChange={(e) => onChange({ risk_level: e.target.value })}><option value="R2">R2</option><option value="R3">R3</option></select></Field>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {FIELD_ROWS.map((f) => (
          <Field key={f.k} label={`${f.l}${REQUIRED.includes(f.k) || (f.k === 'rollback' && d.risk_level === 'R3') ? ' *' : ''}`}>
            {f.rows ? <textarea className={clsx('textarea', miss.has(f.k) && 'rb-miss')} rows={f.rows} value={String(d[f.k] || '')} placeholder={f.ph} onChange={(e) => onChange({ [f.k]: e.target.value } as Partial<RunbookDraft>)} />
              : <input className={cls(f.k)} value={String(d[f.k] || '')} placeholder={f.ph} onChange={(e) => onChange({ [f.k]: e.target.value } as Partial<RunbookDraft>)} />}
          </Field>))}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="font-bold text-sm flex items-center gap-2">Các bước xử lý <span className="text-xs text-muted font-normal">Đánh dấu “Nguy hiểm” để người làm phải xác nhận trước khi thực hiện</span></div>
        <div className="rb-steps">
          {d.steps.map((s, i) => (
            <div key={i} className={clsx('rb-step', s.dangerous && 'danger')}>
              <span className="n">{i + 1}</span>
              <textarea className={clsx('textarea', !s.action.trim() && 'rb-miss')} rows={2} value={s.action} placeholder="Việc cần làm" onChange={(e) => setStep(i, { action: e.target.value })} />
              <textarea className={clsx('textarea', !s.expected.trim() && 'rb-miss')} rows={2} value={s.expected} placeholder="Kết quả mong đợi" onChange={(e) => setStep(i, { expected: e.target.value })} />
              <div className="flex flex-col gap-1 items-start">
                <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer"><input type="checkbox" checked={s.dangerous} onChange={(e) => setStep(i, { dangerous: e.target.checked })} />Nguy hiểm</label>
                {s.auto_dangerous && <span className="text-[10.5px] text-amber-700 font-semibold">AI/hệ thống tự đánh dấu</span>}
                <div className="flex gap-0.5">
                  <button className="btn ghost sm icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Lên"><ArrowUp size={13} /></button>
                  <button className="btn ghost sm icon" onClick={() => move(i, 1)} disabled={i === d.steps.length - 1} aria-label="Xuống"><ArrowDown size={13} /></button>
                  <button className="btn ghost sm icon" onClick={() => onChange({ steps: d.steps.filter((_, j) => j !== i) })} aria-label="Xóa bước"><Trash2 size={13} /></button>
                </div>
              </div>
            </div>))}
        </div>
        <div className="flex gap-2"><button className="btn outline sm" onClick={() => onChange({ steps: [...d.steps, { action: '', expected: '', dangerous: false }] })}><Plus size={13} />Thêm bước</button>
          <button className="btn ghost sm ml-auto text-red-700" onClick={onRemove}><Trash2 size={13} />Bỏ quy trình này</button></div>
      </div>
    </div>)
}
