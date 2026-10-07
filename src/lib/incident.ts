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
