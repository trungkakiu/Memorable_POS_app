import type { LocalFile } from '../lib/api'

// Tệp do nơi khác (khung hỏi ở trang chủ, kéo-thả) chuyển sang trang "Hỏi về tệp của tôi", kèm câu hỏi nếu có.
let queued: { files: LocalFile[]; question?: string } | null = null
export function queueMyFile(file: LocalFile | LocalFile[], question?: string) { queued = { files: Array.isArray(file) ? file : [file], question } }
export function takeQueued() { const q = queued; queued = null; return q }
export const hasQueued = () => !!queued

// Tệp Word/Excel/CSV từ khung trò chuyện chuyển sang trang "Điền mẫu tự động" để lưu làm mẫu.
let template: LocalFile | null = null
export function queueTemplate(file: LocalFile) { template = file }
export function takeTemplate() { const t = template; template = null; return t }
