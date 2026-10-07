// Danh sách dài (nguồn trích dẫn, đoạn trích, nguồn Internet...): chỉ hiện vài mục đầu, phần còn lại mở bằng "Xem thêm".
// Khi mở hết mà vẫn dài thì danh sách cuộn bên trong (không đẩy khung chat ra khỏi màn hình).
import { ReactNode, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown, ChevronUp } from 'lucide-react'

export function useShowMore<T>(items: T[], first: number) {
  const [all, setAll] = useState(false)
  const rest = Math.max(0, items.length - first)
  return { shown: all || rest === 0 ? items : items.slice(0, first), rest, all, toggle: () => setAll((a) => !a) }
}

/** Nút "Xem thêm N …" / "Thu gọn" */
export function MoreToggle({ rest, all, onClick, noun, className }: { rest: number; all: boolean; onClick: () => void; noun: string; className?: string }) {
  if (rest <= 0) return null
  return (
    <button type="button" className={clsx('more-toggle', className)} onClick={onClick} aria-expanded={all}>
      {all ? <><ChevronUp size={14} />Thu gọn</> : <><ChevronDown size={14} />Xem thêm {rest} {noun}</>}
    </button>)
}

/**
 * Danh sách có giới hạn: hiện `first` mục đầu, nút xem thêm, và cuộn bên trong khi mở hết.
 * @param maxHeight chiều cao tối đa khi mở hết (CSS), mặc định 50vh
 */
export function LimitedList<T>({ items, first = 3, noun, render, className, maxHeight = '50vh' }: {
  items: T[]; first?: number; noun: string; render: (item: T, i: number) => ReactNode; className?: string; maxHeight?: string
}) {
  const { shown, rest, all, toggle } = useShowMore(items, first)
  return (
    <>
      <div className={clsx(className, all && rest > 0 && 'more-scroll')} style={all && rest > 0 ? { maxHeight } : undefined}>{shown.map(render)}</div>
      <MoreToggle rest={rest} all={all} onClick={toggle} noun={noun} />
    </>)
}

/** Phân trang ngay trên máy cho danh sách đã tải hết (danh mục thẻ, nguồn, kết quả nhập…) */
export function useClientPage<T>(items: T[], size = 50) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(items.length / size))
  const p = Math.min(page, pages)
  return { rows: items.slice((p - 1) * size, p * size), page: p, pages, total: items.length, setPage }
}
