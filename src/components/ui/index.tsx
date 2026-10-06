import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { Activity, Inbox, Search, X } from 'lucide-react'
import { addDays, todayStr, ymd } from '../../lib/format'
import { useUi } from '../../store/ui'

export function Modal({ title, onClose, children, footer, size = 'md', closable = true }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; closable?: boolean
}) {
  useEffect(() => {
    if (!closable) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, closable])
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (closable && e.target === e.currentTarget) onClose() }}>
      <div className={clsx('modal', size)} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          {closable && <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={20} /></button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>, document.body)
}

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <div className={clsx('field', className)}>
      <label>{label}</label>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  )
}

export const Pill = ({ children, tone = '', sm = false }: { children: ReactNode; tone?: '' | 'soft' | 'ok' | 'warn' | 'bad' | 'gray'; sm?: boolean }) =>
  <span className={clsx('pill', tone, sm && 'sm')}>{children}</span>

export function Stat({ label, value, unit, hint, hintTone, icon }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; hintTone?: 'up' | 'down'; icon?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-top"><span className="stat-ico">{icon ?? <Activity size={17} />}</span><span className="stat-label">{label}</span></div>
      <div className="stat-value">{value}{unit && <small>{unit}</small>}</div>
      <div className={clsx('stat-hint', hintTone)}>{hint ?? ' '}</div>
    </div>
  )
}

export function Empty({ text = 'Chưa có dữ liệu', icon }: { text?: string; icon?: ReactNode }) {
  return <div className="empty">{icon ?? <Inbox size={34} strokeWidth={1.5} />}<div className="t">{text}</div></div>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="min-w-0 pl-2"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Tìm kiếm…', className, inputRef, onEnter }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
  inputRef?: React.Ref<HTMLInputElement>; onEnter?: () => void
}) {
  return (
    <div className={clsx('search-box', className)}>
      <Search size={17} />
      <input ref={inputRef} className="input" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.() }} />
    </div>
  )
}

export function Seg<T extends string>({ value, onChange, options, sm }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; sm?: boolean }) {
  return (
    <div className={clsx('seg', sm && 'sm')}>
      {options.map((o) => <button key={o.value} className={clsx(value === o.value && 'on')} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  )
}

export type Range = { from: string; to: string }
export function DateRange({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const t = todayStr()
  const preset = (from: string, to = t) => onChange({ from, to })
  const now = new Date()
  const first = ymd(new Date(now.getFullYear(), now.getMonth(), 1))
  const lastFrom = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const lastTo = ymd(new Date(now.getFullYear(), now.getMonth(), 0))
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button className="btn outline sm" onClick={() => preset(t)}>Hôm nay</button>
      <button className="btn outline sm" onClick={() => preset(ymd(addDays(now, -1)), ymd(addDays(now, -1)))}>Hôm qua</button>
      <button className="btn outline sm" onClick={() => preset(ymd(addDays(now, -6)))}>7 ngày</button>
      <button className="btn outline sm" onClick={() => preset(first)}>Tháng này</button>
      <button className="btn outline sm" onClick={() => preset(lastFrom, lastTo)}>Tháng trước</button>
      <input type="date" className="input !w-auto !py-1.5" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} />
      <span className="text-muted">→</span>
      <input type="date" className="input !w-auto !py-1.5" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} />
    </div>
  )
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismiss)
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={clsx('toast', t.kind)} onClick={() => dismiss(t.id)}>{t.text}</div>)}
    </div>
  )
}

export function ConfirmHost() {
  const c = useUi((s) => s.confirm)
  const close = useUi((s) => s.closeConfirm)
  if (!c) return null
  return (
    <Modal title={c.title} size="sm" onClose={() => close(false)}
      footer={<>
        <button className="btn outline" onClick={() => close(false)}>Hủy</button>
        <button className={clsx('btn', c.danger && 'danger')} autoFocus onClick={() => close(true)}>{c.okText || 'Đồng ý'}</button>
      </>}>
      <p className="m-0 text-[15px] leading-relaxed">{c.message}</p>
    </Modal>
  )
}

/** Ô nhập số có định dạng ngăn nghìn. */
export function MoneyInput({ value, onChange, className, placeholder, autoFocus, disabled }: {
  value: number; onChange: (n: number) => void; className?: string; placeholder?: string; autoFocus?: boolean; disabled?: boolean
}) {
  const [txt, setTxt] = useState(value ? String(value) : '')
  useEffect(() => { setTxt((cur) => (Number(cur.replace(/\D/g, '')) === value ? cur : value ? String(value) : '')) }, [value])
  return (
    <input className={clsx('input right', className)} inputMode="numeric" value={txt ? Number(txt).toLocaleString('vi-VN') : ''}
      placeholder={placeholder ?? '0'} autoFocus={autoFocus} disabled={disabled}
      onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 12); setTxt(d); onChange(Number(d || 0)) }}
      onFocus={(e) => e.target.select()} />
  )
}
