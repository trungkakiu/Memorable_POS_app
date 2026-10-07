import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  Archive, ArrowLeft, Check, CheckCircle2, Clipboard, Download, FileUp, GitCompare, History, Pencil, Play, RotateCcw, Send, SkipForward,
  Bot, Tag, Trash2, X, XCircle, AlertTriangle, FlaskConical, Sparkles, RefreshCw, ShieldCheck, BookOpenText, Loader2,
} from 'lucide-react'
import { ApiError, del, deskApi, download, get, patch, post, put, useGet } from '../lib/api'
import { AttachStrip, AttachmentGrid, Uploader } from '../components/Attachments'
import { can } from '../lib/permissions'
import { bytes, dt, FILE_ICON, SEVERITY_LABEL, SENS_LABEL, WORK_TYPE } from '../lib/format'
import type { Attachment, ItemDetail as Item, PromptVar, RelatedItem, RunbookStep } from '../lib/types'
import { Empty, Field, Modal, Pill, Seg } from '../components/ui'
import { ErrorBox, ItemBadges, KV, Loading, Md, Section, Tags, TagPicker, TierPill, useBusy } from '../components/shared'
import { useIsOfficial, useOfficial } from '../components/Knowledge'
import { useAuth } from '../store/auth'
import { confirmDialog, toast } from '../store/ui'

const arr = <T,>(v: unknown): T[] => { if (Array.isArray(v)) return v as T[]; if (typeof v === 'string') { try { const x = JSON.parse(v); return Array.isArray(x) ? x : [] } catch { return [] } } return [] }
type Tab = 'content' | 'merged' | 'detail' | 'versions' | 'files' | 'tests' | 'run'

