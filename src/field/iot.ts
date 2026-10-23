// Cảm biến IoT cho khối Sản xuất: lấy số đo từ máy chủ và nói bằng lời thường (không dùng từ kỹ thuật).
import { useEffect, useState } from 'react'
import { ApiError, get } from '../lib/api'

export type IotKind = 'temperature' | 'humidity' | 'soil' | 'water' | 'power' | 'other'
export type IotStatus = 'ok' | 'warn' | 'bad' | 'offline'
export interface IotDevice {
  id: number; name: string; place: string | null; kind: IotKind; unit: string | null
  ok_min: number | null; ok_max: number | null; danger_min: number | null; danger_max: number | null; offline_minutes: number
  last_value: number | null; last_at: string | null; active: boolean; status: IotStatus; side: 'low' | 'high' | null
}
export interface IotPoint { value: number; at: string }

export const KIND_LABEL: Record<IotKind, string> = { temperature: 'Nhiệt độ', humidity: 'Độ ẩm không khí', soil: 'Độ ẩm đất', water: 'Nước', power: 'Điện', other: 'Số đo khác' }

/** Câu ngắn nói tình trạng: "Bình thường", "Hơi cao", "Nguy hiểm: quá thấp", "Mất tín hiệu" */
export function sayStatus(d: Pick<IotDevice, 'status' | 'side'>) {
  if (d.status === 'ok') return 'Bình thường'
  if (d.status === 'offline') return 'Mất tín hiệu'
  const dir = d.side === 'low' ? 'thấp' : 'cao'
  return d.status === 'warn' ? `Hơi ${dir}` : `Nguy hiểm: quá ${dir}`
}

/** Số hiển thị gọn: 29.5 → "29,5", 30 → "30" */
export const showNum = (v: number | null) => (v == null ? '—' : String(Math.round(v * 10) / 10).replace('.', ','))

/** "vừa xong", "5 phút trước", "2 giờ trước", "3 ngày trước" */
export function agoText(iso: string | null) {
  if (!iso) return 'chưa có số đo'
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${m} phút trước`
  if (m < 1440) return `${Math.round(m / 60)} giờ trước`
  return `${Math.round(m / 1440)} ngày trước`
}

/** Danh sách cảm biến, tự cập nhật mỗi 30 giây. `null` = đang tải. */
export function useIotDevices(every = 30000) {
  const [devices, setDevices] = useState<IotDevice[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    const load = () => get<{ devices: IotDevice[] }>('/iot/devices')
      .then((r) => { if (live) { setDevices(r.devices); setErr('') } })
      .catch((e) => { if (live) { setErr(e instanceof ApiError ? e.full : String(e)); setDevices((d) => d ?? []) } })
    void load()
    const t = setInterval(() => void load(), every)
    return () => { live = false; clearInterval(t) }
  }, [every])
  return { devices, err }
}

export async function loadReadings(id: number, hours = 24) {
  return get<{ device: IotDevice; readings: IotPoint[] }>(`/iot/devices/${id}/readings`, { hours })
}
