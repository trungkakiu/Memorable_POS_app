import { useCallback, useEffect, useState } from 'react'
import { CloudOff, Loader2, RefreshCw } from 'lucide-react'
import { deskApi, flushQueue } from '../lib/api'
import { useOffline } from '../lib/offline'
import { toast } from '../store/ui'

/** Thanh báo mất kết nối: cho biết đang xem dữ liệu đã lưu và còn bao nhiêu việc chờ gửi. */
export function OfflineBanner() {
  const offline = useOffline((s) => s.offline)
  const stale = useOffline((s) => s.stale)
  const pending = useOffline((s) => s.pending)
  const [busy, setBusy] = useState(false)

  const retry = useCallback(async () => {
    setBusy(true)
    try {
      const p = await deskApi().ping()
      const online = !!p.data?.online
      useOffline.getState().setOffline(!online)
      if (online) {
        const r = await flushQueue()
        if (r.sent) toast.ok(`Đã gửi ${r.sent} mục đang chờ`)
        if (r.failed) toast.error(`${r.failed} mục bị máy chủ từ chối nên không gửi được`)
      }
    } catch { /* vẫn mất mạng */ } finally { setBusy(false) }
  }, [])

  useEffect(() => {
    const onOnline = () => { void retry() }
    window.addEventListener('online', onOnline)
    const t = window.setInterval(() => {
      const s = useOffline.getState()
      if (s.offline || s.pending > 0) void retry()
    }, 20000)
    return () => { window.removeEventListener('online', onOnline); window.clearInterval(t) }
  }, [retry])

  if (!offline && pending === 0) return null
  return (
    <div className="fixed left-4 bottom-4 z-50 max-w-[420px] rounded-lg border border-amber-300 bg-amber-50 text-amber-900 shadow-lg px-3 py-2.5 text-[12.5px] flex items-start gap-2" role="status">
      <CloudOff size={16} className="shrink-0 mt-0.5" />
      <div className="flex-1 leading-snug">
        {offline ? <b>Đang mất kết nối với máy chủ.</b> : <b>Đã có kết nối lại.</b>}
        {offline && stale && <> Bạn đang xem dữ liệu đã lưu trên máy, có thể chưa phải bản mới nhất.</>}
        {pending > 0 && <> Có {pending} mục đang chờ gửi, sẽ tự gửi khi có mạng.</>}
      </div>
      <button className="btn outline sm shrink-0" onClick={() => void retry()} disabled={busy}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}Thử lại
      </button>
    </div>
  )
}