export default function ItemDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const user = useAuth((s) => s.user)!
  const { tags: allTags } = useAuth()
  const { data: it, loading, error, reload } = useGet<Item>(`/items/${id}`)
  // ?tab=run&incident=ID (mở từ Trung tâm sự cố): vào thẳng chế độ chạy, lần chạy gắn với sự cố
  const [sp] = useSearchParams()
  const incidentId = Number(sp.get('incident')) || null
  const [tab, setTab] = useState<Tab>(sp.get('tab') === 'run' ? 'run' : 'content')
  const { busy: busyRun, run } = useBusy()
  const [busy2, setBusy2] = useState(false)
  const busy = busyRun || busy2
  const [reject, setReject] = useState(false)
  const [reason, setReason] = useState('')
  const [tagEdit, setTagEdit] = useState<number[] | null>(null)
  const official = useIsOfficial(Number(id))
  const [offDlg, setOffDlg] = useState(false)
  const [offNote, setOffNote] = useState('')

  useEffect(() => { setTab('content'); void post('/usage-events', { event_type: 'view', item_id: Number(id) }).catch(() => undefined) }, [id])

  if (loading && !it) return <Loading />
  if (error) return <div className="flex flex-col gap-4"><button className="btn outline w-fit" onClick={() => nav(-1)}><ArrowLeft size={15} />Quay lại</button><ErrorBox error={error} onRetry={reload} /></div>
  if (!it) return null

  const w = can(user.role, 'write'); const mod = can(user.role, 'moderate')
  const act = (path: string, body: unknown, ok: string) => run(async () => { const r = await post(path, body); await reload(); return r }, ok)

  async function approve() {
    const r = await run(() => post<{ status: string; approvals: number; needed: number }>(`/items/${id}/approve`, {}), undefined)
    if (r) { toast.ok(r.status === 'approved' ? 'Đã duyệt & xuất bản' : `Đã ghi nhận duyệt (${r.approvals}/${r.needed}) — cần thêm người duyệt khác`); reload() }
  }
  async function doReject() {
    if (!reason.trim()) return toast.warn('Nhập lý do trả lại')
    const r = await run(() => post(`/items/${id}/reject`, { reason: reason.trim() }), 'Đã trả mục về nháp')
    if (r !== undefined) { setReject(false); setReason(''); reload() }
  }
  async function setOfficial(on: boolean) {
    setBusy2(true)
    try { await post(`/items/${id}/official`, { official: on, note: offNote.trim() || undefined }); useOfficial.getState().set(Number(id), on); toast.ok(on ? 'Đã xác nhận là nguồn chính thống' : 'Đã gỡ xác nhận nguồn chính thống'); setOffDlg(false); reload() }
    catch (e) { const er = e as ApiError; toast.error(er.status === 403 ? 'Chủ sở hữu không tự xác nhận mục của mình. ' : er.status === 409 ? 'Mục chưa ở trạng thái đã duyệt. ' : er.status === 422 ? 'Mục hạn chế không dùng làm nguồn cho AI. ' : er.full) }
    finally { setBusy2(false) }
  }
  async function autoTag(force = false) {
    setBusy2(true)
    try {
      const r = await post<{ status: string; tags?: { name: string; created: boolean }[]; created?: number }>(`/items/${id}/auto-tag`, { wait: true, force })
      if (r.status === 'done') { toast.ok(`AI đã gắn ${r.tags?.length ?? 0} thẻ${r.created ? ` (tạo mới ${r.created})` : ''}: ${(r.tags || []).map((x) => '#' + x.name).join(', ')}`); reload() }
      else if (r.status === 'up_to_date') { if (await confirmDialog('Thẻ AI đã cập nhật', 'Nội dung chưa đổi kể từ lần AI gắn thẻ gần nhất. Vẫn chạy lại?', { okText: 'Chạy lại' })) await autoTag(true) }
      else toast.warn(AUTO_TAG_STATUS[r.status] || `Không gắn thẻ (${r.status})`)
    } catch (e) { toast.error(e instanceof ApiError ? e.full : String(e)) } finally { setBusy2(false) }
  }
  async function archive() { if (await confirmDialog('Lưu trữ mục', 'Mục sẽ bị ẩn khỏi tìm kiếm thông thường. Bạn có thể khôi phục về nháp sau.', { okText: 'Lưu trữ' })) act(`/items/${id}/archive`, {}, 'Đã lưu trữ') }
  async function saveTags() { const r = await run(() => put(`/items/${id}/tags`, { tags: tagEdit }), 'Đã cập nhật thẻ'); if (r !== undefined) { setTagEdit(null); reload() } }
  async function exportIt(format: 'md' | 'json') {
    try { const r = await download(`/items/${id}/export`, { format }, `item-${id}.${format}`, [{ name: format.toUpperCase(), extensions: [format] }]); if (r.ok) toast.ok('Đã xuất tệp') } catch (e) { toast.error(e) }
  }

  const x = (it.detail || {}) as Record<string, any>
  const hasDetail = it.type === 'prompt' || it.type === 'runbook'
  const tabs: { v: Tab; l: string }[] = [
    { v: 'content', l: 'Nội dung' }, { v: 'merged', l: 'Bản gộp (bài + tệp)' }, ...(hasDetail ? [{ v: 'detail' as Tab, l: it.type === 'prompt' ? 'Chi tiết prompt' : 'Chi tiết runbook' }] : []),
    { v: 'versions', l: 'Phiên bản' }, { v: 'files', l: `Tệp (${it.attachments?.length ?? 0})` },
    ...(it.type === 'prompt' ? [{ v: 'tests' as Tab, l: 'Kiểm thử' }] : []), ...(it.type === 'runbook' ? [{ v: 'run' as Tab, l: 'Chạy runbook' }] : []),
  ]

  return (
    <div className="flex flex-col gap-4">
      <section className="panel">
        <div className="px-5 pt-4 pb-3 flex flex-col gap-2">
          <button className="btn ghost sm w-fit !px-0" onClick={() => nav('/items')}><ArrowLeft size={15} />Kho tri thức</button>
          <h1 className="m-0 text-[22px] font-extrabold leading-snug text-ink">{it.title}</h1>
          <div className="flex items-center gap-3 flex-wrap"><ItemBadges it={it} />{official && <Pill tone="ok"><ShieldCheck size={12} />Nguồn chính thống</Pill>}<Tags tags={it.tags} max={8} />
            {w && <button className="btn outline sm" onClick={() => setTagEdit((it.tags || []).map((t) => t.id))}><Tag size={13} />Gán thẻ</button>}
            {(w || mod) && <button className="btn outline sm" disabled={busy} title="AI đọc nội dung và gắn nhóm kiến thức, chủ đề phù hợp" onClick={() => void autoTag()}><Bot size={13} />AI gắn thẻ</button>}</div>
        </div>
        <div className="px-5 py-3 border-t border-line-soft bg-brand-50/60 flex gap-2 flex-wrap items-center">
          {w && <button className="btn outline" onClick={() => nav(`/items/${id}/edit`)}><Pencil size={15} />Sửa</button>}
          {w && it.status === 'draft' && <button className="btn" disabled={busy} onClick={() => act(`/items/${id}/submit`, {}, it.risk_level === 'R1' ? 'Đã xuất bản (R1)' : 'Đã gửi duyệt')}><Send size={15} />Gửi duyệt</button>}
          {mod && it.status === 'pending' && <>
            <button className="btn success" disabled={busy} onClick={approve}><CheckCircle2 size={15} />Duyệt</button>
            <button className="btn danger" disabled={busy} onClick={() => setReject(true)}><XCircle size={15} />Trả lại</button></>}
          {mod && it.status === 'approved' && <button className={official ? 'btn outline' : 'btn'} disabled={busy} title="Xác nhận đây là bản chính thức để AI ưu tiên và tin cậy" onClick={() => { setOffNote(''); setOffDlg(true) }}><ShieldCheck size={15} />{official ? 'Gỡ nguồn chính thống' : 'Xác nhận nguồn chính thống'}</button>}
          {w && (it.status === 'approved' || it.status === 'overdue') && <button className="btn" disabled={busy} onClick={() => act(`/items/${id}/renew`, {}, 'Đã gia hạn ngày rà soát')}><RefreshCw size={15} />Xác nhận còn đúng</button>}
          {w && it.status === 'archived' && <button className="btn" disabled={busy} onClick={() => act(`/items/${id}/restore`, {}, 'Đã khôi phục về nháp')}><RotateCcw size={15} />Khôi phục</button>}
          {w && it.status !== 'archived' && <button className="btn outline" onClick={archive}><Archive size={15} />Lưu trữ</button>}
          <button className="btn outline" onClick={() => exportIt('md')}><Download size={15} />.md</button>
          <button className="btn outline" onClick={() => exportIt('json')}><Download size={15} />.json</button>
        
        </div>
        <div className="px-5 py-4 border-t border-line-soft grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <KV k="Mảng" v={it.space?.name} /><KV k="Chủ sở hữu" v={it.owner?.name} /><KV k="Độ nhạy cảm" v={SENS_LABEL[it.sensitivity_level]} />
          <KV k="Hiệu lực từ" v={dt(it.effective_date, false)} /><KV k="Hạn rà soát" v={dt(it.next_review_date, false)} />
          <KV k="Phiên bản" v={it.version ? `v${it.version.number} · ${dt(it.version.edited_at)}` : '—'} />
          {it.summary && <div className="col-span-full"><KV k="Tóm tắt" v={it.summary} /></div>}
        </div>
      </section>

      <Seg value={tab} onChange={setTab} options={tabs.map((t) => ({ value: t.v, label: t.l }))} />

      {tab === 'content' && (
        <div className="grid xl:grid-cols-[1fr_380px] gap-5 items-start">
          <div className="flex flex-col gap-4 min-w-0">
            <div className="card">{it.content ? <Md>{it.content}</Md> : <Empty text="Mục chưa có nội dung" />}</div>
            {(it.attachments?.length ?? 0) > 0 && (
              <Section title={`Tệp & ảnh đính kèm (${it.attachments!.length})`} right={<button className="btn outline sm" onClick={() => setTab('files')}>Quản lý tệp</button>}>
                <AttachStrip atts={it.attachments} size={72} max={12} label={false} />
              </Section>)}
          </div>
          <div className="flex flex-col gap-4 min-w-0">
            {it.type === 'prompt' && <PromptRender id={Number(id)} vars={arr<PromptVar>(x.variables)} />}
            <RelatedPanel id={Number(id)} />
          </div>
        </div>)}
      {tab === 'merged' && <Merged id={Number(id)} atts={it.attachments || []} />}
      {tab === 'detail' && <DetailPane it={it} x={x} />}
      {tab === 'versions' && <Versions id={Number(id)} canWrite={w} onRestored={reload} />}
      {tab === 'files' && <Files id={Number(id)} atts={it.attachments || []} canWrite={w} onChange={reload} />}
      {tab === 'tests' && <Tests id={Number(id)} canWrite={w} />}
      {tab === 'run' && <RunbookRun id={Number(id)} incidentId={incidentId} />}

      {offDlg && (
        <Modal title={official ? 'Gỡ nguồn chính thống' : 'Xác nhận nguồn chính thống'} size="sm" onClose={() => setOffDlg(false)}
          footer={<><button className="btn outline" onClick={() => setOffDlg(false)}>Hủy</button><button className="btn" disabled={busy} onClick={() => void setOfficial(!official)}>{official ? 'Gỡ xác nhận' : 'Xác nhận'}</button></>}>
          <div className="flex flex-col gap-3 text-sm leading-relaxed">
            <p className="m-0">{official ? 'Mục sẽ trở về hạng “đã kiểm duyệt”. AI sẽ không còn ưu tiên mục này trước các nguồn khác.' : 'Khi xác nhận, AI sẽ ưu tiên mục này (và các tệp của nó) hơn các nguồn khác và dùng nó để phân xử khi tài liệu mâu thuẫn. Chỉ xác nhận khi bạn đã đối chiếu với bản gốc.'}</p>
            <p className="m-0 text-muted">Người xác nhận phải khác chủ sở hữu mục; mục phải đã duyệt và không ở mức hạn chế.</p>
            <Field label="Ghi chú (tùy chọn)"><textarea className="textarea" rows={3} maxLength={300} value={offNote} onChange={(e) => setOffNote(e.target.value)} placeholder="Đã đối chiếu với bản ký ngày…" /></Field>
          </div>
        </Modal>)}
      {reject && (
        <Modal title="Trả mục về nháp" size="sm" onClose={() => setReject(false)} footer={<><button className="btn outline" onClick={() => setReject(false)}>Hủy</button><button className="btn danger" disabled={busy} onClick={doReject}>Trả lại</button></>}>
          <Field label="Lý do (bắt buộc)"><textarea className="textarea" autoFocus rows={4} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>)}
      {tagEdit && (
        <Modal title="Gán thẻ cho mục" size="md" onClose={() => setTagEdit(null)} footer={<><button className="btn outline" onClick={() => setTagEdit(null)}>Hủy</button><button className="btn" disabled={busy} onClick={saveTags}>Lưu thẻ</button></>}>
          <TagPicker all={allTags} value={tagEdit} onChange={setTagEdit} />
        </Modal>)}
    </div>
  )
}

