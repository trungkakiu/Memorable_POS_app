import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Brain, Check, Loader2, Pencil, Pin, PinOff, Search, Star, Trash2, X } from 'lucide-react'
import { ApiError, del, put, useGet } from '../lib/api'
import { dt } from '../lib/format'
import type { Agent, AiMemory, MemoryKind, MemoryList } from '../lib/types'
import { confirmDialog, toast } from '../store/ui'
import { Empty, Field, Modal, Pill } from './ui'
import { ErrorBox, Loading, Pager } from './shared'

// Nhãn cho người đọc (lời thường) và cho quản trị (đúng thuật ngữ)
export const MEMORY_KIND_PLAIN: Record<MemoryKind, string> = { fact: 'Điều bạn đã nói', preference: 'Bạn thích', decision: 'Bạn đã quyết định', task: 'Việc còn dang dở', entity: 'Người, nơi, hệ thống', conversation: 'Tóm tắt trò chuyện' }
export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = { fact: 'Sự thật', preference: 'Sở thích', decision: 'Quyết định', task: 'Việc dang dở', entity: 'Đối tượng', conversation: 'Hội thoại' }
const KIND_TONE: Record<MemoryKind, 'soft' | 'ok' | 'warn' | 'gray'> = { fact: 'soft', preference: 'ok', decision: 'soft', task: 'warn', entity: 'gray', conversation: 'gray' }
const KINDS: MemoryKind[] = ['fact', 'preference', 'decision', 'task', 'entity', 'conversation']
const errMsg = (e: unknown) => (e instanceof ApiError ? (e.status === 422 ? 'Nội dung rỗng hoặc chứa thông tin bí mật nên không ghi nhớ được.' : e.full) : String(e))

function EditMemory({ m, plain, onClose, onSaved }: { m: AiMemory; plain?: boolean; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(m.text)
  const [importance, setImportance] = useState(m.importance)
  const [kind, setKind] = useState<MemoryKind>(m.kind === 'conversation' ? 'fact' : m.kind)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try { await put(`/agents/memory/${m.id}`, { text: text.trim(), importance, ...(plain || m.kind === 'conversation' ? {} : { kind }) }); toast.ok(plain ? 'Đã sửa điều trợ lý ghi nhớ' : 'Đã cập nhật ký ức'); onSaved(); onClose() }
    catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Modal title={plain ? 'Sửa điều trợ lý ghi nhớ' : `Sửa ký ức #${m.id}`} size="md" onClose={onClose}
      footer={<><button className="btn outline" onClick={onClose}>Hủy</button><button className="btn" disabled={busy || text.trim().length < 8} onClick={save}>Lưu</button></>}>
      <div className="flex flex-col gap-4">
        <Field label={plain ? 'Trợ lý sẽ nhớ câu này' : 'Nội dung (8–300 ký tự)'}><textarea className="textarea" rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <Field label={plain ? 'Mức quan trọng' : 'Mức quan trọng (1–5)'}>
          <div className="flex gap-1.5">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className="border-0 bg-transparent p-0.5 cursor-pointer" onClick={() => setImportance(n)} aria-label={`${n} sao`}><Star size={22} className={n <= importance ? 'text-amber-500 fill-amber-400' : 'text-slate-300'} /></button>)}</div>
        </Field>
        {!plain && m.kind !== 'conversation' && <Field label="Loại"><select className="select" value={kind} onChange={(e) => setKind(e.target.value as MemoryKind)}>{KINDS.filter((k) => k !== 'conversation').map((k) => <option key={k} value={k}>{MEMORY_KIND_LABEL[k]}</option>)}</select></Field>}
      </div>
    </Modal>)
}

/**
 * Trí nhớ dài hạn của trợ lý — mỗi người chỉ thấy của mình.
 * plain: giao diện người đọc (thẻ, lời thường). Mặc định: bảng có bộ lọc và số liệu cho quản trị.
 */
