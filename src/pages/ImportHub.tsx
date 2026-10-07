import { ClipboardEvent, DragEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertTriangle, ArrowRight, Bot, CheckCircle2, ClipboardPaste, Copy, ExternalLink, Eye, FileStack, FileText, FileUp, Files, ImagePlus, Layers, Loader2, Lock,
  PencilLine, Plus, RotateCcw, ScanSearch, ShieldAlert, Sparkles, Trash2, UploadCloud, Wand2, X, XCircle,
} from 'lucide-react'
import { ApiError, LocalFile, checkFile, fromBrowserFile, pickLocalFiles, AUDIO_MB, UPLOAD_MB } from '../lib/api'
import { can } from '../lib/permissions'
import { bytes as fmtBytes, FILE_ICON, TYPE_LABEL } from '../lib/format'
import { extOf } from '../lib/preview'
import type { ItemType, PromptVar, Risk, RunbookStep, SmartImportResult, TagKind } from '../lib/types'
import { Conf, CreateOutcome, DraftForm, avgConfidence, blockers, createFromDraft, draftFrom, lowFields, takeImportFiles, toForm } from '../lib/smartImport'
import { Field, PageHeader, Pill, Seg, Stat } from '../components/ui'
import { Md } from '../components/shared'
import { PreviewModal } from '../components/FileViewer'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { toast } from '../store/ui'

const TYPES: ItemType[] = ['document', 'article', 'runbook', 'prompt']
const RISK_HINT: Record<Risk, string> = { R1: 'R1 · tự xuất bản', R2: 'R2 · 1 người duyệt', R3: 'R3 · 2 người duyệt' }
const METHOD: Record<string, string> = { native: 'Đọc trực tiếp', ai_ocr: 'AI đọc chữ', ai_ocr_proofread: 'AI đọc 2 lượt', ai_transcribe: 'AI chép lời ghi âm' }
const STAGES = ['Đang đọc tệp…', 'AI đang phân loại và hiểu nội dung…', 'AI đang điền các trường…', 'Đang kiểm tra trùng với kho…']
const MAX_AI_FILES = 5
const MAX_BULK = 20

// ---------------------------------------------------------------- Huy hiệu độ tin cậy của từng trường
function ConfBadge({ c, touched }: { c: Conf; touched?: boolean }) {
  if (touched) return <span className="inline-flex items-center gap-1 text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-slate-100 text-slate-600"><PencilLine size={10} />Bạn đã sửa</span>
  if (!c) return <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-slate-100 text-slate-500">AI chưa điền</span>
  const lvl = c.score >= 0.85 ? ['bg-green-100 text-green-800', 'Chắc chắn'] : c.score >= 0.6 ? ['bg-amber-100 text-amber-800', 'Khá chắc'] : ['bg-red-100 text-red-700', 'Cần kiểm tra']
  return <span className={clsx('inline-flex items-center gap-1 text-[10.5px] font-bold rounded px-1.5 py-0.5 cursor-help', lvl[0])} title={c.evidence ? `Căn cứ trong nguồn: “${c.evidence}”` : 'AI suy ra, không có đoạn trích trực tiếp'}><Bot size={10} />{lvl[1]} {Math.round(c.score * 100)}%</span>
}
function L({ label, field, f, children, hint, className }: { label: string; field?: string; f: DraftForm; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={clsx('flex flex-col gap-1.5 min-w-0', className)}>
      <span className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-wide text-muted">{label}{field && <ConfBadge c={f.origin.confidence[field]} touched={f.touched.includes(field)} />}</span>
      {children}
      {hint && <span className="text-[11px] text-muted leading-snug">{hint}</span>}
    </label>)
}

// ---------------------------------------------------------------- Danh sách tệp nguồn
function FileList({ files, onRemove, onView }: { files: LocalFile[]; onRemove: (i: number) => void; onView: (f: LocalFile) => void }) {
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
      {files.map((f, i) => (
        <div key={f.name + i} className="flex items-center gap-2.5 border border-line rounded-lg bg-white px-2.5 py-2">
          <span className="text-2xl shrink-0">{FILE_ICON[extOf(f.name)] || '📎'}</span>
          <button className="min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer" onClick={() => onView(f)} title="Xem trước"><div className="text-[13px] font-bold truncate">{f.name}</div><div className="text-[11px] text-muted">{fmtBytes(f.size)}</div></button>
          <button className="btn ghost sm icon" onClick={() => onRemove(i)} aria-label={`Bỏ ${f.name}`}><X size={14} /></button>
        </div>))}
    </div>)
}