function DetailPane({ it, x }: { it: Item; x: Record<string, any> }) {
  if (it.type === 'prompt') {
    const vars = arr<PromptVar>(x.variables)
    return (
      <div className="grid lg:grid-cols-2 gap-5">
        <Section title="Thông tin"><div className="grid gap-4"><KV k="Mục đích" v={x.purpose} /><KV k="Mô hình đã thử" v={x.model_used} /><KV k="Nhãn phiên bản" v={x.version_label} /><KV k="Hướng dẫn dùng" v={x.usage_guide} /><KV k="Giới hạn" v={x.limitations} /></div></Section>
        <Section title="Ví dụ & biến"><div className="grid gap-4"><KV k="Ví dụ đầu vào" v={x.example_input && <pre className="m-0 whitespace-pre-wrap font-sans">{x.example_input}</pre>} /><KV k="Ví dụ đầu ra" v={x.example_output && <pre className="m-0 whitespace-pre-wrap font-sans">{x.example_output}</pre>} />
          <div><div className="text-[11px] font-bold uppercase text-muted mb-2">Biến ({vars.length})</div>
            {vars.length === 0 ? '—' : <div className="flex flex-col gap-1.5">{vars.map((v) => <div key={v.name} className="text-sm"><code className="bg-brand-50 text-brand-700 rounded px-1.5 py-0.5 font-bold">{`{{${v.name}}}`}</code> <Pill sm tone="gray">{v.type || 'string'}</Pill> {v.description}</div>)}</div>}</div></div></Section>
      </div>)
  }
  const steps = arr<RunbookStep>(x.steps)
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Section title="Thông tin sự cố"><div className="grid gap-4">
        <KV k="Hệ thống bị ảnh hưởng" v={x.affected_system} /><KV k="Mức độ nghiêm trọng" v={x.severity_level && <Pill sm tone={x.severity_level === 'critical' || x.severity_level === 'high' ? 'bad' : 'warn'}>{SEVERITY_LABEL[x.severity_level] || x.severity_level}</Pill>} />
        <KV k="Triệu chứng" v={x.symptom} /><KV k="Điều kiện tiên quyết" v={x.prerequisites} /><KV k="Liên hệ leo thang" v={x.contact_info} />
        <KV k="Cách xác minh" v={x.verification} /><KV k="Cách hoàn tác" v={x.rollback} /></div></Section>
      <Section title={`Các bước xử lý (${steps.length})`}>
        {steps.length === 0 ? <Empty text="Chưa có bước nào" /> : <ol className="m-0 pl-0 list-none flex flex-col gap-3">{steps.map((s, i) => (
          <li key={i} className={clsx('flex gap-3 p-3 rounded-lg border-[1.5px]', s.dangerous ? 'border-red-300 bg-red-50' : 'border-line')}>
            <span className="w-8 h-8 shrink-0 rounded-md bg-brand-600 text-white font-black grid place-items-center">{i + 1}</span>
            <div><div className="font-bold">{s.action} {s.dangerous && <Pill sm tone="bad"><AlertTriangle size={11} />Nguy hiểm</Pill>}</div><div className="text-sm text-muted">Mong đợi: {s.expected}</div></div></li>))}</ol>}
      </Section>
    </div>)
}

