import { ApiError, del, get, post, put } from '../lib/api'
import type { Agent, SkillCatalog } from '../lib/types'
import { useChat } from '../store/chat'
import { useWorkspace, Ctx } from './workspace'

// Trợ lý đọc hiểu của người đọc: một Agent riêng tư được tạo tự động (lần đầu dùng).
// Agent tự tra cứu kho tri thức và ĐỌC tài liệu theo mã [doc:ID], nên hỏi về "bài đang mở" chính xác hơn hỏi đáp thường.
const NAME = 'Trợ lý thư viện'
const INSTRUCTIONS = 'Trả lời bằng tiếng Việt đơn giản, dễ hiểu cho người không rành công nghệ. Chia thành các ý ngắn hoặc các bước đánh số. Khi hướng dẫn thao tác, luôn nêu cách kiểm tra đã làm đúng chưa. Luôn trích nguồn tài liệu.'

let pending: Promise<number | null> | null = null
/** Tìm hoặc tạo Agent của người đọc; trả null nếu máy chủ không hỗ trợ Agent. */
export function ensureReaderAgent(): Promise<number | null> {
  if (pending) return pending
  pending = (async () => {
    const ws = useWorkspace.getState()
    const status = useChat.getState().status
    if (status && !status.features.includes('agent')) return null
    if (ws.readerAgent) { try { const a = await get<Agent>(`/agents/${ws.readerAgent}`); if (a.is_active) return a.id } catch { /* tạo lại */ } }
    try {
      const mine = await get<Agent[]>('/agents', { scope: 'mine' })
      const found = (mine || []).find((a) => a.name === NAME && a.is_active)
      if (found) { ws.setReaderAgent(found.id); return found.id }
    } catch { return null }
    let skills: number[] = []
    try { const cat = await get<SkillCatalog>('/agents/skills'); const all = cat.categories.flatMap((c) => c.skills); skills = all.filter((s) => /concise|ngắn/i.test(s.slug + s.name)).slice(0, 1).map((s) => s.id) } catch { /* không có skill */ }
    const body = { name: NAME, description: 'Trợ lý đọc hiểu tài liệu trong thư viện tri thức', knowledge_mode: 'documents', visibility: 'private', custom_instructions: INSTRUCTIONS }
    try { const a = await post<Agent>('/agents', { ...body, skill_ids: skills }); ws.setReaderAgent(a.id); return a.id } catch (e) {
      if (e instanceof ApiError && e.status === 422 && skills.length) { try { const a = await post<Agent>('/agents', body); ws.setReaderAgent(a.id); return a.id } catch { return null } }
      return null
    }
  })().finally(() => { pending = null })
  return pending
}

/** Đặt Agent đọc hiểu làm trợ lý đang trò chuyện (nếu có), ngược lại dùng hỏi đáp thường. */
export async function useAgentIfAvailable(): Promise<number | null> {
  const id = await ensureReaderAgent()
  useChat.getState().selectAgent(id)
  if (id) { try { await useChat.getState().loadAgents() } catch { /* bỏ qua */ } }
  return id
}

export async function setReaderKnowledge(hybrid: boolean) {
  const id = useWorkspace.getState().readerAgent; if (!id) return
  await put(`/agents/${id}`, { knowledge_mode: hybrid ? 'hybrid' : 'documents' })
  await useChat.getState().loadAgents()
}

export interface QuickAction { key: string; label: string; hint: string; prompt: (c: Ctx) => string }
/** Những việc trợ lý làm hộ trên bài đang mở. */
export const DOC_ACTIONS: QuickAction[] = [
  { key: 'sum', label: 'Tóm tắt 5 ý chính', hint: 'Đọc nhanh trong 30 giây', prompt: (c) => `Hãy đọc tài liệu [doc:${c.id}] rồi tóm tắt thành tối đa 5 ý chính, bằng tiếng Việt đơn giản.` },
  { key: 'easy', label: 'Giải thích dễ hiểu', hint: 'Như cho người mới', prompt: (c) => `Hãy đọc tài liệu [doc:${c.id}] rồi giải thích lại như cho người mới, tránh thuật ngữ, có ví dụ đời thường.` },
  { key: 'todo', label: 'Biến thành checklist', hint: 'Danh sách việc cần làm', prompt: (c) => `Hãy đọc tài liệu [doc:${c.id}] rồi biến thành danh sách việc cần làm (checklist) theo đúng thứ tự, mỗi dòng một việc.` },
  { key: 'warn', label: 'Điều cần tránh', hint: 'Lưu ý và rủi ro', prompt: (c) => `Hãy đọc tài liệu [doc:${c.id}] rồi liệt kê các lưu ý quan trọng, rủi ro và những điều tuyệt đối không được làm.` },
]

/** Gửi một việc cho trợ lý về bài đang mở, hiện trong khung chat bằng nhãn ngắn gọn. */
export async function runDocAction(c: Ctx, a: QuickAction) {
  const chat = useChat.getState()
  chat.setOpen(true)
  const agent = await useAgentIfAvailable()
  useChat.setState({ convId: null }) // mỗi việc là một hội thoại mới, hỏi tiếp vẫn nhớ
  const label = `${a.label}: “${c.title}”`
  if (agent) await useChat.getState().ask(a.prompt(c), 'documents', label)
  else await useChat.getState().ask(`Về bài "${c.title}": ${a.label.toLowerCase()}`.slice(0, 500), 'documents', label, { item_ids: [c.id] })
  useChat.getState().selectAgent(null) // câu hỏi tiếp theo đi qua hỏi đáp có đoạn trích và chính sách nguồn
}

