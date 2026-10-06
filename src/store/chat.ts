import { create } from 'zustand'
import { ApiError, LocalFile, askWithFiles, checkFile, get, isAiVisionName, post, uploadAttachments } from '../lib/api'
import { can } from '../lib/permissions'
import type { Agent, AgentMemoryUse, AgentToolUse, AskFileInfo } from '../lib/types'
import { useAuth } from './auth'
import { toast } from './ui'

export interface AnsPassage { chunk_id?: number; kind?: string; attachment_id?: number; filename?: string; page?: string; section?: string; ai_text_unverified?: boolean; tier?: string; score?: number; excerpt?: string }
export interface Src { id: number; title: string; type: string; trust_label: string; freshness: string; next_review_date: string; tier?: string; tier_label?: string; passages?: AnsPassage[] }
export type PolicyChoice = 'auto' | 'all' | 'reviewed' | 'official'
export type AskMode = 'documents' | 'general' | 'hybrid'
export const MODE_LABEL: Record<AskMode, string> = { documents: 'Trong tài liệu', general: 'Ngoài tài liệu', hybrid: 'Kết hợp' }
export const MODE_HINT: Record<AskMode, string> = {
  documents: 'Chỉ trả lời từ tài liệu đã duyệt của nhóm, luôn kèm nguồn',
  general: 'Kiến thức chung của AI — KHÔNG gửi tài liệu nội bộ, chỉ gửi câu hỏi',
  hybrid: 'Ưu tiên tài liệu; phần thiếu được bổ sung bằng kiến thức chung (tách riêng, có nhãn)',
}
export const MODE_FEATURE: Record<AskMode, string> = { documents: 'ask', general: 'ask_general', hybrid: 'ask_hybrid' }
export interface Ans {
  mode?: AskMode; answer: string; insufficient_info?: boolean; grounded?: boolean; caveats?: string; warning?: string
  general_knowledge?: string; suggests_documents?: boolean; sources: Src[]; model: string; cost_usd: number
  // Đối chiếu nhiều tài liệu & kiểm soát nguồn
  conflicts?: unknown[]; cross_document?: boolean; retrieval?: { mode?: string; source_policy?: string; documents_considered?: number; passages_used?: number; reranked?: boolean; excluded_by_policy?: number }
  // Trả lời từ tệp trên máy người dùng (không lưu lên máy chủ)
  localFile?: { name: string }
  // Trả lời của Agent
  agentName?: string; tools_used?: AgentToolUse[]; consulted?: number[]; steps?: number; warnings?: string[]; sourceIds?: number[]
  // Trả lời từ việc AI xem ảnh/PDF (POST /ai/analyze)
  analysis?: { filename: string; kind: string; attachment_id: number; item_id: number; note?: string }
  // Hỏi bằng tệp gửi thẳng lên máy chủ (POST /ai/ask-file)
  fileAsk?: AskFileInfo
  // Trí nhớ Agent đã dùng cho lượt trả lời
  memory?: AgentMemoryUse
}
export interface ChatFile { name: string; size: number; attId?: number; status: 'saving' | 'saved' | 'error'; error?: string }
export interface Msg {
  id: number; role: 'user' | 'ai' | 'sys'; text: string; ans?: Ans; err?: string; mode?: AskMode; question?: string
  files?: ChatFile[]; itemId?: number; itemTitle?: string; agentName?: string
}
export interface AiStatus { ready: boolean; api_key_configured: boolean; enabled: boolean; data_policy_approved: boolean; budget_set: boolean; features: string[]; model?: string }
export type Target = { kind: 'ask' } | { kind: 'new'; spaceId?: number } | { kind: 'item'; itemId?: number }

const KEY = 'memorable.chat'
const AKEY = 'memorable.chat.agent'
const load = (): Msg[] => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]') } catch { return [] } }
const save = (m: Msg[]) => { try { sessionStorage.setItem(KEY, JSON.stringify(m.slice(-40))) } catch { /* bỏ qua */ } }
const loadAgent = (): { agentId: number | null; convId: number | null } => { try { return JSON.parse(sessionStorage.getItem(AKEY) || '{"agentId":null,"convId":null}') } catch { return { agentId: null, convId: null } } }
const saveAgent = (agentId: number | null, convId: number | null) => { try { sessionStorage.setItem(AKEY, JSON.stringify({ agentId, convId })) } catch { /* bỏ qua */ } }

