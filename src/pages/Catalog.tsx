import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { del, post, put, useGet } from '../lib/api'
import { can } from '../lib/permissions'
import { dt, SENS_LABEL } from '../lib/format'
import type { Space, Synonym, Tag, Template } from '../lib/types'
import { Empty, Field, Modal, PageHeader, Pill } from '../components/ui'
import { ErrorBox, Loading, useBusy } from '../components/shared'
import { useAuth } from '../store/auth'
import { confirmDialog } from '../store/ui'
import { useClientPage } from '../components/ShowMore'
import { Pager } from '../components/shared'

export { Tags } from './TagsAdmin'

export function Synonyms() {
  const user = useAuth((s) => s.user)!
  const w = can(user.role, 'moderate')
  const { data, loading, error, reload } = useGet<Synonym[]>('/synonyms')
  const { busy, run } = useBusy()
  const [word, setWord] = useState(''); const [syn, setSyn] = useState('')
  async function add() { const r = await run(() => post('/synonyms', { word: word.trim(), synonym_with: syn.trim() }), 'Đã thêm từ đồng nghĩa'); if (r) { setWord(''); setSyn(''); reload() } }
  async function rm(s: Synonym) { if (await confirmDialog('Xóa từ đồng nghĩa', `Xóa “${s.word} ↔ ${s.synonym_with}”?`, { danger: true, okText: 'Xóa' })) { await run(() => del(`/synonyms/${s.id}`), 'Đã xóa'); reload() } }
  const synPg = useClientPage(data || [], 50)
  return (
    <div className="flex flex-col gap-4 max-w-[900px]">
      <PageHeader title="Từ đồng nghĩa" subtitle="Giúp tìm kiếm hiểu “lỗi” = “error”, “khởi động lại” = “restart”…" />
      {w && <div className="card !p-4 flex items-end gap-3 flex-wrap"><Field label="Từ" className="w-56"><input className="input" value={word} onChange={(e) => setWord(e.target.value)} placeholder="khoi dong lai" /></Field><span className="pb-3 font-black text-brand-600">↔</span>
        <Field label="Đồng nghĩa với" className="w-56"><input className="input" value={syn} onChange={(e) => setSyn(e.target.value)} placeholder="restart" /></Field><button className="btn" disabled={busy || !word.trim() || !syn.trim()} onClick={add}><Plus size={16} />Thêm</button></div>}
      <ErrorBox error={error} onRetry={reload} />{loading && !data && <Loading />}
      {data && data.length === 0 && <Empty text="Chưa có từ đồng nghĩa" />}
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Từ</th><th>Đồng nghĩa với</th><th /></tr></thead><tbody>
        {synPg.rows.map((s) => <tr key={s.id}><td className="font-bold">{s.word}</td><td>{s.synonym_with}</td><td className="num">{w && <button className="btn ghost icon" onClick={() => rm(s)} aria-label={`Xóa ${s.word}`}><Trash2 size={15} /></button>}</td></tr>)}</tbody></table></div>
      <Pager page={synPg.page} pages={synPg.pages} total={synPg.total} onPage={synPg.setPage} />
    </div>)
}