function PromptRender({ id, vars }: { id: number; vars: PromptVar[] }) {
  const [vals, setVals] = useState<Record<string, string | boolean>>({})
  const [out, setOut] = useState<{ text: string; missing_variables: string[]; version: number } | null>(null)
  const { busy, run } = useBusy()
  async function render() {
    const values: Record<string, unknown> = {}
    vars.forEach((v) => { const raw = vals[v.name]; if (raw === undefined || raw === '') return; values[v.name] = v.type === 'number' ? Number(raw) : v.type === 'boolean' ? !!raw : raw })
    const r = await run(() => post<NonNullable<typeof out>>(`/items/${id}/prompt/render`, { values }))
    if (r) setOut(r)
  }
  async function copy() {
    if (!out) return
    await navigator.clipboard.writeText(out.text); toast.ok('Đã sao chép prompt')
    void post('/usage-events', { event_type: 'copy_prompt', item_id: id }).catch(() => undefined)
  }
  return (
    <Section title="Điền biến & sao chép">
      <div className="flex flex-col gap-3">
        {vars.length === 0 && <div className="text-muted text-sm">Prompt không có biến.</div>}
        {vars.map((v) => (
          <Field key={v.name} label={`${v.name}${v.type ? ` (${v.type})` : ''}`} hint={v.description}>
            {v.type === 'boolean' ? <label className="check"><input type="checkbox" checked={!!vals[v.name]} onChange={(e) => setVals({ ...vals, [v.name]: e.target.checked })} />Đúng</label>
              : v.type === 'text' ? <textarea className="textarea" rows={3} placeholder={v.example} value={String(vals[v.name] ?? '')} onChange={(e) => setVals({ ...vals, [v.name]: e.target.value })} />
                : <input className="input" type={v.type === 'number' ? 'number' : 'text'} placeholder={v.example} value={String(vals[v.name] ?? '')} onChange={(e) => setVals({ ...vals, [v.name]: e.target.value })} />}
          </Field>))}
        <button className="btn" disabled={busy} onClick={render}><Play size={14} />Tạo prompt hoàn chỉnh</button>
        {out && (
          <div className="border-[1.5px] border-brand-300 rounded-lg bg-brand-50 p-3">
            {out.missing_variables.length > 0 && <div className="text-amber-700 text-sm font-semibold mb-2">Thiếu biến: {out.missing_variables.join(', ')}</div>}
            <pre className="m-0 whitespace-pre-wrap font-sans text-sm max-h-72 overflow-auto">{out.text}</pre>
            <button className="btn sm mt-3" onClick={copy}><Clipboard size={13} />Sao chép</button>
          </div>)}
      </div>
    </Section>)
}

