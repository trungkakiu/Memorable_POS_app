import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { ApiError, get } from '../lib/api'
import type { ItemDetail } from '../lib/types'
import { Modal, Pill } from './ui'
import { ErrorBox, Loading, Md } from './shared'

export interface DiffResult { from: number; to: number; added: number; removed: number; truncated?: boolean; changes: { type: string; text: string }[] }

/** Danh sách dòng khác nhau giữa hai phiên bản (thêm xanh, bớt đỏ gạch). */
export function DiffView({ diff }: { diff: DiffResult }) {
  return (
    <>
      {diff.truncated && <div className="text-amber-700 text-sm mb-2 font-semibold">Kết quả đã bị cắt bớt do quá dài.</div>}
      <div className="font-mono text-[13px] border-[1.5px] border-line rounded-lg overflow-auto max-h-[480px]">
        {diff.changes.map((c, i) => (
          <div key={i} className={clsx('px-3 py-0.5 whitespace-pre-wrap', c.type === 'added' && 'bg-green-100 text-green-900', c.type === 'removed' && 'bg-red-100 text-red-900 line-through decoration-red-300')}>
            <span className="inline-block w-5 opacity-60">{c.type === 'added' ? '+' : c.type === 'removed' ? '−' : ' '}</span>{c.text}</div>))}
      </div>
    </>)
}

type State = { loading: boolean; error?: ApiError | string; diff?: DiffResult; first?: { number: number; content: string } }

/** Người duyệt xem nhanh phần khác so với bản đã duyệt trước đó; mục mới (chưa có bản trước) thì xem nội dung bản gửi duyệt. */
export function ChangesModal({ id, title, onClose }: { id: number; title: string; onClose: () => void }) {
  const [s, setS] = useState<State>({ loading: true })
  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const it = await get<ItemDetail & { pending_version?: { number: number } }>(`/items/${id}`)
        const to = it.pending_version?.number ?? it.version?.number
        const from = it.current_version?.number
        if (!to) throw new Error('Mục chưa có phiên bản nào')
        if (from && from !== to) { const diff = await get<DiffResult>(`/items/${id}/compare`, { from, to }); if (!off) setS({ loading: false, diff }) }
        else { const v = await get<{ version_number: number; content?: string }>(`/items/${id}/versions/${to}`); if (!off) setS({ loading: false, first: { number: to, content: v.content || '' } }) }
      } catch (e) { if (!off) setS({ loading: false, error: e instanceof ApiError ? e : (e as Error).message }) }
    })()
    return () => { off = true }
  }, [id])
  return (
    <Modal title={`Thay đổi chờ duyệt: ${title}`} size="lg" onClose={onClose} footer={<button className="btn outline" onClick={onClose}>Đóng</button>}>
      {s.loading && <Loading />}
      {s.error && <ErrorBox error={s.error} />}
      {s.diff && (<>
        <div className="flex items-center gap-2 mb-3 text-sm"><span>So với bản đã duyệt <b>v{s.diff.from}</b> → bản gửi duyệt <b>v{s.diff.to}</b></span><Pill sm tone="ok">+{s.diff.added}</Pill><Pill sm tone="bad">−{s.diff.removed}</Pill></div>
        {s.diff.added === 0 && s.diff.removed === 0 ? <div className="text-muted text-sm">Nội dung không đổi (có thể chỉ đổi tiêu đề, thẻ hoặc thông tin khác).</div> : <DiffView diff={s.diff} />}
      </>)}
      {s.first && (<>
        <div className="mb-3 text-sm"><Pill sm tone="warn">Mục mới</Pill> <span className="ml-2">Chưa có bản đã duyệt để so sánh. Đây là nội dung bản v{s.first.number} gửi duyệt.</span></div>
        <div className="border-[1.5px] border-line rounded-lg p-4 max-h-[480px] overflow-auto"><Md>{s.first.content}</Md></div>
      </>)}
    </Modal>)
}