export function MemoryPanel({ plain, agents = [] }: { plain?: boolean; agents?: Agent[] }) {
  const [page, setPage] = useState(1)
  const [kind, setKind] = useState<MemoryKind | ''>('')
  const [pinned, setPinned] = useState(false)
  const [agentId, setAgentId] = useState('')
  const [q, setQ] = useState(''); const [qq, setQq] = useState('')
  const [edit, setEdit] = useState<AiMemory | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  useEffect(() => { const h = setTimeout(() => { setQq(q.trim()); setPage(1) }, 300); return () => clearTimeout(h) }, [q])
  const { data, loading, error, reload } = useGet<MemoryList>('/agents/memory', { page, limit: plain ? 30 : 25, ...(kind ? { kind } : {}), ...(pinned ? { pinned: true } : {}), ...(agentId ? { agent_id: agentId } : {}), ...(qq ? { q: qq } : {}) })
  const total = data ? Object.values(data.by_kind || {}).reduce((a, b) => a + b, 0) : 0

  async function togglePin(m: AiMemory) {
    setBusyId(m.id)
    try { await put(`/agents/memory/${m.id}`, { pinned: !m.pinned }); reload() } catch (e) { toast.error(errMsg(e)) } finally { setBusyId(null) }
  }
  async function forget(m: AiMemory) {
    if (!(await confirmDialog(plain ? 'Quên điều này?' : 'Xóa ký ức', plain ? `Trợ lý sẽ không còn nhớ: “${m.text.slice(0, 120)}”` : `Xóa vĩnh viễn ký ức #${m.id}?`, { danger: true, okText: plain ? 'Quên đi' : 'Xóa' }))) return
    setBusyId(m.id)
    try { await del(`/agents/memory/${m.id}`); toast.ok(plain ? 'Trợ lý đã quên điều này' : 'Đã xóa ký ức'); reload() } catch (e) { toast.error(errMsg(e)) } finally { setBusyId(null) }
  }
  async function forgetAll() {
    const scope = agentId ? (plain ? 'của trợ lý này' : `của Agent #${agentId}`) : (plain ? '' : 'của mọi Agent')
    if (!(await confirmDialog(plain ? 'Quên tất cả?' : 'Xóa toàn bộ trí nhớ', plain ? `Trợ lý sẽ quên hết những gì đã ghi nhớ về bạn ${scope}. Không thể khôi phục.` : `Xóa toàn bộ ký ức ${scope}. Không thể khôi phục.`, { danger: true, okText: plain ? 'Quên tất cả' : 'Xóa toàn bộ' }))) return
    try { const r = await del<{ deleted: number }>('/agents/memory', { confirm: true, ...(agentId ? { agent_id: agentId } : {}) }); toast.ok(plain ? `Đã quên ${r?.deleted ?? 0} điều` : `Đã xóa ${r?.deleted ?? 0} ký ức`); setPage(1); reload() } catch (e) { toast.error(errMsg(e)) }
  }
  const agentName = (id: number | null) => (id ? agents.find((a) => a.id === id)?.name || `Agent #${id}` : plain ? 'Mọi trợ lý' : 'Dùng chung')

  // ---------------- Người đọc: thẻ dễ hiểu ----------------
  if (plain) return (
    <div className="flex flex-col gap-5">
      <div className="rd-callout info !py-3 text-[0.92em]"><Brain size={20} className="shrink-0 mt-0.5" /><div>Khi bạn trò chuyện, trợ lý tự ghi nhớ vài điều hữu ích (bạn làm bộ phận nào, việc còn dang dở, cách bạn thích được trả lời…) để lần sau giúp nhanh hơn. <b>Chỉ bạn nhìn thấy</b> và bạn có thể sửa hoặc bảo trợ lý quên bất cứ lúc nào.</div></div>
      <div className="flex gap-2.5 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px]"><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-500" />
          <input className="w-full h-[48px] border-2 border-line rounded-md pl-11 pr-4 text-[1em] font-[inherit] focus:outline-none focus:border-[#7a2ee6]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong những điều trợ lý nhớ…" /></div>
        <button className={`rd-btn sm ${pinned ? '' : 'secondary'}`} onClick={() => { setPinned(!pinned); setPage(1) }}><Pin size={16} />Đã ghim</button>
        {total > 0 && <button className="rd-btn secondary sm" onClick={() => void forgetAll()}><Trash2 size={16} />Quên tất cả</button>}
      </div>
      <div className="flex gap-2 flex-wrap">
        <button className={`rd-btn sm ${kind ? 'secondary' : ''}`} onClick={() => { setKind(''); setPage(1) }}>Tất cả{total ? ` (${total})` : ''}</button>
        {KINDS.filter((k) => data?.by_kind?.[k]).map((k) => <button key={k} className={`rd-btn sm ${kind === k ? '' : 'secondary'}`} onClick={() => { setKind(k); setPage(1) }}>{MEMORY_KIND_PLAIN[k]} ({data!.by_kind[k]})</button>)}
      </div>
      {error && <div className="rd-callout bad">{error.status === 403 ? 'Vai trò của bạn chưa dùng được tính năng này.' : error.full}</div>}
      {loading && !data && <div className="rd-card p-10 flex justify-center"><Loader2 className="animate-spin text-brand-500" /></div>}
      {data && data.memories.length === 0 && (
        <div className="rd-card p-10 text-center flex flex-col items-center gap-3 text-muted"><Brain size={40} className="text-brand-300" /><b className="text-ink text-[1.1em]">{qq || kind || pinned ? 'Không có điều nào khớp' : 'Trợ lý chưa ghi nhớ điều gì về bạn'}</b>
          <span className="max-w-[440px] leading-relaxed">Cứ trò chuyện với trợ lý như bình thường — những điều quan trọng sẽ tự xuất hiện ở đây.</span></div>)}
      <div className="grid md:grid-cols-2 gap-3">
        {data?.memories.map((m) => (
          <div key={m.id} className={clsx('rd-card p-4 flex flex-col gap-2.5', m.pinned && '!border-amber-300')}>
            <div className="flex items-center gap-2 flex-wrap"><span className="rd-chip !py-1 !px-2.5 !text-[0.76em]">{MEMORY_KIND_PLAIN[m.kind] || m.kind_label}</span>
              {m.pinned && <span className="rd-chip warn !py-1 !px-2.5 !text-[0.76em]"><Pin size={12} />Đã ghim</span>}
              <span className="ml-auto flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} className={n <= m.importance ? 'text-amber-500 fill-amber-400' : 'text-slate-200'} />)}</span></div>
            <div className="leading-relaxed font-semibold">{m.text}</div>
            <div className="text-[0.8em] text-muted">{m.conversation_title ? `Từ cuộc trò chuyện “${m.conversation_title}” · ` : ''}{dt(m.updated_at, false)}</div>
            <div className="flex gap-2 flex-wrap">
              <button className="rd-btn secondary sm" disabled={busyId === m.id} onClick={() => void togglePin(m)}>{m.pinned ? <><PinOff size={15} />Bỏ ghim</> : <><Pin size={15} />Ghim lại</>}</button>
              <button className="rd-btn secondary sm" onClick={() => setEdit(m)}><Pencil size={15} />Sửa</button>
              <button className="rd-btn secondary sm" disabled={busyId === m.id} onClick={() => void forget(m)}><X size={15} />Quên đi</button>
            </div>
          </div>))}
      </div>
      {data && data.pages > 1 && <div className="flex justify-center gap-2"><button className="rd-btn secondary sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</button><span className="self-center text-muted">Trang {page}/{data.pages}</span><button className="rd-btn secondary sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Trang sau</button></div>}
      {edit && <EditMemory m={edit} plain onClose={() => setEdit(null)} onSaved={reload} />}
    </div>)

  // ---------------- Quản trị: bảng có bộ lọc và phân bố ----------------
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 md:grid-cols-7 gap-2.5">
        <button className={clsx('kv text-left cursor-pointer border', !kind ? 'border-brand-400 bg-brand-50' : 'border-transparent')} onClick={() => { setKind(''); setPage(1) }}><span className="k">Tổng</span><span className="v">{total}</span></button>
        {KINDS.map((k) => <button key={k} className={clsx('kv text-left cursor-pointer border', kind === k ? 'border-brand-400 bg-brand-50' : 'border-transparent')} onClick={() => { setKind(kind === k ? '' : k); setPage(1) }}><span className="k">{MEMORY_KIND_LABEL[k]}</span><span className="v">{data?.by_kind?.[k] ?? 0}</span></button>)}
      </div>
      <div className="card !p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <Field label="Tìm trong nội dung" className="col-span-2"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="từ khóa…" /></Field>
        <Field label="Phạm vi"><select className="select" value={agentId} onChange={(e) => { setAgentId(e.target.value); setPage(1) }}><option value="">Tất cả</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <label className="check text-sm pb-2"><input type="checkbox" checked={pinned} onChange={(e) => { setPinned(e.target.checked); setPage(1) }} />Chỉ ký ức đã ghim</label>
        <button className="btn outline danger" disabled={!total} onClick={() => void forgetAll()}><Trash2 size={14} />Xóa toàn bộ{agentId ? ' (phạm vi này)' : ''}</button>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Nội dung</th><th>Loại</th><th>Quan trọng</th><th>Phạm vi</th><th>Nguồn</th><th className="num">Đã dùng</th><th>Lần dùng cuối</th><th /></tr></thead><tbody>
        {loading && !data && <tr><td colSpan={8}><Loading /></td></tr>}
        {data && data.memories.length === 0 && <tr><td colSpan={8}><Empty text="Chưa có ký ức nào khớp bộ lọc" icon={<Brain size={40} strokeWidth={1.4} />} /></td></tr>}
        {data?.memories.map((m) => (
          <tr key={m.id}>
            <td className="max-w-[380px]"><div className="flex gap-1.5 items-start">{m.pinned && <Pin size={13} className="text-amber-600 shrink-0 mt-0.5" />}<span className="leading-snug">{m.text}</span></div>
              {m.topics?.length > 0 && <div className="text-[11px] text-muted mt-0.5">{m.topics.map((t) => `#${t}`).join(' ')}</div>}</td>
            <td><Pill sm tone={KIND_TONE[m.kind]}>{MEMORY_KIND_LABEL[m.kind] || m.kind_label}</Pill></td>
            <td className="whitespace-nowrap">{'★'.repeat(m.importance)}<span className="text-slate-300">{'★'.repeat(5 - m.importance)}</span></td>
            <td className="text-xs">{agentName(m.agent_id)}</td>
            <td className="text-xs" title={m.conversation_title || ''}><div className="max-w-[180px] truncate">{m.conversation_title ? `“${m.conversation_title}”` : '—'}{!m.has_embedding && <div className="text-amber-700">chưa có vector</div>}</div></td>
            <td className="num">{m.hits}</td>
            <td className="text-xs whitespace-nowrap">{m.last_used_at ? dt(m.last_used_at) : '—'}</td>
            <td className="num"><div className="flex gap-1 justify-end">
              <button className="btn ghost sm icon" title={m.pinned ? 'Bỏ ghim' : 'Ghim (luôn ưu tiên nhớ)'} disabled={busyId === m.id} onClick={() => void togglePin(m)}>{m.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
              <button className="btn ghost sm icon" title="Sửa" onClick={() => setEdit(m)}><Pencil size={14} /></button>
              <button className="btn ghost sm icon" title="Xóa" disabled={busyId === m.id} onClick={() => void forget(m)}><Trash2 size={14} /></button>
            </div></td>
          </tr>))}
      </tbody></table></div>
      {data && <Pager page={page} pages={data.pages} total={data.total} onPage={setPage} />}
      {data?.note && <div className="text-xs text-muted flex items-center gap-1.5"><Check size={12} />Ký ức được chắt lọc từ các cuộc trò chuyện với Agent; chỉ chủ tài khoản xem, sửa, xóa được.</div>}
      {edit && <EditMemory m={edit} onClose={() => setEdit(null)} onSaved={reload} />}
    </div>)
}

