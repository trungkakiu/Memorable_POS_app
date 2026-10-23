// "Xem vườn, máy": số đo cảm biến bằng chữ thật to. Mỗi cảm biến một thẻ màu (xanh bình thường, vàng hơi lệch, đỏ nguy hiểm, xám mất tín hiệu).
// Bấm vào thẻ để xem biểu đồ hôm nay; thẻ đỏ có nút "Báo hỏng ngay" (tự điền sẵn chuyện gì xảy ra).
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ArrowLeft, Droplets, Gauge, Loader2, Siren, Sprout, Thermometer, Waves, Zap } from 'lucide-react'
import { IotDevice, IotKind, IotPoint, agoText, loadReadings, sayStatus, showNum, useIotDevices } from './iot'

const ICON: Record<IotKind, (p: { size: number }) => ReactNode> = {
  temperature: (p) => <Thermometer {...p} />, humidity: (p) => <Droplets {...p} />, soil: (p) => <Sprout {...p} />,
  water: (p) => <Waves {...p} />, power: (p) => <Zap {...p} />, other: (p) => <Gauge {...p} />,
}

/** Câu "báo hỏng" soạn sẵn cho thẻ đỏ */
const reportText = (d: IotDevice) => `${d.name}${d.place ? ` (${d.place})` : ''}: ${sayStatus(d).toLowerCase()}, đang ${showNum(d.last_value)}${d.unit ? ` ${d.unit}` : ''}.`

function Card({ d, onOpen }: { d: IotDevice; onOpen: () => void }) {
  return (
    <button className={clsx('fd-sensor', d.status)} onClick={onOpen}>
      <span className="ico">{ICON[d.kind]({ size: 40 })}</span>
      <span className="txt"><b>{d.name}</b><span className="num">{d.status === 'offline' ? '—' : showNum(d.last_value)}<small>{d.status === 'offline' ? '' : ` ${d.unit || ''}`}</small></span>
        <span className="say">{sayStatus(d)}</span></span>
    </button>)
}

