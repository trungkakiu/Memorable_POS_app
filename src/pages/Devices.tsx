// Quản trị cảm biến IoT: tạo cảm biến, đặt khoảng "bình thường" và "nguy hiểm", lấy khóa để nhập vào thiết bị.
// Khóa thiết bị chỉ hiện MỘT lần lúc tạo hoặc đổi khóa; máy chủ chỉ lưu bản băm.
import { useEffect, useState } from 'react'
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { deskApi, del, patch, post, useGet } from '../lib/api'
import { Empty, Field, Modal, PageHeader, Pill } from '../components/ui'
import { ErrorBox, Loading, useBusy } from '../components/shared'
import { confirmDialog, toast } from '../store/ui'
import { APP_CONFIG } from '../lib/appConfig'
import { IotDevice, IotKind, KIND_LABEL, agoText, sayStatus, showNum } from '../field/iot'

const TONE = { ok: 'ok', warn: 'warn', bad: 'bad', offline: 'gray' } as const
interface Form { id?: number; name: string; place: string; kind: IotKind; unit: string; ok_min: string; ok_max: string; danger_min: string; danger_max: string; offline_minutes: string }
const blank = (): Form => ({ name: '', place: '', kind: 'temperature', unit: '°C', ok_min: '', ok_max: '', danger_min: '', danger_max: '', offline_minutes: '30' })
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
const UNIT: Record<IotKind, string> = { temperature: '°C', humidity: '%', soil: '%', water: 'cm', power: 'V', other: '' }