function Versions({ id, canWrite, onRestored }: { id: number; canWrite: boolean; onRestored: () => void }) {
  const { data, loading, error, reload } = useGet<{ current_version_id: number; versions: { id: number; version_number: number; edited_by: number; edited_at: string; change_note?: string; content_hash: string }[] }>(`/items/${id}/versions`)
  const [view, setView] = useState<any>(null)
  const [cmp, setCmp] = useState<{ from: number; to: number } | null>(null)
  const [diff, setDiff] = useState<any>(null)
  const { busy, run } = useBusy()
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const vs = data?.versions || []
  const nums = vs.map((v) => v.version_number).sort((a, b) => a - b)
  async function open(n: number) { const r = await run(() => get(`/items/${id}/versions/${n}`)); if (r) setView(r) }
  async function compare() { if (!cmp) return; const r = await run(() => get(`/items/${id}/compare`, cmp)); if (r) setDiff(r) }
  async function restore(n: number) {
    if (!(await confirmDialog('Khôi phục phiên bản', `Tạo phiên bản mới từ nội dung của v${n}? Mục sẽ quay lại luồng duyệt.`))) return
    const r = await run(() => post(`/items/${id}/versions/${n}/restore`, {}), `Đã khôi phục v${n} thành phiên bản mới`); if (r) { reload(); onRestored() }
  }
  return (
    <div className="flex flex-col gap-5">
      <Section title="Lịch sử phiên bản" right={nums.length >= 2 && (
        <div className="flex items-center gap-2"><GitCompare size={16} />
          <select className="select !w-24 !py-1.5" value={cmp?.from ?? ''} onChange={(e) => setCmp({ from: Number(e.target.value), to: cmp?.to ?? nums[nums.length - 1] })}><option value="">Từ</option>{nums.map((n) => <option key={n} value={n}>v{n}</option>)}</select>→
          <select className="select !w-24 !py-1.5" value={cmp?.to ?? ''} onChange={(e) => setCmp({ from: cmp?.from ?? nums[0], to: Number(e.target.value) })}><option value="">Đến</option>{nums.map((n) => <option key={n} value={n}>v{n}</option>)}</select>
          <button className="btn sm" disabled={!cmp?.from || !cmp?.to || busy} onClick={compare}>So sánh</button></div>)}>
        <div className="tbl-wrap max-h-[420px]"><table className="tbl"><thead><tr><th>Phiên bản</th><th>Thời gian</th><th>Ghi chú</th><th>Mã băm</th><th /></tr></thead><tbody>
          {vs.map((v) => (
            <tr key={v.id}><td className="font-bold">v{v.version_number} {v.id === data?.current_version_id && <Pill sm tone="ok">Hiện hành</Pill>}</td><td>{dt(v.edited_at)}</td><td>{v.change_note || '—'}</td><td className="font-mono text-xs text-muted">{v.content_hash?.slice(0, 10)}</td>
              <td className="num"><div className="flex gap-1 justify-end"><button className="btn outline sm" onClick={() => open(v.version_number)}><History size={13} />Xem</button>
                {canWrite && v.id !== data?.current_version_id && <button className="btn outline sm" onClick={() => restore(v.version_number)}><RotateCcw size={13} />Khôi phục</button>}</div></td></tr>))}
        </tbody></table></div>
      </Section>
      {diff && (
        <Section title={`So sánh v${diff.from} → v${diff.to}`} right={<span className="flex gap-2"><Pill sm tone="ok">+{diff.added}</Pill><Pill sm tone="bad">−{diff.removed}</Pill><button className="btn ghost sm" onClick={() => setDiff(null)}><X size={14} /></button></span>}>
          {diff.truncated && <div className="text-amber-700 text-sm mb-2 font-semibold">Kết quả đã bị cắt bớt do quá dài.</div>}
          <div className="font-mono text-[13px] border-[1.5px] border-line rounded-lg overflow-auto max-h-[480px]">
            {diff.changes.map((c: { type: string; text: string }, i: number) => (
              <div key={i} className={clsx('px-3 py-0.5 whitespace-pre-wrap', c.type === 'added' && 'bg-green-100 text-green-900', c.type === 'removed' && 'bg-red-100 text-red-900 line-through decoration-red-300')}>
                <span className="inline-block w-5 opacity-60">{c.type === 'added' ? '+' : c.type === 'removed' ? '−' : ' '}</span>{c.text}</div>))}
          </div>
        </Section>)}
      {view && (
        <Modal title={`Phiên bản v${view.version_number}`} size="lg" onClose={() => setView(null)}>
          <div className="text-sm text-muted mb-3">{view.editor?.name} · {dt(view.edited_at)} {view.change_note && `· ${view.change_note}`}</div>
          <div className="border-[1.5px] border-line rounded-lg p-4"><Md>{view.content || ''}</Md></div>
        </Modal>)}
    </div>
  )
}

function Files({ id, atts, canWrite, onChange }: { id: number; atts: Attachment[]; canWrite: boolean; onChange: () => void }) {
  // tệp mới tải lên được đọc ở nền: tự làm mới đến khi xong
  const waiting = atts.some((a) => a.ingest_status === 'pending' || a.ingest_status === 'processing')
  useEffect(() => { if (!waiting) return; const t = setInterval(onChange, 5000); return () => clearInterval(t) }, [waiting, onChange])
  return (
    <div className="flex flex-col gap-4">
      {canWrite && <Section title="Tải tệp & ảnh lên"><Uploader itemId={id} onUploaded={onChange} /></Section>}
      <Section title={`Tệp đính kèm (${atts.length})`} right={<span className="text-xs text-muted">Ảnh: bấm để phóng to · nút MD để chèn vào nội dung</span>}>
        <AttachmentGrid atts={atts} canWrite={canWrite} onChange={onChange} />
      </Section>
    </div>)
}

