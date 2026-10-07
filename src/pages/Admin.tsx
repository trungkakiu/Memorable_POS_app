import { useEffect, useState } from 'react'
import { Download, FileJson, FileSpreadsheet, KeyRound, Lock, Play, Plus, ShieldCheck, Unlock, Upload } from 'lucide-react'
import { ApiError, api, deskApi, download, get, patch, post, put, useGet } from '../lib/api'
import { parseCsv } from '../lib/csv'
import { dt, ROLE_LABEL } from '../lib/format'
import type { AdminUser, Role } from '../lib/types'
import { Empty, Field, Modal, PageHeader, Pill, Seg, SearchBox, Stat } from '../components/ui'
import { ErrorBox, Loading, Pager, Section, useBusy } from '../components/shared'
import { useAuth } from '../store/auth'
import { toast } from '../store/ui'
import { useNotices } from '../store/notices'
import { APP_CONFIG } from '../lib/appConfig'

export function Users() {
  const me = useAuth((s) => s.user)!
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useGet<{ users: AdminUser[]; total: number; page: number; pages: number }>('/admin/users', { page, limit: 20 })
  const { busy, run } = useBusy()
  const [f, setF] = useState<{ name: string; email: string; password: string; role: Role } | null>(null)
  const [q, setQ] = useState('')
  async function create() { if (!f) return; const r = await run(() => post('/admin/users', f), 'Đã tạo người dùng'); if (r) { setF(null); reload() } }
  const upd = async (u: AdminUser, body: Partial<AdminUser>, ok: string) => { await run(() => patch(`/admin/users/${u.id}`, body), ok); reload() }
  const list = (data?.users || []).filter((u) => (u.name + u.email).toLowerCase().includes(q.toLowerCase()))
  const pwBad = !!f && f.password.length < 10
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Người dùng & vai trò" subtitle="Chỉ quản trị viên. Tự đăng ký luôn là Người đọc — nâng quyền tại đây." actions={<button className="btn" onClick={() => setF({ name: '', email: '', password: '', role: 'contributor' })}><Plus size={16} />Tạo người dùng</button>} />
      <div className="card !p-3"><SearchBox className="w-72" value={q} onChange={setQ} placeholder="Lọc theo tên / email…" /></div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Người dùng</th><th>Vai trò</th><th>Trạng thái</th><th>2FA</th><th>Tạo lúc</th><th /></tr></thead><tbody>
        {loading && !data && <tr><td colSpan={6}><Loading /></td></tr>}
        {data && list.length === 0 && <tr><td colSpan={6}><Empty /></td></tr>}
        {list.map((u) => (<tr key={u.id}><td><div className="font-bold">{u.name} {u.id === me.id && <Pill sm tone="soft">Bạn</Pill>}</div><div className="text-xs text-muted">{u.email} · #{u.id}</div></td>
          <td><select className="select !w-48 !py-1.5" disabled={busy || u.id === me.id} value={u.role} onChange={(e) => upd(u, { role: e.target.value as Role }, 'Đã đổi vai trò')}>{Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
          <td>{u.status === 'active' ? <Pill sm tone="ok">Hoạt động</Pill> : <Pill sm tone="bad"><Lock size={11} />Bị khóa</Pill>}</td><td>{u.totp_enabled ? <ShieldCheck size={17} className="text-green-600" /> : '—'}</td><td>{dt(u.created_at)}</td>
          <td className="num">{u.id !== me.id && (u.status === 'active' ? <button className="btn outline sm" disabled={busy} onClick={() => upd(u, { status: 'locked' }, 'Đã khóa tài khoản')}><Lock size={13} />Khóa</button> : <button className="btn sm" disabled={busy} onClick={() => upd(u, { status: 'active' }, 'Đã mở khóa')}><Unlock size={13} />Mở khóa</button>)}</td></tr>))}
      </tbody></table></div>
      {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      {f && <Modal title="Tạo người dùng" size="sm" onClose={() => setF(null)} footer={<><button className="btn outline" onClick={() => setF(null)}>Hủy</button><button className="btn" disabled={busy || !f.name.trim() || !f.email.includes('@') || pwBad} onClick={create}>Tạo</button></>}>
        <div className="grid gap-4"><Field label="Họ tên *"><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email *"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Mật khẩu (≥ 10 ký tự) *"><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />{pwBad && f.password && <span className="text-xs text-red-600 font-semibold">Cần ít nhất 10 ký tự</span>}</Field>
          <Field label="Vai trò"><select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field></div></Modal>}
    </div>)
}

type SettingKind = 'bool' | 'number' | 'json' | 'select'
const KNOWN: { key: string; kind: SettingKind; group: string; title: string; help: string; def?: string; options?: [string, string][] }[] = [
  { key: 'ai_enabled', kind: 'bool', group: 'AI — điều khiển chung', title: 'Bật AI', help: 'Bật/tắt toàn bộ tính năng AI' },
  { key: 'ai_data_policy_approved', kind: 'bool', group: 'AI — điều khiển chung', title: 'Đã duyệt chính sách dữ liệu', help: 'Chỉ bật khi công ty đã duyệt việc gửi nội dung ra nhà cung cấp AI' },
  { key: 'ai_monthly_budget_usd', kind: 'number', group: 'AI — điều khiển chung', title: 'Ngân sách AI mỗi tháng (USD)', help: 'Hết ngân sách AI trả lỗi 429. Mặc định mới là 30 USD vì việc đọc tệp tốn thêm chi phí' },
  { key: 'ai_daily_calls_per_user', kind: 'number', group: 'AI — điều khiển chung', title: 'Số lần gọi mô hình tối đa / người / ngày', help: 'Mặc định 150; một lượt chat với Agent có thể gọi mô hình 2–5 lần', def: '150' },
  { key: 'ai_agents_per_user', kind: 'number', group: 'Agent cá nhân', title: 'Số Agent tối đa mỗi người', help: 'Mặc định 10', def: '10' },
  { key: 'ai_agent_turn_max_usd', kind: 'number', group: 'Agent cá nhân', title: 'Chi phí tối đa một lượt chat với Agent (USD)', help: 'Mặc định 0.5; quá mức thì Agent phải trả lời luôn', def: '0.5' },
  { key: 'ai_conversation_retention_days', kind: 'number', group: 'Agent cá nhân', title: 'Số ngày lưu hội thoại với Agent', help: 'Mặc định 30; 0 = giữ mãi', def: '30' },
  { key: 'ai_feature_ask', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Hỏi đáp trong tài liệu', help: 'Chế độ documents (mặc định)' },
  { key: 'ai_feature_ask_general', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Hỏi đáp ngoài tài liệu', help: 'Chế độ general — kiến thức chung, không gửi tài liệu nội bộ. Tắt nếu không muốn cho hỏi ngoài tài liệu' },
  { key: 'ai_feature_ask_hybrid', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Hỏi đáp kết hợp', help: 'Chế độ hybrid — tài liệu trước, bổ sung kiến thức chung có gắn nhãn' },
  { key: 'ai_feature_suggest', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Gợi ý tóm tắt / thẻ / rủi ro', help: 'POST /ai/suggest' },
  { key: 'ai_feature_duplicates', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Phát hiện trùng lặp / mâu thuẫn', help: 'POST /ai/duplicates' },
  { key: 'ai_feature_prompt_test', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Chạy & chấm kiểm thử prompt', help: 'POST /ai/prompt-tests/run' },
  { key: 'ai_feature_vision', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Hỏi AI về ảnh / PDF', help: 'POST /ai/analyze — AI nhìn trực tiếp vào tệp và trả lời (không lưu)' },
  { key: 'ai_feature_vision_extract', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'AI đọc chữ trong ảnh / PDF và lưu', help: 'POST /attachments/{id}/ai-extract — lưu chữ để tìm kiếm và để AI dùng' },
  { key: 'ai_feature_agent', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Agent cá nhân hóa', help: 'Tạo và chat với Agent (tra cứu tài liệu, đọc tệp, xem ảnh/PDF)' },
  { key: 'ai_auto_ingest', kind: 'bool', group: 'Đọc & ghi nhớ tài liệu', title: 'Tự đọc tệp khi tải lên', help: 'Tệp mới được đọc, chia đoạn và ghi nhớ ở nền ngay sau khi tải lên (cần INGEST_WORKER=true trên máy chủ)' },
  { key: 'ai_ocr_double_check', kind: 'bool', group: 'Đọc & ghi nhớ tài liệu', title: 'Đọc ảnh/PDF quét hai lượt', help: 'AI đọc chữ rồi tự soát lại lần hai để giảm sai số; tốn thêm chi phí' },
  { key: 'ai_rag_expansion', kind: 'bool', group: 'Đọc & ghi nhớ tài liệu', title: 'Mở rộng câu hỏi khi tìm', help: 'AI viết thêm vài cách diễn đạt khác (đồng nghĩa, Việt/Anh) trước khi tìm đoạn' },
  { key: 'ai_rag_rerank', kind: 'bool', group: 'Đọc & ghi nhớ tài liệu', title: 'AI chấm lại thứ tự đoạn tìm được', help: 'Chính xác hơn nhưng thêm một lượt gọi AI mỗi câu hỏi' },
  { key: 'ai_source_policy_default', kind: 'select', group: 'Đọc & ghi nhớ tài liệu', title: 'Chính sách nguồn mặc định', help: 'AI được dùng nguồn nào khi người dùng không chọn: tất cả (ưu tiên hạng cao), chỉ đã kiểm duyệt, hay chỉ chính thống', def: 'all', options: [['all', 'Tất cả nguồn (ưu tiên hạng cao)'], ['reviewed', 'Chỉ nguồn đã kiểm duyệt'], ['official', 'Chỉ nguồn chính thống']] },
  { key: 'ai_feature_ingest_ocr', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Đọc chữ ảnh/PDF quét khi ghi nhớ', help: 'Dùng AI nhìn ảnh để lấy chữ lúc ghi nhớ tệp' },
  { key: 'ai_feature_ingest_enrich', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Rút trích dữ kiện, thực thể, thẻ gợi ý', help: 'Sau khi đọc, AI tóm tắt và rút ra dữ kiện chính, câu hỏi tài liệu trả lời được' },
  { key: 'ai_feature_conflict_scan', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Tự quét mâu thuẫn giữa tài liệu', help: 'Khi ghi nhớ tệp mới, đối chiếu với tài liệu liên quan và báo chỗ khác nhau' },
  { key: 'ai_feature_embed', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Tạo vector cho đoạn nội dung', help: 'Cần để tìm theo ngữ nghĩa; tắt thì chỉ tìm theo từ khóa' },
  { key: 'ai_feature_embed_query', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Tạo vector cho câu hỏi', help: 'Cần để tìm theo ngữ nghĩa lúc hỏi đáp và tìm đoạn' },
  { key: 'ai_feature_rag_expand', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Mở rộng câu hỏi (tính năng)', help: 'Cho phép gọi AI mở rộng câu hỏi khi tìm' },
  { key: 'ai_feature_rag_rerank', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'Chấm lại thứ tự đoạn (tính năng)', help: 'Cho phép gọi AI chấm lại thứ tự đoạn' },
  { key: 'ai_feature_compare', kind: 'bool', group: 'AI — bật/tắt từng tính năng', title: 'So sánh tài liệu', help: 'POST /knowledge/compare — đối chiếu 2–5 tài liệu' },
  { key: 'ai_ask_rewrite', kind: 'bool', group: 'Hội thoại & suy luận', title: 'Hiểu câu hỏi nối tiếp', help: 'POST /ai/ask với conversation_id: AI viết lại câu ngắn như “còn bước cuối?” thành câu đủ ý dựa trên các câu trước rồi mới tìm tài liệu' },
  { key: 'ai_ask_effort', kind: 'select', group: 'Hội thoại & suy luận', title: 'Mức suy luận khi hỏi đáp', help: 'Mức suy luận của mô hình khi soạn câu trả lời /ai/ask', def: 'high', options: [['low', 'Thấp — nhanh, rẻ'], ['medium', 'Vừa'], ['high', 'Cao — kỹ hơn, chậm và tốn hơn']] },
  { key: 'ai_agent_final_pass', kind: 'bool', group: 'Hội thoại & suy luận', title: 'Agent trả lời lại có suy luận sau khi tra cứu', help: 'Sau các vòng gọi công cụ (không suy luận), Agent soạn câu trả lời cuối thêm một lượt có suy luận; tắt để nhanh và rẻ hơn' },
  { key: 'ai_agent_final_effort', kind: 'select', group: 'Hội thoại & suy luận', title: 'Mức suy luận lượt trả lời cuối của Agent', help: 'Áp dụng khi bật lượt trả lời cuối', def: 'high', options: [['low', 'Thấp — nhanh, rẻ'], ['medium', 'Vừa'], ['high', 'Cao — kỹ hơn, chậm và tốn hơn']] },
  { key: 'ai_feature_file_chat', kind: 'bool', group: 'Hỏi bằng tệp', title: 'Trò chuyện kèm tệp kiểu ChatGPT', help: 'POST /ai/file-chat — AI nhìn ảnh/PDF trực tiếp, đọc Word/Excel, chép lời ghi âm; dùng ở trang Hỏi về tệp và nút đính kèm của trợ lý' },
  { key: 'ai_feature_web_search', kind: 'bool', group: 'Tìm trên Internet', title: 'Cho AI tìm trên Internet', help: 'POST /ai/web/ask — chỉ gửi câu hỏi, không gửi tài liệu nội bộ; luôn ghi nguồn và xác minh nguồn' },
  { key: 'ai_web_scope_default', kind: 'select', group: 'Tìm trên Internet', title: 'Phạm vi tìm mặc định', help: 'Khi người dùng không chọn', def: 'balanced', options: [['balanced', 'Ưu tiên chính thống, thiếu thì mở rộng'], ['official', 'Chỉ trang chính thống'], ['open', 'Mọi trang (trừ trang bị chặn)']] },
  { key: 'ai_feature_web_learn', kind: 'bool', group: 'Tìm trên Internet', title: 'Cho AI khái quát câu hỏi để học câu trả lời tốt', help: 'Gọi mô hình nhỏ để bỏ thông tin riêng và quyết định câu trả lời có dùng lại được không' },
  { key: 'ai_web_auto_learn', kind: 'bool', group: 'Tìm trên Internet', title: 'Tự học câu trả lời có nguồn tốt', help: 'Tắt thì chỉ học khi người dùng bấm Hữu ích' },
  { key: 'ai_web_learn_min_level', kind: 'select', group: 'Tìm trên Internet', title: 'Mức xác minh tối thiểu để tự học', help: 'Mức cao cần nguồn chính thống, không có liên kết hỏng, nhiều trang xác nhận', def: 'high', options: [['high', 'Cao'], ['medium', 'Khá']] },
  { key: 'ai_web_learned_days', kind: 'number', group: 'Tìm trên Internet', title: 'Hạn dùng tối đa của câu trả lời đã học (ngày)', help: 'Mặc định 30; AI có thể đặt ngắn hơn với tin tức, giá cả', def: '30' },
  { key: 'ai_web_hide_after_unhelpful', kind: 'number', group: 'Tìm trên Internet', title: 'Tự ẩn sau số lượt “chưa đúng”', help: 'Mặc định 2 (và phải nhiều hơn lượt hữu ích)', def: '2' },
  { key: 'ai_feature_transcribe', kind: 'bool', group: 'Chép lời ghi âm', title: 'Cho AI chép lời file ghi âm', help: 'POST /ai/transcribe, nút micro, file ghi âm trong hỏi bằng tệp / nhập tri thức / tệp đính kèm. Mô hình AI_MODEL_TRANSCRIBE (mặc định gpt-4o-transcribe)' },
  { key: 'ai_transcribe_double_check', kind: 'bool', group: 'Chép lời ghi âm', title: 'Chép lời bằng hai mô hình rồi đối chiếu', help: 'Mặc định bật: chính xác hơn với tên riêng và con số, tốn gấp đôi; tắt để chỉ dùng một mô hình' },
  { key: 'ai_transcribe_max_minutes', kind: 'number', group: 'Chép lời ghi âm', title: 'Độ dài tối đa một bản ghi (phút)', help: 'Mặc định 60. Bản ghi dài hơn bị từ chối (413)', def: '60' },
  { key: 'ai_transcribe_language', kind: 'select', group: 'Chép lời ghi âm', title: 'Ngôn ngữ mặc định khi chép lời', help: 'Dùng khi người dùng không chọn ngôn ngữ (ghi âm từ nút micro, tệp đính kèm, hỏi bằng tệp)', def: 'vi', options: [['vi', 'Tiếng Việt'], ['en', 'Tiếng Anh'], ['auto', 'Tự nhận biết']] },
  { key: 'ai_feature_smart_import', kind: 'bool', group: 'Nhập tri thức thông minh', title: 'Cho AI đọc tệp và soạn bản nháp mục', help: 'POST /ai/draft-item, /ai/draft-item/text — AI phân loại, điền mọi trường, gắn thẻ, kiểm tra trùng; người dùng xem lại rồi mới tạo. Đọc ảnh/PDF hai lượt dùng chung khóa ai_ask_file_double_check.' },
  { key: 'ai_ask_file_double_check', kind: 'bool', group: 'Hỏi bằng tệp', title: 'Đọc ảnh/PDF hai lượt khi hỏi bằng tệp', help: 'AI đọc lại lần hai để giảm sai số chữ (số tiền, mã lỗi); chậm và tốn chi phí hơn', def: 'false' },
  { key: 'ai_feature_ask_file', kind: 'bool', group: 'Hỏi bằng tệp', title: 'Cho phép hỏi bằng tệp', help: 'POST /ai/ask-file — người đọc trở lên gửi ảnh/PDF/Word/Excel kèm câu hỏi, đối chiếu kho rồi trả lời (tệp không lưu)' },
  { key: 'ai_feature_ask_file_read', kind: 'bool', group: 'Hỏi bằng tệp', title: 'AI đọc chữ trong tệp gửi lên', help: 'Tắt thì chỉ đọc được tệp có sẵn chữ (Word, Excel, văn bản); ảnh và PDF quét bị bỏ qua' },
  { key: 'ai_memory_enabled', kind: 'bool', group: 'Trí nhớ của trợ lý', title: 'Bật trí nhớ dài hạn', help: 'Chắt lọc sự thật, sở thích, quyết định, việc dang dở từ hội thoại với Agent để dùng ở lần sau', def: 'true' },
  { key: 'ai_memory_max_per_user', kind: 'number', group: 'Trí nhớ của trợ lý', title: 'Số ký ức tối đa mỗi người', help: 'Vượt mức thì bỏ ký ức ít quan trọng, lâu không dùng (mặc định 500)', def: '500' },
  { key: 'ai_memory_retention_days', kind: 'number', group: 'Trí nhớ của trợ lý', title: 'Số ngày giữ ký ức không dùng đến', help: 'Ký ức không ghim và không được dùng quá số ngày này sẽ bị xóa (mặc định 365)', def: '365' },
  { key: 'ai_auto_tag', kind: 'bool', group: 'Thẻ thông minh', title: 'AI tự gắn thẻ', help: 'Khi mục được duyệt hoặc sửa, AI gắn nhóm kiến thức và chủ đề phù hợp (cần bộ xử lý nền)', def: 'true' },
  { key: 'ai_auto_create_tags', kind: 'bool', group: 'Thẻ thông minh', title: 'Cho AI tạo thẻ mới', help: 'Tắt thì AI chỉ dùng thẻ đã có; thẻ AI tạo được đánh dấu để kiểm duyệt viên xác nhận', def: 'true' },
  { key: 'ai_rag_tag_expansion', kind: 'bool', group: 'Thẻ thông minh', title: 'Mở rộng tìm kiếm qua thẻ liên quan', help: 'Khi hỏi đáp/tìm đoạn, xét thêm tài liệu cùng thẻ hoặc thẻ hay đi cùng (kể cả khác nhóm)', def: 'true' },
  { key: 'secret_allowlist', kind: 'json', group: 'Quét bí mật', title: 'Danh sách bỏ qua khi quét bí mật', help: 'Mảng JSON các giá trị được bỏ qua, ví dụ ["EXAMPLE_KEY"]' },
]

function SettingRow({ def, value, onSave, busy }: { def: (typeof KNOWN)[number]; value: string | undefined; onSave: (v: string) => void; busy: boolean }) {
  const [v, setV] = useState(value ?? def.def ?? '')
  useEffect(() => { setV(value ?? def.def ?? '') }, [value, def.def])
  const dirty = v !== (value ?? def.def ?? '')
  let bad = ''
  if (def.kind === 'number' && v.trim() !== '' && !(Number(v) >= 0)) bad = 'Nhập số không âm'
  if (def.kind === 'json') { try { if (!Array.isArray(JSON.parse(v || '[]'))) bad = 'Phải là mảng JSON' } catch { bad = 'JSON không hợp lệ' } }
  return (
    <div className="flex items-start gap-4 p-3 rounded-lg border border-line bg-white">
      <div className="flex-1 min-w-0">
        <div className="font-bold text-[13.5px]">{def.title} {value === undefined && <Pill sm tone="gray">chưa đặt</Pill>}</div>
        <div className="text-xs text-muted mt-0.5 leading-snug">{def.help}</div>
        <code className="text-[11px] text-brand-700">{def.key}</code>
        {bad && <div className="text-xs text-red-600 font-semibold mt-1">{bad}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {def.kind === 'bool' ? (
          <button role="switch" aria-checked={v === 'true'} disabled={busy} title={v === 'true' ? 'Đang bật — bấm để tắt' : 'Đang tắt — bấm để bật'}
            onClick={() => onSave(v === 'true' ? 'false' : 'true')}
            className={'w-12 h-7 rounded-md border-0 cursor-pointer relative transition-colors ' + (v === 'true' ? 'bg-green-500' : 'bg-slate-300')}>
            <span className={'absolute top-1 w-5 h-5 rounded-[4px] bg-white shadow transition-all ' + (v === 'true' ? 'left-6' : 'left-1')} />
          </button>
        ) : def.kind === 'select' ? (
          <select className="select !w-64" disabled={busy} value={v || def.def || ''} onChange={(e) => onSave(e.target.value)}>{def.options!.map(([o, l]) => <option key={o} value={o}>{l}</option>)}</select>
        ) : def.kind === 'number' ? (
          <><input className="input !w-32 right" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} />
            <button className="btn sm" disabled={busy || !dirty || !!bad || v.trim() === ''} onClick={() => onSave(v.trim())}>Lưu</button></>
        ) : (
          <><textarea className="textarea font-mono text-xs !w-64 !min-h-[60px]" value={v} onChange={(e) => setV(e.target.value)} />
            <button className="btn sm" disabled={busy || !dirty || !!bad} onClick={() => onSave(v.trim() || '[]')}>Lưu</button></>
        )}
      </div>
    </div>)
}

export function AdminSettings() {
  const { data, loading, error, reload } = useGet<{ key_name: string; value: string; description: string | null }[]>('/admin/settings')
  const { busy, run } = useBusy()
  const [edit, setEdit] = useState<{ key: string; value: string; description: string } | null>(null)
  const [job, setJob] = useState<{ reminded: number; marked_overdue: number; escalated: number } | null>(null)
  const [purge, setPurge] = useState<{ retention_days: number; deleted: number; skipped: boolean } | null>(null)
  const [vf, setVf] = useState<{ checked: number; ok: number; missing: unknown[]; corrupt: unknown[]; size_mismatch: unknown[]; orphan_files: number; truncated: boolean; healthy: boolean } | null>(null)
  const map = new Map((data || []).map((s) => [s.key_name, s]))
  const others = (data || []).filter((s) => !KNOWN.some((k) => k.key === s.key_name))
  const groups = Array.from(new Set(KNOWN.map((k) => k.group)))

  async function put1(key: string, value: string, description?: string) {
    const r = await run(() => put(`/admin/settings/${encodeURIComponent(key)}`, { value, description: description || undefined }), 'Đã lưu cấu hình')
    if (r) reload()
    return r
  }
  async function runPurge() { const r = await run(() => post<NonNullable<typeof purge>>('/admin/jobs/purge-conversations')); if (r) setPurge(r) }
  async function runVerify() { const r = await run(() => post<NonNullable<typeof vf>>('/admin/jobs/verify-files')); if (r) setVf(r) }
  const [rx, setRx] = useState<{ scope: string; attachments: number; items: number; worker: { enabled: boolean; running: number; waiting: number } } | null>(null)
  const [rxScope, setRxScope] = useState('pending')
  async function runReindex() {
    try { const r = await run(() => post<NonNullable<typeof rx>>('/admin/jobs/reindex-knowledge', { scope: rxScope })); if (r) setRx(r) } catch { /* đã báo lỗi */ }
  }
  async function runJob() { const r = await run(() => post<NonNullable<typeof job>>('/admin/jobs/freshness')); if (r) setJob(r) }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Cấu hình máy chủ" subtitle="Chỉ quản trị viên. Thay đổi có hiệu lực ngay. Các khóa bên dưới lấy từ tài liệu Swagger (PUT /admin/settings/{key})."
        actions={<button className="btn outline" onClick={() => setEdit({ key: '', value: '', description: '' })}><Plus size={16} />Đặt khóa khác</button>} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : groups.map((g) => (
        <Section key={g} title={g}>
          <div className="flex flex-col gap-2.5">{KNOWN.filter((k) => k.group === g).map((k) => <SettingRow key={k.key} def={k} value={map.get(k.key)?.value} busy={busy} onSave={(v) => void put1(k.key, v)} />)}</div>
        </Section>))}
      {others.length > 0 && (
        <Section title="Cài đặt khác">
          <div className="tbl-wrap !shadow-none"><table className="tbl"><thead><tr><th>Khóa</th><th>Giá trị</th><th>Mô tả</th><th /></tr></thead><tbody>
            {others.map((s) => <tr key={s.key_name}><td className="font-mono font-bold">{s.key_name}</td><td><code>{s.value}</code></td><td>{s.description || '—'}</td>
              <td className="num"><button className="btn outline sm" onClick={() => setEdit({ key: s.key_name, value: s.value, description: s.description || '' })}>Sửa</button></td></tr>)}</tbody></table></div>
        </Section>)}
      <Section title="Tác vụ bảo trì">
        <div className="grid xl:grid-cols-2 gap-4">
          <div className="border border-line rounded-lg p-4 flex flex-col gap-3"><div><div className="font-bold">Rà soát định kỳ</div><p className="m-0 mt-1 text-xs text-muted">Đánh dấu mục quá hạn, gửi nhắc nhở và leo thang. Máy chủ thường tự chạy theo lịch.</p></div>
            <button className="btn w-fit" disabled={busy} onClick={runJob}><Play size={15} />Chạy ngay</button>
            {job && <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="kv"><span className="k">Đã nhắc</span><span className="v">{job.reminded}</span></div><div className="kv"><span className="k">Quá hạn</span><span className="v">{job.marked_overdue}</span></div><div className="kv"><span className="k">Leo thang</span><span className="v">{job.escalated}</span></div></div>}</div>
          <div className="border border-line rounded-lg p-4 flex flex-col gap-3"><div><div className="font-bold">Xóa hội thoại Agent quá hạn lưu</div><p className="m-0 mt-1 text-xs text-muted">Theo cài đặt <code>ai_conversation_retention_days</code> (mặc định 30 ngày; 0 = giữ mãi). Nên chạy mỗi đêm.</p></div>
            <button className="btn w-fit" disabled={busy} onClick={runPurge}><Play size={15} />Chạy ngay</button>
            {purge && <div className={'rounded-lg px-3 py-2 text-sm font-semibold ' + (purge.skipped ? 'bg-slate-100 text-slate-700' : 'bg-green-50 text-green-800')}>{purge.skipped ? 'Bỏ qua — đang giữ hội thoại mãi mãi (retention = 0)' : `Đã xóa ${purge.deleted} hội thoại (thời hạn lưu ${purge.retention_days} ngày)`}</div>}</div>
          <div className="border border-line rounded-lg p-4 flex flex-col gap-3"><div><div className="font-bold">Kiểm tra toàn vẹn kho tệp</div><p className="m-0 mt-1 text-xs text-muted">Đối chiếu SHA-256 và dung lượng từng tệp, báo tệp thiếu/hỏng/mồ côi (tối đa 5000 tệp). Chỉ báo cáo, không sửa hay xóa.</p></div>
            <button className="btn w-fit" disabled={busy} onClick={runVerify}><Play size={15} />Quét ngay</button>
            {vf && <div className="flex flex-col gap-2 text-sm"><div className={'rounded-lg px-3 py-2 font-semibold ' + (vf.healthy ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>{vf.healthy ? 'Kho tệp toàn vẹn' : 'Phát hiện vấn đề'} — đã kiểm tra {vf.checked}, hợp lệ {vf.ok}{vf.truncated ? ' (chưa quét hết)' : ''}</div>
              {!vf.healthy && <div className="text-xs">Thiếu: {vf.missing.length} · Hỏng: {vf.corrupt.length} · Lệch dung lượng: {vf.size_mismatch.length} · Mồ côi: {vf.orphan_files}</div>}
              {!vf.healthy && <pre className="m-0 text-[11px] bg-brand-50 border border-line-soft rounded-md p-2 max-h-40 overflow-auto">{JSON.stringify({ missing: vf.missing, corrupt: vf.corrupt, size_mismatch: vf.size_mismatch }, null, 1)}</pre>}</div>}</div>
          <div className="border border-line rounded-lg p-4 flex flex-col gap-3"><div><div className="font-bold">Đọc & ghi nhớ lại tri thức</div><p className="m-0 mt-1 text-xs text-muted">Xếp hàng đọc lại tệp ở nền. Cần bộ xử lý nền bật trên máy chủ (nếu không, máy chủ trả lỗi 409).</p></div>
            <div className="flex gap-2 items-center"><select className="select !h-9" value={rxScope} onChange={(e) => setRxScope(e.target.value)}><option value="pending">Việc dang dở</option><option value="failed">Tệp bị lỗi</option><option value="embeddings">Chỉ tạo lại vector</option><option value="all">Toàn bộ (tốn chi phí)</option></select>
              <button className="btn w-fit" disabled={busy} onClick={runReindex}><Play size={15} />Chạy</button></div>
            {rx && <div className="rounded-lg px-3 py-2 text-sm font-semibold bg-green-50 text-green-800">Đã xếp hàng {rx.attachments} tệp, {rx.items} mục · bộ xử lý: {rx.worker.running} chạy, {rx.worker.waiting} chờ</div>}</div>
        </div>
      </Section>
      {edit && <Modal title={edit.key && map.has(edit.key) ? `Sửa ${edit.key}` : 'Đặt cấu hình'} size="sm" onClose={() => setEdit(null)} footer={<><button className="btn outline" onClick={() => setEdit(null)}>Hủy</button><button className="btn" disabled={busy || !edit.key.trim()} onClick={async () => { if (await put1(edit.key.trim(), edit.value, edit.description)) setEdit(null) }}>Lưu</button></>}>
        <div className="grid gap-4"><Field label="Khóa"><input className="input font-mono" value={edit.key} onChange={(e) => setEdit({ ...edit, key: e.target.value })} placeholder="ai_enabled" /></Field>
          <Field label="Giá trị"><input className="input" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} /></Field>
          <Field label="Mô tả"><input className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field></div></Modal>}
    </div>)
}

export function Audit() {
  const [page, setPage] = useState(1)
  const [f, setF] = useState({ action: '', target_table: '', target_id: '', user_id: '', from: '', to: '' })
  const q = { page, limit: 50, action: f.action, target_table: f.target_table, target_id: f.target_id, user_id: f.user_id, from: f.from, to: f.to }
  const { data, loading, error, reload } = useGet<{ logs: { id: number; user_id: number; action: string; target_table: string; target_id: number; action_time: string; details: string }[]; total: number; page: number; pages: number }>('/audit-logs', q)
  const [view, setView] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); setPage(1) }
  async function csv() { try { const r = await download('/audit-logs', { ...q, format: 'csv', page: undefined, limit: undefined }, 'nhat-ky-kiem-toan.csv', [{ name: 'CSV', extensions: ['csv'] }]); if (r.ok) toast.ok('Đã xuất CSV') } catch (e) { toast.error(e) } }
  const pretty = (d: string) => { try { return JSON.stringify(JSON.parse(d), null, 2) } catch { return d } }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Nhật ký kiểm toán" subtitle="Mọi thao tác quan trọng đều được ghi lại" actions={<button className="btn outline" onClick={csv}><Download size={15} />Xuất CSV</button>} />
      <div className="card !p-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <input className="input" placeholder="Hành động (item.approve)" value={f.action} onChange={(e) => set('action', e.target.value)} />
        <input className="input" placeholder="Bảng (ITEM)" value={f.target_table} onChange={(e) => set('target_table', e.target.value)} />
        <input className="input" placeholder="Mã đối tượng" inputMode="numeric" value={f.target_id} onChange={(e) => set('target_id', e.target.value.replace(/\D/g, ''))} />
        <input className="input" placeholder="Mã người dùng" inputMode="numeric" value={f.user_id} onChange={(e) => set('user_id', e.target.value.replace(/\D/g, ''))} />
        <input type="date" className="input" value={f.from} onChange={(e) => set('from', e.target.value)} /><input type="date" className="input" value={f.to} onChange={(e) => set('to', e.target.value)} />
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Thời gian</th><th>Người dùng</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>
        {loading && !data && <tr><td colSpan={5}><Loading /></td></tr>}
        {data && data.logs.length === 0 && <tr><td colSpan={5}><Empty /></td></tr>}
        {data?.logs.map((l) => <tr key={l.id}><td className="whitespace-nowrap">{dt(l.action_time)}</td><td>#{l.user_id}</td><td><Pill sm tone="soft">{l.action}</Pill></td><td>{l.target_table} #{l.target_id}</td>
          <td className="max-w-[320px]"><button className="text-left truncate w-full font-mono text-xs text-muted cursor-pointer bg-transparent border-0 hover:text-brand-700" onClick={() => setView(pretty(l.details))}>{l.details}</button></td></tr>)}</tbody></table></div>
      {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      {view && <Modal title="Chi tiết nhật ký" size="md" onClose={() => setView(null)}><pre className="m-0 text-xs whitespace-pre-wrap">{view}</pre></Modal>}
    </div>)
}

interface ImportRes { dry_run: boolean; total: number; valid: number; failed: number; duplicates: number; rows: { index: number; title: string; status: string; errors: string[]; item_id: number | null; warnings: string[] }[] }
const SAMPLE_JSON = `[
  {
    "type": "article",
    "title": "Cơ sở dữ liệu: quy trình sao lưu",
    "summary": "Sao lưu hằng ngày lúc 02:00",
    "content": "Sao lưu chạy lúc 02:00 mỗi ngày, mã hóa AES-256, giữ 30 ngày, khôi phục thử mỗi quý.",
    "space": "Vận hành",
    "owner_email": "an@congty.vn",
    "tags": ["van-hanh"],
    "risk_level": "R2"
  }
]`
export function ImportItems() {
  const [fmt, setFmt] = useState<'json' | 'csv'>('json')
  const [text, setText] = useState(SAMPLE_JSON)
  const [res, setRes] = useState<ImportRes | null>(null)
  const [done, setDone] = useState(false)
  const { busy, run } = useBusy()
  async function load() { const r = await deskApi().openText({ filters: [{ name: 'JSON / CSV', extensions: ['json', 'csv'] }] }); if (r.data) { setText(r.data.text); setFmt(r.data.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json'); setRes(null); setDone(false); toast.ok(`Đã nạp ${r.data.name}`) } }
  function body(dry: boolean) {
    if (fmt === 'json') {
      let items: unknown
      try { items = JSON.parse(text) } catch { throw new ApiError('JSON không hợp lệ', 0) }
      if (!Array.isArray(items)) throw new ApiError('JSON phải là một mảng các mục', 0)
      return { dry_run: dry, format: 'json', items }
    }
    if (parseCsv(text).length < 2) throw new ApiError('CSV cần dòng tiêu đề và ít nhất một dòng dữ liệu', 0)
    return { dry_run: dry, format: 'csv', csv: text }
  }
  async function go(dry: boolean) {
    let b; try { b = body(dry) } catch (e) { return toast.error(e) }
    const r = await run(() => post<ImportRes>('/import/items', b), dry ? undefined : 'Đã nhập — các mục ở trạng thái nháp chờ duyệt')
    if (r) { setRes(r); setDone(!dry) }
  }
  return (
    <div className="flex flex-col gap-5 max-w-[1200px]">
      <PageHeader title="Nhập hàng loạt" subtitle="Tối đa 500 dòng. Luôn chạy thử trước; mục nhập vào ở trạng thái nháp. Mảng, người sở hữu (owner_email) và thẻ phải tồn tại." actions={<button className="btn outline" onClick={load}><Upload size={15} />Nạp từ tệp</button>} />
      <Section title="Dữ liệu nhập" right={<Seg sm value={fmt} onChange={(v) => { setFmt(v); setRes(null) }} options={[{ value: 'json', label: 'JSON' }, { value: 'csv', label: 'CSV' }]} />}>
        {fmt === 'csv' && <p className="mt-0 text-xs text-muted">CSV chỉ phù hợp tài liệu / bài viết. Dòng đầu là tiêu đề cột: type,title,summary,content,space,owner_email,tags,risk_level…</p>}
        <textarea className="textarea font-mono text-[12.5px]" rows={14} value={text} onChange={(e) => { setText(e.target.value); setRes(null); setDone(false) }} />
        <div className="flex gap-3 mt-4"><button className="btn outline" disabled={busy || done} onClick={() => go(true)}><FileJson size={15} />Chạy thử (không ghi)</button>
          <button className="btn" disabled={busy || done || !res || res.dry_run === false || res.failed > 0 || res.valid === 0} onClick={() => go(false)}><FileSpreadsheet size={15} />Nhập thật</button>
          {res && res.dry_run && res.failed > 0 && <span className="text-sm text-red-600 font-semibold self-center">Sửa hết dòng lỗi rồi chạy thử lại trước khi nhập thật.</span>}</div>
      </Section>
      {res && (
        <Section title={res.dry_run ? 'Kết quả chạy thử' : 'Kết quả nhập thật'}>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4"><Stat label="Tổng dòng" value={res.total} /><Stat label="Hợp lệ" value={res.valid} /><Stat label="Lỗi" value={res.failed} /><Stat label="Trùng" value={res.duplicates} /></div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>#</th><th>Tiêu đề</th><th>Trạng thái</th><th>Lỗi / cảnh báo</th><th>Mã mục</th></tr></thead><tbody>
            {res.rows.map((r) => <tr key={r.index}><td>{r.index + 1}</td><td className="font-bold">{r.title}</td><td><Pill sm tone={r.status === 'ok' ? 'ok' : r.status === 'duplicate' ? 'warn' : 'bad'}>{r.status}</Pill></td>
              <td className="text-xs">{[...(r.errors || []), ...(r.warnings || [])].join(' · ') || '—'}</td><td>{r.item_id ?? '—'}</td></tr>)}</tbody></table></div>
        </Section>)}
    </div>)
}

export function ExportFull() {
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useGet<{ exported_at: string; items: unknown[]; total: number; pages: number }>('/export/full', { page, limit: 100 })
  async function dl() { try { const r = await download('/export/full', { page, limit: 100, download: 1 }, `memorable-export-trang-${page}.json`, [{ name: 'JSON', extensions: ['json'] }]); if (r.ok) toast.ok('Đã xuất tệp JSON') } catch (e) { toast.error(e) } }
  return (
    <div className="flex flex-col gap-4 max-w-[900px]">
      <PageHeader title="Xuất toàn bộ dữ liệu" subtitle="Chỉ quản trị viên. Xuất theo trang (100 mục/trang) gồm phiên bản, thẻ và tệp đính kèm." />
      <ErrorBox error={error} onRetry={reload} />{loading && !data && <Loading />}
      {data && (<div className="card flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-4"><Stat label="Tổng số mục" value={data.total} /><Stat label="Số trang" value={data.pages} /><Stat label="Mục ở trang này" value={data.items.length} /></div>
        <div className="text-sm text-muted">Dữ liệu được tạo lúc {dt(data.exported_at)}.</div>
        <div className="flex gap-3 items-center"><button className="btn" onClick={dl}><Download size={15} />Tải trang {page} (.json)</button>
          <Pager page={page} pages={data.pages} onPage={setPage} /></div></div>)}
    </div>)
}

export function Connection() {
  const user = useAuth((s) => s.user)!
  const n = useNotices()
  const [cfg, setCfg] = useState<{ serverUrl: string } | null>(null)
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState<{ version: string; electron: string; node: string } | null>(null)
  const [prof, setProf] = useState<{ id: number; name: string; email: string; role: string } | null>(null)
  useEffect(() => {
    deskApi().getConfig().then((r) => { if (r.data) { setCfg(r.data); setUrl(r.data.serverUrl) } })
    deskApi().info().then((r) => setInfo(r.data ?? null))
    get<typeof prof>('/user/profile').then(setProf).catch(() => undefined)
  }, [])
  async function save() { const r = await deskApi().setConfig({ serverUrl: url }); if (!r.ok) return toast.error(r.error); setCfg(r.data!); setUrl(r.data!.serverUrl); toast.ok('Đã lưu — kiểm tra kết nối…'); n.ping() }
  void api
  return (
    <div className="flex flex-col gap-5 max-w-[900px]">
      <PageHeader title="Kết nối & tài khoản" />
      <Section title="Máy chủ Memorable API" right={<Pill tone={n.online ? 'ok' : n.online === false ? 'bad' : 'gray'}>{n.online ? `Online · ${n.ms} ms` : n.online === false ? 'Offline' : 'Đang kiểm tra'}</Pill>}>
        <div className="flex gap-3 items-end"><Field label="Địa chỉ máy chủ (cổng API)" className="flex-1"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={APP_CONFIG.server} /></Field>
          <button className="btn" disabled={!url || url === cfg?.serverUrl} onClick={save}>Lưu</button><button className="btn outline" onClick={() => n.ping()}>Kiểm tra</button></div>
        <p className="text-xs text-muted mb-0">Tài liệu Swagger của máy chủ chạy ở cổng 3002; ứng dụng gọi API ở cổng 3001. Đổi địa chỉ sẽ áp dụng cho các yêu cầu tiếp theo.</p>
      </Section>
      <Section title="Tài khoản đang đăng nhập"><div className="grid grid-cols-2 gap-4">
        <div><div className="text-[11px] font-bold uppercase text-muted">Họ tên</div><div className="font-bold">{prof?.name ?? user.name}</div></div>
        <div><div className="text-[11px] font-bold uppercase text-muted">Email</div><div className="font-bold">{prof?.email ?? user.email}</div></div>
        <div><div className="text-[11px] font-bold uppercase text-muted">Vai trò</div><Pill tone="soft" sm>{ROLE_LABEL[prof?.role ?? user.role]}</Pill></div>
        <div><div className="text-[11px] font-bold uppercase text-muted">Mã người dùng</div><div className="font-bold flex items-center gap-1"><KeyRound size={14} />#{prof?.id ?? user.id}</div></div></div>
        <p className="text-xs text-muted mb-0">Token đăng nhập có hiệu lực 1 giờ; hết hạn ứng dụng sẽ yêu cầu đăng nhập lại.</p></Section>
      {info && <Section title="Về ứng dụng"><div className="text-sm text-muted">Memorable Desktop {info.version} · Electron {info.electron} · Node {info.node}</div></Section>}
    </div>)
}
