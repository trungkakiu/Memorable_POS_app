import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Copy, Eye, FileText, Plus, Save, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { ApiError, get, post, put } from '../lib/api'
import { RISK_LABEL, SENS_LABEL, SEVERITY_LABEL, TYPE_LABEL, todayStr } from '../lib/format'
import type { Attachment, ItemDetail, ItemType, PromptVar, RunbookStep, Template } from '../lib/types'
import type { LocalFile } from '../lib/api'
import { AttachmentGrid, PendingFiles, Uploader, uploadPending } from '../components/Attachments'
import { Field, Modal, PageHeader, Pill } from '../components/ui'
import { ErrorBox, Loading, Md, Section, TagPicker, useBusy } from '../components/shared'
import { useAuth } from '../store/auth'
import { toast } from '../store/ui'

interface Form {
  type: ItemType; space_id: number | ''; title: string; summary: string; content: string
  risk_level: 'R1' | 'R2' | 'R3'; sensitivity_level: 'internal' | 'restricted'; effective_date: string; next_review_date: string
  tags: number[]; change_note: string
  purpose: string; model_used: string; variables: PromptVar[]; version_label: '' | 'draft' | 'approved' | 'deprecated'
  usage_guide: string; example_input: string; example_output: string; limitations: string
  symptom: string; affected_system: string; severity_level: '' | 'low' | 'medium' | 'high' | 'critical'; prerequisites: string
  steps: RunbookStep[]; verification: string; rollback: string; contact_info: string
  confirm_masked: boolean; allow_duplicate: boolean; minor_edit: boolean
}
const blank = (): Form => ({
  type: 'article', space_id: '', title: '', summary: '', content: '', risk_level: 'R2', sensitivity_level: 'internal',
  effective_date: todayStr(), next_review_date: '', tags: [], change_note: '', purpose: '', model_used: '', variables: [], version_label: '',
  usage_guide: '', example_input: '', example_output: '', limitations: '', symptom: '', affected_system: '', severity_level: '', prerequisites: '',
  steps: [{ action: '', expected: '', dangerous: false }], verification: '', rollback: '', contact_info: '',
  confirm_masked: false, allow_duplicate: false, minor_edit: false,
})
const arr = <T,>(v: unknown): T[] => { if (Array.isArray(v)) return v as T[]; if (typeof v === 'string') { try { const x = JSON.parse(v); return Array.isArray(x) ? x : [] } catch { return [] } } return [] }
const s = (v: unknown) => (v == null ? '' : String(v))

function fromDetail(d: ItemDetail): Form {
  const x = (d.detail || {}) as Record<string, unknown>
  const b = blank()
  return {
    ...b, type: d.type, space_id: d.space?.id ?? '', title: d.title, summary: s(d.summary), content: s(d.content),
    risk_level: d.risk_level, sensitivity_level: d.sensitivity_level, effective_date: s(d.effective_date).slice(0, 10),
    next_review_date: s(d.next_review_date).slice(0, 10), tags: (d.tags || []).map((t) => t.id),
    purpose: s(x.purpose), model_used: s(x.model_used), variables: arr<PromptVar>(x.variables), version_label: (s(x.version_label) as Form['version_label']),
    usage_guide: s(x.usage_guide), example_input: s(x.example_input), example_output: s(x.example_output), limitations: s(x.limitations),
    symptom: s(x.symptom), affected_system: s(x.affected_system), severity_level: s(x.severity_level) as Form['severity_level'], prerequisites: s(x.prerequisites),
    steps: arr<RunbookStep>(x.steps).length ? arr<RunbookStep>(x.steps).map((st) => ({ action: s(st.action), expected: s(st.expected), dangerous: !!st.dangerous })) : b.steps,
    verification: s(x.verification), rollback: s(x.rollback), contact_info: s(x.contact_info),
  }
}