function Tests({ id, canWrite }: { id: number; canWrite: boolean }) {
  const tests = useGet<{ id: number; test_name: string; input_sample?: string; criteria_type: string; criteria: string }[]>(`/items/${id}/tests`)
  const matrix = useGet<{ versions: number[]; tests: { id: number; test_name: string; results: Record<string, { result: string; model_used: string; tester: string; tested_at: string }> }[] }>(`/items/${id}/test-matrix`)
  const { busy, run } = useBusy()
  const [add, setAdd] = useState(false)
  const [nt, setNt] = useState({ test_name: '', input_sample: '', criteria_type: 'pattern', criteria: '' })
  const [manual, setManual] = useState<number | null>(null)
  const [mr, setMr] = useState({ model_used: '', output_text: '', result: 'pass' })
  const [aiRes, setAiRes] = useState<any>(null)
  const reloadAll = () => { tests.reload(); matrix.reload() }

  async function create() {
    if (!nt.test_name.trim() || !nt.criteria.trim()) return toast.warn('Nhập tên ca và tiêu chí')
    const r = await run(() => post(`/items/${id}/tests`, { ...nt, input_sample: nt.input_sample || undefined }), 'Đã thêm ca kiểm thử')
    if (r) { setAdd(false); setNt({ test_name: '', input_sample: '', criteria_type: 'pattern', criteria: '' }); reloadAll() }
  }
  async function recordManual() {
    if (!mr.model_used.trim() || !mr.output_text.trim()) return toast.warn('Nhập mô hình và kết quả đầu ra')
    const r = await run(() => post(`/tests/${manual}/runs`, mr), 'Đã ghi kết quả')
    if (r) { setManual(null); setMr({ model_used: '', output_text: '', result: 'pass' }); reloadAll() }
  }
  async function aiRun() { const r = await run(() => post('/ai/prompt-tests/run', { item_id: id })); if (r) { setAiRes(r); matrix.reload() } }
  async function rm(tid: number) { if (await confirmDialog('Xóa ca kiểm thử', 'Xóa ca kiểm thử này cùng kết quả đã chạy?', { danger: true, okText: 'Xóa' })) { await run(() => del(`/tests/${tid}`), 'Đã xóa'); reloadAll() } }
  const crit: Record<string, string> = { checklist: 'Danh sách kiểm', pattern: 'Mẫu chuỗi (mỗi dòng 1 chuỗi cần có)', manual: 'Chấm tay' }

  return (
    <div className="flex flex-col gap-5">
      <Section title="Ca kiểm thử" right={canWrite && <div className="flex gap-2"><button className="btn outline" disabled={busy} onClick={aiRun}><Sparkles size={15} />Chạy & chấm bằng AI</button><button className="btn" onClick={() => setAdd(true)}>Thêm ca</button></div>}>
        {tests.loading ? <Loading /> : tests.error ? <ErrorBox error={tests.error} onRetry={tests.reload} /> : !tests.data?.length ? <Empty text="Chưa có ca kiểm thử" icon={<FlaskConical size={40} strokeWidth={1.4} />} /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Tên ca</th><th>Đầu vào mẫu</th><th>Loại tiêu chí</th><th>Tiêu chí</th><th /></tr></thead><tbody>
            {tests.data.map((t) => (<tr key={t.id}><td className="font-bold">{t.test_name}</td><td className="font-mono text-xs"><div className="max-w-[220px] truncate">{t.input_sample || '—'}</div></td><td><Pill sm tone="soft">{crit[t.criteria_type] || t.criteria_type}</Pill></td><td className="max-w-[260px] whitespace-pre-wrap text-xs">{t.criteria}</td>
              <td className="num"><div className="flex gap-1 justify-end">{canWrite && <button className="btn outline sm" onClick={() => setManual(t.id)}>Ghi kết quả</button>}{canWrite && <button className="btn ghost icon" onClick={() => rm(t.id)}><Trash2 size={15} /></button>}</div></td></tr>))}
          </tbody></table></div>)}
      </Section>
      <Section title="Bảng đạt / không đạt theo phiên bản">
        {!matrix.data?.tests.length ? <Empty text="Chưa có kết quả chạy" /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Ca kiểm thử</th>{matrix.data.versions.map((v) => <th key={v} className="center">v{v}</th>)}</tr></thead><tbody>
            {matrix.data.tests.map((t) => (<tr key={t.id}><td className="font-bold">{t.test_name}</td>{matrix.data!.versions.map((v) => { const r = t.results[String(v)]; return (
              <td key={v} className="center">{r ? <span title={`${r.model_used} · ${r.tester} · ${dt(r.tested_at)}`}><Pill sm tone={r.result === 'pass' ? 'ok' : 'bad'}>{r.result === 'pass' ? <Check size={11} /> : <X size={11} />}{r.result === 'pass' ? 'Đạt' : 'Không'}</Pill></span> : <span className="text-muted">—</span>}</td>) })}</tr>))}
          </tbody></table></div>)}
      </Section>
      {add && <Modal title="Thêm ca kiểm thử" onClose={() => setAdd(false)} footer={<><button className="btn outline" onClick={() => setAdd(false)}>Hủy</button><button className="btn" disabled={busy} onClick={create}>Thêm</button></>}>
        <div className="grid gap-4">
          <Field label="Tên ca *"><input className="input" value={nt.test_name} onChange={(e) => setNt({ ...nt, test_name: e.target.value })} /></Field>
          <Field label="Đầu vào mẫu (JSON giá trị biến)" hint='Ví dụ: {"van_ban":"Xin chào"}'><textarea className="textarea font-mono text-xs" value={nt.input_sample} onChange={(e) => setNt({ ...nt, input_sample: e.target.value })} /></Field>
          <Field label="Loại tiêu chí"><select className="select" value={nt.criteria_type} onChange={(e) => setNt({ ...nt, criteria_type: e.target.value })}>{Object.entries(crit).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Tiêu chí *"><textarea className="textarea" rows={3} value={nt.criteria} onChange={(e) => setNt({ ...nt, criteria: e.target.value })} /></Field>
        </div></Modal>}
      {manual != null && <Modal title="Ghi kết quả chạy thủ công" onClose={() => setManual(null)} footer={<><button className="btn outline" onClick={() => setManual(null)}>Hủy</button><button className="btn" disabled={busy} onClick={recordManual}>Ghi nhận</button></>}>
        <div className="grid gap-4">
          <Field label="Mô hình đã dùng *"><input className="input" value={mr.model_used} onChange={(e) => setMr({ ...mr, model_used: e.target.value })} /></Field>
          <Field label="Kết quả đầu ra *"><textarea className="textarea" rows={5} value={mr.output_text} onChange={(e) => setMr({ ...mr, output_text: e.target.value })} /></Field>
          <Field label="Đánh giá"><Seg sm value={mr.result as 'pass' | 'fail'} onChange={(v) => setMr({ ...mr, result: v })} options={[{ value: 'pass', label: 'Đạt' }, { value: 'fail', label: 'Không đạt' }]} /></Field>
        </div></Modal>}
      {aiRes && <Modal title={`Kết quả AI chấm · phiên bản v${aiRes.version}`} onClose={() => setAiRes(null)} footer={<button className="btn" onClick={() => setAiRes(null)}>Đóng</button>}>
        <div className="flex flex-col gap-2">{aiRes.results.map((r: any) => (
          <div key={r.test_id} className="p-3 rounded-lg border border-line flex items-start gap-3"><Pill sm tone={r.result === 'pass' ? 'ok' : r.result === 'fail' ? 'bad' : 'gray'}>{r.result === 'pass' ? 'Đạt' : r.result === 'fail' ? 'Không đạt' : 'Bỏ qua'}</Pill>
            <div><div className="font-bold">{r.test_name}</div><div className="text-sm text-muted">{r.detail}</div></div></div>))}</div></Modal>}
    </div>)
}

