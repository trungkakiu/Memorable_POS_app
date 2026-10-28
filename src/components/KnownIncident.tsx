// Khung "Hệ thống đã gặp sự cố tương tự": Agent tự giải thích khi sự cố đã từng xảy ra và có kết luận đã duyệt.
// Dùng ở form báo sự cố, chi tiết sự cố và trang người đọc.
import clsx from 'clsx'
import { CheckCircle2, Play, Sparkles } from 'lucide-react'
import { dt } from '../lib/format'
import { fmtMinutes, type KnownIncident as KnownData } from '../lib/incident'

export function KnownIncident({ data, variant = 'admin', onOpen, onRun }: {
  data: KnownData; variant?: 'admin' | 'reader'; onOpen?: (id: number) => void; onRun?: (runbookId: number) => void
}) {
  if (!data.known || !data.explanation) return null
  const reader = variant === 'reader'
  return (
    <div className={clsx(reader ? 'rd-card' : 'inc-hint', 'flex flex-col gap-2')}>
      <div className={clsx('font-bold flex items-center gap-2 flex-wrap', !reader && 'text-sm')}>
        <Sparkles size={reader ? 18 : 16} />Hệ thống đã gặp sự cố tương tự
        <span className="text-xs font-semibold text-muted">{data.ai ? 'Agent giải thích' : 'Tóm tắt từ sự cố đã xử lý'}</span>
      </div>
      <p className={clsx('m-0 whitespace-pre-line', !reader && 'text-sm')}>{data.explanation}</p>
      {data.matches.map((m) => (
        <div key={m.id} className="text-xs flex items-center gap-2 flex-wrap">
          <CheckCircle2 size={13} className="shrink-0" />
          <span className="font-semibold">#{m.id} {m.title}</span>
          {m.resolved_at && <span className="text-muted">khắc phục {dt(m.resolved_at, false)}{m.mttr_minutes != null ? `, mất ${fmtMinutes(m.mttr_minutes)}` : ''}</span>}
          {onOpen && <button type="button" className="text-brand-700 font-bold bg-transparent border-0 p-0 cursor-pointer underline" onClick={() => onOpen(m.id)}>Xem</button>}
        </div>))}
      {onRun && data.runbooks.map((r) => (
        <div key={r.id}><button type="button" className="btn sm" onClick={() => onRun(r.id)}><Play size={13} />Làm theo “{r.title}”</button></div>))}
    </div>)
}