function buildBody(f: Form, edit: boolean) {
  const o: Record<string, unknown> = {
    title: f.title.trim(), summary: f.summary.trim() || undefined, content: f.content || undefined, risk_level: f.risk_level,
    sensitivity_level: f.sensitivity_level, effective_date: f.effective_date || undefined, next_review_date: f.next_review_date || undefined,
    tags: f.tags, change_note: f.change_note.trim() || undefined, confirm_masked: f.confirm_masked || undefined,
  }
  if (f.type === 'prompt') {
    Object.assign(o, {
      purpose: f.purpose || undefined, model_used: f.model_used || undefined, version_label: f.version_label || undefined,
      usage_guide: f.usage_guide || undefined, example_input: f.example_input || undefined, example_output: f.example_output || undefined, limitations: f.limitations || undefined,
      variables: f.variables.filter((v) => v.name.trim()).map((v) => ({ name: v.name.trim(), type: v.type || 'string', description: v.description || undefined, example: v.example || undefined })),
    })
  }
  if (f.type === 'runbook') {
    Object.assign(o, {
      symptom: f.symptom || undefined, affected_system: f.affected_system || undefined, severity_level: f.severity_level || undefined,
      prerequisites: f.prerequisites || undefined, verification: f.verification || undefined, rollback: f.rollback || undefined, contact_info: f.contact_info || undefined,
      steps: f.steps.filter((st) => st.action.trim() && st.expected.trim()).map((st) => ({ action: st.action.trim(), expected: st.expected.trim(), dangerous: !!st.dangerous })),
    })
  }
  if (edit) { if (f.minor_edit) o.minor_edit = true } else { o.type = f.type; o.space_id = Number(f.space_id); if (f.allow_duplicate) o.allow_duplicate = true }
  return o
}

function validate(f: Form, edit: boolean) {
  const e: string[] = []
  if (f.title.trim().length < 3) e.push('Tiêu đề tối thiểu 3 ký tự')
  if (!edit && !f.space_id) e.push('Chọn mảng nội dung')
  if ((f.type === 'document' || f.type === 'article') && !f.summary.trim()) e.push('Tài liệu/bài viết bắt buộc có tóm tắt')
  if (f.type === 'article' && f.content.trim().length < 50) e.push('Bài viết cần nội dung tối thiểu 50 ký tự')
  if ((f.type === 'prompt' || f.type === 'runbook') && f.risk_level === 'R1') e.push('Prompt và runbook chỉ được mức rủi ro R2 hoặc R3')
  if (f.type === 'prompt' && edit && !f.change_note.trim()) e.push('Sửa prompt bắt buộc có ghi chú thay đổi')
  if (f.type === 'runbook') {
    if (!f.steps.some((st) => st.action.trim() && st.expected.trim())) e.push('Runbook cần ít nhất một bước (hành động + kết quả mong đợi)')
    if (f.risk_level !== 'R1' && !f.verification.trim()) e.push('Runbook R2/R3 bắt buộc có cách xác minh')
    if (f.risk_level === 'R3' && !f.rollback.trim()) e.push('Runbook R3 bắt buộc có cách hoàn tác')
  }
  return e
}