// ---------------------------------------------------------------- Trình chỉnh một bản nháp
function DraftEditor({ f, set, onCreate, onDiscard }: { f: DraftForm; set: (p: Partial<DraftForm>, field?: string) => void; onCreate: () => void; onDiscard: () => void }) {
  const nav = useNavigate()
  const { spaces, tags } = useAuth()
  const role = useAuth((s) => s.user?.role)
  const canTag = can(role, 'moderate')
  const [preview, setPreview] = useState(false)
  const [addTag, setAddTag] = useState('')
  const d = f.origin
  const block = blockers(f)
  const low = lowFields(f)
  const busy = f.status === 'saving'
  const steps = f.steps.length ? f.steps : [{ action: '', expected: '', dangerous: false }]
  const vars = f.variables
  const setStep = (i: number, p: Partial<RunbookStep>) => set({ steps: steps.map((s, j) => (j === i ? { ...s, ...p } : s)) }, 'steps')
  const setVar = (i: number, p: Partial<PromptVar>) => set({ variables: vars.map((v, j) => (j === i ? { ...v, ...p } : v)) }, 'variables')
  const tagName = (id: number) => tags.find((t) => t.id === id)

  if (f.status === 'done') return null
  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
      {/* ---- Biểu mẫu ---- */}
      <div className="card !p-5 flex flex-col gap-5 min-w-0">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <div className="text-[11px] font-bold uppercase text-muted mb-1.5 flex items-center gap-2">Loại nội dung<ConfBadge c={d.confidence.type} touched={f.touched.includes('type')} /></div>
            <Seg value={f.type} onChange={(v) => set({ type: v }, 'type')} options={TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
            {d.type_reason && <div className="text-[11px] text-muted mt-1.5">AI chọn {TYPE_LABEL[d.type]}: {d.type_reason}</div>}
          </div>
        </div>

        <L label="Tiêu đề *" field="title" f={f} hint="Dạng “Hệ thống hoặc chủ đề: việc cần làm / triệu chứng” để dễ tìm."><input className="input !h-11 !text-[15px] !font-bold" maxLength={255} value={f.title} onChange={(e) => set({ title: e.target.value }, 'title')} /></L>
        <L label={`Tóm tắt${f.type === 'document' || f.type === 'article' ? ' *' : ''}`} field="summary" f={f}><textarea className="textarea" rows={2} maxLength={2000} value={f.summary} onChange={(e) => set({ summary: e.target.value }, 'summary')} /></L>

        <div className="grid md:grid-cols-2 gap-4">
          <L label="Mảng nội dung *" field="space_id" f={f}><select className="select" value={f.space_id} onChange={(e) => set({ space_id: e.target.value }, 'space_id')}><option value="">— Chọn mảng —</option>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></L>
          <L label="Mức rủi ro" field="risk_level" f={f} hint={d.risk_reason || undefined}><select className="select" value={f.risk_level} onChange={(e) => set({ risk_level: e.target.value as Risk }, 'risk_level')}>{(['R1', 'R2', 'R3'] as Risk[]).map((r) => <option key={r} value={r}>{RISK_HINT[r]}</option>)}</select></L>
          <L label="Độ nhạy cảm" field="sensitivity_level" f={f} hint={d.sensitivity_reason || undefined}><select className="select" value={f.sensitivity_level} onChange={(e) => set({ sensitivity_level: e.target.value as 'internal' | 'restricted' }, 'sensitivity_level')}><option value="internal">Nội bộ</option><option value="restricted">Hạn chế (không gửi AI, ít người xem)</option></select></L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Hiệu lực từ" field="effective_date" f={f}><input type="date" className="input" value={f.effective_date} onChange={(e) => set({ effective_date: e.target.value }, 'effective_date')} /></L>
            <L label="Rà soát lại" field="next_review_date" f={f}><input type="date" className="input" value={f.next_review_date} onChange={(e) => set({ next_review_date: e.target.value }, 'next_review_date')} /></L>
          </div>
        </div>

        <L label="Thẻ" field="tags" f={f}>
          <div className="flex gap-1.5 flex-wrap items-center">
            {f.tagIds.map((id) => { const t = tagName(id); return <span key={id} className={clsx('inline-flex items-center gap-1 text-xs font-bold rounded-md px-2 py-1 border', t?.kind === 'category' ? 'bg-brand-600 text-white border-brand-600' : 'bg-brand-50 text-brand-700 border-brand-200')}>{t?.kind === 'category' ? '' : '#'}{t?.name || id}<button type="button" className="border-0 bg-transparent p-0 cursor-pointer opacity-70 hover:opacity-100 text-inherit" onClick={() => set({ tagIds: f.tagIds.filter((x) => x !== id) }, 'tags')} aria-label="Bỏ thẻ"><X size={11} /></button></span> })}
            {f.newTags.map((t, i) => (
              <span key={'n' + i} className={clsx('inline-flex items-center gap-1 text-xs font-bold rounded-md px-2 py-1 border border-dashed', t.accept ? 'bg-amber-50 text-amber-800 border-amber-400' : 'bg-slate-50 text-slate-400 border-slate-300 line-through')} title={canTag ? 'Thẻ mới AI đề xuất — bấm để chấp nhận/bỏ' : 'Thẻ mới cần kiểm duyệt viên tạo'}>
                <button type="button" disabled={!canTag} className="border-0 bg-transparent p-0 cursor-pointer text-inherit font-bold" onClick={() => set({ newTags: f.newTags.map((x, j) => (j === i ? { ...x, accept: !x.accept } : x)) }, 'tags')}>+ {t.name} <span className="font-normal opacity-70">(mới · {t.kind === 'category' ? 'nhóm' : 'chủ đề'})</span></button>
              </span>))}
            <select className="select !h-8 !w-auto !text-xs" value={addTag} onChange={(e) => { const id = Number(e.target.value); if (id && !f.tagIds.includes(id)) set({ tagIds: [...f.tagIds, id] }, 'tags'); setAddTag('') }}>
              <option value="">+ Thêm thẻ có sẵn</option>{tags.filter((t) => !f.tagIds.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.kind === 'category' ? '▣ ' : '#'}{t.name}</option>)}
            </select>
          </div>
          {f.newTags.length > 0 && !canTag && <span className="text-[11px] text-amber-700">Thẻ mới chỉ kiểm duyệt viên/quản trị tạo được — mục sẽ được tạo với các thẻ có sẵn.</span>}
        </L>

        {f.type === 'runbook' && (
          <div className="flex flex-col gap-3 border-t border-line-soft pt-4">
            <div className="font-extrabold text-sm flex items-center gap-2">Thông tin xử lý sự cố<ConfBadge c={d.confidence.steps} touched={f.touched.includes('steps')} /></div>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Dấu hiệu nhận biết"><textarea className="textarea" rows={2} value={f.symptom} onChange={(e) => set({ symptom: e.target.value })} /></Field>
              <Field label="Hệ thống ảnh hưởng"><input className="input" value={f.affected_system} onChange={(e) => set({ affected_system: e.target.value })} /></Field>
              <Field label="Mức nghiêm trọng"><select className="select" value={f.severity_level} onChange={(e) => set({ severity_level: e.target.value })}><option value="">—</option><option value="low">Thấp</option><option value="medium">Trung bình</option><option value="high">Cao</option><option value="critical">Nghiêm trọng</option></select></Field>
              <Field label="Liên hệ"><input className="input" value={f.contact_info} onChange={(e) => set({ contact_info: e.target.value })} /></Field>
              <Field label="Cần chuẩn bị" className="md:col-span-2"><textarea className="textarea" rows={2} value={f.prerequisites} onChange={(e) => set({ prerequisites: e.target.value })} /></Field>
            </div>
            <div className="flex flex-col gap-2">
              {steps.map((s, i) => (
                <div key={i} className={clsx('grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-start border rounded-lg p-2', s.dangerous ? 'border-red-200 bg-red-50/50' : 'border-line')}>
                  <span className="w-7 h-7 rounded-md bg-brand-100 text-brand-700 font-black text-xs grid place-items-center mt-1">{i + 1}</span>
                  <textarea className="textarea !min-h-[54px]" rows={2} placeholder="Việc cần làm" value={s.action} onChange={(e) => setStep(i, { action: e.target.value })} />
                  <textarea className="textarea !min-h-[54px]" rows={2} placeholder="Làm đúng thì thấy…" value={s.expected} onChange={(e) => setStep(i, { expected: e.target.value })} />
                  <div className="flex flex-col gap-1"><label className="check text-[11px]"><input type="checkbox" checked={!!s.dangerous} onChange={(e) => setStep(i, { dangerous: e.target.checked })} />Nguy hiểm</label>
                    <button type="button" className="btn ghost sm icon" onClick={() => set({ steps: steps.filter((_, j) => j !== i) }, 'steps')} aria-label="Xóa bước"><Trash2 size={13} /></button></div>
                </div>))}
              <button type="button" className="btn outline sm w-fit" onClick={() => set({ steps: [...steps, { action: '', expected: '', dangerous: false }] }, 'steps')}><Plus size={13} />Thêm bước</button>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Kiểm tra sau khi làm"><textarea className="textarea" rows={2} value={f.verification} onChange={(e) => set({ verification: e.target.value })} /></Field>
              <Field label="Hoàn tác nếu làm sai"><textarea className="textarea" rows={2} value={f.rollback} onChange={(e) => set({ rollback: e.target.value })} /></Field>
            </div>
          </div>)}

        {f.type === 'prompt' && (
          <div className="flex flex-col gap-3 border-t border-line-soft pt-4">
            <div className="font-extrabold text-sm flex items-center gap-2">Thông tin prompt<ConfBadge c={d.confidence.variables} touched={f.touched.includes('variables')} /></div>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Mục đích"><textarea className="textarea" rows={2} value={f.purpose} onChange={(e) => set({ purpose: e.target.value })} /></Field>
              <Field label="Mô hình đã thử"><input className="input" value={f.model_used} onChange={(e) => set({ model_used: e.target.value })} /></Field>
            </div>
            {vars.map((v, i) => (
              <div key={i} className="grid grid-cols-[150px_110px_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center">
                <input className="input font-mono" placeholder="ten_bien" value={v.name} onChange={(e) => setVar(i, { name: e.target.value })} />
                <select className="select" value={v.type || 'string'} onChange={(e) => setVar(i, { type: e.target.value as PromptVar['type'] })}><option value="string">Chuỗi</option><option value="text">Đoạn dài</option><option value="number">Số</option><option value="boolean">Có/không</option></select>
                <input className="input" placeholder="Mô tả" value={v.description || ''} onChange={(e) => setVar(i, { description: e.target.value })} />
                <input className="input" placeholder="Ví dụ" value={v.example || ''} onChange={(e) => setVar(i, { example: e.target.value })} />
                <button type="button" className="btn ghost sm icon" onClick={() => set({ variables: vars.filter((_, j) => j !== i) }, 'variables')} aria-label="Xóa biến"><Trash2 size={13} /></button>
              </div>))}
            <button type="button" className="btn outline sm w-fit" onClick={() => set({ variables: [...vars, { name: '', type: 'string', description: '', example: '' }] }, 'variables')}><Plus size={13} />Thêm biến</button>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Hướng dẫn dùng"><textarea className="textarea" rows={2} value={f.usage_guide} onChange={(e) => set({ usage_guide: e.target.value })} /></Field>
              <Field label="Giới hạn"><textarea className="textarea" rows={2} value={f.limitations} onChange={(e) => set({ limitations: e.target.value })} /></Field>
              <Field label="Ví dụ đầu vào"><textarea className="textarea" rows={2} value={f.example_input} onChange={(e) => set({ example_input: e.target.value })} /></Field>
              <Field label="Ví dụ đầu ra"><textarea className="textarea" rows={2} value={f.example_output} onChange={(e) => set({ example_output: e.target.value })} /></Field>
            </div>
          </div>)}

        <L label="Nội dung (Markdown)" field="content" f={f}>
          <div className="flex justify-end -mt-1 mb-1"><Seg sm value={preview ? 'view' : 'edit'} onChange={(v) => setPreview(v === 'view')} options={[{ value: 'edit', label: 'Sửa' }, { value: 'view', label: 'Xem trước' }]} /></div>
          {preview ? <div className="border border-line rounded-lg p-4 bg-white max-h-[480px] overflow-auto"><Md>{f.content || '_(trống)_'}</Md></div>
            : <textarea className="textarea font-mono text-[12.5px]" rows={14} maxLength={200000} value={f.content} onChange={(e) => set({ content: e.target.value }, 'content')} />}
        </L>
      </div>

      {/* ---- Bảng kiểm tra trước khi tạo ---- */}
      <div className="flex flex-col gap-3 xl:sticky xl:top-2">
        <div className="card !p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between"><div className="font-extrabold">Sẵn sàng tạo mục</div><Pill sm tone={block.length ? 'warn' : 'ok'}>{block.length ? `${block.length} việc cần làm` : 'Đủ điều kiện'}</Pill></div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="kv"><span className="k">Tin cậy TB</span><span className="v">{Math.round(avgConfidence(d) * 100)}%</span></div>
            <div className="kv"><span className="k">Trường yếu</span><span className={clsx('v', low.length && 'text-red-600')}>{low.length}</span></div>
            <div className="kv"><span className="k">Đã sửa</span><span className="v">{f.touched.length}</span></div>
          </div>
          {block.length > 0 && <ul className="m-0 pl-4 text-[12.5px] text-amber-900 flex flex-col gap-1">{block.map((b) => <li key={b}>{b}</li>)}</ul>}
          {low.length > 0 && <div className="text-[12px] text-red-700">Nên kiểm tra kỹ: {low.join(', ')}</div>}
          {d.secret_warning && <label className="check text-[12.5px] text-red-800 bg-red-50 border border-red-200 rounded-md p-2"><input type="checkbox" checked={f.confirmMasked} onChange={(e) => set({ confirmMasked: e.target.checked })} />Nội dung có thể chứa mật khẩu/khóa. Tôi đã che hoặc xác nhận an toàn.</label>}
          <div className="flex flex-col gap-1.5 text-[12.5px] border-t border-line-soft pt-2.5">
            {f.sourceFiles.length > 0 && <label className="check"><input type="checkbox" checked={f.attachSources} onChange={(e) => set({ attachSources: e.target.checked })} />Đính kèm {f.sourceFiles.length} tệp gốc làm bằng chứng nguồn</label>}
            <label className="check"><input type="checkbox" checked={f.submitAfter} onChange={(e) => set({ submitAfter: e.target.checked })} />Gửi duyệt ngay sau khi tạo{f.risk_level === 'R1' ? ' (R1 sẽ tự xuất bản)' : ''}</label>
          </div>
          {f.error && <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-[12.5px] p-2 flex gap-1.5"><XCircle size={14} className="shrink-0 mt-0.5" />{f.error}</div>}
          <div className="flex gap-2">
            <button className="btn flex-1" disabled={busy || block.length > 0} onClick={onCreate}>{busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}Tạo mục</button>
            <button className="btn outline" disabled={busy} onClick={onDiscard} title="Bỏ bản nháp này"><Trash2 size={15} /></button>
          </div>
        </div>

        {d.similar.length > 0 && (
          <div className={clsx('card !p-4 flex flex-col gap-2.5', !f.ackSimilar && '!border-amber-300')}>
            <div className="font-extrabold flex items-center gap-2"><Copy size={16} className="text-amber-600" />Có thể đã có ({d.similar.length})</div>
            {d.similar.map((s) => (
              <button key={s.id} className="text-left border border-line rounded-md p-2.5 bg-white hover:bg-brand-50 cursor-pointer" onClick={() => window.open(`#/items/${s.id}`, '_blank')}>
                <div className="flex items-start gap-2"><b className="flex-1 text-[13px] leading-snug">{s.title}</b><ExternalLink size={12} className="text-muted shrink-0 mt-0.5" /></div>
                <div className="text-[11px] text-muted mt-0.5">#{s.id} · {s.reason === 'title' ? 'Tiêu đề tương tự' : 'Nội dung gần nghĩa'} · {Math.round(s.score * 100)}%{s.tier_label ? ` · ${s.tier_label}` : ''}{s.status ? ` · ${s.status}` : ''}</div>
                {s.excerpt && <div className="text-[11.5px] text-ink-2 mt-1 line-clamp-2">{s.excerpt}</div>}
              </button>))}
            <label className="check text-[12.5px]"><input type="checkbox" checked={f.ackSimilar} onChange={(e) => set({ ackSimilar: e.target.checked })} />Đã xem, đây là nội dung mới — vẫn tạo</label>
            <div className="text-[11px] text-muted">Nếu là bản cập nhật của mục cũ, hãy mở mục đó và sửa thay vì tạo mới.</div>
          </div>)}

        {(d.uncertain.length > 0 || d.missing.length > 0) && (
          <div className="card !p-4 flex flex-col gap-2 text-[12.5px]">
            {d.uncertain.length > 0 && <div><div className="font-extrabold mb-1 flex items-center gap-1.5"><ScanSearch size={14} className="text-red-600" />AI chưa chắc</div><ul className="m-0 pl-4 flex flex-col gap-0.5">{d.uncertain.map((u, i) => <li key={i}>{u}</li>)}</ul></div>}
            {d.missing.length > 0 && <div><div className="font-extrabold mb-1 flex items-center gap-1.5"><AlertTriangle size={14} className="text-amber-600" />Nguồn còn thiếu</div><ul className="m-0 pl-4 flex flex-col gap-0.5">{d.missing.map((u, i) => <li key={i}>{u}</li>)}</ul></div>}
          </div>)}
        <div className="text-[11px] text-muted px-1">Mục được tạo ở trạng thái <b>nháp</b>, ghi chú phiên bản ghi rõ “Nhập bằng AI”. <button className="text-brand-700 underline bg-transparent border-0 p-0 cursor-pointer text-[11px]" onClick={() => nav('/items/new')}>Nhập thủ công</button></div>
      </div>
    </div>)
}

