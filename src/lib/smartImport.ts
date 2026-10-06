// Nhập tri thức thông minh: chuyển bản nháp AI (POST /ai/draft-item) thành mục thật sau khi người dùng xem lại.
import { ApiError, LocalFile, get, post, postFiles, uploadAttachments } from './api'
import type { ItemType, PromptVar, Risk, RunbookStep, SmartDraft, SmartImportResult, Tag, TagKind } from './types'

export type Conf = { score: number; evidence: string } | undefined
export interface DraftForm {
  key: string; origin: SmartDraft; sourceFiles: LocalFile[]
  type: ItemType; title: string; summary: string; content: string; space_id: string
  tagIds: number[]; newTags: { name: string; kind: TagKind; accept: boolean }[]
  risk_level: Risk; sensitivity_level: 'internal' | 'restricted'; effective_date: string; next_review_date: string
  symptom: string; affected_system: string; severity_level: string; prerequisites: string; steps: RunbookStep[]; verification: string; rollback: string; contact_info: string
  purpose: string; model_used: string; variables: PromptVar[]; usage_guide: string; example_input: string; example_output: string; limitations: string
  touched: string[]; ackSimilar: boolean; confirmMasked: boolean; attachSources: boolean; submitAfter: boolean
  status: 'edit' | 'saving' | 'done' | 'error' | 'discarded'; createdId?: number; error?: string
}

let seq = 1
/** Bản nháp AI -> biểu mẫu chỉnh sửa (gắn kèm đúng tệp nguồn của bản nháp). */
export function toForm(d: SmartDraft, files: LocalFile[], canTag: boolean): DraftForm {
  const rb = d.runbook; const pr = d.prompt
  return {
    key: `d${seq++}`, origin: d, sourceFiles: (d.source_files.length ? d.source_files.map((i) => files[i - 1]).filter(Boolean) : []),
    type: d.type, title: d.title, summary: d.summary, content: d.content, space_id: d.space_id ? String(d.space_id) : '',
    tagIds: d.tags.map((t) => t.id), newTags: d.new_tags.map((t) => ({ ...t, accept: canTag })),
    risk_level: d.risk_level, sensitivity_level: d.sensitivity_level, effective_date: d.effective_date || '', next_review_date: d.next_review_date || '',
    symptom: rb?.symptom || '', affected_system: rb?.affected_system || '', severity_level: rb?.severity_level || '', prerequisites: rb?.prerequisites || '',
    steps: rb?.steps?.length ? rb.steps : [], verification: rb?.verification || '', rollback: rb?.rollback || '', contact_info: rb?.contact_info || '',
    purpose: pr?.purpose || '', model_used: pr?.model_used || '', variables: pr?.variables || [], usage_guide: pr?.usage_guide || '',
    example_input: pr?.example_input || '', example_output: pr?.example_output || '', limitations: pr?.limitations || '',
    touched: [], ackSimilar: d.similar.length === 0, confirmMasked: false, attachSources: true, submitAfter: false, status: 'edit',
  }
}

/** Các điều kiện chặn tạo mục (cùng quy tắc với máy chủ và trang tạo mục thủ công). */
export function blockers(f: DraftForm): string[] {
  const e: string[] = []
  if (f.title.trim().length < 3) e.push('Tiêu đề tối thiểu 3 ký tự')
  if (!f.space_id) e.push('Chọn mảng nội dung')
  if ((f.type === 'document' || f.type === 'article') && !f.summary.trim()) e.push('Tài liệu/bài viết bắt buộc có tóm tắt')
  if (f.type === 'article' && f.content.trim().length < 50) e.push('Bài viết cần nội dung tối thiểu 50 ký tự')
  if ((f.type === 'prompt' || f.type === 'runbook') && f.risk_level === 'R1') e.push('Prompt và runbook chỉ được mức rủi ro R2 hoặc R3')
  if (f.type === 'runbook' && !f.steps.some((s) => s.action.trim() && s.expected.trim())) e.push('Runbook cần ít nhất một bước có kết quả mong đợi')
  if (f.type === 'prompt' && f.variables.some((v) => v.name.trim() && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v.name.trim()))) e.push('Tên biến prompt chỉ gồm chữ không dấu, số, gạch dưới')
  if (f.effective_date && f.next_review_date && f.next_review_date <= f.effective_date) e.push('Ngày rà soát phải sau ngày hiệu lực')
  if (!f.ackSimilar) e.push('Xem các mục tương tự và xác nhận vẫn tạo mới')
  if (f.origin.secret_warning && !f.confirmMasked) e.push('Nội dung có thể chứa bí mật: che đi hoặc xác nhận đã che')
  return e
}

/** Điểm tin cậy trung bình của các trường AI đã điền (0..1). */
export const avgConfidence = (d: SmartDraft) => { const v = Object.values(d.confidence).map((c) => c.score); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 }
export const lowFields = (f: DraftForm) => Object.entries(f.origin.confidence).filter(([k, c]) => c.score < 0.6 && !f.touched.includes(k)).map(([k]) => k)