interface RunData { run_id: number; started_at: string; steps: { index: number; action: string; expected: string; dangerous: boolean }[]; verification?: string; rollback?: string }
function RunbookRun({ id, incidentId }: { id: number; incidentId?: number | null }) {
  const nav = useNavigate()
  const [rn, setRn] = useState<RunData | null>(null)
  const [state, setState] = useState<Record<number, 'done' | 'skipped' | 'failed'>>({})
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [finished, setFinished] = useState<{ duration_minutes: number | null } | null>(null)
  const { busy, run } = useBusy()
  async function start() {
    const r = await run(() => post<RunData>(`/items/${id}/runs`, incidentId ? { incident_id: incidentId } : {})); if (r) { setRn(r); setState({}); setNotes({}); setFinished(null); void post('/usage-events', { event_type: 'run_runbook', item_id: id }).catch(() => undefined) }
  }
  async function mark(step: RunData['steps'][number], st: 'done' | 'skipped' | 'failed') {
    let confirmed = false
    if (step.dangerous && st === 'done') {
      if (!(await confirmDialog('Bước nguy hiểm', `Bước “${step.action}” được đánh dấu NGUY HIỂM. Bạn xác nhận đã hiểu rủi ro và thực hiện?`, { danger: true, okText: 'Tôi xác nhận' }))) return
      confirmed = true
    }
    const r = await run(() => patch(`/runs/${rn!.run_id}`, { step_index: step.index, step_status: st, confirmed_dangerous: confirmed || undefined, note: notes[step.index] || undefined }))
    if (r !== undefined) setState((p) => ({ ...p, [step.index]: st }))
  }
  async function finish() {
    const r = await run(() => patch<{ duration_minutes: number | null }>(`/runs/${rn!.run_id}`, { finish: true }), 'Đã kết thúc lần chạy'); if (r) setFinished(r)
  }
  const incidentBar = incidentId ? (
    <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2.5 mb-3 flex items-center gap-2 flex-wrap text-sm">
      <AlertTriangle size={16} className="shrink-0" /><span className="flex-1">Lần chạy này gắn với <b>sự cố #{incidentId}</b>: từng bước được ghi vào dòng thời gian của sự cố.</span>
      <button className="btn outline sm" onClick={() => nav(`/incidents?open=${incidentId}`)}>Về sự cố</button></div>) : null
  if (!rn) return (
    <Section title="Chạy runbook khi xử lý sự cố">{incidentBar}
      <div className="empty"><Play size={40} strokeWidth={1.4} /><div>Bắt đầu một lần chạy để ghi lại từng bước đã làm (có tính thời gian xử lý).</div><button className="btn lg" disabled={busy} onClick={start}><Play size={16} />Bắt đầu chạy</button></div>
    </Section>)
  const done = Object.keys(state).length
  return (
    <Section title={`Đang chạy #${rn.run_id}`} right={<div className="flex items-center gap-3"><Pill tone="soft">{done}/{rn.steps.length} bước</Pill>
      {!finished && <button className="btn success" disabled={busy} onClick={finish}><Check size={15} />Kết thúc</button>}{finished && <button className="btn outline" onClick={start}>Chạy lại</button>}</div>}>
      {incidentBar}
      <div className="progress mb-4"><i style={{ width: `${(done / Math.max(1, rn.steps.length)) * 100}%` }} /></div>
      {finished && <div className="rounded-lg bg-green-50 border border-green-200 text-green-900 p-3 mb-4 font-semibold flex items-center gap-3 flex-wrap"><span className="flex-1">Hoàn tất. Thời gian xử lý: {finished.duration_minutes != null ? `${finished.duration_minutes} phút` : 'chưa xác định'}.</span>{incidentId && <button className="btn sm" onClick={() => nav(`/incidents?open=${incidentId}`)}>Về sự cố để đóng</button>}</div>}
      <div className="flex flex-col gap-3">
        {rn.steps.map((s) => { const st = state[s.index]; return (
          <div key={s.index} className={clsx('p-4 rounded-lg border-[1.5px]', s.dangerous ? 'border-red-300 bg-red-50/60' : 'border-line', st === 'done' && '!border-green-400 !bg-green-50', st === 'failed' && '!border-red-400 !bg-red-100')}>
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 shrink-0 rounded-md bg-brand-600 text-white font-black grid place-items-center">{s.index + 1}</span>
              <div className="flex-1"><div className="font-bold">{s.action} {s.dangerous && <Pill sm tone="bad"><AlertTriangle size={11} />Nguy hiểm</Pill>}</div><div className="text-sm text-muted">Mong đợi: {s.expected}</div></div>
              {st && <Pill sm tone={st === 'done' ? 'ok' : st === 'failed' ? 'bad' : 'gray'}>{st === 'done' ? 'Đã làm' : st === 'failed' ? 'Thất bại' : 'Bỏ qua'}</Pill>}
            </div>
            {!finished && <div className="flex gap-2 mt-3 pl-11 flex-wrap items-center">
              <input className="input !w-64 !py-1.5" placeholder="Ghi chú (tùy chọn)" value={notes[s.index] || ''} onChange={(e) => setNotes({ ...notes, [s.index]: e.target.value })} />
              <button className="btn success sm" disabled={busy} onClick={() => mark(s, 'done')}><Check size={13} />Đã làm</button>
              <button className="btn outline sm" disabled={busy} onClick={() => mark(s, 'skipped')}><SkipForward size={13} />Bỏ qua</button>
              <button className="btn danger sm" disabled={busy} onClick={() => mark(s, 'failed')}><X size={13} />Thất bại</button></div>}
          </div>) })}
      </div>
      {(rn.verification || rn.rollback) && <div className="grid md:grid-cols-2 gap-4 mt-5">
        {rn.verification && <div className="p-3 rounded-lg bg-brand-50 border border-brand-100"><b>Xác minh đã khỏi:</b><div className="text-sm mt-1">{rn.verification}</div></div>}
        {rn.rollback && <div className="p-3 rounded-lg bg-amber-50 border border-amber-200"><b>Hoàn tác nếu làm sai:</b><div className="text-sm mt-1">{rn.rollback}</div></div>}</div>}
    </Section>)
}
void WORK_TYPE; void ApiError; void deskApi