// ---------------------------------------------------------------- Nhập hàng loạt: mỗi tệp thành một bản nháp
interface BulkRow { key: string; file: LocalFile; state: 'wait' | 'ai' | 'creating' | 'done' | 'review' | 'error'; note?: string; itemId?: number; form?: DraftForm; result?: SmartImportResult }
function BulkImport({ onReview }: { onReview: (r: SmartImportResult, files: LocalFile[]) => void }) {
  const nav = useNavigate()
  const { spaces, tags, loadCatalog } = useAuth()
  const role = useAuth((s) => s.user?.role)
  const canTag = can(role, 'moderate')
  const [rows, setRows] = useState<BulkRow[]>([])
  const [space, setSpace] = useState('')
  const [type, setType] = useState('')
  const [auto, setAuto] = useState(true)
  const [running, setRunning] = useState(false)
  const stop = useRef(false)
  const patch = (key: string, p: Partial<BulkRow>) => setRows((x) => x.map((r) => (r.key === key ? { ...r, ...p } : r)))
  function add(list: LocalFile[]) {
    const ok = list.filter((f) => { const b = checkFile(f); if (b) toast.warn(`${f.name}: ${b}`); return !b })
    setRows((x) => [...x, ...ok.map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, state: 'wait' as const }))].slice(0, MAX_BULK))
  }
  async function run() {
    if (!space) return toast.warn('Chọn mảng mặc định cho các mục')
    setRunning(true); stop.current = false
    for (const r of rows.filter((x) => x.state === 'wait' || x.state === 'error')) {
      if (stop.current) break
      patch(r.key, { state: 'ai', note: undefined })
      try {
        const res = await draftFrom({ files: [r.file] }, { type, space_id: space, allow_split: false })
        const d = res.drafts[0]
        const form = toForm(d, [r.file], canTag)
        if (!form.space_id) form.space_id = space
        const strongDup = d.similar.some((s) => s.score >= 0.8)
        if (!strongDup) form.ackSimilar = true
        const block = blockers(form)
        if (!auto || block.length || d.secret_warning) { patch(r.key, { state: 'review', form, result: res, note: !auto ? 'Chờ bạn xem lại' : strongDup ? 'Có thể trùng mục đã có' : d.secret_warning ? 'Có thể chứa bí mật' : block[0] }); continue }
        patch(r.key, { state: 'creating', form, result: res })
        const out = await createFromDraft(form, tags, canTag)
        patch(r.key, { state: 'done', itemId: out.id, note: `${TYPE_LABEL[form.type]} · ${form.title}${out.attachErrors.length ? ' · lỗi đính kèm' : ''}` })
      } catch (e) {
        const er = e as ApiError
        patch(r.key, { state: er.status === 409 ? 'review' : 'error', note: er.status === 429 ? 'Hết hạn mức AI — thử lại sau' : er.full || String(e) })
        if (er.status === 429 || er.status === 503) break
      }
    }
    setRunning(false); void loadCatalog()
  }
  const done = rows.filter((r) => r.state === 'done').length
  const review = rows.filter((r) => r.state === 'review').length
  const STATE: Record<BulkRow['state'], [string, 'ok' | 'warn' | 'bad' | 'gray' | 'soft']> = { wait: ['Chờ', 'gray'], ai: ['AI đang đọc', 'soft'], creating: ['Đang tạo', 'soft'], done: ['Đã tạo nháp', 'ok'], review: ['Cần xem lại', 'warn'], error: ['Lỗi', 'bad'] }
  return (
    <div className="flex flex-col gap-4">
      <div className="card !p-4 grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <Field label="Mảng mặc định *" hint="Dùng khi AI không chọn được mảng phù hợp"><select className="select" value={space} onChange={(e) => setSpace(e.target.value)}><option value="">— Chọn mảng —</option>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Loại nội dung"><select className="select" value={type} onChange={(e) => setType(e.target.value)}><option value="">AI tự nhận diện từng tệp</option>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></Field>
        <label className="check text-sm pb-2.5" title="Tự tạo mục nháp khi đủ điều kiện, không trùng mạnh, không có bí mật. Còn lại chờ bạn xem lại."><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Tự tạo nháp khi đủ điều kiện</label>
      </div>
      <Drop onFiles={add} disabled={running} label={`Kéo thả tối đa ${MAX_BULK} tệp — mỗi tệp thành một bản nháp`} />
      {rows.length > 0 && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Pill tone="ok">{done} đã tạo</Pill><Pill tone="warn">{review} cần xem lại</Pill><Pill tone="gray">{rows.length} tệp</Pill>
            <div className="ml-auto flex gap-2">
              {running ? <button className="btn outline" onClick={() => { stop.current = true }}><XCircle size={15} />Dừng sau tệp này</button>
                : <><button className="btn outline" onClick={() => setRows([])}><Trash2 size={15} />Xóa danh sách</button><button className="btn" disabled={!rows.some((r) => r.state === 'wait' || r.state === 'error')} onClick={() => void run()}><Sparkles size={15} />AI xử lý {rows.filter((r) => r.state === 'wait' || r.state === 'error').length} tệp</button></>}
            </div>
          </div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Tệp</th><th>Trạng thái</th><th>Kết quả</th><th /></tr></thead><tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="max-w-[260px]"><div className="font-bold truncate">{FILE_ICON[extOf(r.file.name)] || '📎'} {r.file.name}</div><div className="text-[11px] text-muted">{fmtBytes(r.file.size)}</div></td>
                <td><Pill sm tone={STATE[r.state][1]}>{(r.state === 'ai' || r.state === 'creating') && <Loader2 size={11} className="animate-spin" />}{STATE[r.state][0]}</Pill></td>
                <td className="text-[12.5px] max-w-[360px]">{r.note || (r.form ? `${TYPE_LABEL[r.form.type]} · ${r.form.title}` : '—')}</td>
                <td className="num"><div className="flex gap-1 justify-end">
                  {r.itemId && <button className="btn outline sm" onClick={() => nav(`/items/${r.itemId}`)}><ExternalLink size={13} />Mở</button>}
                  {r.state === 'review' && r.result && <button className="btn sm" onClick={() => onReview(r.result!, [r.file])}><Eye size={13} />Xem lại</button>}
                  {!running && r.state !== 'done' && <button className="btn ghost sm icon" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} aria-label="Bỏ"><X size={13} /></button>}
                </div></td>
              </tr>))}
          </tbody></table></div>
        </>)}
    </div>)
}