// ---------------------------------------------------------------------------
// Trợ lý đọc tệp: Agent riêng ở chế độ "kiến thức chung" để trả lời dựa trên các đoạn trích do người dùng gửi kèm
// (đoạn trích lấy từ tệp trên máy, không phải tài liệu trong kho).
const FILE_AGENT = 'Trợ lý đọc tệp'
const FILE_INSTR = 'Người dùng gửi kèm các đoạn trích từ một tệp trên máy của họ. Chỉ dựa vào các đoạn trích đó để trả lời, bằng tiếng Việt đơn giản. Nêu số trang hoặc số đoạn khi có. Nếu các đoạn trích chưa đủ thông tin, hãy nói rõ là chưa đủ, đừng bịa. Không dùng tài liệu nội bộ của công ty.'
let filePending: Promise<number | null> | null = null
const fileKey = () => `memorable.fileagent.${useWorkspace.getState().uid ?? 0}`
let fileOk: { key: string; id: number } | null = null // đã kiểm tra trong phiên này, khỏi hỏi lại máy chủ mỗi lượt
/** Tệp riêng tư không được lưu thành trí nhớ: tắt trí nhớ của Agent đọc tệp và xóa ký ức đã lỡ ghi từ bản cũ. */
let fileSwept = false
async function privateFileAgent(a: Agent) {
  if (a.use_memory !== false) {
    try { await put(`/agents/${a.id}`, { use_memory: false }) } catch { /* máy chủ cũ chưa có trường này */ }
    try { await del('/agents/memory', { confirm: true, agent_id: a.id }) } catch { /* bỏ qua */ }
  }
  // Mỗi phiên dọn một lần các hội thoại cũ còn sót (phiên trước bị tắt đột ngột, hoặc từ bản cũ chưa tự xóa)
  if (!fileSwept) {
    fileSwept = true
    try {
      const old = await get<{ id: number }[]>(`/agents/${a.id}/conversations`)
      await Promise.all((old || []).map((c) => del(`/agents/conversations/${c.id}`, { keep_memory: false }).catch(() => undefined)))
    } catch { /* bỏ qua */ }
  }
}
// Các hội thoại đã mở với Agent đọc tệp trong phiên: xóa khi người dùng bỏ tệp / rời trang để không lưu lại đoạn trích trên máy chủ
const fileConvs = new Set<number>()
export async function forgetFileConversations() {
  const ids = [...fileConvs]; fileConvs.clear()
  await Promise.all(ids.map((id) => del(`/agents/conversations/${id}`, { keep_memory: false }).catch(() => undefined)))
}
export function ensureFileAgent(): Promise<number | null> {
  if (fileOk && fileOk.key === fileKey()) return Promise.resolve(fileOk.id)
  if (filePending) return filePending
  filePending = (async () => {
    const status = useChat.getState().status
    if (status && !status.features.includes('agent')) return null
    const cached = Number(localStorage.getItem(fileKey()) || 0)
    if (cached) { try { const a = await get<Agent>(`/agents/${cached}`); if (a.is_active) { await privateFileAgent(a); fileOk = { key: fileKey(), id: a.id }; return a.id } } catch { /* tạo lại */ } }
    try {
      const mine = await get<Agent[]>('/agents', { scope: 'mine' })
      const f = (mine || []).find((a) => a.name === FILE_AGENT && a.is_active)
      if (f) { await privateFileAgent(f); localStorage.setItem(fileKey(), String(f.id)); fileOk = { key: fileKey(), id: f.id }; return f.id }
    } catch { return null }
    try {
      const a = await post<Agent>('/agents', { name: FILE_AGENT, description: 'Trả lời câu hỏi dựa trên đoạn trích từ tệp trên máy người dùng', knowledge_mode: 'general', visibility: 'private', use_memory: false, custom_instructions: FILE_INSTR })
      fileSwept = true
      localStorage.setItem(fileKey(), String(a.id)); fileOk = { key: fileKey(), id: a.id }; return a.id
    } catch { return null }
  })().finally(() => { filePending = null })
  return filePending
}

export interface FileAnswer { answer: string; conversation_id: number; model?: string; cost_usd?: number }
/** Gửi một câu hỏi kèm đoạn trích tới Agent đọc tệp. */
export async function askFileAgent(message: string, conversationId?: number | null): Promise<FileAnswer> {
  const id = await ensureFileAgent()
  if (!id) throw new ApiError('Tính năng Agent đang tắt hoặc không dùng được, nên chưa thể hỏi về tệp trên máy.', 503)
  const send = (aid: number, conv?: number | null) => post<FileAnswer>(`/agents/${aid}/chat`, { message: message.slice(0, 2000), ...(conv ? { conversation_id: conv } : {}) })
  try { const r = await send(id, conversationId); fileConvs.add(r.conversation_id); return r } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e
    // Agent đã bị xóa: tạo lại và hỏi lại (hội thoại cũ không còn)
    fileOk = null; localStorage.removeItem(fileKey())
    const again = await ensureFileAgent(); if (!again) throw e
    const r = await send(again, null); fileConvs.add(r.conversation_id); return r
  }
}