export default function ItemForm() {
  const { id } = useParams()
  const edit = !!id
  const nav = useNavigate()
  const { spaces, tags } = useAuth()
  const [f, setF] = useState<Form>(blank())
  const [loading, setLoading] = useState(edit)
  const [err, setErr] = useState<ApiError | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [preview, setPreview] = useState(false)
  const [sugg, setSugg] = useState<any>(null)
  const [dups, setDups] = useState<any>(null)
  const { busy, run } = useBusy()
  const [formErr, setFormErr] = useState<string[]>([])
  const [serverHint, setServerHint] = useState('')
  const [pending, setPending] = useState<LocalFile[]>([])
  const [atts, setAtts] = useState<Attachment[]>([])
  const reloadAtts = () => get<Attachment[]>(`/items/${id}/attachments`).then(setAtts).catch(() => undefined)

  const up = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))
  useEffect(() => { get<Template[]>('/templates').then(setTemplates).catch(() => undefined) }, [])
  useEffect(() => {
    if (!id) return
    get<ItemDetail>(`/items/${id}`).then((d) => { setF(fromDetail(d)); setAtts(d.attachments || []) }).catch((e) => setErr(e)).finally(() => setLoading(false))
  }, [id])
  useEffect(() => { if (!edit && !f.space_id && spaces[0]) up('space_id', spaces[0].id) }, [spaces]) // eslint-disable-line
  useEffect(() => { if ((f.type === 'prompt' || f.type === 'runbook') && f.risk_level === 'R1') up('risk_level', 'R2') }, [f.type]) // eslint-disable-line

  const aiPayload = useMemo(() => ({ ...(edit ? { item_id: Number(id) } : {}), type: f.type, title: f.title || undefined, summary: f.summary || undefined, content: f.content || undefined }), [f.type, f.title, f.summary, f.content, id, edit])

  async function saveWithHints() {
    const errs = validate(f, edit); setFormErr(errs); setServerHint('')
    if (errs.length) return toast.warn(errs[0])
    try {
      const body = buildBody(f, edit)
      const r = edit ? await put<{ id: number }>(`/items/${id}`, body) : await post<{ id: number; warnings?: string[] }>('/items', body)
      toast.ok(edit ? 'Đã lưu — tạo phiên bản mới' : 'Đã tạo mục (trạng thái nháp)')
      if (!edit && pending.length) {
        const u = await uploadPending((r as { id: number }).id, pending, f.confirm_masked)
        if (u.ok) toast.ok(`Đã tải lên ${u.ok} tệp đính kèm`)
        if (u.errors.length) toast.warn(`Một số tệp chưa tải được — thêm lại ở tab Tệp: ${u.errors.join(' · ')}`)
      }
      const w = (r as { warnings?: string[] }).warnings
      if (w?.length) toast.warn(w.join(' · '))
      nav(`/items/${edit ? id : r.id}`)
    } catch (e) {
      const m = e instanceof ApiError ? e.full : (e as Error).message
      setServerHint(m); toast.error(m)
    }
  }

  async function askSuggest() { const r = await run(() => post('/ai/suggest', aiPayload)); if (r) setSugg(r) }
  async function askDups() { const r = await run(() => post('/ai/duplicates', aiPayload)); if (r) setDups(r) }
  function applySuggest() {
    if (!sugg) return
    setF((p) => ({
      ...p, summary: sugg.summary || p.summary, risk_level: ((p.type === 'prompt' || p.type === 'runbook') && sugg.risk_level === 'R1' ? 'R2' : sugg.risk_level) || p.risk_level,
      title: sugg.title_suggestion || p.title, tags: Array.from(new Set([...p.tags, ...(sugg.tags || []).map((t: { id: number }) => t.id)])),
    }))
    setSugg(null); toast.ok('Đã áp dụng gợi ý — hãy kiểm tra lại trước khi lưu')
  }

  if (loading) return <Loading />
  if (err) return <ErrorBox error={err} />
  const T = f.type

  return (
    <div className="flex flex-col gap-5 max-w-[1200px]">
      <PageHeader title={edit ? `Sửa mục #${id}` : 'Tạo mục mới'} subtitle={edit ? 'Mỗi lần lưu tạo một phiên bản mới; mục đã duyệt sẽ quay lại luồng duyệt' : 'Mục mới ở trạng thái nháp; vào chi tiết để gửi duyệt'}
        actions={<>
          <button className="btn outline" onClick={() => nav(-1)}>Hủy</button>
          <button className="btn" disabled={busy} onClick={saveWithHints}><Save size={16} />{edit ? 'Lưu thay đổi' : 'Tạo mục'}</button>
        </>} />
      {(formErr.length > 0 || serverHint) && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 p-4 text-sm">
          {formErr.length > 0 && <ul className="m-0 pl-5">{formErr.map((x) => <li key={x}>{x}</li>)}</ul>}
          {serverHint && <div><b>Máy chủ từ chối:</b> {serverHint}<div className="mt-1 text-red-700/80">Nếu cảnh báo liên quan <b>bí mật</b> hoặc <b>trùng tiêu đề</b>, bật tùy chọn tương ứng ở khung “Tùy chọn nâng cao” bên dưới rồi lưu lại.</div></div>}
        </div>
      )}

      <Section title="Thông tin chung">
        <div className="grid md:grid-cols-4 gap-4">
          <Field label="Loại nội dung" className="md:col-span-1">
            <select className="select" value={f.type} disabled={edit} onChange={(e) => up('type', e.target.value as ItemType)}>
              {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Mảng (space)" className="md:col-span-1">
            <select className="select" value={f.space_id} disabled={edit} onChange={(e) => up('space_id', Number(e.target.value))}>
              <option value="">— Chọn —</option>{spaces.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}</select></Field>
          <Field label="Mức rủi ro" hint="Quyết định số người duyệt"><select className="select" value={f.risk_level} onChange={(e) => up('risk_level', e.target.value as Form['risk_level'])}>
            {Object.entries(RISK_LABEL).map(([v, l]) => <option key={v} value={v} disabled={v === 'R1' && (T === 'prompt' || T === 'runbook')}>{l}</option>)}</select></Field>
          <Field label="Độ nhạy cảm" hint="Hạn chế = không gửi cho AI"><select className="select" value={f.sensitivity_level} onChange={(e) => up('sensitivity_level', e.target.value as Form['sensitivity_level'])}>
            {Object.entries(SENS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Tiêu đề *" className="md:col-span-4" hint="Nên theo quy ước “Hệ thống hoặc chủ đề: việc cần làm hoặc triệu chứng”">
            <input className="input" value={f.title} maxLength={255} onChange={(e) => up('title', e.target.value)} placeholder="Cổng thanh toán: lỗi timeout khi gọi bên thứ ba" /></Field>
          <Field label={`Tóm tắt${T === 'document' || T === 'article' ? ' *' : ''}`} className="md:col-span-4" hint="1–3 câu, hiện trong kết quả tìm kiếm">
            <textarea className="textarea" rows={2} maxLength={2000} value={f.summary} onChange={(e) => up('summary', e.target.value)} /></Field>
          <Field label="Ngày hiệu lực"><input type="date" className="input" value={f.effective_date} onChange={(e) => up('effective_date', e.target.value)} /></Field>
          <Field label="Hạn rà soát tiếp theo" hint="Bỏ trống = mặc định theo loại"><input type="date" className="input" value={f.next_review_date} onChange={(e) => up('next_review_date', e.target.value)} /></Field>
          <Field label={edit ? `Ghi chú thay đổi${T === 'prompt' ? ' *' : ''}` : 'Ghi chú phiên bản'} className="md:col-span-2">
            <input className="input" maxLength={1000} value={f.change_note} onChange={(e) => up('change_note', e.target.value)} placeholder="Đã sửa gì và vì sao" /></Field>
        </div>
        <div className="mt-4"><Field label="Thẻ (tối đa 20)"><TagPicker all={tags} value={f.tags} onChange={(v) => up('tags', v)} /></Field></div>
      </Section>

      <Section title={T === 'prompt' ? 'Nội dung câu lệnh (dùng {{ten_bien}})' : 'Nội dung (Markdown)'}
        right={<div className="flex gap-2 flex-wrap">
          {templates.length > 0 && (
            <select className="select !w-auto !py-1.5" value="" onChange={(e) => { const t = templates.find((x) => x.id === Number(e.target.value)); if (t) up('content', (f.content ? f.content + '\n\n' : '') + (t.content || '')) }}>
              <option value="">Chèn mẫu…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>)}
          <button className="btn outline sm" onClick={() => setPreview(!preview)}>{preview ? <FileText size={14} /> : <Eye size={14} />}{preview ? 'Soạn thảo' : 'Xem trước'}</button>
        </div>}>
        {preview ? <div className="min-h-[260px] border-[1.5px] border-line rounded-lg p-4"><Md>{f.content || '*Chưa có nội dung*'}</Md></div>
          : <textarea className="textarea font-mono text-[13px]" rows={14} maxLength={200000} value={f.content} onChange={(e) => up('content', e.target.value)} placeholder="## Triệu chứng&#10;..." />}
        <div className="text-xs text-muted mt-1 text-right">{f.content.length.toLocaleString('vi-VN')} / 200.000 ký tự</div>
      </Section>

      {T === 'prompt' && (
        <Section title="Chi tiết prompt">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Mục đích — làm gì, cho ai dùng"><textarea className="textarea" rows={2} value={f.purpose} onChange={(e) => up('purpose', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Mô hình AI đã thử"><input className="input" value={f.model_used} onChange={(e) => up('model_used', e.target.value)} placeholder="gpt-5.4" /></Field>
              <Field label="Nhãn phiên bản"><select className="select" value={f.version_label} onChange={(e) => up('version_label', e.target.value as Form['version_label'])}>
                <option value="">(tự động)</option><option value="draft">draft</option><option value="approved">approved</option><option value="deprecated">deprecated</option></select></Field>
            </div>
            <Field label="Hướng dẫn cách dùng"><textarea className="textarea" rows={3} value={f.usage_guide} onChange={(e) => up('usage_guide', e.target.value)} /></Field>
            <Field label="Giới hạn đã biết"><textarea className="textarea" rows={3} value={f.limitations} onChange={(e) => up('limitations', e.target.value)} /></Field>
            <Field label="Ví dụ đầu vào tốt"><textarea className="textarea" rows={3} value={f.example_input} onChange={(e) => up('example_input', e.target.value)} /></Field>
            <Field label="Ví dụ đầu ra tương ứng"><textarea className="textarea" rows={3} value={f.example_output} onChange={(e) => up('example_output', e.target.value)} /></Field>
          </div>
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2"><div className="text-xs font-bold uppercase text-muted">Biến của prompt (tên phải khớp {'{{...}}'})</div>
              <div className="flex gap-2">
                <button className="btn outline sm" onClick={() => {
                  const names = Array.from(new Set(Array.from(f.content.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)).map((m) => m[1])))
                  const have = new Set(f.variables.map((v) => v.name)); const add = names.filter((n) => !have.has(n))
                  if (!add.length) return toast.info('Không có biến mới trong nội dung')
                  up('variables', [...f.variables, ...add.map((name) => ({ name, type: 'string' as const }))])
                }}><Wand2 size={13} />Dò biến từ nội dung</button>
                <button className="btn outline sm" onClick={() => up('variables', [...f.variables, { name: '', type: 'string' }])}><Plus size={13} />Thêm biến</button></div></div>
            <div className="flex flex-col gap-2">
              {f.variables.map((v, i) => (
                <div key={i} className="grid grid-cols-[1.2fr_.8fr_2fr_1.6fr_auto] gap-2 items-center">
                  <input className="input" placeholder="ten_bien" value={v.name} pattern="[a-zA-Z_][a-zA-Z0-9_]*" onChange={(e) => up('variables', f.variables.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <select className="select" value={v.type || 'string'} onChange={(e) => up('variables', f.variables.map((x, j) => (j === i ? { ...x, type: e.target.value as PromptVar['type'] } : x)))}>
                    <option value="string">string</option><option value="text">text</option><option value="number">number</option><option value="boolean">boolean</option></select>
                  <input className="input" placeholder="Mô tả" value={v.description || ''} onChange={(e) => up('variables', f.variables.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                  <input className="input" placeholder="Ví dụ" value={v.example || ''} onChange={(e) => up('variables', f.variables.map((x, j) => (j === i ? { ...x, example: e.target.value } : x)))} />
                  <button className="btn ghost icon" onClick={() => up('variables', f.variables.filter((_, j) => j !== i))} aria-label="Xóa biến"><Trash2 size={16} /></button>
                </div>))}
              {f.variables.length === 0 && <div className="text-muted text-sm">Chưa có biến.</div>}
            </div>
          </div>
        </Section>
      )}

      {T === 'runbook' && (
        <Section title="Chi tiết runbook">
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Hệ thống bị ảnh hưởng"><input className="input" value={f.affected_system} onChange={(e) => up('affected_system', e.target.value)} /></Field>
            <Field label="Mức độ nghiêm trọng"><select className="select" value={f.severity_level} onChange={(e) => up('severity_level', e.target.value as Form['severity_level'])}>
              <option value="">—</option>{Object.entries(SEVERITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Liên hệ leo thang"><input className="input" value={f.contact_info} onChange={(e) => up('contact_info', e.target.value)} /></Field>
            <Field label="Triệu chứng & thông báo lỗi điển hình" className="md:col-span-3"><textarea className="textarea" rows={2} value={f.symptom} onChange={(e) => up('symptom', e.target.value)} /></Field>
            <Field label="Điều kiện tiên quyết" className="md:col-span-3"><textarea className="textarea" rows={2} value={f.prerequisites} onChange={(e) => up('prerequisites', e.target.value)} /></Field>
          </div>
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2"><div className="text-xs font-bold uppercase text-muted">Các bước xử lý (theo thứ tự)</div>
              <button className="btn outline sm" onClick={() => up('steps', [...f.steps, { action: '', expected: '', dangerous: false }])}><Plus size={13} />Thêm bước</button></div>
            <div className="flex flex-col gap-2">
              {f.steps.map((st, i) => (
                <div key={i} className="grid grid-cols-[34px_2fr_2fr_auto_auto] gap-2 items-center">
                  <span className="w-8 h-8 rounded-md bg-brand-100 text-brand-700 font-black grid place-items-center">{i + 1}</span>
                  <input className="input" placeholder="Làm gì" value={st.action} onChange={(e) => up('steps', f.steps.map((x, j) => (j === i ? { ...x, action: e.target.value } : x)))} />
                  <input className="input" placeholder="Kết quả mong đợi" value={st.expected} onChange={(e) => up('steps', f.steps.map((x, j) => (j === i ? { ...x, expected: e.target.value } : x)))} />
                  <label className="check text-xs"><input type="checkbox" checked={!!st.dangerous} onChange={(e) => up('steps', f.steps.map((x, j) => (j === i ? { ...x, dangerous: e.target.checked } : x)))} />Nguy hiểm</label>
                  <button className="btn ghost icon" disabled={f.steps.length <= 1} onClick={() => up('steps', f.steps.filter((_, j) => j !== i))} aria-label="Xóa bước"><Trash2 size={16} /></button>
                </div>))}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-5">
            <Field label={`Cách xác minh đã khỏi${f.risk_level !== 'R1' ? ' *' : ''}`}><textarea className="textarea" rows={3} value={f.verification} onChange={(e) => up('verification', e.target.value)} /></Field>
            <Field label={`Cách hoàn tác nếu làm sai${f.risk_level === 'R3' ? ' *' : ''}`}><textarea className="textarea" rows={3} value={f.rollback} onChange={(e) => up('rollback', e.target.value)} /></Field>
          </div>
        </Section>
      )}

      <Section title={edit ? `Tệp & ảnh đính kèm (${atts.length})` : 'Tệp & ảnh đính kèm'}
        right={<span className="text-xs text-muted">Tối đa 10 MB/tệp · AI chỉ đọc txt, md, csv</span>}>
        {edit ? (
          <div className="flex flex-col gap-4">
            <Uploader itemId={Number(id)} compact onUploaded={reloadAtts} />
            <AttachmentGrid atts={atts} canWrite onChange={reloadAtts} onInsert={(md) => { up('content', (f.content ? f.content.trimEnd() + '\n\n' : '') + md + '\n'); toast.ok('Đã chèn ảnh vào cuối nội dung — nhớ bấm Lưu') }} />
          </div>
        ) : <PendingFiles files={pending} onChange={setPending} />}
      </Section>

      <Section title="Trợ lý AI & tùy chọn nâng cao">
        <div className="flex gap-3 flex-wrap mb-4">
          <button className="btn outline" disabled={busy} onClick={askSuggest}><Sparkles size={15} />Gợi ý tóm tắt · thẻ · rủi ro</button>
          <button className="btn outline" disabled={busy} onClick={askDups}><Copy size={15} />Phát hiện trùng / mâu thuẫn</button>
          <span className="text-xs text-muted self-center">AI chỉ gợi ý nháp; mục “Hạn chế” không bao giờ được gửi cho AI.</span>
        </div>
        <div className="flex gap-6 flex-wrap">
          <label className="check"><input type="checkbox" checked={f.confirm_masked} onChange={(e) => up('confirm_masked', e.target.checked)} />Tôi đã che giá trị nhạy cảm (confirm_masked)</label>
          {!edit && <label className="check"><input type="checkbox" checked={f.allow_duplicate} onChange={(e) => up('allow_duplicate', e.target.checked)} />Vẫn tạo dù có tiêu đề tương tự (allow_duplicate)</label>}
          {edit && <label className="check"><input type="checkbox" checked={f.minor_edit} onChange={(e) => up('minor_edit', e.target.checked)} />Sửa nhỏ (minor_edit)</label>}
        </div>
      </Section>

      {sugg && (
        <Modal title="Gợi ý từ AI" size="md" onClose={() => setSugg(null)} footer={<><button className="btn outline" onClick={() => setSugg(null)}>Bỏ qua</button><button className="btn" onClick={applySuggest}>Áp dụng</button></>}>
          <div className="flex flex-col gap-3 text-sm">
            <div><b>Tóm tắt:</b> {sugg.summary}</div>
            <div className="flex items-center gap-2"><b>Mức rủi ro:</b> <Pill tone="warn" sm>{sugg.risk_level}</Pill><span className="text-muted">{sugg.risk_reason}</span></div>
            {sugg.title_suggestion && <div><b>Tiêu đề gợi ý:</b> {sugg.title_suggestion}</div>}
            <div className="flex gap-1 flex-wrap"><b>Thẻ:</b>{(sugg.tags || []).length ? sugg.tags.map((t: { id: number; name: string }) => <Pill key={t.id} tone="soft" sm>#{t.name}</Pill>) : ' (không có)'}</div>
            {sugg.missing_info?.length > 0 && <div><b>Còn thiếu:</b><ul className="m-0 pl-5">{sugg.missing_info.map((m: string) => <li key={m}>{m}</li>)}</ul></div>}
            <div className="text-xs text-muted">{sugg.note} · {sugg.model} · ${sugg.cost_usd}</div>
          </div>
        </Modal>)}
      {dups && (
        <Modal title="Kiểm tra trùng lặp / mâu thuẫn" size="md" onClose={() => setDups(null)} footer={<button className="btn" onClick={() => setDups(null)}>Đóng</button>}>
          {dups.findings?.length ? (
            <div className="flex flex-col gap-3">{dups.findings.map((x: any) => (
              <div key={x.item_id} className="p-3 rounded-lg border border-line">
                <div className="flex items-center gap-2"><Pill sm tone={x.relation === 'contradicts' ? 'bad' : 'warn'}>{x.relation === 'contradicts' ? 'Mâu thuẫn' : x.relation === 'duplicate' ? 'Trùng' : x.relation}</Pill>
                  <a className="font-bold cursor-pointer text-brand-700" onClick={() => window.open(`#/items/${x.item_id}`, '_blank')}>#{x.item_id} {x.title}</a></div>
                <div className="text-sm mt-1">{x.reason}</div></div>))}</div>
          ) : <div className="text-center py-6 font-semibold text-green-700">Không phát hiện mục trùng hoặc mâu thuẫn (đã so sánh {dups.compared}).</div>}
          <div className="text-xs text-muted mt-3">{dups.note}</div>
        </Modal>)}
    </div>
  )
}
