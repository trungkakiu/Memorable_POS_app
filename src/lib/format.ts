const nf = new Intl.NumberFormat('vi-VN')
export const money = (n: number | string | null | undefined) => nf.format(Math.round(Number(n) || 0)) + 'đ'
export const num = (n: number | string | null | undefined, digits = 0) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(Number(n) || 0)
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`)

const pad = (x: number) => String(x).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayStr = () => ymd(new Date())
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const thisPeriod = () => todayStr().slice(0, 7)

/** ISO hoặc YYYY-MM-DD → "14:03 05/10/2026" / "05/10/2026" */
export function dt(s: string | null | undefined, withTime = true) {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const date = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  if (!withTime || /^\d{4}-\d{2}-\d{2}$/.test(s)) return date
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${date}`
}
export const toLocalInput = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromLocalInput = (v: string) => new Date(v).toISOString()
export const bytes = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')

export const ROLE_LABEL: Record<string, string> = {
  reader: 'Người đọc', contributor: 'Người đóng góp', moderator: 'Kiểm duyệt viên', admin: 'Quản trị', sponsor: 'Người bảo trợ',
}
export const TYPE_LABEL: Record<string, string> = { document: 'Tài liệu', article: 'Bài viết', prompt: 'Prompt', runbook: 'Runbook' }
export const STATUS_LABEL: Record<string, string> = { draft: 'Nháp', pending: 'Chờ duyệt', approved: 'Đã duyệt', overdue: 'Quá hạn', archived: 'Lưu trữ' }
export const STATUS_TONE: Record<string, 'gray' | 'warn' | 'ok' | 'bad' | 'soft'> = { draft: 'gray', pending: 'warn', approved: 'ok', overdue: 'bad', archived: 'gray' }
export const FRESH_LABEL: Record<string, string> = { fresh: 'Còn hạn', due_soon: 'Sắp đến hạn', overdue: 'Quá hạn' }
export const FRESH_TONE: Record<string, 'ok' | 'warn' | 'bad'> = { fresh: 'ok', due_soon: 'warn', overdue: 'bad' }
export const RISK_LABEL: Record<string, string> = { R1: 'R1 · Tự xuất bản', R2: 'R2 · 1 người duyệt', R3: 'R3 · 2 người duyệt' }
export const RISK_TONE: Record<string, 'ok' | 'warn' | 'bad'> = { R1: 'ok', R2: 'warn', R3: 'bad' }
export const SENS_LABEL: Record<string, string> = { internal: 'Nội bộ', restricted: 'Hạn chế' }
export const SEVERITY_LABEL: Record<string, string> = { low: 'Thấp', medium: 'Trung bình', high: 'Cao', critical: 'Nghiêm trọng' }
export const WORK_TYPE: Record<string, string> = {
  analysis: 'Phân tích', development: 'Phát triển', testing: 'Kiểm thử', deployment_operations: 'Triển khai & vận hành',
  content_moderation: 'Kiểm duyệt nội dung', content_import: 'Nhập nội dung', training: 'Đào tạo', meeting: 'Họp', project_management: 'Quản lý dự án',
}
export const COST_ITEM: Record<string, string> = {
  hosting: 'Hosting / máy chủ', claude_subscription: 'Gói Claude', claude_api: 'Claude API', domain_certificate: 'Tên miền & chứng chỉ',
  backup_storage: 'Lưu trữ sao lưu', other: 'Khác',
}
export const NOTICE_TYPE: Record<string, string> = {
  review_requested: 'Cần duyệt', item_approved: 'Đã được duyệt', item_rejected: 'Bị trả lại', review_due: 'Đến hạn rà soát',
}
export const ACTION_LABEL = (a: string) => a
export const TRUST_LABEL: Record<string, string> = { approved: 'Đã duyệt', pending: 'Chờ duyệt', draft: 'Bản nháp', overdue: 'Quá hạn', archived: 'Lưu trữ' }
export const FILE_ICON: Record<string, string> = {
  pdf: '📕', docx: '📘', doc: '📘', odt: '📘', rtf: '📘', xlsx: '📗', xls: '📗', ods: '📗', csv: '📊', tsv: '📊', pptx: '📙', ppt: '📙', odp: '📙',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', jfif: '🖼️', jpe: '🖼️', pjpeg: '🖼️', pjp: '🖼️', gif: '🖼️', webp: '🖼️', bmp: '🖼️', avif: '🖼️', tif: '🖼️', tiff: '🖼️', heic: '🖼️', heif: '🖼️', mp3: '🎧', m4a: '🎧', aac: '🎧', wav: '🎧', ogg: '🎧', oga: '🎧', opus: '🎧', webm: '🎧', flac: '🎧', amr: '🎧', wma: '🎧', '3gp': '🎧', txt: '📄', log: '📄', md: '📝', json: '🧾', xml: '🧾', yaml: '🧾', yml: '🧾', zip: '🗜️',
}