/** Biểu đồ đường đơn giản; vùng xanh là khoảng bình thường */
function Chart({ pts, d }: { pts: IotPoint[]; d: IotDevice }) {
  if (pts.length < 2) return <div className="fd-chart-empty">Chưa đủ số đo để vẽ.</div>
  const vals = pts.map((p) => p.value)
  const lo = Math.min(...vals, d.ok_min ?? Infinity), hi = Math.max(...vals, d.ok_max ?? -Infinity)
  const span = hi - lo || 1
  const t0 = new Date(pts[0].at).getTime(), t1 = new Date(pts[pts.length - 1].at).getTime() || t0 + 1
  const X = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * 300
  const Y = (v: number) => 70 - ((v - lo) / span) * 64
  const line = pts.map((p) => `${X(new Date(p.at).getTime()).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ')
  const okTop = Y(d.ok_max ?? hi), okBot = Y(d.ok_min ?? lo)
  return (
    <svg className="fd-chart" viewBox="0 0 300 76" preserveAspectRatio="none" role="img" aria-label="Biểu đồ số đo hôm nay">
      {(d.ok_min != null || d.ok_max != null) && <rect x="0" y={okTop} width="300" height={Math.max(0, okBot - okTop)} className="okband" />}
      <polyline points={line} className="ln" />
    </svg>)
}

function Detail({ d, onBack }: { d: IotDevice; onBack: () => void }) {
  const nav = useNavigate()
  const [pts, setPts] = useState<IotPoint[] | null>(null)
  useEffect(() => { void loadReadings(d.id, 24).then((r) => setPts(r.readings)).catch(() => setPts([])) }, [d.id])
  const ext = useMemo(() => (pts && pts.length ? { lo: Math.min(...pts.map((p) => p.value)), hi: Math.max(...pts.map((p) => p.value)) } : null), [pts])
  const unit = d.unit ? ` ${d.unit}` : ''
  return (
    <div className="flex flex-col gap-4">
      <button className="fd-btn soft" style={{ alignSelf: 'flex-start' }} onClick={onBack}><ArrowLeft size={24} />Quay lại</button>
      <div className={clsx('fd-sensor big', d.status)} aria-live="polite">
        <span className="ico">{ICON[d.kind]({ size: 52 })}</span>
        <span className="txt"><b>{d.name}</b>{d.place && <small>{d.place}</small>}
          <span className="num">{d.status === 'offline' ? '—' : showNum(d.last_value)}<small>{d.status === 'offline' ? '' : unit}</small></span>
          <span className="say">{sayStatus(d)}</span><small>Cập nhật {agoText(d.last_at)}</small></span>
      </div>
      {d.status === 'offline' && <div className="fd-note">Cảm biến không gửi số đo. Có thể hết pin, mất điện hoặc mất mạng. Nhờ thợ hoặc tổ trưởng kiểm tra.</div>}
      {(d.status === 'bad' || d.status === 'warn') && (
        <button className={clsx('fd-btn lg', d.status === 'bad' ? 'danger' : 'soft')} onClick={() => nav(`/bao-hong?chuyen=${encodeURIComponent(reportText(d))}&ngung=${d.status === 'bad' ? 1 : 0}`)}>
          <Siren size={28} />{d.status === 'bad' ? 'Báo hỏng ngay' : 'Báo cho tổ trưởng'}</button>)}
      <div className="fd-card">
        <b className="block text-[1.1em] mb-2">Hôm nay</b>
        {pts === null ? <div className="fd-wait"><Loader2 size={30} className="animate-spin" />Đang tải…</div> : <Chart pts={pts} d={d} />}
        {ext && <div className="fd-range"><span>Thấp nhất: <b>{showNum(ext.lo)}{unit}</b></span><span>Cao nhất: <b>{showNum(ext.hi)}{unit}</b></span></div>}
        {(d.ok_min != null || d.ok_max != null) && <p className="fd-sub" style={{ marginTop: 8 }}>Vùng xanh trên biểu đồ là mức bình thường{d.ok_min != null && d.ok_max != null ? `: từ ${showNum(d.ok_min)} đến ${showNum(d.ok_max)}${unit}` : ''}.</p>}
      </div>
    </div>)
}

export default function FieldFarm() {
  const { devices, err } = useIotDevices()
  const [open, setOpen] = useState<number | null>(null)
  const cur = devices?.find((d) => d.id === open)
  const groups = useMemo(() => {
    const m = new Map<string, IotDevice[]>()
    for (const d of devices || []) { const k = d.place || 'Khác'; m.set(k, [...(m.get(k) || []), d]) }
    // chỗ nào có cảm biến nguy hiểm lên đầu
    const rank = (l: IotDevice[]) => (l.some((x) => x.status === 'bad') ? 0 : l.some((x) => x.status === 'warn' || x.status === 'offline') ? 1 : 2)
    return [...m.entries()].sort((a, b) => rank(a[1]) - rank(b[1]))
  }, [devices])
  if (cur) return <Detail d={cur} onBack={() => setOpen(null)} />
  const bad = (devices || []).filter((d) => d.status === 'bad').length
  return (
    <div className="flex flex-col gap-4">
      <h1 className="fd-title">Xem vườn, máy</h1>
      {err && <div className="fd-card text-red-700">{err}</div>}
      {!devices && !err && <div className="fd-wait"><Loader2 size={30} className="animate-spin" />Đang tải…</div>}
      {devices && devices.length === 0 && !err && <div className="fd-card text-center text-muted">Chưa có cảm biến nào. Nhờ quản trị viên cài thêm.</div>}
      {bad > 0 && <div className="fd-alert"><Siren size={30} />Có {bad} chỗ nguy hiểm. Bấm vào thẻ màu đỏ.</div>}
      {groups.map(([place, list]) => (
        <section key={place} className="flex flex-col gap-3">
          <h2 className="fd-place">{place}</h2>
          {list.map((d) => <Card key={d.id} d={d} onOpen={() => setOpen(d.id)} />)}
        </section>))}
    </div>)
}
