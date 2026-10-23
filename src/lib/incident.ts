// Sự cố và quy trình xử lý: kiểu dữ liệu (khớp API /incidents, /runbooks) và nhãn hiển thị dùng chung cho quản lý và người đọc.
export type IncidentStatus = 'open' | 'investigating' | 'resolved'
export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface PersonRef { id: number; name: string }
export interface IncidentRow {
  id: number; title: string; description: string | null; system: string; error_group: string
  status: IncidentStatus; status_label: string; severity: Severity | null; severity_label: string | null
  detected_at: string; resolved_at: string | null; runbook_id: number | null; conclusion: string | null
  reporter: PersonRef | null; assignee: PersonRef | null; reporter_id: number | null; assignee_id: number | null
  created_at: string | null; updated_at: string | null; mttr_minutes: number | null
}
export interface IncidentRunLog { index: number; status: 'done' | 'skipped' | 'failed'; at: string; note: string | null; action: string | null }
export interface IncidentRun {
  id: number; runbook_id: number; runbook_title: string | null; user: PersonRef | null; started_at: string; finished_at: string | null
  duration_minutes: number | null; steps_total: number; steps_done: number; steps_failed: number; log: IncidentRunLog[]
}
export interface IncidentDetail extends IncidentRow {
  runbook_title: string | null; runs: IncidentRun[]; timeline: { at: string; kind: string; text: string }[]
}
export interface IncidentStats {
  open: number; investigating: number; resolved: number; open_by_severity: Record<string, number>
  last_30_days: { resolved: number; mttr_minutes: number | null; with_runbook: number; top_error_groups: { name: string; count: number }[] }
  previous_30_days?: { resolved: number; mttr_minutes: number | null }
}
export interface RunbookSuggestion {
  id: number; title: string; summary: string | null; status: string; affected_system: string | null; severity_level: Severity | null
  steps: number; dangerous_steps: number; used_for_similar: number; reasons: string[]; score: number
}

// ---- Nhập quy trình
export interface DraftStep { action: string; expected: string; dangerous: boolean; auto_dangerous?: boolean }
export interface RunbookDraft {
  code?: string; title: string; summary: string; affected_system: string; severity_level: string; error_group: string; symptom: string
  prerequisites: string; verification: string; rollback: string; contact_info: string; risk_level: string; steps: DraftStep[]
  missing?: { field: string; label: string }[]; notes?: string[]; ready?: boolean; allow_duplicate?: boolean
}
export interface ParseResult {
  method: 'template' | 'ai'; source?: string; runbooks: RunbookDraft[]; cost_usd: number; notes?: string; model?: string
  sources?: { filename: string; method: string }[]; skipped?: { filename: string; reason: string }[]
}
export interface CommitResult {
  created: number; failed: number
  results: { index: number; ok: boolean; id?: number; title: string; status?: string | number; warnings?: string[]; error?: string; errors?: { field: string; message: string }[]; similar?: { id: number; title: string }[] }[]
}

export const STATUS_TEXT: Record<IncidentStatus, string> = { open: 'Mới báo', investigating: 'Đang xử lý', resolved: 'Đã khắc phục' }
export const STATUS_TONE: Record<IncidentStatus, 'bad' | 'warn' | 'ok'> = { open: 'bad', investigating: 'warn', resolved: 'ok' }
export const SEVERITY_TEXT: Record<Severity, string> = { low: 'Thấp', medium: 'Trung bình', high: 'Cao', critical: 'Nghiêm trọng' }
export const SEVERITY_LIST: Severity[] = ['critical', 'high', 'medium', 'low']
// Màu theo mức độ (đậm dần), dùng cho chấm màu và nhãn
export const SEVERITY_COLOR: Record<Severity, string> = { low: '#12b76a', medium: '#f79009', high: '#f04438', critical: '#b42318' }

/** "5 phút", "1 giờ 20 phút", "2 ngày 3 giờ" */
export const fmtMinutes = (m: number | null | undefined) => {
  if (m == null) return '—'
  const t = Math.round(m)
  if (t < 60) return `${t} phút`
  const h = Math.floor(t / 60)
  if (h < 24) return `${h} giờ${t % 60 ? ` ${t % 60} phút` : ''}`
  return `${Math.floor(h / 24)} ngày${h % 24 ? ` ${h % 24} giờ` : ''}`
}
/** "vừa xong", "12 phút trước", "3 giờ trước", "2 ngày trước" */
export const ago = (iso: string | null | undefined) => {
  if (!iso) return ''
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${Math.round(m)} phút trước`
  if (m < 1440) return `${Math.round(m / 60)} giờ trước`
  return `${Math.round(m / 1440)} ngày trước`
}

// ---- Luật bắt buộc của quy trình xử lý: một nguồn duy nhất cho trang tạo mục và trang nhập quy trình (khớp máy chủ)
export const RUNBOOK_FIELD: Record<string, string> = {
  title: 'Tên quy trình', affected_system: 'Hệ thống bị ảnh hưởng', severity_level: 'Mức độ', symptom: 'Dấu hiệu nhận biết',
  prerequisites: 'Chuẩn bị trước', contact_info: 'Liên hệ hỗ trợ', verification: 'Cách xác nhận đã khắc phục', rollback: 'Cách hoàn tác',
  steps: 'Các bước xử lý', 'steps.expected': 'Việc cần làm và kết quả của từng bước', risk_level: 'Mức rủi ro',
}
export const RUNBOOK_REQUIRED = ['title', 'affected_system', 'severity_level', 'symptom', 'prerequisites', 'contact_info', 'verification'] as const
export interface RunbookLike {
  title: string; affected_system: string; severity_level: string; symptom: string; prerequisites: string; contact_info: string
  verification: string; rollback: string; risk_level: string; steps: { action: string; expected: string }[]
}
/** Các trường còn thiếu. Dòng bước để trống hoàn toàn được bỏ qua (khi lưu sẽ bị lọc). */
export const runbookMissing = (r: RunbookLike): string[] => {
  const m: string[] = RUNBOOK_REQUIRED.filter((k) => !String(r[k] || '').trim())
  const steps = r.steps.filter((s) => s.action.trim() || s.expected.trim())
  if (!steps.length) m.push('steps')
  else if (steps.some((s) => !s.action.trim() || !s.expected.trim())) m.push('steps.expected')
  if (r.risk_level === 'R1') m.push('risk_level')
  if (r.risk_level === 'R3' && !r.rollback.trim()) m.push('rollback')
  return m
}
export const runbookMissingText = (k: string) => (k === 'risk_level' ? 'Quy trình xử lý phải ở mức rủi ro R2 hoặc R3' : k === 'rollback' ? 'Mức rủi ro R3 phải có cách hoàn tác' : k === 'steps' ? 'Cần ít nhất một bước (việc cần làm + kết quả mong đợi)' : `Thiếu: ${RUNBOOK_FIELD[k] || k}`)