export function buildItemBody(f: DraftForm, tagIds: number[], allowDuplicate: boolean) {
  const files = f.sourceFiles.map((x) => x.name)
  const o: Record<string, unknown> = {
    type: f.type, title: f.title.trim(), space_id: Number(f.space_id), summary: f.summary.trim() || undefined, content: f.content || undefined,
    risk_level: f.risk_level, sensitivity_level: f.sensitivity_level, effective_date: f.effective_date || undefined, next_review_date: f.next_review_date || undefined,
    tags: tagIds, confirm_masked: f.confirmMasked || undefined, allow_duplicate: allowDuplicate || undefined,
    change_note: `Nhập bằng AI${files.length ? ` từ ${files.join(', ')}` : ' từ văn bản dán vào'}; người tạo đã xem lại${f.touched.length ? ` và sửa ${f.touched.length} trường` : ''}.`.slice(0, 1000),
  }
  if (f.type === 'runbook') Object.assign(o, {
    symptom: f.symptom || undefined, affected_system: f.affected_system || undefined, severity_level: f.severity_level || undefined, prerequisites: f.prerequisites || undefined,
    verification: f.verification || undefined, rollback: f.rollback || undefined, contact_info: f.contact_info || undefined,
    steps: f.steps.filter((s) => s.action.trim() && s.expected.trim()).map((s) => ({ action: s.action.trim(), expected: s.expected.trim(), dangerous: !!s.dangerous })),
  })
  if (f.type === 'prompt') Object.assign(o, {
    purpose: f.purpose || undefined, model_used: f.model_used || undefined, usage_guide: f.usage_guide || undefined, example_input: f.example_input || undefined,
    example_output: f.example_output || undefined, limitations: f.limitations || undefined,
    variables: f.variables.filter((v) => v.name.trim()).map((v) => ({ name: v.name.trim(), type: v.type || 'string', description: v.description || undefined, example: v.example || undefined })),
  })
  return o
}

export interface CreateOutcome { id: number; tagsCreated: string[]; attached: number; attachErrors: string[]; submitted: boolean; submitError?: string }
/** Tạo mục từ bản nháp: (1) tạo thẻ mới đã chấp nhận, (2) tạo mục, (3) đính kèm tệp gốc, (4) gửi duyệt nếu chọn. */
export async function createFromDraft(f: DraftForm, catalog: Tag[], canTag: boolean): Promise<CreateOutcome> {
  const tagIds = [...f.tagIds]; const tagsCreated: string[] = []
  if (canTag) for (const nt of f.newTags.filter((t) => t.accept)) {
    const existing = catalog.find((t) => t.name.trim().toLowerCase() === nt.name.trim().toLowerCase())
    if (existing) { tagIds.push(existing.id); continue }
    try { const t = await post<{ id: number }>('/tags', { name: nt.name.trim(), kind: nt.kind }); tagIds.push(t.id); tagsCreated.push(nt.name) }
    catch (e) {
      if (e instanceof ApiError && e.status === 409) { try { const all = await get<Tag[]>('/tags', { q: nt.name }); const m = all.find((t) => t.name.toLowerCase() === nt.name.toLowerCase()); if (m) tagIds.push(m.id) } catch { /* bỏ qua */ } }
      else throw e
    }
  }
  const item = await post<{ id: number }>('/items', buildItemBody(f, [...new Set(tagIds)].slice(0, 20), f.ackSimilar && f.origin.similar.length > 0))
  let attached = 0; const attachErrors: string[] = []
  if (f.attachSources && f.sourceFiles.length) {
    const res = await uploadAttachments(item.id, f.sourceFiles, f.confirmMasked)
    for (const r of res) if (r.ok) attached++; else attachErrors.push(`${r.file.name}: ${r.message}`)
  }
  let submitted = false; let submitError: string | undefined
  if (f.submitAfter) { try { await post(`/items/${item.id}/submit`, {}); submitted = true } catch (e) { submitError = e instanceof ApiError ? e.full : String(e) } }
  return { id: item.id, tagsCreated, attached, attachErrors, submitted, submitError }
}

/** Gọi AI soạn bản nháp từ tệp hoặc văn bản. */
export function draftFrom(src: { files?: LocalFile[]; text?: string }, hints: { type?: string; space_id?: string; instructions?: string; allow_split?: boolean }) {
  const h = { type: hints.type || undefined, space_id: hints.space_id ? Number(hints.space_id) : undefined, allow_split: hints.allow_split !== false }
  if (src.files?.length) return postFiles<SmartImportResult>('/ai/draft-item', src.files, { ...h, instructions: hints.instructions?.slice(0, 300) || undefined })
  return post<SmartImportResult>('/ai/draft-item/text', { text: src.text, ...h, instructions: hints.instructions?.slice(0, 500) || undefined })
}

/** Tệp do nơi khác (khung kéo-thả ở Tổng quan) chuyển sang trang Nhập tri thức. */
let queued: LocalFile[] | null = null
export const queueImportFiles = (f: LocalFile[]) => { queued = f }
export const takeImportFiles = () => { const q = queued; queued = null; return q }