// ---------------------------------------------------------------- Vùng thả tệp
function Drop({ onFiles, disabled, label, small }: { onFiles: (f: LocalFile[]) => void; disabled?: boolean; label: string; small?: boolean }) {
  const [over, setOver] = useState(false)
  async function onDrop(e: DragEvent) { e.preventDefault(); setOver(false); if (disabled) return; onFiles(await Promise.all(Array.from(e.dataTransfer.files).map(fromBrowserFile))) }
  async function pick(images = false) { try { onFiles(await pickLocalFiles(images)) } catch (e) { toast.error(e) } }
  return (
    <div className={clsx('rounded-[10px] border-2 border-dashed transition flex flex-col items-center justify-center text-center gap-2', small ? 'p-4' : 'p-8', over ? 'border-brand-500 bg-brand-50' : 'border-brand-200 bg-brand-50/40', disabled && 'opacity-60')}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <UploadCloud size={small ? 26 : 36} className="text-brand-500" />
      <div className="font-bold">{label}</div>
      <div className="text-xs text-muted">PDF, Word, Excel, PowerPoint, ảnh chụp, văn bản (tối đa {UPLOAD_MB} MB/tệp) · ghi âm cuộc họp mp3, m4a, wav… ({AUDIO_MB} MB) · dán ảnh bằng Ctrl+V</div>
      <div className="flex gap-2 mt-1"><button className="btn sm" disabled={disabled} onClick={() => void pick()}><FileUp size={14} />Chọn tệp</button><button className="btn outline sm" disabled={disabled} onClick={() => void pick(true)}><ImagePlus size={14} />Chọn ảnh</button></div>
    </div>)
}

