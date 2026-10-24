// Dùng Claude ngay trong app khi máy chủ Memorable chưa bật AI (503). Chỉ chạy trong Electron có khóa ANTHROPIC_API_KEY trong .env.
import { get } from './api'
import { confirmDialog } from '../store/ui'
import type { CompareResult, ItemDetail, SourceTier } from './types'

const CONSENT = 'memorable.claude.local.ok'

/** Hỏi người dùng một lần mỗi phiên trước khi gửi câu hỏi / tài liệu ra ngoài cho Claude. */
export async function askClaudeConsent(): Promise<boolean> {
  try { if (sessionStorage.getItem(CONSENT) === '1') return true } catch { /* bỏ qua */ }
  const ok = await confirmDialog(
    'Dùng Claude thay cho máy chủ?',
    'Máy chủ Memorable chưa bật AI. Nếu tiếp tục, câu hỏi của bạn (và các đoạn tài liệu công ty liên quan nếu có) sẽ được gửi cho Anthropic (Claude) bằng khóa cài trên máy này. Chỉ tiếp tục khi công ty cho phép dùng AI bên ngoài với tài liệu nội bộ.',
    { okText: 'Tiếp tục' },
  )
  if (ok) { try { sessionStorage.setItem(CONSENT, '1') } catch { /* bỏ qua */ } }
  return !!ok
}

/** Toàn bộ một mục (nội dung + các tệp đính kèm) dưới dạng Markdown. */
export async function itemMarkdown(id: number): Promise<string> {
  const r = await get<unknown>(`/items/${id}/markdown`, { attachments: true })
  if (typeof r === 'string') return r
  const o = (r || {}) as Record<string, unknown>
  return String(o.markdown ?? o.content ?? o.text ?? '')
}

const tierOf = (label?: string): SourceTier => (/chính thống|official/i.test(label || '') ? 'official' : /kiểm duyệt|đã duyệt|reviewed/i.test(label || '') ? 'reviewed' : /quá hạn|stale/i.test(label || '') ? 'stale' : 'unreviewed')

/** So sánh 2-5 bài: giao diện đọc bài từ máy chủ (theo quyền người dùng), Claude đối chiếu trong Electron. */
export async function compareViaClaude(docs: { id: number; title: string }[], question: string): Promise<CompareResult> {
  const d = window.desk
  if (!d?.aiCompare) throw new Error('Cần chạy trong ứng dụng Electron có khóa ANTHROPIC_API_KEY')
  const used: (CompareResult['documents'][number] & { markdown: string })[] = []
  const skipped: CompareResult['skipped'] = []
  for (const x of docs) {
    try {
      const it = await get<ItemDetail>(`/items/${x.id}`)
      if (it.sensitivity_level === 'restricted') { skipped.push({ id: x.id, reason: 'Bài hạn chế, không gửi ra ngoài' }); continue }
      const markdown = await itemMarkdown(x.id)
      if (!markdown.trim()) { skipped.push({ id: x.id, reason: 'Bài chưa có nội dung đọc được' }); continue }
      used.push({ id: x.id, title: it.title || x.title, tier: tierOf(it.trust_label), tier_label: it.trust_label || '', trust_label: it.trust_label, effective_date: it.effective_date ?? null, next_review_date: it.next_review_date ?? null, markdown })
    } catch { skipped.push({ id: x.id, reason: 'Không đọc được bài này' }) }
  }
  if (used.length < 2) throw new Error('Cần ít nhất 2 bài đọc được và không hạn chế để so sánh.')
  const r = await d.aiCompare({ docs: used, question: question || undefined })
  if (!r.ok) throw new Error(r.error || 'Claude chưa so sánh được')
  const x = r.data
  if (!x || x.fallback) throw new Error('Chưa có khóa ANTHROPIC_API_KEY trong .env nên không so sánh bằng Claude được.')
  return {
    documents: used.map(({ markdown: _m, ...meta }) => meta), skipped,
    summary: x.summary || '', common_points: x.common_points || [], differences: x.differences || [], conflicts: x.conflicts || [], gaps: x.gaps || [], recommendation: x.recommendation,
    note: 'So sánh do Claude thực hiện trực tiếp trong ứng dụng (máy chủ chưa bật AI); chưa qua kiểm tra mã bài của máy chủ.', model: x.model, cost_usd: 0,
  }
}