export default function Devices() {
  const { data, loading, error, reload } = useGet<{ devices: IotDevice[] }>('/iot/devices', { all: true })
  const { busy, run } = useBusy()
  const [f, setF] = useState<Form | null>(null)
  const [key, setKey] = useState<{ name: string; key: string } | null>(null)
  const list = data?.devices || []
  const [server, setServer] = useState(APP_CONFIG.server)
  useEffect(() => { deskApi().getConfig().then((r) => { if (r.data?.serverUrl) setServer(r.data.serverUrl) }).catch(() => undefined) }, [])

  const bad = f && [f.ok_min, f.ok_max, f.danger_min, f.danger_max].some((v) => v.trim() !== '' && !Number.isFinite(num(v)))
  const order = f ? [num(f.danger_min), num(f.ok_min), num(f.ok_max), num(f.danger_max)].filter((v): v is number => v != null) : []
  const wrongOrder = order.some((v, i) => i > 0 && v < order[i - 1])

  async function save() {
    if (!f) return
    const body = { name: f.name.trim(), place: f.place.trim() || undefined, kind: f.kind, unit: f.unit.trim() || undefined,
      ok_min: num(f.ok_min) ?? undefined, ok_max: num(f.ok_max) ?? undefined, danger_min: num(f.danger_min) ?? undefined, danger_max: num(f.danger_max) ?? undefined, offline_minutes: Number(f.offline_minutes) || 30 }
    if (f.id) {
      // Sửa: ô để trống nghĩa là bỏ ngưỡng, nên gửi null
      const r = await run(() => patch(`/iot/devices/${f.id}`, { ...body, place: f.place.trim() || null, unit: f.unit.trim() || null, ok_min: num(f.ok_min), ok_max: num(f.ok_max), danger_min: num(f.danger_min), danger_max: num(f.danger_max) }), 'Đã lưu')
      if (r) { setF(null); reload() }
      return
    }
    const r = await run(() => post<IotDevice & { device_key: string }>('/iot/devices', body))
    if (r) { setF(null); setKey({ name: r.name, key: r.device_key }); reload() }
  }
  const edit = (d: IotDevice) => setF({ id: d.id, name: d.name, place: d.place || '', kind: d.kind, unit: d.unit || '', ok_min: d.ok_min == null ? '' : String(d.ok_min), ok_max: d.ok_max == null ? '' : String(d.ok_max), danger_min: d.danger_min == null ? '' : String(d.danger_min), danger_max: d.danger_max == null ? '' : String(d.danger_max), offline_minutes: String(d.offline_minutes) })
  const toggle = async (d: IotDevice) => { await run(() => patch(`/iot/devices/${d.id}`, { active: !d.active }), d.active ? 'Đã tắt cảm biến' : 'Đã bật cảm biến'); reload() }
  async function rotate(d: IotDevice) {
    if (!(await confirmDialog('Đổi khóa thiết bị', `Khóa cũ của “${d.name}” hết hiệu lực ngay. Phải nhập khóa mới vào thiết bị. Tiếp tục?`, { okText: 'Đổi khóa' }))) return
    const r = await run(() => post<{ device_key: string }>(`/iot/devices/${d.id}/rotate-key`))
    if (r) setKey({ name: d.name, key: r.device_key })
  }
  async function remove(d: IotDevice) {
    if (!(await confirmDialog('Xóa cảm biến', `Xóa “${d.name}” cùng toàn bộ lịch sử số đo? Không thể hoàn tác. Muốn tạm dừng thì chọn Tắt.`, { danger: true, okText: 'Xóa' }))) return
    await run(() => del(`/iot/devices/${d.id}`), 'Đã xóa'); reload()
  }
  const url = `${server.replace(/\/$/, '')}/iot/ingest`
  const sample = key ? `curl -X POST ${url} -H "Content-Type: application/json" -H "X-Device-Key: ${key.key}" -d "{\\"value\\": 29.5}"` : ''
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.ok('Đã sao chép'), () => toast.warn('Không sao chép được, hãy bôi đen rồi chép tay'))

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Cảm biến IoT" subtitle="Người làm vườn, xưởng xem số đo trên điện thoại (màu xanh, vàng, đỏ). Thiết bị gửi số đo lên máy chủ bằng khóa riêng của từng cảm biến."
        actions={<button className="btn" onClick={() => setF(blank())}><Plus size={16} />Thêm cảm biến</button>} />
      <ErrorBox error={error} onRetry={reload} />
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Cảm biến</th><th>Số đo mới nhất</th><th>Tình trạng</th><th>Khoảng bình thường</th><th /></tr></thead><tbody>
        {loading && !data && <tr><td colSpan={5}><Loading /></td></tr>}
        {data && list.length === 0 && <tr><td colSpan={5}><Empty text="Chưa có cảm biến. Bấm “Thêm cảm biến”." /></td></tr>}
        {list.map((d) => (
          <tr key={d.id} className={d.active ? '' : 'opacity-60'}>
            <td><div className="font-bold">{d.name}{!d.active && <> <Pill sm tone="gray">Đã tắt</Pill></>}</div><div className="text-xs text-muted">{KIND_LABEL[d.kind]}{d.place ? ` · ${d.place}` : ''}</div></td>
            <td><b>{d.status === 'offline' && d.last_value == null ? '—' : `${showNum(d.last_value)} ${d.unit || ''}`}</b><div className="text-xs text-muted">{agoText(d.last_at)}</div></td>
            <td><Pill sm tone={TONE[d.status]}>{sayStatus(d)}</Pill></td>
            <td className="text-sm">{d.ok_min == null && d.ok_max == null ? <span className="text-muted">Chưa đặt</span> : `${showNum(d.ok_min)} đến ${showNum(d.ok_max)} ${d.unit || ''}`}</td>
            <td className="num"><span className="inline-flex gap-1.5 flex-wrap justify-end">
              <button className="btn outline sm" disabled={busy} onClick={() => edit(d)}>Sửa</button>
              <button className="btn outline sm" disabled={busy} onClick={() => void toggle(d)}>{d.active ? 'Tắt' : 'Bật'}</button>
              <button className="btn outline sm" disabled={busy} onClick={() => void rotate(d)} title="Lấy khóa mới cho thiết bị"><KeyRound size={13} />Khóa</button>
              <button className="btn outline sm" disabled={busy} onClick={() => void remove(d)} aria-label="Xóa"><Trash2 size={13} /></button></span></td></tr>))}
      </tbody></table></div>

      {f && (
        <Modal title={f.id ? 'Sửa cảm biến' : 'Thêm cảm biến'} size="md" onClose={() => setF(null)}
          footer={<><button className="btn outline" onClick={() => setF(null)}>Hủy</button><button className="btn" disabled={busy || f.name.trim().length < 2 || !!bad || wrongOrder} onClick={() => void save()}>{f.id ? 'Lưu' : 'Tạo và lấy khóa'}</button></>}>
          <div className="grid gap-4">
            <Field label="Tên cảm biến *" hint="Viết cho người làm vườn đọc hiểu, ví dụ “Nhiệt độ nhà màng 1”, “Nước bể chính”."><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Đặt ở đâu" hint="Dùng để nhóm trên điện thoại"><input className="input" value={f.place} placeholder="Vườn, Kho lạnh, Xưởng…" onChange={(e) => setF({ ...f, place: e.target.value })} /></Field>
              <Field label="Loại"><select className="select" value={f.kind} onChange={(e) => { const k = e.target.value as IotKind; setF({ ...f, kind: k, unit: f.unit === UNIT[f.kind] ? UNIT[k] : f.unit }) }}>{Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Đơn vị"><input className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
              <Field label="Bình thường từ"><input className="input" inputMode="decimal" value={f.ok_min} onChange={(e) => setF({ ...f, ok_min: e.target.value })} /></Field>
              <Field label="Bình thường đến"><input className="input" inputMode="decimal" value={f.ok_max} onChange={(e) => setF({ ...f, ok_max: e.target.value })} /></Field>
              <Field label="Nguy hiểm nếu dưới"><input className="input" inputMode="decimal" value={f.danger_min} onChange={(e) => setF({ ...f, danger_min: e.target.value })} /></Field>
              <Field label="Nguy hiểm nếu trên"><input className="input" inputMode="decimal" value={f.danger_max} onChange={(e) => setF({ ...f, danger_max: e.target.value })} /></Field>
              <Field label="Mất tín hiệu sau (phút)"><input className="input" inputMode="numeric" value={f.offline_minutes} onChange={(e) => setF({ ...f, offline_minutes: e.target.value })} /></Field>
            </div>
            <p className="text-xs text-muted m-0">Trong khoảng “bình thường” thì hiện xanh. Ra ngoài khoảng đó là vàng (“hơi cao”, “hơi thấp”). Vượt ngưỡng nguy hiểm là đỏ. Ô để trống nghĩa là không đặt.</p>
            {bad && <div className="text-xs text-red-600 font-semibold">Chỉ nhập số (ví dụ 18 hoặc 32,5).</div>}
            {!bad && wrongOrder && <div className="text-xs text-red-600 font-semibold">Thứ tự phải là: nguy hiểm dưới ≤ bình thường từ ≤ bình thường đến ≤ nguy hiểm trên.</div>}
          </div>
        </Modal>)}

      {key && (
        <Modal title={`Khóa thiết bị: ${key.name}`} size="md" onClose={() => setKey(null)} footer={<button className="btn" onClick={() => setKey(null)}>Đã lưu khóa</button>}>
          <div className="grid gap-3">
            <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-sm font-semibold">Khóa này chỉ hiện một lần. Hãy chép và nhập vào thiết bị ngay. Quên thì dùng nút “Khóa” để lấy khóa mới (khóa cũ sẽ hết hiệu lực).</div>
            <div className="flex gap-2"><input className="input font-mono text-xs" readOnly value={key.key} onFocus={(e) => e.currentTarget.select()} /><button className="btn sm" onClick={() => copy(key.key)}><Copy size={14} />Chép</button></div>
            <div className="text-sm"><b>Cách thiết bị gửi số đo</b> (HTTP, gửi 1 lần mỗi 1 đến 5 phút là đủ):</div>
            <pre className="m-0 p-3 rounded-lg bg-surface text-xs whitespace-pre-wrap break-all">{sample}</pre>
            <button className="btn outline sm w-fit" onClick={() => copy(sample)}><Copy size={14} />Chép lệnh mẫu</button>
          </div>
        </Modal>)}
    </div>)
}