export function Spaces() {
  const user = useAuth((s) => s.user)!
  const loadCatalog = useAuth((s) => s.loadCatalog)
  const admin = can(user.role, 'admin')
  const { data, loading, error, reload } = useGet<Space[]>('/spaces')
  const { busy, run } = useBusy()
  const [f, setF] = useState<{ id?: number; name: string; description: string; owner_id: string; default_sensitivity_level: 'internal' | 'restricted' } | null>(null)
  async function save() {
    if (!f) return
    const body = { name: f.name.trim(), description: f.description || undefined, owner_id: f.owner_id ? Number(f.owner_id) : undefined, default_sensitivity_level: f.default_sensitivity_level }
    const r = await run(() => (f.id ? put(`/spaces/${f.id}`, body) : post('/spaces', body)), 'Đã lưu mảng')
    if (r) { setF(null); reload(); loadCatalog() }
  }
  return (
    <div className="flex flex-col gap-4 max-w-[1000px]">
      <PageHeader title="Mảng nội dung" subtitle="Nhóm nội dung; mỗi mục thuộc một mảng. Chỉ quản trị được tạo/sửa mảng." actions={admin && <button className="btn" onClick={() => setF({ name: '', description: '', owner_id: '', default_sensitivity_level: 'internal' })}><Plus size={16} />Tạo mảng</button>} />
      <ErrorBox error={error} onRetry={reload} />{loading && !data && <Loading />}
      <div className="grid md:grid-cols-2 gap-4">{data?.map((s) => (
        <div key={s.id} className="card"><div className="flex items-start gap-3"><div className="flex-1"><div className="font-black text-lg text-brand-800">{s.name}</div><div className="text-sm text-muted mt-1">{s.description || 'Chưa có mô tả'}</div>
          <div className="flex gap-2 mt-3"><Pill sm tone="soft">ID {s.id}</Pill><Pill sm tone={s.default_sensitivity_level === 'restricted' ? 'bad' : 'gray'}>{SENS_LABEL[s.default_sensitivity_level || 'internal']}</Pill>{s.owner_id && <Pill sm tone="gray">Chủ #{s.owner_id}</Pill>}</div></div>
          {admin && <button className="btn outline icon" onClick={() => setF({ id: s.id, name: s.name, description: s.description || '', owner_id: s.owner_id ? String(s.owner_id) : '', default_sensitivity_level: s.default_sensitivity_level || 'internal' })}><Pencil size={15} /></button>}</div></div>))}</div>
      {f && <Modal title={f.id ? 'Sửa mảng' : 'Tạo mảng'} size="sm" onClose={() => setF(null)} footer={<><button className="btn outline" onClick={() => setF(null)}>Hủy</button><button className="btn" disabled={busy || !f.name.trim()} onClick={save}>Lưu</button></>}>
        <div className="grid gap-4"><Field label="Tên mảng *"><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Mô tả"><textarea className="textarea" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Mã người sở hữu mảng"><input className="input" inputMode="numeric" value={f.owner_id} onChange={(e) => setF({ ...f, owner_id: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Độ nhạy cảm mặc định"><select className="select" value={f.default_sensitivity_level} onChange={(e) => setF({ ...f, default_sensitivity_level: e.target.value as 'internal' | 'restricted' })}>{Object.entries(SENS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field></div></Modal>}
    </div>)
}

export function Templates() {
  const user = useAuth((s) => s.user)!
  const w = can(user.role, 'moderate')
  const { data, loading, error, reload } = useGet<Template[]>('/templates')
  const { busy, run } = useBusy()
  const [f, setF] = useState<{ id?: number; name: string; content: string } | null>(null)
  async function save() { if (!f) return; const body = { name: f.name.trim(), content: f.content }; const r = await run(() => (f.id ? put(`/templates/${f.id}`, body) : post('/templates', body)), 'Đã lưu mẫu'); if (r) { setF(null); reload() } }
  async function rm(t: Template) { if (await confirmDialog('Xóa mẫu', `Xóa mẫu “${t.name}”?`, { danger: true, okText: 'Xóa' })) { await run(() => del(`/templates/${t.id}`), 'Đã xóa mẫu'); reload() } }
  return (
    <div className="flex flex-col gap-4 max-w-[1100px]">
      <PageHeader title="Mẫu nội dung" subtitle="Khung soạn sẵn có thể chèn khi tạo mục mới" actions={w && <button className="btn" onClick={() => setF({ name: '', content: '' })}><Plus size={16} />Tạo mẫu</button>} />
      <ErrorBox error={error} onRetry={reload} />{loading && !data && <Loading />}
      {data && data.length === 0 && <Empty text="Chưa có mẫu nội dung" />}
      <div className="grid md:grid-cols-2 gap-4">{data?.map((t) => (
        <div key={t.id} className="card"><div className="flex items-center gap-2"><div className="font-black text-brand-800 flex-1">{t.name}</div>{w && <><button className="btn outline icon" onClick={() => setF({ id: t.id, name: t.name, content: t.content || '' })}><Pencil size={15} /></button><button className="btn ghost icon" onClick={() => rm(t)}><Trash2 size={15} /></button></>}</div>
          <pre className="m-0 mt-3 text-xs bg-brand-50 rounded-lg p-3 max-h-40 overflow-auto whitespace-pre-wrap font-mono">{t.content || '(trống)'}</pre><div className="text-xs text-muted mt-2">{dt(t.created_at)}</div></div>))}</div>
      {f && <Modal title={f.id ? 'Sửa mẫu' : 'Tạo mẫu'} size="lg" onClose={() => setF(null)} footer={<><button className="btn outline" onClick={() => setF(null)}>Hủy</button><button className="btn" disabled={busy || !f.name.trim()} onClick={save}>Lưu</button></>}>
        <div className="grid gap-4"><Field label="Tên mẫu *"><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Nội dung (Markdown)"><textarea className="textarea font-mono text-[13px]" rows={14} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></Field></div></Modal>}
    </div>)
}
