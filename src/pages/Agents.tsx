import { PolicySelect } from '../components/Knowledge'
import { MemoryPanel } from '../components/Memory'
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertTriangle, Bot, Check, Copy, Eye, FileText, Layers, MessageSquare, Pencil, Plus, Power, Save, Send, Sparkles, Trash2, Users, Wand2, X, Brain, Loader2, Search,
} from 'lucide-react'
import { ApiError, del, get, post, put, useGet } from '../lib/api'
import { can } from '../lib/permissions'
import { dt, KNOWLEDGE_HINT, KNOWLEDGE_LABEL, POLICY_LABEL, SKILL_CATEGORY } from '../lib/format'
import type { Agent, AgentConversation, AgentMemoryUse, AgentMessageRow, AgentPreset, AiMemory, ConvHit, KnowledgeMode, Skill, SkillCatalog } from '../lib/types'
import { Empty, Field, Modal, PageHeader, Pill, Seg } from '../components/ui'
import { ErrorBox, Loading, Section, useBusy } from '../components/shared'
import { Messages } from '../components/chat/Chat'
import { useAiFeature } from '../components/AttachAi'
import { useAuth } from '../store/auth'
import { Msg, useChat } from '../store/chat'
import { confirmDialog, toast } from '../store/ui'

const CAT_COLOR: Record<string, string> = { role: 'bg-violet-100 text-violet-800', style: 'bg-pink-100 text-pink-800', reasoning: 'bg-sky-100 text-sky-800', format: 'bg-amber-100 text-amber-800', quality: 'bg-green-100 text-green-800', task: 'bg-slate-200 text-slate-800' }
const SkillTag = ({ s }: { s: { name: string; category?: string } }) => <span className={clsx('text-[11px] font-bold rounded-md px-2 py-0.5', CAT_COLOR[s.category || ''] || 'bg-brand-100 text-brand-800')}>{s.name}</span>
const errMsg = (e: unknown) => (e instanceof ApiError ? e.full : String(e))

// ====================================================================
//  Xem system prompt thực tế của Agent (không gọi AI)
// ====================================================================
export function PromptPreviewModal({ agent, onClose }: { agent: Pick<Agent, 'id' | 'name'>; onClose: () => void }) {
  const { data, loading, error } = useGet<{ system_prompt: string; knowledge_mode: KnowledgeMode; tools: string[]; skills: { id: number; name: string }[] }>(`/agents/${agent.id}/prompt-preview`)
  return (
    <Modal title={`System prompt: ${agent.name}`} size="lg" onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : data && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap items-center"><Pill tone="soft">{KNOWLEDGE_LABEL[data.knowledge_mode]}</Pill>
            {data.tools.map((t) => <Pill key={t} tone="gray" sm>{t}</Pill>)}{data.skills.map((s) => <Pill key={s.id} tone="ok" sm>{s.name}</Pill>)}</div>
          <p className="m-0 text-xs text-muted">Đây là chỉ dẫn thực tế Agent gửi cho AI (luật nền tảng, luật chế độ tri thức, skill, chỉ dẫn riêng). Không tốn chi phí AI.</p>
          <pre className="m-0 text-[12.5px] whitespace-pre-wrap font-mono bg-[#1f1b2e] text-[#eae6f7] rounded-lg p-4 max-h-[55vh] overflow-auto">{data.system_prompt}</pre>
          <button className="btn outline sm w-fit" onClick={() => { void navigator.clipboard.writeText(data.system_prompt); toast.ok('Đã sao chép system prompt') }}><Copy size={13} />Sao chép</button>
        </div>)}
    </Modal>)
}

