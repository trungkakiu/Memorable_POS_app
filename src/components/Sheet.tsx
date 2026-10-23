// Hộp trượt từ đáy màn hình: thay cho menu thả xuống (khó bấm trên điện thoại). Bấm ra ngoài, nút Đóng hoặc nút Back để đóng.
import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="sheet-wrap modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head"><b>{title}</b><button onClick={onClose} aria-label="Đóng"><X size={22} /></button></div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>)
}

/** Một dòng lựa chọn trong hộp: biểu tượng, tên, mô tả ngắn. */
export function SheetRow({ icon, label, hint, onClick, tone, checked }: { icon?: ReactNode; label: string; hint?: string; onClick: () => void; tone?: 'danger'; checked?: boolean }) {
  return (
    <button className={`sheet-row${tone ? ` ${tone}` : ''}${checked ? ' on' : ''}`} onClick={onClick} role={checked === undefined ? undefined : 'radio'} aria-checked={checked}>
      {icon && <span className="ico">{icon}</span>}
      <span className="txt"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      {checked && <span className="tick" aria-hidden>✓</span>}
    </button>)
}