function Merged({ id, atts }: { id: number; atts: Attachment[] }) {
  const [withAtt, setWithAtt] = useState(true)
  const { data, loading, error, reload } = useGet<{ markdown: string; title: string }>(`/items/${id}/markdown`, { attachments: withAtt })
  return (
    <Section title="Bản gộp: bài + chữ trong từng tệp" right={<div className="flex gap-2 items-center"><label className="check text-sm"><input type="checkbox" checked={withAtt} onChange={(e) => setWithAtt(e.target.checked)} />Kèm nội dung tệp ({atts.length})</label>
      <button className="btn outline sm" disabled={!data} onClick={() => { void navigator.clipboard.writeText(data!.markdown); toast.ok('Đã sao chép Markdown') }}><Clipboard size={13} />Sao chép</button></div>}>
      <p className="m-0 mb-3 text-xs text-muted flex items-center gap-1.5"><BookOpenText size={14} />Đây chính là văn bản mà AI đọc cho mục này: mỗi nguồn được tách riêng, ghi rõ hạng tin cậy và chữ nào do AI đọc chưa kiểm chứng.</p>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : data ? <div className="border border-line rounded-lg p-5 bg-white max-h-[68vh] overflow-auto"><Md>{data.markdown}</Md></div> : null}
    </Section>)
}

const AUTO_TAG_STATUS: Record<string, string> = { disabled: 'Quản trị đã tắt AI gắn thẻ (ai_auto_tag)', not_taggable: 'Mục nháp, hạn chế hoặc đã lưu trữ không gửi cho AI', no_content: 'Mục quá ít nội dung để gắn thẻ', missing: 'Không tìm thấy mục' }

/** Mục liên quan: chung thẻ (kể cả khác nhóm) và gần nghĩa nội dung */
function RelatedPanel({ id }: { id: number }) {
  const nav = useNavigate()
  const { data, loading, error } = useGet<{ related: RelatedItem[] }>(`/items/${id}/related`, { limit: 8 })
  if (error?.status === 404) return null
  return (
    <Section title="Mục liên quan" right={data && <span className="text-xs text-muted">{data.related.length} mục</span>}>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} /> : !data?.related.length ? <Empty text="Chưa có mục liên quan" /> : (
        <div className="flex flex-col gap-2.5">{data.related.map((r) => (
          <button key={r.id} className="text-left border border-line rounded-lg p-3 bg-white hover:border-brand-300 hover:bg-brand-50 cursor-pointer flex flex-col gap-1.5" onClick={() => nav(`/items/${r.id}`)}>
            <div className="flex items-start gap-2"><b className="flex-1 leading-snug text-brand-800">{r.title}</b><TierPill tier={r.tier} /></div>
            <div className="flex items-center gap-2"><div className="progress flex-1 !h-1.5"><i style={{ width: `${Math.min(100, r.score * 100)}%` }} /></div><span className="text-[11px] font-mono text-muted">{r.score.toFixed(2)}</span></div>
            {r.shared_tags.length > 0 && <div className="flex gap-1 flex-wrap">{r.shared_tags.map((t) => <span key={t.id} className="text-[10.5px] font-bold text-brand-700 bg-brand-50 border border-brand-200 rounded px-1.5">{t.kind === 'category' ? '' : '#'}{t.name}</span>)}</div>}
            {r.semantic_score != null && <div className="text-[11px] text-muted">Gần nghĩa nội dung: {r.semantic_score.toFixed(2)}</div>}
          </button>))}</div>)}
    </Section>)
}