export const KNOWLEDGE_LABEL: Record<string, string> = { documents: 'Trong tài liệu', hybrid: 'Kết hợp', general: 'Kiến thức chung' }
export const KNOWLEDGE_HINT: Record<string, string> = {
  documents: 'Chỉ dựa vào tài liệu của nhóm; Agent phải tra cứu trước khi trả lời, luôn có nguồn',
  hybrid: 'Tài liệu trước; phần thiếu bổ sung bằng kiến thức chung, tách riêng và gắn nhãn',
  general: 'Kiến thức chung của AI, không dựa vào tài liệu nội bộ',
}
export const SKILL_CATEGORY: Record<string, string> = { role: 'Vai trò', style: 'Văn phong', reasoning: 'Cách suy luận', format: 'Định dạng', quality: 'Kiểm soát chất lượng', task: 'Tác vụ' }
export const TOOL_LABEL: Record<string, string> = { search_knowledge: 'Tra cứu kho tri thức', get_document: 'Đọc tài liệu', look_at_attachment: 'Xem ảnh / PDF' }

// ---------- Hạng tin cậy của nguồn ----------
export const TIER_LABEL: Record<string, string> = { official: 'Nguồn chính thống', reviewed: 'Đã kiểm duyệt', unreviewed: 'Chưa kiểm duyệt', stale: 'Quá hạn' }
export const TIER_PLAIN: Record<string, string> = { official: 'Chính thống', reviewed: 'Đã được kiểm duyệt', unreviewed: 'Chưa ai kiểm tra', stale: 'Có thể đã cũ' }
export const TIER_TONE: Record<string, 'ok' | 'soft' | 'warn' | 'bad'> = { official: 'ok', reviewed: 'soft', unreviewed: 'warn', stale: 'bad' }
export const POLICY_LABEL: Record<string, string> = { all: 'Mọi nguồn', reviewed: 'Đã kiểm duyệt trở lên', official: 'Chỉ nguồn chính thống' }
export const INGEST_LABEL: Record<string, string> = { pending: 'Chờ đọc', processing: 'Đang đọc', done: 'Đã đọc', failed: 'Đọc lỗi', skipped: 'Bỏ qua' }
export const INGEST_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'gray' | 'soft'> = { pending: 'warn', processing: 'soft', done: 'ok', failed: 'bad', skipped: 'gray' }
export const TEXT_REVIEW_LABEL: Record<string, string> = { not_needed: 'Hệ thống tự đọc', unreviewed: 'Chữ AI chưa kiểm chứng', verified: 'Đã kiểm chứng', rejected: 'Bị từ chối' }
export const TEXT_REVIEW_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'gray'> = { not_needed: 'gray', unreviewed: 'warn', verified: 'ok', rejected: 'bad' }
export const INGEST_METHOD: Record<string, string> = { parsed: 'Hệ thống tự đọc', ai_ocr: 'AI đọc (OCR)', ai_ocr_proofread: 'AI đọc (OCR) và soát lại lần hai', text: 'Đọc văn bản', manual: 'Người sửa tay' }
export const TIER_FLAG: Record<string, string> = { ai_text_unverified: 'Chữ AI đọc chưa ai kiểm chứng', stale: 'Quá hạn rà soát', not_official: 'Chưa là nguồn chính thống' }