// ====================================================================
//  Danh sách Agent
// ====================================================================
export function AgentList() {
  const nav = useNavigate()
  const agentOn = useAiFeature('agent')
  const [scope, setScope] = useState<'mine' | 'team' | 'all'>('all')
  const { data, loading, error, reload } = useGet<Agent[]>('/agents', { scope })
  const { busy, run } = useBusy()
  const [preview, setPreview] = useState<Agent | null>(null)
  const chat = useChat()

  async function toggle(a: Agent) { const r = await run(() => put(`/agents/${a.id}`, { is_active: !a.is_active }), a.is_active ? 'Đã tạm tắt Agent' : 'Đã bật Agent'); if (r) { reload(); void chat.loadAgents() } }
  async function clone(a: Agent) { const r = await run(() => post<Agent>(`/agents/${a.id}/clone`), 'Đã nhân bản Agent thành bản riêng của bạn'); if (r) { reload(); void chat.loadAgents() } }
  async function remove(a: Agent) {
    if (!(await confirmDialog('Xóa Agent', `Xóa Agent “${a.name}” cùng toàn bộ lịch sử hội thoại với Agent này? Không thể hoàn tác.`, { danger: true, okText: 'Xóa' }))) return
    const r = await run(() => del(`/agents/${a.id}`), 'Đã xóa Agent'); if (r !== undefined) { reload(); if (chat.agentId === a.id) chat.selectAgent(null); void chat.loadAgents() }
  }
  function useInBubble(a: Agent) { chat.selectAgent(a.id); chat.setOpen(true); void chat.loadAgents() }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Agent cá nhân hóa" subtitle="Ghép skill prompting, chỉ dẫn riêng và chế độ tri thức thành trợ lý của chính bạn. Agent tự tra cứu tài liệu, đọc tệp đính kèm, xem ảnh/PDF — luôn theo quyền của người đang chat."
        actions={<button className="btn" onClick={() => nav('/agents/new')}><Plus size={16} />Tạo Agent</button>} />
      {!agentOn && <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 p-3 text-sm font-semibold flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />Tính năng Agent đang bị tắt trên máy chủ (cài đặt ai_feature_agent) — bạn vẫn quản lý được Agent nhưng chưa chat được.</div>}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Seg value={scope} onChange={setScope} options={[{ value: 'all', label: 'Tất cả' }, { value: 'mine', label: 'Của tôi' }, { value: 'team', label: 'Đồng nghiệp chia sẻ' }]} />
        <span className="text-xs text-muted">Mỗi người tối đa 10 Agent (quản trị có thể đổi)</span>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && data.length === 0 && <Empty text={scope === 'team' ? 'Chưa có Agent nào được đồng nghiệp chia sẻ' : 'Bạn chưa có Agent nào — hãy tạo từ một mẫu dựng sẵn'} icon={<Bot size={36} strokeWidth={1.5} />} />}
      <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-4">
        {data?.map((a) => (
          <div key={a.id} className={clsx('panel', !a.is_active && 'opacity-70')}>
            <div className="p-4 flex flex-col gap-3 flex-1">
              <div className="flex items-start gap-3">
                <span className="w-11 h-11 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white grid place-items-center shrink-0"><Bot size={22} /></span>
                <div className="min-w-0 flex-1"><div className="font-extrabold text-[15px] leading-tight">{a.name}</div>
                  <div className="text-xs text-muted mt-0.5">{a.is_mine ? 'Của bạn' : `Của ${a.owner?.name}`} · cập nhật {dt(a.updated_at, false)}</div></div>
                {!a.is_active && <Pill sm tone="gray">Đang tắt</Pill>}
              </div>
              {a.description && <div className="text-sm text-ink-2 leading-snug line-clamp-2">{a.description}</div>}
              <div className="flex gap-1.5 flex-wrap">
                <Pill sm tone="soft">{KNOWLEDGE_LABEL[a.knowledge_mode]}</Pill>{a.source_policy && a.knowledge_mode !== 'general' && <Pill sm tone="ok">{POLICY_LABEL[a.source_policy]}</Pill>}
                <Pill sm tone={a.visibility === 'team' ? 'ok' : 'gray'}>{a.visibility === 'team' ? <><Users size={11} />Chia sẻ nhóm</> : 'Riêng tư'}</Pill>
                {a.model_tier === 'fast' && <Pill sm tone="warn">Nhanh</Pill>}
              </div>
              <div className="flex gap-1.5 flex-wrap">{a.skills.map((s) => <SkillTag key={s.id} s={s} />)}
                {a.skills_unavailable > 0 && <Pill sm tone="bad" >{a.skills_unavailable} skill đã tắt</Pill>}{a.skills.length === 0 && <span className="text-xs text-muted">Chưa chọn skill</span>}</div>
              {a.custom_instructions && <div className="text-xs bg-brand-50 border border-line-soft rounded-md px-2.5 py-2 text-muted line-clamp-2"><b className="text-brand-700">Chỉ dẫn riêng:</b> {a.custom_instructions}</div>}
            </div>
            <div className="px-4 py-3 border-t border-line-soft bg-brand-50/60 flex gap-1.5 flex-wrap">
              <button className="btn sm" disabled={!a.is_active} onClick={() => nav(`/agents/${a.id}/chat`)}><MessageSquare size={13} />Chat</button>
              <button className="btn outline sm" disabled={!a.is_active} title="Chọn Agent này trong bóng chat" onClick={() => useInBubble(a)}><Sparkles size={13} />Dùng trong bóng chat</button>
              <button className="btn outline sm" onClick={() => setPreview(a)}><Eye size={13} />Prompt</button>
              {a.is_mine ? <>
                <button className="btn outline sm" onClick={() => nav(`/agents/${a.id}/edit`)}><Pencil size={13} />Sửa</button>
                <button className="btn ghost sm icon" title={a.is_active ? 'Tạm tắt' : 'Bật lại'} disabled={busy} onClick={() => toggle(a)}><Power size={14} /></button>
                <button className="btn ghost sm icon" title="Xóa" disabled={busy} onClick={() => remove(a)}><Trash2 size={14} /></button></>
                : <button className="btn outline sm" disabled={busy} onClick={() => clone(a)}><Copy size={13} />Nhân bản</button>}
            </div>
          </div>))}
      </div>
      {preview && <PromptPreviewModal agent={preview} onClose={() => setPreview(null)} />}
    </div>)
}

// ====================================================================
//  Chọn skill: theo nhóm, tối đa N skill, nhóm loại trừ
// ====================================================================
function SkillPicker({ catalog, value, onChange, max }: { catalog: SkillCatalog; value: number[]; onChange: (v: number[]) => void; max: number }) {
  const all = useMemo(() => catalog.categories.flatMap((c) => c.skills), [catalog])
  const toggle = (s: Skill) => {
    if (value.includes(s.id)) return onChange(value.filter((x) => x !== s.id))
    let next = value
    if (s.exclusive_group) {
      const clash = all.filter((o) => o.exclusive_group === s.exclusive_group && value.includes(o.id))
      if (clash.length) { next = value.filter((x) => !clash.some((c) => c.id === x)); toast.info(`“${s.name}” loại trừ “${clash.map((c) => c.name).join(', ')}” — đã thay thế`) }
    }
    if (next.length >= max) return toast.warn(`Mỗi Agent tối đa ${max} skill`)
    onChange([...next, s.id])
  }
  return (
    <div className="flex flex-col gap-4">
      {catalog.categories.map((c) => c.skills.length > 0 && (
        <div key={c.key}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2">{c.label || SKILL_CATEGORY[c.key]}</div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {c.skills.map((s) => {
              const on = value.includes(s.id)
              return (
                <button type="button" key={s.id} onClick={() => toggle(s)} title={s.instruction}
                  className={clsx('text-left rounded-lg border p-2.5 cursor-pointer transition flex gap-2.5 items-start', on ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-line bg-white hover:border-brand-300')}>
                  <span className={clsx('w-5 h-5 rounded-[5px] border grid place-items-center shrink-0 mt-0.5', on ? 'bg-brand-600 border-brand-600 text-white' : 'border-line')}>{on && <Check size={13} />}</span>
                  <span className="min-w-0"><span className="block font-bold text-[13px]">{s.name}</span>
                    {s.description && <span className="block text-xs text-muted leading-snug">{s.description}</span>}
                    {s.exclusive_group && <span className="block text-[10.5px] text-amber-700 mt-0.5">Loại trừ nhóm “{s.exclusive_group}”</span>}</span>
                </button>)
            })}
          </div>
        </div>))}
    </div>)
}