// ====================================================================
//  Trang Nhập tri thức
// ====================================================================
export default function ImportHub() {
  const nav = useNavigate()
  const { spaces, tags, loadCatalog } = useAuth()
  const role = useAuth((s) => s.user?.role)
  const canTag = can(role, 'moderate')
  const status = useChat((s) => s.status)
  const aiOn = !status || (status.ready !== false && status.features.includes('smart_import'))
  const [mode, setMode] = useState<'ai' | 'bulk'>('ai')
  const [src, setSrc] = useState<'files' | 'text'>('files')
  const [files, setFiles] = useState<LocalFile[]>([])
  const [text, setText] = useState('')
  const [hType, setHType] = useState('')
  const [hSpace, setHSpace] = useState('')
  const [split, setSplit] = useState(true)
  const [instr, setInstr] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(0)
  const [secs, setSecs] = useState(0)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<SmartImportResult | null>(null)
  const [forms, setForms] = useState<DraftForm[]>([])
  const [active, setActive] = useState('')
  const [view, setView] = useState<LocalFile | null>(null)
  const [created, setCreated] = useState<{ form: DraftForm; out: CreateOutcome }[]>([])
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => { void useChat.getState().loadStatus(); const q = takeImportFiles(); if (q?.length) { setFiles(q.slice(0, MAX_AI_FILES)); if (q.length > MAX_AI_FILES) { setMode('bulk') } } }, [])
  useEffect(() => { if (!busy) return; setSecs(0); setStage(0); const t = setInterval(() => setSecs((s) => s + 1), 1000); const s = setInterval(() => setStage((x) => Math.min(STAGES.length - 1, x + 1)), 6000); return () => { clearInterval(t); clearInterval(s) } }, [busy])
  useEffect(() => { const h = (e: globalThis.ClipboardEvent) => { if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT') return; void onPaste(e) }; document.addEventListener('paste', h); return () => document.removeEventListener('paste', h) }, []) // eslint-disable-line

  function addFiles(list: LocalFile[]) {
    const ok = list.filter((f) => { const b = checkFile(f); if (b) toast.warn(`${f.name}: ${b}`); return !b })
    setFiles((cur) => { const all = [...cur, ...ok]; if (all.length > MAX_AI_FILES) toast.warn(`AI đọc tối đa ${MAX_AI_FILES} tệp một lần — dùng “Nhập hàng loạt” cho nhiều tệp.`); return all.slice(0, MAX_AI_FILES) })
    setSrc('files')
  }
  async function onPaste(e: ClipboardEvent | globalThis.ClipboardEvent) {
    const list = Array.from(e.clipboardData?.files || []); if (!list.length) return
    e.preventDefault(); addFiles(await Promise.all(list.map((f, i) => fromBrowserFile(new File([f], f.name && f.name !== 'image.png' ? f.name : `anh-chup-${Date.now()}-${i}.png`, { type: f.type })))))
  }
  function loadResult(r: SmartImportResult, srcFiles: LocalFile[]) {
    const fs = r.drafts.map((d) => toForm(d, srcFiles, canTag))
    setRes(r); setForms(fs); setActive(fs[0]?.key || ''); setCreated([]); setMode('ai')
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }
  async function analyze() {
    setErr(''); setBusy(true)
    try {
      const r = await draftFrom(src === 'files' ? { files } : { text }, { type: hType, space_id: hSpace, instructions: instr, allow_split: split })
      loadResult(r, src === 'files' ? files : [])
      toast.ok(`AI đã soạn ${r.drafts.length} bản nháp — hãy xem lại trước khi tạo`)
    } catch (e) {
      const er = e as ApiError
      setErr(er.status === 429 ? 'Đã hết hạn mức AI (theo phút, ngày hoặc ngân sách tháng). Thử lại sau.' : er.status === 503 ? 'AI chưa bật hoặc tính năng nhập thông minh (smart_import) đang tắt.' : er.status === 403 ? 'Vai trò của bạn không được nhập tri thức.' : er.status === 413 ? 'Quá nhiều tệp hoặc tệp quá lớn.' : er.full || String(e))
    } finally { setBusy(false) }
  }
  const setForm = (key: string) => (p: Partial<DraftForm>, field?: string) => setForms((x) => x.map((f) => (f.key === key ? { ...f, ...p, touched: field && !f.touched.includes(field) ? [...f.touched, field] : f.touched, error: undefined } : f)))
  async function create(f: DraftForm) {
    setForm(f.key)({ status: 'saving' })
    try {
      const out = await createFromDraft(f, tags, canTag)
      setForms((x) => x.map((y) => (y.key === f.key ? { ...y, status: 'done', createdId: out.id } : y)))
      setCreated((c) => [...c, { form: f, out }])
      if (out.tagsCreated.length) void loadCatalog()
      toast.ok(`Đã tạo mục #${out.id}${out.submitted ? ' và gửi duyệt' : ''}`)
      const next = forms.find((y) => y.key !== f.key && y.status === 'edit'); if (next) setActive(next.key)
    } catch (e) {
      const er = e as ApiError
      const msg = er.status === 409 ? 'Máy chủ báo đã có mục tiêu đề tương tự trong mảng này. Xem mục “Có thể đã có”, đổi tiêu đề hoặc xác nhận vẫn tạo.' : er.status === 422 ? `Dữ liệu chưa hợp lệ: ${er.full}` : er.full || String(e)
      setForms((x) => x.map((y) => (y.key === f.key ? { ...y, status: 'edit', error: msg, ackSimilar: er.status === 409 ? false : y.ackSimilar } : y)))
    }
  }
  const remaining = forms.filter((f) => f.status === 'edit' || f.status === 'saving' || f.status === 'error')
  const cur = forms.find((f) => f.key === active)
  const canAnalyze = !busy && aiOn && (src === 'files' ? files.length > 0 : text.trim().length >= 20)
  const totalLow = useMemo(() => forms.reduce((a, f) => a + lowFields(f).length, 0), [forms])

  const methods: { k: 'ai' | 'manual' | 'bulk'; icon: ReactNode; t: string; d: string; tag?: string }[] = [
    { k: 'ai', icon: <Wand2 size={22} />, t: 'AI đọc và tự điền', d: 'Đưa tệp hoặc dán văn bản. AI phân loại, điền mọi trường, gắn thẻ, kiểm tra trùng. Bạn xem lại rồi tạo.', tag: 'Nên dùng' },
    { k: 'bulk', icon: <FileStack size={22} />, t: 'Nhập hàng loạt', d: `Tối đa ${MAX_BULK} tệp, mỗi tệp thành một bản nháp; tự tạo khi đủ điều kiện, còn lại chờ bạn xem lại.` },
    { k: 'manual', icon: <PencilLine size={22} />, t: 'Nhập thủ công', d: 'Tự điền biểu mẫu từ đầu (có AI gợi ý tóm tắt, thẻ, rủi ro trong biểu mẫu).' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Nhập tri thức" subtitle="Đưa tri thức mới vào kho nhanh và chuẩn: AI đọc tài liệu, điền sẵn toàn bộ trường kèm độ tin cậy, phát hiện trùng; bạn chỉ cần xem lại và xác nhận."
        actions={<><button className="btn outline" onClick={() => nav('/import')}><Files size={15} />Nhập từ CSV/JSON</button><button className="btn outline" onClick={() => nav('/items?status=draft')}><Layers size={15} />Bản nháp hiện có</button></>} />

      <div className="grid md:grid-cols-3 gap-3">
        {methods.map((m) => (
          <button key={m.k} className={clsx('text-left rounded-[10px] border p-4 flex gap-3 items-start cursor-pointer transition', (m.k === mode) ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-line bg-white hover:border-brand-300')}
            onClick={() => (m.k === 'manual' ? nav('/items/new') : setMode(m.k))}>
            <span className={clsx('w-11 h-11 rounded-lg grid place-items-center shrink-0', m.k === mode ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white' : 'bg-brand-50 text-brand-600')}>{m.icon}</span>
            <span className="min-w-0"><span className="flex items-center gap-2 font-extrabold">{m.t}{m.tag && <Pill sm tone="ok">{m.tag}</Pill>}{m.k === 'manual' && <ArrowRight size={14} className="text-muted" />}</span><span className="block text-xs text-muted mt-1 leading-relaxed">{m.d}</span></span>
          </button>))}
      </div>

      {!aiOn && <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 p-3 text-sm flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />AI chưa bật hoặc tính năng nhập thông minh (<code>ai_feature_smart_import</code>) đang tắt — vẫn nhập thủ công hoặc CSV được.</div>}

      {/* Giữ danh sách hàng loạt khi chuyển sang xem lại một bản nháp */}
      <div className={mode === 'bulk' ? '' : 'hidden'}><BulkImport onReview={(r, fs) => loadResult(r, fs)} /></div>
      {mode === 'bulk' ? null : (
        <div className="card !p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-extrabold text-[15px] flex items-center gap-2"><span className="w-6 h-6 rounded-md bg-brand-600 text-white text-xs grid place-items-center">1</span>Nguồn tri thức</div>
            <Seg sm value={src} onChange={setSrc} options={[{ value: 'files', label: `Tệp (${files.length}/${MAX_AI_FILES})` }, { value: 'text', label: 'Dán văn bản' }]} />
          </div>
          {src === 'files' ? (
            <div className="flex flex-col gap-3">
              <Drop onFiles={addFiles} disabled={busy || files.length >= MAX_AI_FILES} small={files.length > 0} label={files.length ? 'Thả thêm tệp' : 'Kéo thả tệp vào đây (tối đa 5)'} />
              {files.length > 0 && <FileList files={files} onRemove={(i) => setFiles((x) => x.filter((_, j) => j !== i))} onView={setView} />}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <textarea className="textarea" rows={9} maxLength={100000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Dán nội dung email, biên bản họp, tin nhắn, ghi chú, nội dung copy từ trang khác… (tối thiểu 20 ký tự)" />
              <div className="flex justify-between text-[11px] text-muted"><span className="flex items-center gap-1"><ClipboardPaste size={12} />Văn bản có mật khẩu, khóa hay dữ liệu cá nhân sẽ bị từ chối trước khi gửi AI.</span><span>{text.length.toLocaleString('vi-VN')}/100.000</span></div>
            </div>)}

          <div className="font-extrabold text-[15px] flex items-center gap-2 mt-1"><span className="w-6 h-6 rounded-md bg-brand-600 text-white text-xs grid place-items-center">2</span>Gợi ý cho AI <span className="text-xs font-normal text-muted">(không bắt buộc)</span></div>
          <div className="grid md:grid-cols-4 gap-3 items-end">
            <Field label="Loại nội dung"><select className="select" value={hType} onChange={(e) => setHType(e.target.value)}><option value="">AI tự nhận diện</option>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></Field>
            <Field label="Mảng ưu tiên"><select className="select" value={hSpace} onChange={(e) => setHSpace(e.target.value)}><option value="">AI tự chọn</option>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Dặn thêm AI" className="md:col-span-2"><input className="input" maxLength={src === 'files' ? 300 : 500} value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Ví dụ: chỉ lấy phần quy trình, bỏ phụ lục" /></Field>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="check text-sm" title="Nếu tài liệu chứa nhiều chủ đề độc lập, AI tách thành nhiều bản nháp (tối đa 5)"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />Tách thành nhiều bản nháp khi có nhiều chủ đề</label>
            <span className="text-xs text-muted flex items-center gap-1"><Lock size={12} />Nguồn chỉ dùng để soạn nháp, chưa lưu vào kho cho đến khi bạn bấm Tạo mục.</span>
            <button className="btn ml-auto !h-11 !px-5" disabled={!canAnalyze} onClick={() => void analyze()}>{busy ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}{busy ? 'AI đang xử lý…' : 'AI đọc và soạn bản nháp'}</button>
          </div>
          {busy && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-3.5 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-brand-800"><Loader2 size={15} className="animate-spin" />{STAGES[stage]} <span className="font-normal text-muted ml-auto">{secs}s</span></div>
              <div className="progress"><i style={{ width: `${Math.min(95, 8 + secs * 3)}%` }} /></div>
              <div className="text-[11px] text-muted">Thường mất 15–40 giây; ảnh và PDF quét lâu hơn vì AI phải đọc chữ.</div>
            </div>)}
          {err && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 p-3 text-sm flex gap-2"><XCircle size={16} className="shrink-0 mt-0.5" />{err}</div>}
        </div>)}

      {res && (
        <div ref={resultRef} className="flex flex-col gap-3">
          <div className="card !p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 font-extrabold text-[15px]"><span className="w-6 h-6 rounded-md bg-brand-600 text-white text-xs grid place-items-center">3</span>Xem lại và tạo mục</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="Bản nháp" value={forms.length} hint={res.split_reason ? 'AI đã tách chủ đề' : undefined} />
              <Stat label="Đã tạo" value={created.length} />
              <Stat label="Trường cần kiểm tra" value={totalLow} hintTone={totalLow ? 'down' : undefined} hint={totalLow ? 'độ tin cậy < 60%' : 'đều khá chắc'} />
              <Stat label="Tệp đã đọc" value={res.files.length} hint={res.skipped.length ? `${res.skipped.length} tệp bỏ qua` : undefined} hintTone={res.skipped.length ? 'down' : undefined} />
              <Stat label="Chi phí AI" value={`$${res.cost_usd.toFixed(3)}`} hint={res.model} />
            </div>
            {res.split_reason && <div className="text-[12.5px] text-ink-2 bg-brand-50 border border-brand-200 rounded-md px-3 py-2"><b>Lý do tách:</b> {res.split_reason}</div>}
            {(res.files.length > 0 || res.skipped.length > 0) && (
              <div className="flex gap-1.5 flex-wrap text-[11.5px]">
                {res.files.map((f) => <span key={f.filename} className="inline-flex items-center gap-1 border border-line rounded-md px-2 py-1 bg-white"><FileText size={12} />{f.filename} · {METHOD[f.method] || f.method}{f.pages ? ` · ${f.pages} trang` : ''}{f.uncertain ? <span className="text-amber-700"> · {f.uncertain} chỗ chưa chắc</span> : null}</span>)}
                {res.skipped.map((s, i) => <span key={i} className="inline-flex items-center gap-1 border border-red-200 rounded-md px-2 py-1 bg-red-50 text-red-800"><ShieldAlert size={12} />{s.filename}: {s.reason}</span>)}
              </div>)}
          </div>

          {created.length > 0 && (
            <div className="card !p-4 flex flex-col gap-2">
              <div className="font-extrabold flex items-center gap-2 text-green-800"><CheckCircle2 size={17} />Đã tạo {created.length} mục</div>
              {created.map(({ form, out }) => (
                <div key={out.id} className="flex items-center gap-3 flex-wrap text-sm border-t border-line-soft pt-2">
                  <b className="flex-1 min-w-[200px]">#{out.id} · {form.title}</b>
                  <span className="text-xs text-muted">{TYPE_LABEL[form.type]}{out.attached ? ` · đính kèm ${out.attached} tệp` : ''}{out.tagsCreated.length ? ` · tạo thẻ ${out.tagsCreated.join(', ')}` : ''}{out.submitted ? ' · đã gửi duyệt' : ' · nháp'}</span>
                  {(out.attachErrors.length > 0 || out.submitError) && <span className="text-xs text-red-700">{[...out.attachErrors, out.submitError].filter(Boolean).join('; ')}</span>}
                  <button className="btn outline sm" onClick={() => nav(`/items/${out.id}`)}><ExternalLink size={13} />Mở</button>
                </div>))}
              {remaining.length === 0 && <div className="flex gap-2 mt-1"><button className="btn sm" onClick={() => { setRes(null); setForms([]); setFiles([]); setText(''); setCreated([]); window.scrollTo({ top: 0 }) }}><RotateCcw size={13} />Nhập tri thức khác</button></div>}
            </div>)}

          {forms.filter((f) => f.status !== 'discarded' && f.status !== 'done').length > 1 && (
            <div className="flex gap-2 flex-wrap">{forms.filter((f) => f.status !== 'discarded').map((f, i) => (
              <button key={f.key} className={clsx('cat-chip !py-1.5 !px-3', active === f.key && 'on')} onClick={() => setActive(f.key)} disabled={f.status === 'done'}>
                {f.status === 'done' ? <CheckCircle2 size={13} /> : blockers(f).length ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} className="opacity-40" />}Bản nháp {i + 1}: {f.title.slice(0, 40) || '(chưa có tiêu đề)'}</button>))}</div>)}

          {cur && cur.status !== 'done' && cur.status !== 'discarded' && (
            <DraftEditor key={cur.key} f={cur} set={setForm(cur.key)} onCreate={() => void create(cur)} onDiscard={() => { setForms((x) => x.map((y) => (y.key === cur.key ? { ...y, status: 'discarded' } : y))); const next = forms.find((y) => y.key !== cur.key && y.status === 'edit'); setActive(next?.key || '') }} />)}
        </div>)}
      {view?.bytes && <PreviewModal src={{ type: 'local', name: view.name, bytes: view.bytes }} onClose={() => setView(null)} />}
    </div>)
}