/** Nội dung tệp của các tin nhắn trong phiên hiện tại (không lưu vào sessionStorage) để xem trước ngay. */
const chatBytes = new Map<string, Uint8Array>()
export const getChatBytes = (msgId: number, i: number) => chatBytes.get(`${msgId}:${i}`)

interface ChatState {
  open: boolean
  wide: boolean
  mode: AskMode
  msgs: Msg[]
  busy: boolean
  unseen: number
  status: AiStatus | null
  draft: LocalFile[]
  target: Target
  agentId: number | null
  convId: number | null
  agents: Agent[]
  vision: boolean
  policy: PolicyChoice
  setPolicy: (p: PolicyChoice) => void
  /** Tìm sâu: mở rộng qua thẻ liên quan và nhiều tài liệu hơn (chậm hơn) */
  deep: boolean
  setDeep: (v: boolean) => void
  setOpen: (v: boolean) => void
  toggle: () => void
  setWide: (v: boolean) => void
  setMode: (m: AskMode) => void
  setTarget: (t: Target) => void
  setVision: (v: boolean) => void
  addDraft: (files: LocalFile[]) => void
  removeDraft: (i: number) => void
  clear: () => void
  loadStatus: () => Promise<void>
  loadAgents: () => Promise<void>
  selectAgent: (id: number | null) => void
  newConversation: () => void
  ask: (q: string, mode?: AskMode, display?: string, opts?: { item_ids?: number[] }) => Promise<void>
  /** Hỏi bằng tệp: gửi tệp + câu hỏi lên máy chủ, trả lời từ tài liệu của nhóm (tệp không được lưu). */
  askFile: (files: LocalFile[], q: string, opts?: { item_ids?: number[] }) => Promise<void>
  send: (text: string) => Promise<void>
}

let seq = Date.now()
const errText = (st: number, msg: string, e: unknown) =>
  st === 429 ? 'Đã hết hạn mức AI trong ngày hoặc hết ngân sách tháng (429).'
    : st === 503 ? 'AI chưa bật, chưa cấu hình hoặc quản trị đã tắt tính năng này (503). Xem trạng thái AI.'
      : st === 422 ? `Yêu cầu bị từ chối: ${msg} (không nên chứa mật khẩu, khóa hay số điện thoại).`
        : st === 415 ? `Loại tệp AI chưa đọc được: ${msg}` : st === 500 ? `Lỗi máy chủ: ${msg}` : (e instanceof ApiError ? msg : String(e))

interface AgentChatRes {
  conversation_id: number; answer: string; mode: AskMode; grounded: boolean; sources: Src[]; consulted: number[]
  tools_used: AgentToolUse[]; steps: number; warnings: string[]; model: string; cost_usd: number; memory?: AgentMemoryUse
}
interface AnalyzeRes { attachment_id: number; filename: string; item_id: number; kind: string; answer: string; note?: string; model: string; cost_usd: number }

