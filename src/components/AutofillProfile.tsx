// "Hồ sơ của tôi" cho Điền mẫu tự động: thẻ tóm tắt, hộp sửa hồ sơ theo nhóm, quét CCCD bằng AI.
// Hồ sơ lưu mã hóa trên máy chủ (/fill/profile); ảnh CCCD chỉ gửi cho AI đọc, không lưu.
import { DragEvent, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { create } from 'zustand'
import { AlertTriangle, Check, CreditCard, IdCard, ImagePlus, Loader2, Lock, Pencil, ScanLine, ShieldCheck, Sparkles, Trash2, UserRound, X } from 'lucide-react'
import { ApiError, LocalFile, del, fromBrowserFile, get, isAnyImageName, pickLocalFiles, postFiles, put } from '../lib/api'
import { confirmDialog, toast } from '../store/ui'
import { FileThumb } from './FileKit'
import { Modal } from './ui'

export interface ProfileField { key: string; group: string; label: string; type: string; hint?: string }
export interface Profile {
  groups: { id: string; label: string }[]; fields: ProfileField[]; values: Record<string, string>; sources: Record<string, string>
  filled: number; total: number; updated_at: string | null; note?: string
}
interface ScanResult { values: Record<string, string>; document_type: string | null; unclear: string[]; warnings: string[]; fields: { key: string; label: string }[]; cost_usd: number }

const SOURCE_TAG: Record<string, string> = { manual: 'Tự nhập', id_card: 'Từ CCCD', fill: 'Từ lần điền' }
const GROUP_ICON: Record<string, string> = { personal: '👤', id_card: '🪪', contact: '📞', work: '🏢', bank: '🏦', defaults: '📍' }

/** Hồ sơ dùng chung giữa thẻ tóm tắt, hộp sửa và bàn điền mẫu */
export const useProfile = create<{
  data: Profile | null; loading: boolean; dialog: null | 'edit' | 'scan'
  load: () => Promise<void>; save: (values: Record<string, string>, source?: string) => Promise<boolean>; clear: () => Promise<void>; open: (d: null | 'edit' | 'scan') => void
}>((set, getState) => ({
  data: null, loading: false, dialog: null,
  load: async () => {
    set({ loading: true })
    try { set({ data: await get<Profile>('/fill/profile') }) } catch (e) { toast.error((e as ApiError).full || e) } finally { set({ loading: false }) }
  },
  save: async (values, source = 'manual') => {
    try { set({ data: await put<Profile>('/fill/profile', { values, source }) }); return true } catch (e) { toast.error((e as ApiError).full || e); return false }
  },
  clear: async () => {
    if (!(await confirmDialog('Xóa toàn bộ hồ sơ?', 'Mọi thông tin trong hồ sơ (họ tên, CCCD, địa chỉ, tài khoản…) sẽ bị xóa và không khôi phục được. Mẫu và các lần điền đã lưu vẫn còn.', { danger: true, okText: 'Xóa hồ sơ' }))) return
    try { await del('/fill/profile'); toast.ok('Đã xóa hồ sơ'); await getState().load() } catch (e) { toast.error((e as ApiError).full || e) }
  },
  open: (dialog) => set({ dialog }),
}))

const initials = (name?: string) => (name || '').trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase() || '?'

/** Thẻ hồ sơ ở đầu trang Điền mẫu */
export function ProfileCard({ admin, scanOff }: { admin: boolean; scanOff: boolean }) {
  const { data, load, open } = useProfile()
  useEffect(() => { if (!data) void load() }, []) // eslint-disable-line
  if (!data) return <div className={clsx('af-profile', admin && 'admin')}><Loader2 size={18} className="animate-spin text-brand-500" /><span className="text-muted">Đang tải hồ sơ…</span></div>
  const v = data.values
  const pct = Math.round((data.filled / Math.max(1, data.total)) * 100)
  const key = [
    { k: 'so_cccd', t: 'CCCD' }, { k: 'ngay_sinh', t: 'Ngày sinh' }, { k: 'noi_thuong_tru', t: 'Thường trú' }, { k: 'dien_thoai', t: 'Điện thoại' },
    { k: 'cong_ty', t: 'Công ty' }, { k: 'so_tai_khoan', t: 'Tài khoản' }, { k: 'noi_lam_don', t: 'Nơi làm đơn' },
  ]
  const empty = data.filled === 0
  return (
    <div className={clsx('af-profile', admin && 'admin', empty && 'is-empty')}>
      <span className="af-avatar" aria-hidden>{empty ? <UserRound size={22} /> : initials(v.ho_ten)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <b className="text-[1.05em]">{empty ? 'Hồ sơ của tôi' : v.ho_ten || 'Hồ sơ của tôi'}</b>
          <span className="af-pill"><Lock size={11} />Mã hóa, chỉ mình bạn xem</span>
        </div>
        {empty
          ? <div className="text-muted text-[0.9em] mt-0.5">Lưu thông tin một lần (quét CCCD là nhanh nhất) để các ô họ tên, ngày sinh, CCCD, địa chỉ, ngày làm đơn… <b>tự điền, không tốn AI</b>.</div>
          : (<>
            <div className="af-meter" title={`${data.filled}/${data.total} thông tin`}><i><b className="af-meter-fill" style={{ width: `${pct}%` }} /></i><span>{data.filled}/{data.total} thông tin</span></div>
            <div className="af-chips">{key.map((x) => <span key={x.k} className={clsx(v[x.k] ? 'on' : 'off')}>{v[x.k] ? <Check size={11} /> : <X size={11} />}{x.t}</span>)}</div>
          </>)}
      </div>
      <div className="af-profile-actions">
        <button className={clsx(empty ? 'af-btn-primary' : 'af-btn-soft')} disabled={scanOff} onClick={() => open('scan')} title={scanOff ? 'Tính năng đọc CCCD bằng AI đang tắt' : 'Chụp CCCD, AI đọc và điền hồ sơ'}><ScanLine size={17} />Quét CCCD</button>
        <button className="af-btn-soft" onClick={() => open('edit')}><Pencil size={16} />{empty ? 'Tự nhập' : 'Xem & sửa'}</button>
      </div>
      <ProfileDialogs scanOff={scanOff} />
    </div>)
}

function ProfileDialogs({ scanOff }: { scanOff: boolean }) {
  const { dialog, open } = useProfile()
  if (dialog === 'edit') return <ProfileDialog onClose={() => open(null)} onScan={scanOff ? undefined : () => open('scan')} />
  if (dialog === 'scan') return <ScanDialog onClose={() => open(null)} />
  return null
}

/** Hộp xem và sửa hồ sơ theo nhóm */
function ProfileDialog({ onClose, onScan }: { onClose: () => void; onScan?: () => void }) {
  const { data, save, clear } = useProfile()
  const [vals, setVals] = useState<Record<string, string>>(() => ({ ...(data?.values || {}) }))
  const [busy, setBusy] = useState(false)
  if (!data) return null
  const changed = data.fields.filter((f) => (vals[f.key] || '').trim() !== (data.values[f.key] || ''))
  async function submit() {
    if (!changed.length) return onClose()
    setBusy(true)
    const ok = await save(Object.fromEntries(changed.map((f) => [f.key, (vals[f.key] || '').trim()])), 'manual')
    setBusy(false)
    if (ok) { toast.ok(`Đã lưu ${changed.length} thông tin vào hồ sơ`); onClose() }
  }
  return (
    <Modal title={<span className="inline-flex items-center gap-2"><UserRound size={20} />Hồ sơ của tôi</span>} size="xl" onClose={onClose}
      footer={<>
        {data.filled > 0 && <button className="btn ghost mr-auto text-red-700" onClick={() => void clear().then(onClose)}><Trash2 size={15} />Xóa hồ sơ</button>}
        <button className="btn outline" onClick={onClose}>Đóng</button>
        <button className="btn" disabled={busy || !changed.length} onClick={() => void submit()}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{changed.length ? `Lưu ${changed.length} thay đổi` : 'Lưu'}</button>
      </>}>
      <div className="flex flex-col gap-5">
        <div className="af-prof-intro">
          <ShieldCheck size={20} className="shrink-0 text-emerald-700" />
          <div className="flex-1 text-[13.5px] leading-relaxed">Thông tin ở đây dùng để <b>tự điền</b> các ô về bạn (người làm đơn) trong mọi mẫu. Hồ sơ được <b>mã hóa</b> trên máy chủ, chỉ bạn xem được. Ô nói về người khác (bên mua, khách hàng, người thân…) không bao giờ lấy từ hồ sơ.</div>
          {onScan && <button className="btn sm" onClick={onScan}><ScanLine size={15} />Quét CCCD</button>}
        </div>
        {data.note && <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 text-sm flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />Hồ sơ cũ không đọc được (khóa mã hóa đã đổi). Hãy nhập lại.</div>}
        {data.groups.map((g) => {
          const fs = data.fields.filter((f) => f.group === g.id)
          if (!fs.length) return null
          return (
            <section key={g.id} className="af-prof-group">
              <h4><span aria-hidden>{GROUP_ICON[g.id] || '•'}</span>{g.label}<small>{fs.filter((f) => vals[f.key]).length}/{fs.length}</small></h4>
              <div className="af-prof-grid">
                {fs.map((f) => (
                  <label key={f.key} className={clsx('af-prof-field', f.type === 'long_text' && 'wide')}>
                    <span className="flex items-center gap-1.5">{f.label}{data.sources[f.key] && (vals[f.key] || '') === (data.values[f.key] || '') && <em>{SOURCE_TAG[data.sources[f.key]] || data.sources[f.key]}</em>}</span>
                    <input className="input" value={vals[f.key] || ''} maxLength={300} onChange={(e) => setVals((c) => ({ ...c, [f.key]: e.target.value }))}
                      placeholder={f.type === 'date' ? 'dd/mm/yyyy' : f.hint || ''} inputMode={f.type === 'phone' || f.type === 'id_number' ? 'numeric' : undefined} />
                  </label>))}
              </div>
            </section>)
        })}
      </div>
    </Modal>)
}

/** Quét CCCD: chọn ảnh mặt trước, mặt sau; AI đọc; người dùng xem lại, chọn thông tin cần lưu */
function ScanDialog({ onClose }: { onClose: () => void }) {
  const { data, save } = useProfile()
  const [front, setFront] = useState<LocalFile | null>(null)
  const [back, setBack] = useState<LocalFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<ScanResult | null>(null)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  async function choose(side: 'front' | 'back') {
    try { const [f] = await pickLocalFiles('image'); if (f) (side === 'front' ? setFront : setBack)(f) } catch (e) { toast.error(e) }
  }
  async function drop(e: DragEvent, side: 'front' | 'back') {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (!f) return
    const lf = await fromBrowserFile(f)
    if (!isAnyImageName(lf.name) && !/\.pdf$/i.test(lf.name)) return toast.warn('Hãy chọn ảnh (jpg, png, heic…) hoặc PDF')
    ;(side === 'front' ? setFront : setBack)(lf)
  }
  async function read() {
    const files = [front, back].filter(Boolean) as LocalFile[]
    if (!files.length) return
    setBusy(true)
    try {
      const r = await postFiles<ScanResult>('/fill/profile/scan', files, {}, 2)
      setRes(r); setVals(r.values)
      const cur = data?.values || {}
      setPick(new Set(Object.keys(r.values).filter((k) => r.values[k] && r.values[k] !== cur[k])))
      if (!Object.keys(r.values).length) toast.warn('AI chưa đọc được thông tin nào. Hãy chụp lại rõ hơn, đủ sáng, không bị lóa.')
    } catch (e) { toast.error((e as ApiError).full || e) } finally { setBusy(false) }
  }
  async function submit() {
    if (!pick.size) return onClose()
    setSaving(true)
    const ok = await save(Object.fromEntries([...pick].map((k) => [k, (vals[k] || '').trim()])), 'id_card')
    setSaving(false)
    if (ok) { toast.ok(`Đã lưu ${pick.size} thông tin từ CCCD vào hồ sơ`); onClose() }
  }
  const slot = (side: 'front' | 'back', f: LocalFile | null, set: (f: LocalFile | null) => void) => (
    <div className={clsx('af-scan-slot', f && 'has')} onDragOver={(e) => e.preventDefault()} onDrop={(e) => void drop(e, side)}>
      {f ? (<>
        <FileThumb name={f.name} bytes={f.bytes} className="af-scan-img" />
        <div className="af-scan-cap"><span className="truncate">{side === 'front' ? 'Mặt trước' : 'Mặt sau'} · {f.name}</span><button onClick={() => set(null)} aria-label="Bỏ ảnh"><X size={14} /></button></div>
      </>) : (
        <button className="af-scan-pick" onClick={() => void choose(side)}>
          {side === 'front' ? <IdCard size={34} /> : <CreditCard size={34} />}
          <b>{side === 'front' ? 'Ảnh mặt trước' : 'Ảnh mặt sau (nên có)'}</b>
          <small>{side === 'front' ? 'Họ tên, số CCCD, ngày sinh, quê quán, thường trú' : 'Ngày cấp, nơi cấp'}</small>
          <span className="af-mini"><ImagePlus size={14} />Chọn hoặc kéo ảnh vào</span>
        </button>)}
    </div>)

  const cur = data?.values || {}
  return (
    <Modal title={<span className="inline-flex items-center gap-2"><ScanLine size={20} />Quét căn cước công dân</span>} size="lg" onClose={onClose} closable={!busy && !saving}
      footer={res
        ? <><button className="btn outline mr-auto" onClick={() => { setRes(null); setPick(new Set()) }}>Quét lại</button><button className="btn outline" onClick={onClose}>Đóng</button>
          <button className="btn" disabled={saving || !pick.size} onClick={() => void submit()}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}Lưu {pick.size} thông tin vào hồ sơ</button></>
        : <><button className="btn outline" onClick={onClose}>Hủy</button>
          <button className="btn" disabled={busy || !front && !back} onClick={() => void read()}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{busy ? 'AI đang đọc thẻ…' : 'Đọc thông tin bằng AI'}</button></>}>
      {!res ? (
        <div className="flex flex-col gap-4">
          <div className="grid sm:grid-cols-2 gap-3">{slot('front', front, setFront)}{slot('back', back, setBack)}</div>
          <div className="af-privacy"><Lock size={14} /><span>Ảnh chỉ được gửi cho AI để đọc chữ và <b>không lưu</b> trên máy chủ. Bạn xem lại từng thông tin rồi mới chọn lưu vào hồ sơ (được mã hóa).</span></div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {res.warnings.map((w) => <div key={w} className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 text-sm flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{w}</div>)}
          <div className="text-sm text-muted">AI đọc được {Object.keys(res.values).length} thông tin{res.document_type ? ` từ ${res.document_type}` : ''}. Đánh dấu thông tin muốn lưu; sửa lại nếu đọc nhầm.</div>
          <div className="af-scan-list">
            {res.fields.filter((f) => res.values[f.key] || res.unclear.includes(f.key)).map((f) => (
              <label key={f.key} className={clsx('af-scan-row', pick.has(f.key) && 'on')}>
                <input type="checkbox" checked={pick.has(f.key)} onChange={(e) => setPick((s) => { const n = new Set(s); if (e.target.checked) n.add(f.key); else n.delete(f.key); return n })} />
                <span className="af-scan-label">{f.label}</span>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <input className="input !min-h-[34px]" value={vals[f.key] || ''} onChange={(e) => setVals((c) => ({ ...c, [f.key]: e.target.value }))} placeholder={res.unclear.includes(f.key) ? 'Ảnh mờ, chưa đọc được' : ''} />
                  {cur[f.key] && cur[f.key] !== vals[f.key] && <small className="text-muted">Hồ sơ đang có: {cur[f.key]}</small>}
                  {res.unclear.includes(f.key) && <small className="text-amber-700">Chỗ này trên ảnh bị mờ, hãy kiểm tra</small>}
                </span>
              </label>))}
          </div>
        </div>)}
    </Modal>)
}

/** Đề nghị lưu giá trị vừa điền vào hồ sơ (ô ứng với thông tin hồ sơ mà hồ sơ chưa có hoặc khác) */
export function SaveToProfile({ fields, values, matches }: { fields: { key: string; label: string }[]; values: Record<string, string>; matches: Record<string, string> }) {
  const { data, save } = useProfile()
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const items = useMemo(() => {
    if (!data) return []
    const seen = new Set<string>()
    return fields.flatMap((f) => {
      const pk = matches[f.key]
      const v = (values[f.key] || '').trim()
      if (!pk || !v || seen.has(pk) || data.values[pk] === v) return []
      seen.add(pk)
      return [{ pk, label: data.fields.find((x) => x.key === pk)?.label || pk, value: v, old: data.values[pk] }]
    })
  }, [data, fields, values, matches])
  const [off, setOff] = useState<Set<string>>(new Set())
  if (done || !items.length) return null
  const chosen = items.filter((i) => !off.has(i.pk))
  async function submit() {
    setBusy(true)
    const ok = await save(Object.fromEntries(chosen.map((i) => [i.pk, i.value])), 'fill')
    setBusy(false)
    if (ok) { setDone(true); toast.ok('Đã lưu vào hồ sơ: lần sau các ô này tự điền') }
  }
  return (
    <div className="af-learn">
      <div className="flex items-center gap-2 font-bold"><Sparkles size={17} className="text-brand-600" />Lưu vào hồ sơ để lần sau tự điền?</div>
      <div className="flex flex-col gap-1.5">
        {items.map((i) => (
          <label key={i.pk} className="af-learn-row">
            <input type="checkbox" checked={!off.has(i.pk)} onChange={(e) => setOff((s) => { const n = new Set(s); if (e.target.checked) n.delete(i.pk); else n.add(i.pk); return n })} />
            <span className="font-semibold">{i.label}:</span><span className="truncate">{i.value}</span>{i.old && <small className="text-muted shrink-0">(thay “{i.old}”)</small>}
          </label>))}
      </div>
      <div className="flex gap-2">
        <button className="af-mini" disabled={busy || !chosen.length} onClick={() => void submit()}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Lưu {chosen.length} thông tin</button>
        <button className="af-mini ghost" onClick={() => setDone(true)}>Không, cảm ơn</button>
      </div>
    </div>)
}