// ====================================================================
//  Tạo / sửa Agent
// ====================================================================
interface AForm { name: string; description: string; skill_ids: number[]; custom_instructions: string; knowledge_mode: KnowledgeMode; model_tier: 'default' | 'fast'; visibility: 'private' | 'team'; source_policy: '' | 'all' | 'reviewed' | 'official'; use_memory: boolean; memory_scope: 'user' | 'agent' }
const MEM_SCOPES: ['user' | 'agent', string, string][] = [
  ['user', 'Dùng chung với mọi Agent của tôi', 'Agent đọc và ghi vào trí nhớ chung của tài khoản: điều đã nói với Agent khác cũng được nhớ.'],
  ['agent', 'Riêng cho Agent này', 'Chỉ nhớ những gì đã trao đổi với chính Agent này; tách biệt với các Agent khác.'],
]
const blankForm = (): AForm => ({ name: '', description: '', skill_ids: [], custom_instructions: '', knowledge_mode: 'documents', model_tier: 'default', visibility: 'private', source_policy: '', use_memory: true, memory_scope: 'user' })

export function AgentForm() {
  const { id } = useParams(); const edit = !!id
  const nav = useNavigate()
  const status = useChat((s) => s.status)
  const { data: catalog, loading: lc, error: ec } = useGet<SkillCatalog>('/agents/skills')
  const { data: presets } = useGet<AgentPreset[]>('/agents/presets', undefined, !edit)
  const [f, setF] = useState<AForm>(blankForm())
  const [loaded, setLoaded] = useState(!edit)
  const [loadErr, setLoadErr] = useState<ApiError | null>(null)
  const [preset, setPreset] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [serverErr, setServerErr] = useState('')
  const { busy, run } = useBusy()
  const up = <K extends keyof AForm>(k: K, v: AForm[K]) => setF((p) => ({ ...p, [k]: v }))
  const max = catalog?.limits.max_skills_per_agent ?? 6
  const maxCi = catalog?.limits.max_custom_instructions_chars ?? 2000

  useEffect(() => {
    if (!id) return
    get<Agent>(`/agents/${id}`).then((a) => {
      if (!a.is_mine) { toast.warn('Chỉ chủ Agent mới sửa được — hãy nhân bản'); nav('/agents', { replace: true }); return }
      setF({ name: a.name, description: a.description || '', skill_ids: a.skills.map((s) => s.id), custom_instructions: a.custom_instructions || '', knowledge_mode: a.knowledge_mode, model_tier: a.model_tier, visibility: a.visibility, source_policy: a.source_policy || '', use_memory: a.use_memory !== false, memory_scope: a.memory_scope || 'user' })
    }).catch((e) => setLoadErr(e)).finally(() => setLoaded(true))
  }, [id]) // eslint-disable-line

  function applyPreset(p: AgentPreset) {
    setPreset(p.key)
    setF((x) => ({ ...x, name: x.name || p.name, description: p.description, knowledge_mode: p.knowledge_mode, skill_ids: p.skills.map((s) => s.id) }))
  }
  const modeOff = (m: KnowledgeMode) => !!status && ((m === 'general' && !status.features.includes('ask_general')) || (m === 'hybrid' && !status.features.includes('ask_hybrid')))

  async function save() {
    setServerErr('')
    if (!f.name.trim()) return toast.warn('Hãy đặt tên cho Agent')
    const body = { name: f.name.trim(), description: f.description.trim() || undefined, skill_ids: f.skill_ids, custom_instructions: f.custom_instructions.trim() || undefined, knowledge_mode: f.knowledge_mode, model_tier: f.model_tier, visibility: f.visibility, use_memory: f.use_memory, memory_scope: f.memory_scope, ...(f.source_policy ? { source_policy: f.source_policy } : {}) }
    try {
      const r = edit ? await put<Agent>(`/agents/${id}`, { ...body, custom_instructions: f.custom_instructions.trim() }) : await post<Agent>('/agents', body)
      toast.ok(edit ? 'Đã lưu Agent' : 'Đã tạo Agent'); void useChat.getState().loadAgents(); nav(`/agents/${r.id}/chat`)
    } catch (e) {
      const m = e instanceof ApiError ? (e.status === 409 ? `${e.message} (trùng tên Agent của bạn hoặc đã đủ số Agent tối đa)` : e.status === 422 ? `${e.full} (kiểm tra skill: không quá ${max}, không chọn hai skill cùng nhóm loại trừ, chỉ dẫn không chứa bí mật)` : e.full) : String(e)
      setServerErr(m); toast.error(m)
    }
  }

  if (!loaded || lc) return <Loading />
  if (loadErr) return <ErrorBox error={loadErr} />
  return (
    <div className="flex flex-col gap-4 max-w-[1100px]">
      <PageHeader title={edit ? 'Sửa Agent' : 'Tạo Agent cá nhân'} subtitle="Skill và chỉ dẫn riêng chỉ chỉnh phong cách làm việc — không ghi đè luật nền tảng (quyền dữ liệu, trích nguồn, bảo mật)."
        actions={<>{edit && <button className="btn outline" onClick={() => setPreview(true)}><Eye size={15} />Xem system prompt</button>}<button className="btn outline" onClick={() => nav('/agents')}>Hủy</button>
          <button className="btn" disabled={busy || !f.name.trim()} onClick={() => void run(save)}><Save size={15} />{edit ? 'Lưu Agent' : 'Tạo Agent'}</button></>} />
      {serverErr && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 p-3 text-sm flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{serverErr}</div>}
      <ErrorBox error={ec} />

      {!edit && presets && presets.length > 0 && (
        <Section title="Bắt đầu từ mẫu dựng sẵn" right={<span className="text-xs text-muted">Chọn mẫu để điền sẵn skill và chế độ tri thức, rồi tinh chỉnh</span>}>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {presets.map((p) => (
              <button type="button" key={p.key} onClick={() => applyPreset(p)}
                className={clsx('text-left rounded-lg border p-3 cursor-pointer flex flex-col gap-2 transition', preset === p.key ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-line bg-white hover:border-brand-300')}>
                <div className="flex items-center gap-2"><Wand2 size={16} className="text-brand-600" /><b className="flex-1">{p.name}</b><Pill sm tone="soft">{KNOWLEDGE_LABEL[p.knowledge_mode]}</Pill></div>
                <div className="text-xs text-muted leading-snug">{p.description}</div>
                <div className="flex gap-1 flex-wrap">{p.skills.map((s) => <span key={s.id} className="text-[10.5px] font-bold bg-brand-100 text-brand-800 rounded px-1.5 py-0.5">{s.name}</span>)}</div>
              </button>))}
          </div>
        </Section>)}

      <Section title="Thông tin Agent">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Tên Agent *"><input className="input" maxLength={100} value={f.name} onChange={(e) => up('name', e.target.value)} placeholder="Trợ lý vận hành của Trung" /></Field>
          <Field label="Chia sẻ"><Seg value={f.visibility} onChange={(v) => up('visibility', v)} options={[{ value: 'private', label: 'Riêng tư' }, { value: 'team', label: 'Chia sẻ cho nhóm' }]} /></Field>
          <Field label="Mô tả" className="md:col-span-2"><textarea className="textarea" rows={2} maxLength={500} value={f.description} onChange={(e) => up('description', e.target.value)} placeholder="Agent này giúp việc gì?" /></Field>
        </div>
      </Section>

      <Section title="Chế độ tri thức" right={<Seg sm value={f.model_tier} onChange={(v) => up('model_tier', v)} options={[{ value: 'default', label: 'Mô hình mặc định' }, { value: 'fast', label: 'Mô hình nhanh' }]} />}>
        <div className="grid md:grid-cols-3 gap-3">
          {(['documents', 'hybrid', 'general'] as KnowledgeMode[]).map((m) => {
            const off = modeOff(m)
            return (
              <button type="button" key={m} disabled={off} onClick={() => up('knowledge_mode', m)} title={off ? 'Quản trị viên đã tắt chế độ này' : undefined}
                className={clsx('text-left rounded-lg border p-3 flex flex-col gap-1 transition', off ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer', f.knowledge_mode === m ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-line bg-white hover:border-brand-300')}>
                <div className="flex items-center gap-2 font-bold">{m === 'documents' ? <FileText size={15} /> : m === 'hybrid' ? <Layers size={15} /> : <Sparkles size={15} />}{KNOWLEDGE_LABEL[m]}</div>
                <div className="text-xs text-muted leading-snug">{KNOWLEDGE_HINT[m]}</div>
              </button>)
          })}
        </div>
        {f.knowledge_mode !== 'general' && (
          <div className="mt-4 flex items-center gap-3 flex-wrap border-t border-line-soft pt-3">
            <div className="flex-1 min-w-[260px]"><div className="font-bold text-sm">Nguồn tài liệu được dùng</div><div className="text-xs text-muted leading-snug">Agent chỉ trích nguồn đạt hạng tin cậy này. “Mặc định hệ thống” theo cài đặt của quản trị viên.</div></div>
            <div className="w-[260px]"><PolicySelect value={f.source_policy || 'auto'} onChange={((v: string) => up('source_policy', v === 'auto' ? '' : (v as AForm['source_policy']))) as never} /></div>
          </div>)}
      </Section>

      <Section title="Trí nhớ dài hạn" right={<label className="check text-sm"><input type="checkbox" checked={f.use_memory} onChange={(e) => up('use_memory', e.target.checked)} />Bật trí nhớ</label>}>
        <div className={clsx('grid md:grid-cols-2 gap-3', !f.use_memory && 'opacity-50 pointer-events-none')}>
          {MEM_SCOPES.map(([v, l, d]) => (
            <button type="button" key={v} onClick={() => up('memory_scope', v)} className={clsx('text-left rounded-lg border p-3 flex flex-col gap-1 cursor-pointer transition', f.memory_scope === v ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-line bg-white hover:border-brand-300')}>
              <div className="font-bold flex items-center gap-2"><Brain size={15} />{l}</div><div className="text-xs text-muted leading-snug">{d}</div></button>))}
        </div>
        <p className="m-0 mt-2.5 text-xs text-muted">Sau mỗi cuộc trò chuyện, hệ thống tóm tắt ở nền và chắt lọc sự thật, sở thích, quyết định, việc dang dở. Ký ức chỉ chủ tài khoản xem được, quản lý tại Agent › Trí nhớ và hội thoại. Tắt trí nhớ: Agent chỉ dùng lịch sử của hội thoại hiện tại.</p>
      </Section>

      <Section title={`Skill prompting (${f.skill_ids.length}/${max})`} right={f.skill_ids.length > 0 && <button className="btn ghost sm" onClick={() => up('skill_ids', [])}><X size={13} />Bỏ chọn hết</button>}>
        {catalog ? <SkillPicker catalog={catalog} value={f.skill_ids} onChange={(v) => up('skill_ids', v)} max={max} /> : <Empty text="Không tải được danh mục skill" />}
      </Section>

      <Section title="Chỉ dẫn riêng">
        <Field label="Cách xưng hô, ngôn ngữ, thói quen trình bày…" hint="Không chứa mật khẩu, khóa hay thông tin cá nhân (bị chặn). Chỉ chỉnh phong cách, không ghi đè luật nền tảng.">
          <textarea className="textarea" rows={4} maxLength={maxCi} value={f.custom_instructions} onChange={(e) => up('custom_instructions', e.target.value)} placeholder="Luôn gọi tôi là anh Trung. Kết thúc bằng một câu hỏi xác nhận." />
        </Field>
        <div className="text-xs text-muted text-right mt-1">{f.custom_instructions.length}/{maxCi}</div>
      </Section>
      {preview && id && <PromptPreviewModal agent={{ id: Number(id), name: f.name }} onClose={() => setPreview(false)} />}
    </div>)
}

// ====================================================================
//  Trang chat với Agent (có lịch sử hội thoại)
// ====================================================================
let mseq = Date.now()
function rowsToMsgs(rows: AgentMessageRow[], agentName: string): Msg[] {
  return rows.map((r) => r.role === 'user'
    ? { id: r.id, role: 'user' as const, text: r.content }
    : { id: r.id, role: 'ai' as const, text: r.content, agentName, ans: { mode: r.meta?.mode, answer: r.content, sources: [], sourceIds: r.meta?.sources, consulted: r.meta?.consulted, tools_used: r.meta?.tools, model: r.meta?.model || '', cost_usd: r.meta?.cost_usd ?? 0, agentName } })
}

export function AgentChat() {
  const { id } = useParams(); const aid = Number(id)
  const nav = useNavigate()
  const me = useAuth((s) => s.user)!
  const agentOn = useAiFeature('agent')
  const { data: agent, loading, error } = useGet<Agent>(`/agents/${aid}`)
  const convs = useGet<AgentConversation[]>(`/agents/${aid}/conversations`)
  const [convId, setConvId] = useState<number | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)

  const openConv = useCallback(async (cid: number) => {
    try {
      const c = await get<{ id: number; messages: AgentMessageRow[] }>(`/agents/conversations/${cid}`)
      setConvId(cid); setMsgs(rowsToMsgs(c.messages, agent?.name || 'Agent'))
    } catch (e) { toast.error(errMsg(e)) }
  }, [agent?.name])

  async function send() {
    const text = q.trim(); if (!text || busy) return
    setQ(''); if (ta.current) ta.current.style.height = 'auto'
    setMsgs((m) => [...m, { id: ++mseq, role: 'user', text }]); setBusy(true)
    try {
      const r = await post<{ conversation_id: number; answer: string; mode: KnowledgeMode; grounded: boolean; sources: never[]; consulted: number[]; tools_used: never[]; steps: number; warnings: string[]; model: string; cost_usd: number; memory?: AgentMemoryUse }>(`/agents/${aid}/chat`, { message: text.slice(0, 2000), ...(convId ? { conversation_id: convId } : {}) })
      setConvId(r.conversation_id)
      setMsgs((m) => [...m, { id: ++mseq, role: 'ai', text: r.answer, agentName: agent?.name, ans: { mode: r.mode as never, answer: r.answer, grounded: r.grounded, sources: r.sources, consulted: r.consulted, tools_used: r.tools_used, steps: r.steps, warnings: r.warnings, model: r.model, cost_usd: r.cost_usd, agentName: agent?.name, memory: r.memory } }])
      convs.reload()
    } catch (e) {
      const er = e as ApiError
      const m = er.status === 429 ? 'Đã hết hạn mức AI (10 yêu cầu mỗi phút, hạn mức ngày hoặc ngân sách tháng).' : er.status === 503 ? 'AI chưa bật hoặc tính năng Agent đang bị tắt.' : er.status === 409 ? (/đầy|full/i.test(er.message) ? 'Hội thoại đã đầy (200 tin) — hãy bắt đầu hội thoại mới.' : 'Agent đang tắt.') : er.status === 422 ? `Tin nhắn bị từ chối: ${er.full}` : errMsg(e)
      if (er.status === 404) setConvId(null)
      setMsgs((x) => [...x, { id: ++mseq, role: 'ai', text: '', err: m, agentName: agent?.name }])
    } finally { setBusy(false) }
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }
  const [summBusy, setSummBusy] = useState(false)
  const [summ, setSumm] = useState<ConvSummary | null>(null)
  async function summarize() {
    if (!convId) return
    setSummBusy(true)
    try { setSumm(await post<ConvSummary>(`/agents/conversations/${convId}/summarize`, {})) } catch (e) { toast.error(errMsg(e)) } finally { setSummBusy(false) }
  }
  async function removeConv(c: AgentConversation) {
    if (!(await confirmDialog('Xóa hội thoại', `Xóa hội thoại “${c.title}”? Những điều Agent đã ghi nhớ từ hội thoại này vẫn được giữ (xóa riêng ở trang Trí nhớ).`, { danger: true, okText: 'Xóa, giữ trí nhớ' }))) return
    try { await del(`/agents/conversations/${c.id}`, { keep_memory: true }); toast.ok('Đã xóa hội thoại, giữ lại trí nhớ'); if (convId === c.id) { setConvId(null); setMsgs([]) } convs.reload() } catch (e) { toast.error(errMsg(e)) }
  }

  if (loading && !agent) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!agent) return null
  const mine = agent.is_mine || (me.role === 'admin' && false)
  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-136px)] min-h-[460px]">
      <div className="page-head">
        <div className="min-w-0 pl-2 flex items-center gap-3">
          <span className="w-11 h-11 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white grid place-items-center shrink-0"><Bot size={22} /></span>
          <div className="min-w-0"><h1 className="truncate">{agent.name}</h1>
            <div className="flex gap-1.5 flex-wrap mt-1"><Pill sm tone="soft">{KNOWLEDGE_LABEL[agent.knowledge_mode]}</Pill>{agent.visibility === 'team' && <Pill sm tone="ok"><Users size={11} />Chia sẻ</Pill>}
              {agent.skills.map((s) => <SkillTag key={s.id} s={s} />)}{!agent.is_active && <Pill sm tone="bad">Đang tắt</Pill>}</div></div>
        </div>
        <div className="actions">
          {convId && <button className="btn outline" disabled={summBusy} title="Tóm tắt và chắt lọc ký ức ngay thay vì đợi chạy nền" onClick={() => void summarize()}>{summBusy ? <Loader2 size={15} className="animate-spin" /> : <Brain size={15} />}Tóm tắt và ghi nhớ</button>}
          <button className="btn outline" onClick={() => nav('/agents/memory')}><Brain size={15} />Trí nhớ</button>
          <button className="btn outline" onClick={() => setPreview(true)}><Eye size={15} />Prompt</button>
          {mine && <button className="btn outline" onClick={() => nav(`/agents/${aid}/edit`)}><Pencil size={15} />Sửa</button>}
          <button className="btn outline" onClick={() => nav('/agents')}>Danh sách</button>
        </div>
      </div>
      {!agentOn && <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 p-2.5 text-sm font-semibold">Tính năng Agent đang bị tắt trên máy chủ — chưa chat được.</div>}
      <div className="grid lg:grid-cols-[280px_1fr] gap-3 flex-1 min-h-0">
        <div className="panel min-h-0">
          <div className="panel-head !py-2.5"><div className="panel-title">Hội thoại</div>
            <button className="btn sm" onClick={() => { setConvId(null); setMsgs([]) }}><Plus size={13} />Mới</button></div>
          <div className="flex-1 overflow-auto p-2 flex flex-col gap-1">
            {convs.loading && !convs.data && <Loading text="" />}
            {convs.data && convs.data.length === 0 && <div className="text-xs text-muted p-3 text-center">Chưa có hội thoại nào. Lịch sử chỉ bạn đọc được và tự xóa sau thời hạn lưu.</div>}
            {convs.data?.map((c) => (
              <div key={c.id} className={clsx('group flex items-start gap-2 rounded-md p-2 cursor-pointer border', convId === c.id ? 'bg-brand-soft border-brand-300 bg-brand-50' : 'border-transparent hover:bg-brand-50')} onClick={() => void openConv(c.id)}>
                <MessageSquare size={14} className="text-brand-600 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1"><div className="text-[13px] font-bold truncate">{c.title}</div><div className="text-[11px] text-muted">{dt(c.updated_at)} · {c.messages} tin</div></div>
                <button className="border-0 bg-transparent text-muted hover:text-red-600 cursor-pointer p-0.5 opacity-0 group-hover:opacity-100" aria-label="Xóa hội thoại" onClick={(e) => { e.stopPropagation(); void removeConv(c) }}><Trash2 size={13} /></button>
              </div>))}
          </div>
        </div>
        <div className="chat-panel !static !w-full !h-auto min-h-0 !animate-none" style={{ position: 'relative', inset: 'auto' }}>
          <div className="chat-body !p-5">
            <Messages msgs={msgs} busy={busy} onPick={(t) => setQ(t)} onAsk={() => undefined} onOpenItem={(i) => nav(`/items/${i}`)} />
            {msgs.length === 0 && !busy && <div className="text-center text-xs text-muted -mt-2">Agent tự tra cứu kho tri thức, đọc tài liệu và tệp đính kèm, xem ảnh/PDF theo quyền của bạn và trích nguồn <code>[doc:ID]</code>.</div>}
          </div>
          <div className="chat-foot">
            <textarea ref={ta} rows={1} value={q} maxLength={2000} disabled={!agent.is_active} placeholder={agent.is_active ? 'Nhắn cho Agent… (Enter để gửi, Shift+Enter xuống dòng)' : 'Agent đang tắt'}
              onChange={(e) => { setQ(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px' }} onKeyDown={onKey} />
            <button className="btn icon" style={{ height: 40, width: 40 }} disabled={busy || !q.trim() || !agent.is_active} onClick={() => void send()} aria-label="Gửi"><Send size={16} /></button>
          </div>
        </div>
      </div>
      {preview && <PromptPreviewModal agent={agent} onClose={() => setPreview(false)} />}
      {summ && <SummaryModal s={summ} onClose={() => setSumm(null)} />}
    </div>)
}

interface ConvSummary { id: number; title: string; summary: string | null; topics: string[]; summarized_at: string | null; status?: string; [k: string]: unknown }
const SUMM_LABEL: Record<string, string> = { batches: 'Đợt xử lý', memories_added: 'Ký ức mới', memories_updated: 'Ký ức cập nhật' }
function SummaryModal({ s, onClose }: { s: ConvSummary; onClose: () => void }) {
  const nav = useNavigate()
  const extra = Object.entries(s).filter(([k, v]) => !['id', 'title', 'summary', 'topics', 'summarized_at', 'status'].includes(k) && (typeof v === 'number' || typeof v === 'string'))
  return (
    <Modal title={`Tóm tắt hội thoại: ${s.title}`} size="md" onClose={onClose} footer={<><button className="btn outline" onClick={() => nav('/agents/memory')}>Xem trí nhớ</button><button className="btn" onClick={onClose}>Đóng</button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex gap-2 flex-wrap"><Pill sm tone={s.status === 'done' ? 'ok' : 'gray'}>{s.status === 'done' ? 'Đã tóm tắt' : 'Không có gì mới'}</Pill>{s.summarized_at && <Pill sm tone="gray">{dt(s.summarized_at)}</Pill>}
          {extra.map(([k, v]) => <Pill key={k} sm tone="soft">{SUMM_LABEL[k] || k}: {String(v)}</Pill>)}</div>
        {s.summary ? <div className="rounded-lg border border-line bg-brand-50 p-3 leading-relaxed whitespace-pre-wrap">{s.summary}</div> : <div className="text-muted">Chưa có bản tóm tắt.</div>}
        {s.topics?.length > 0 && <div className="flex gap-1.5 flex-wrap">{s.topics.map((x) => <Pill key={x} sm tone="soft">#{x}</Pill>)}</div>}
      </div>
    </Modal>)
}

// ====================================================================
//  Trí nhớ dài hạn và tìm lại hội thoại cũ
// ====================================================================
export function AgentMemoryPage() {
  const nav = useNavigate()
  const [tab, setTab] = useState<'memory' | 'search'>('memory')
  const { data: agents } = useGet<Agent[]>('/agents', { scope: 'mine' })
  const [q, setQ] = useState('')
  const [agentId, setAgentId] = useState('')
  const [res, setRes] = useState<{ query: string; conversations: ConvHit[] } | null>(null)
  const [mem, setMem] = useState<{ memories: (AiMemory & { score?: number })[] } | null>(null)
  const { busy, run } = useBusy()
  async function search() {
    const t = q.trim(); if (t.length < 2) return toast.warn('Nhập ít nhất 2 ký tự')
    const params = { q: t, ...(agentId ? { agent_id: agentId } : {}) }
    const [c, m] = await Promise.all([
      run(() => get<{ query: string; conversations: ConvHit[] }>('/agents/conversations/search', { ...params, limit: 15 })),
      run(() => get<{ memories: (AiMemory & { score?: number })[] }>('/agents/memory/search', { ...params, limit: 10 })),
    ])
    if (c) setRes(c)
    if (m) setMem(m)
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Trí nhớ và hội thoại" subtitle="Trí nhớ dài hạn được chắt lọc từ các cuộc trò chuyện với Agent. Chỉ bạn xem được; có thể sửa, ghim, xóa từng ký ức hoặc tìm lại hội thoại cũ theo nghĩa." />
      <Seg value={tab} onChange={setTab} options={[{ value: 'memory', label: 'Trí nhớ dài hạn' }, { value: 'search', label: 'Tìm lại hội thoại và ký ức' }]} />
      {tab === 'memory' ? <MemoryPanel agents={agents || []} /> : (
        <div className="flex flex-col gap-4">
          <form className="card !p-4 grid md:grid-cols-[1fr_220px_auto] gap-3 items-end" onSubmit={(e) => { e.preventDefault(); void search() }}>
            <Field label="Nội dung cần tìm"><input className="input" value={q} maxLength={300} onChange={(e) => setQ(e.target.value)} placeholder="Hôm trước mình đã bàn gì về hạn mức chi?" /></Field>
            <Field label="Agent"><select className="select" value={agentId} onChange={(e) => setAgentId(e.target.value)}><option value="">Mọi Agent</option>{agents?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <button className="btn" disabled={busy}><Search size={15} />Tìm</button>
          </form>
          {mem && <Section title={`Ký ức liên quan (${mem.memories.length})`}>
            {mem.memories.length === 0 ? <Empty text="Không có ký ức nào gần nghĩa" /> : <div className="flex flex-col gap-2">{mem.memories.map((m) => (
              <div key={m.id} className="flex items-start gap-3 border border-line rounded-lg p-3 bg-white"><Pill sm tone="soft">{m.kind_label || m.kind}</Pill><div className="flex-1 leading-snug">{m.text}</div>{m.score != null && <span className="text-xs font-mono text-muted">{Number(m.score).toFixed(2)}</span>}</div>))}</div>}
          </Section>}
          {res && <Section title={`Hội thoại khớp (${res.conversations.length})`}>
            {res.conversations.length === 0 ? <Empty text="Không có hội thoại nào khớp" /> : <div className="tbl-wrap !shadow-none"><table className="tbl"><thead><tr><th>Hội thoại</th><th>Đoạn khớp</th><th className="num">Điểm</th><th>Cập nhật</th><th /></tr></thead><tbody>
              {res.conversations.map((c) => (
                <tr key={c.id}><td className="max-w-[260px]"><div className="font-bold">{c.title}</div>{c.summary && <div className="text-xs text-muted line-clamp-2">{c.summary}</div>}{c.topics?.length > 0 && <div className="text-[11px] text-brand-700">{c.topics.map((x) => '#' + x).join(' ')}</div>}</td>
                  <td className="max-w-[360px] text-xs">{c.matched_messages.slice(0, 3).map((m) => <div key={m.message_id} className="mb-1"><b>{m.role === 'user' ? 'Bạn' : 'Agent'}:</b> {m.excerpt}</div>)}</td>
                  <td className="num font-mono">{c.score.toFixed(2)}</td><td className="text-xs whitespace-nowrap">{dt(c.updated_at)}</td>
                  <td className="num"><button className="btn outline sm" onClick={() => nav(`/agents/${c.agent_id}/chat`)}>Mở Agent</button></td></tr>))}
            </tbody></table></div>}
          </Section>}
        </div>)}
    </div>)
}

// ====================================================================
//  Thư viện skill prompting
// ====================================================================
interface SForm { id?: number; slug: string; name: string; category: string; description: string; instruction: string; exclusive_group: string; is_active: boolean; is_system?: boolean }
export function SkillsLibrary() {
  const role = useAuth((s) => s.user?.role)
  const manage = can(role, 'moderate'); const admin = can(role, 'admin')
  const [inactive, setInactive] = useState(false)
  const [cat, setCat] = useState('')
  const { data, loading, error, reload } = useGet<SkillCatalog>('/agents/skills', { include_inactive: manage && inactive ? true : undefined, category: cat || undefined })
  const { busy, run } = useBusy()
  const [f, setF] = useState<SForm | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  async function save() {
    if (!f) return
    const body: Record<string, unknown> = { name: f.name.trim(), category: f.category, description: f.description.trim() || undefined, instruction: f.instruction.trim(), exclusive_group: f.exclusive_group.trim() || undefined }
    if (f.id) { body.is_active = f.is_active; if (!f.exclusive_group.trim()) body.exclusive_group = f.exclusive_group.trim() } else if (f.slug.trim()) body.slug = f.slug.trim()
    const r = await run(() => (f.id ? put(`/agents/skills/${f.id}`, body) : post('/agents/skills', body)), f.id ? 'Đã lưu skill' : 'Đã thêm skill')
    if (r) { setF(null); reload() }
  }
  async function disable(s: Skill) {
    if (!(await confirmDialog('Tắt skill', `Tắt skill “${s.name}”? Các Agent đang dùng sẽ báo “skill đã tắt”.`, { okText: 'Tắt' }))) return
    const r = await run(() => del(`/agents/skills/${s.id}`), 'Đã tắt skill'); if (r) reload()
  }
  const edit = (s: Skill) => setF({ id: s.id, slug: s.slug, name: s.name, category: s.category, description: s.description || '', instruction: s.instruction || '', exclusive_group: s.exclusive_group || '', is_active: s.is_active !== false, is_system: s.is_system })
  const valid = f && f.name.trim() && f.instruction.trim()
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Thư viện skill prompting" subtitle="Các đoạn chỉ dẫn ngắn để ghép thành Agent. Hai skill cùng nhóm loại trừ không dùng chung được; skill chỉ chỉnh phong cách, không ghi đè luật nền tảng."
        actions={manage && <button className="btn" onClick={() => setF({ slug: '', name: '', category: 'style', description: '', instruction: '', exclusive_group: '', is_active: true })}><Plus size={16} />Thêm skill</button>} />
      <div className="flex items-center gap-3 flex-wrap">
        <select className="select !w-52" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Tất cả nhóm</option>{Object.entries(SKILL_CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {manage && <label className="check text-sm"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />Hiện cả skill đã tắt</label>}
        {data && <span className="text-xs text-muted">{data.total} skill · mỗi Agent tối đa {data.limits.max_skills_per_agent}</span>}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data?.categories.map((c) => c.skills.length > 0 && (
        <Section key={c.key} title={c.label || SKILL_CATEGORY[c.key]} right={<Pill sm tone="soft">{c.skills.length}</Pill>}>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {c.skills.map((s) => (
              <div key={s.id} className={clsx('border border-line rounded-lg p-3 flex flex-col gap-2 bg-white', s.is_active === false && 'opacity-60')}>
                <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="font-bold">{s.name}</div><code className="text-[11px] text-brand-700">{s.slug}</code></div>
                  {s.is_system ? <Pill sm tone="gray">Hệ thống</Pill> : <Pill sm tone="ok">Tùy chỉnh</Pill>}{s.is_active === false && <Pill sm tone="bad">Đã tắt</Pill>}</div>
                {s.description && <div className="text-xs text-muted leading-snug">{s.description}</div>}
                {s.exclusive_group && <div className="text-[11px] text-amber-700">Loại trừ nhóm “{s.exclusive_group}”</div>}
                <button className="text-left text-xs text-brand-700 font-bold bg-transparent border-0 p-0 cursor-pointer w-fit" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Ẩn chỉ dẫn' : 'Xem chỉ dẫn gửi cho AI'}</button>
                {open === s.id && <pre className="m-0 text-[12px] whitespace-pre-wrap font-mono bg-brand-50 border border-line-soft rounded-md p-2.5">{s.instruction}</pre>}
                {manage && (!s.is_system || admin) && <div className="flex gap-1.5 mt-auto"><button className="btn outline sm" onClick={() => edit(s)}><Pencil size={13} />Sửa</button>
                  {s.is_active !== false && <button className="btn ghost sm" disabled={busy} onClick={() => void disable(s)}><Power size={13} />Tắt</button>}</div>}
              </div>))}
          </div>
        </Section>))}
      {f && (
        <Modal title={f.id ? 'Sửa skill' : 'Thêm skill'} size="md" onClose={() => setF(null)} footer={<><button className="btn outline" onClick={() => setF(null)}>Hủy</button><button className="btn" disabled={busy || !valid} onClick={save}>Lưu</button></>}>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4"><Field label="Tên skill *"><input className="input" maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Nhóm *"><select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(SKILL_CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field></div>
            {!f.id && <Field label="Mã slug (tùy chọn)" hint="Để trống: hệ thống tự tạo từ tên"><input className="input font-mono" maxLength={60} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></Field>}
            <Field label="Mô tả ngắn"><input className="input" maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <Field label="Chỉ dẫn gửi cho AI * (tối đa 800 ký tự)" hint="Nên viết tiếng Anh, ngắn gọn, dạng mệnh lệnh. Không chứa bí mật hay thông tin cá nhân."><textarea className="textarea font-mono text-[13px]" rows={5} maxLength={800} value={f.instruction} onChange={(e) => setF({ ...f, instruction: e.target.value })} /></Field>
            <Field label="Nhóm loại trừ (tùy chọn)" hint="Hai skill cùng nhóm này không dùng chung được trong một Agent"><input className="input" maxLength={30} value={f.exclusive_group} onChange={(e) => setF({ ...f, exclusive_group: e.target.value })} placeholder="register" /></Field>
            {f.id && <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />Đang bật</label>}
          </div>
        </Modal>)}
    </div>)
}