export const useChat = create<ChatState>((set, getState) => {
  const push = (...m: Msg[]) => set((s) => { const n = [...s.msgs, ...m]; save(n); return { msgs: n } })
  const patchMsg = (id: number, p: Partial<Msg>) => set((s) => { const n = s.msgs.map((x) => (x.id === id ? { ...x, ...p } : x)); save(n); return { msgs: n } })
  const finish = (am: Msg | Msg[]) => set((s) => { const arr = Array.isArray(am) ? am : [am]; const m = [...s.msgs, ...arr]; save(m); return { msgs: m, busy: false, unseen: s.open ? 0 : s.unseen + 1 } })

  /** Gửi câu hỏi (hỏi đáp thường hoặc Agent) và thêm câu trả lời; không thêm tin nhắn người dùng. */
  async function runAsk(question: string, mode: AskMode, opts?: { item_ids?: number[] }) {
    set({ busy: true })
    const { agentId, convId, agents } = getState()
    if (agentId) {
      const ag = agents.find((a) => a.id === agentId)
      try {
        const r = await post<AgentChatRes>(`/agents/${agentId}/chat`, { message: question.slice(0, 2000), ...(convId ? { conversation_id: convId } : {}) })
        set({ convId: r.conversation_id }); saveAgent(agentId, r.conversation_id)
        finish({
          id: ++seq, role: 'ai', text: r.answer, mode: r.mode, agentName: ag?.name, question,
          ans: { mode: r.mode, answer: r.answer, grounded: r.grounded, sources: r.sources || [], consulted: r.consulted, tools_used: r.tools_used, steps: r.steps, warnings: r.warnings, model: r.model, cost_usd: r.cost_usd, agentName: ag?.name, memory: r.memory },
        })
      } catch (e) {
        const er = e as ApiError; const st = e instanceof ApiError ? er.status : 0
        const full = st === 409 && /đầy|full/i.test(er.message) ? 'Hội thoại đã đầy (200 tin) — hãy bắt đầu hội thoại mới.' : st === 409 ? 'Agent đang tắt hoặc hội thoại không dùng được.' : st === 404 ? 'Không tìm thấy Agent hoặc hội thoại này (có thể đã bị xóa).' : errText(st, er.full ?? String(e), e)
        if (st === 404 || (st === 409 && /đầy|full/i.test(er.message))) { set({ convId: null }); saveAgent(agentId, null) }
        finish({ id: ++seq, role: 'ai', text: '', mode, agentName: ag?.name, err: full })
      }
      return
    }
    try {
      const pol = getState().policy
      const r = await post<Omit<Ans, 'agentName'>>('/ai/ask', { question: question.slice(0, 500), mode, ...(pol !== 'auto' ? { source_policy: pol } : {}), ...(getState().deep && mode !== 'general' ? { depth: 'deep' } : {}), ...(opts?.item_ids?.length ? { item_ids: opts.item_ids } : {}) })
      finish({ id: ++seq, role: 'ai', text: r.answer, ans: { ...r, mode: r.mode ?? mode }, mode, question })
    } catch (e) {
      const er = e as ApiError
      finish({ id: ++seq, role: 'ai', text: '', mode, err: errText(e instanceof ApiError ? er.status : 0, e instanceof ApiError ? er.full : String(e), e) })
    }
  }

  /** AI nhìn ảnh / PDF vừa tải lên và trả lời (POST /ai/analyze). */
  async function analyzeFile(attId: number, name: string, question: string): Promise<Msg> {
    try {
      const r = await post<AnalyzeRes>('/ai/analyze', { attachment_id: attId, ...(question ? { question: question.slice(0, 500) } : {}) })
      return { id: ++seq, role: 'ai', text: r.answer, mode: 'documents', ans: { answer: r.answer, sources: [], model: r.model, cost_usd: r.cost_usd, analysis: { filename: r.filename || name, kind: r.kind, attachment_id: r.attachment_id, item_id: r.item_id, note: r.note } } }
    } catch (e) {
      const er = e as ApiError
      return { id: ++seq, role: 'ai', text: '', err: `AI chưa đọc được “${name}”: ${errText(e instanceof ApiError ? er.status : 0, e instanceof ApiError ? er.full : String(e), e)}` }
    }
  }

  const a0 = loadAgent()
  return {
    open: false, wide: false, mode: 'documents', msgs: load(), busy: false, unseen: 0, status: null, draft: [], target: { kind: 'new' },
    agentId: a0.agentId, convId: a0.convId, agents: [], vision: true,
    policy: ((() => { try { const v = localStorage.getItem('memorable.chat.policy'); return v === 'all' || v === 'reviewed' || v === 'official' ? v : 'auto' } catch { return 'auto' } })()) as PolicyChoice,
    deep: false,
    setDeep: (v) => set({ deep: v }),
    setPolicy: (p) => { try { localStorage.setItem('memorable.chat.policy', p) } catch { /* bỏ qua */ } set({ policy: p }) },
    setOpen: (v) => set({ open: v, unseen: v ? 0 : getState().unseen }),
    toggle: () => set((s) => ({ open: !s.open, unseen: s.open ? s.unseen : 0 })),
    setWide: (v) => set({ wide: v }),
    setMode: (m) => set({ mode: m }),
    setTarget: (t) => set({ target: t }),
    setVision: (v) => set({ vision: v }),
    addDraft: (files) => {
      const role = useAuth.getState().user?.role
      if (!can(role, 'write') && !can(role, 'ask')) { toast.warn('Vai trò của bạn không được gửi tệp'); return }
      if (!can(role, 'write')) set({ target: { kind: 'ask' } })
      const ok: LocalFile[] = []
      for (const f of files) { const bad = checkFile(f); if (bad) toast.warn(`${f.name}: ${bad}`); else ok.push(f) }
      if (ok.length) set((s) => ({ draft: [...s.draft, ...ok].slice(0, 10) }))
    },
    removeDraft: (i) => set((s) => ({ draft: s.draft.filter((_, j) => j !== i) })),
    clear: () => { save([]); chatBytes.clear(); set({ msgs: [], unseen: 0, convId: null }); saveAgent(getState().agentId, null) },
    loadStatus: async () => { try { set({ status: await get<AiStatus>('/ai/status') }) } catch { /* bỏ qua */ } },
    loadAgents: async () => {
      try {
        const list = await get<Agent[]>('/agents', { scope: 'all' })
        const act = (list || []).filter((a) => a.is_active)
        set((s) => ({ agents: act, agentId: s.agentId && !act.some((a) => a.id === s.agentId) ? null : s.agentId }))
      } catch { /* vai trò không dùng được Agent hoặc máy chủ cũ */ }
    },
    selectAgent: (id) => { set({ agentId: id, convId: null }); saveAgent(id, null) },
    newConversation: () => { set({ convId: null }); saveAgent(getState().agentId, null); push({ id: ++seq, role: 'sys', text: 'Đã bắt đầu hội thoại mới — Agent sẽ không nhớ nội dung trước đó.' }) },
    askFile: async (files, q, opts) => {
      const s = getState(); if (s.busy || !files.length) return
      const question = q.trim()
      const mode: AskMode = s.mode === 'hybrid' ? 'hybrid' : 'documents'
      const um: Msg = { id: ++seq, role: 'user', text: question, mode, files: files.map((f) => ({ name: f.name, size: f.size, status: 'saved' as const })) }
      files.forEach((f, i) => f.bytes && chatBytes.set(`${um.id}:${i}`, f.bytes))
      push(um); set({ busy: true })
      try {
        const pol = s.policy
        const r = await askWithFiles<Omit<Ans, 'fileAsk'> & AskFileInfo>(files, {
          question: question.length >= 3 ? question.slice(0, 500) : undefined, mode, ...(pol !== 'auto' ? { source_policy: pol } : {}), ...(opts?.item_ids?.length ? { item_ids: opts.item_ids.join(',') } : {}),
        })
        const fileAsk: AskFileInfo = { uploaded: r.uploaded || [], skipped: r.skipped || [], need: r.need, key_facts: r.key_facts, search_queries: r.search_queries, discrepancies: r.discrepancies || [], related: r.related || [], searched: r.searched, note: r.note }
        finish({ id: ++seq, role: 'ai', text: r.answer, mode, question: question || files.map((f) => f.name).join(', '), ans: { ...r, mode: r.mode ?? mode, sources: r.sources || [], fileAsk } })
      } catch (e) {
        const er = e as ApiError; const st = e instanceof ApiError ? er.status : 0
        const msg = st === 413 ? 'Quá 5 tệp hoặc có tệp lớn hơn 10 MB.' : st === 422 ? `Không dùng được tệp hoặc câu hỏi: ${er.full}` : errText(st, e instanceof ApiError ? er.full : String(e), e)
        patchMsg(um.id, { files: um.files!.map((f) => ({ ...f, status: 'error' as const, error: msg })) })
        finish({ id: ++seq, role: 'ai', text: '', mode, err: msg })
      }
    },
    ask: async (q, modeArg, display, opts) => {
      const question = q.trim()
      const minLen = getState().agentId ? 1 : 5
      if (question.length < minLen || getState().busy) return
      const mode = modeArg ?? getState().mode
      push({ id: ++seq, role: 'user', text: display ?? question, mode })
      await runAsk(question, mode, opts)
    },

    /** Gửi một lượt từ ô nhập: có thể kèm tệp (lưu vào kho tri thức, AI xem ảnh/PDF) và/hoặc câu hỏi. */
    send: async (text) => {
      const s = getState(); const q = text.trim(); const files = s.draft
      if (s.busy) return
      if (!files.length) { await s.ask(q); return }
      // Chỉ hỏi (không lưu): gửi tệp lên /ai/ask-file — mặc định của người đọc
      if (s.target.kind === 'ask' || !can(useAuth.getState().user?.role, 'write')) { set({ draft: [] }); await s.askFile(files.slice(0, 5), q); return }
      const mode = s.mode; const target = s.target
      const um: Msg = { id: ++seq, role: 'user', text: q, mode, files: files.map((f) => ({ name: f.name, size: f.size, status: 'saving' as const })) }
      files.forEach((f, i) => f.bytes && chatBytes.set(`${um.id}:${i}`, f.bytes))
      push(um); set({ draft: [], busy: true })

      let itemId: number | undefined; let itemTitle = ''; let created = false
      try {
        if (target.kind === 'item') {
          if (!target.itemId) throw new ApiError('Hãy nhập mã mục cần đính kèm', 0)
          itemId = target.itemId
          try { const it = await get<{ title: string }>(`/items/${itemId}`); itemTitle = it.title } catch (e) { throw new ApiError(`Không mở được mục #${itemId}: ${(e as Error).message}`, (e as ApiError).status ?? 0) }
        } else {
          const spaceId = target.spaceId ?? useAuth.getState().spaces[0]?.id
          if (!spaceId) throw new ApiError('Chưa có mảng nội dung nào để lưu tệp', 0)
          itemTitle = (q.length >= 3 ? q : files[0].name).slice(0, 120)
          const r = await post<{ id: number }>('/items', {
            title: itemTitle, type: 'document', space_id: spaceId, summary: `Tệp tải lên từ khung chat: ${files.map((f) => f.name).join(', ')}`.slice(0, 1900),
            content: q.length >= 3 ? q : undefined, risk_level: 'R2', sensitivity_level: 'internal', allow_duplicate: true,
          })
          itemId = r.id; created = true
        }
      } catch (e) {
        const msg = e instanceof ApiError ? e.full : String(e)
        patchMsg(um.id, { files: um.files!.map((f) => ({ ...f, status: 'error' as const, error: msg })) })
        push({ id: ++seq, role: 'sys', text: `Không lưu được tệp: ${msg}` })
        set({ busy: false }); return
      }

      // Tải cả lô lên bằng multipart; API báo riêng từng tệp được nhận / bị từ chối
      const outs = await uploadAttachments(itemId!, files)
      const done: ChatFile[] = files.map((f) => {
        const o = outs.find((x) => x.file === f)
        return o?.ok ? { name: f.name, size: f.size, attId: o.att!.id, status: 'saved' as const } : { name: f.name, size: f.size, status: 'error' as const, error: o?.message || 'Tải lên thất bại' }
      })
      patchMsg(um.id, { files: done })
      const okN = done.filter((f) => f.status === 'saved').length
      push({
        id: ++seq, role: 'sys', itemId, itemTitle,
        text: `Đã lưu ${okN}/${done.length} tệp vào ${created ? 'mục nháp mới' : 'mục'} “${itemTitle}” (#${itemId}).${created ? ' Gửi duyệt để mọi người tìm thấy.' : ''}${done.some((f) => f.status === 'error') ? ' Tệp lỗi: ' + done.filter((f) => f.status === 'error').map((f) => `${f.name} (${f.error})`).join('; ') + '.' : ''}`,
      })

      // AI xem ảnh/PDF ngay trong chat (tối đa 2 tệp): hỏi bằng nội dung người dùng gõ, bỏ trống thì mô tả & tóm tắt
      const feats = getState().status?.features
      const canVision = getState().vision && can(useAuth.getState().user?.role, 'ask') && (!feats || feats.includes('vision'))
      const visual = done.filter((f) => f.status === 'saved' && f.attId && isAiVisionName(f.name)).slice(0, 2)
      if (canVision && visual.length) {
        const replies: Msg[] = []
        for (const f of visual) replies.push(await analyzeFile(f.attId!, f.name, q))
        finish(replies)
        return
      }
      set({ busy: false })
      if (q.length >= (getState().agentId ? 1 : 5)) await runAsk(q, mode)
    },
  }
})
