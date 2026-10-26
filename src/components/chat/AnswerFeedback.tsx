import { useState } from 'react'
import { Loader2, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Msg, useChat } from '../../store/chat'

const REASONS = ['Sai thông tin', 'Thiếu thông tin', 'Không đúng câu hỏi', 'Nguồn cũ hoặc không phù hợp']

/** Đánh giá câu trả lời của AI. Đánh giá "chưa hữu ích" được gửi tới kiểm duyệt viên để bổ sung hoặc sửa tài liệu. */
export function AnswerFeedback({ m }: { m: Msg }) {
  const given = m.ans?.fb
  const [form, setForm] = useState(false)
  const [chips, setChips] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [need, setNeed] = useState(false)
  const [busy, setBusy] = useState(false)

  if (given) {
    return <div className="text-[11.5px] text-muted">{given === 'up' ? 'Cảm ơn bạn đã đánh giá.' : 'Đã gửi phản hồi cho kiểm duyệt viên. Cảm ơn bạn.'}</div>
  }

  const send = async (helpful: boolean) => {
    setBusy(true)
    const reason = [...chips, note.trim()].filter(Boolean).join('; ')
    await useChat.getState().rateAnswer(m.id, helpful, reason || undefined, need)
    setBusy(false)
  }
  const toggle = (r: string) => setChips((c) => (c.includes(r) ? c.filter((x) => x !== r) : [...c, r]))

  return (
    <div className="text-[12px]">
      <div className="flex items-center gap-2 text-muted">
        <span>Câu trả lời này có hữu ích không?</span>
        <button className="btn outline sm" disabled={busy} onClick={() => void send(true)} title="Hữu ích"><ThumbsUp size={12} />Hữu ích</button>
        <button className="btn outline sm" disabled={busy} onClick={() => setForm((v) => !v)} title="Chưa hữu ích"><ThumbsDown size={12} />Chưa hữu ích</button>
      </div>
      {form && (
        <div className="mt-2 rounded-md border border-line bg-white p-2.5 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button key={r} type="button" className={'cat-chip !py-0.5 !px-2 !text-[11px]' + (chips.includes(r) ? ' on' : '')} aria-pressed={chips.includes(r)} onClick={() => toggle(r)}>{r}</button>
            ))}
          </div>
          <textarea className="input" rows={2} maxLength={500} placeholder="Ghi thêm điều chưa đúng (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={need} onChange={(e) => setNeed(e.target.checked)} />Đề nghị bổ sung tài liệu cho nội dung này</label>
          <div className="flex gap-2">
            <button className="btn sm" disabled={busy} onClick={() => void send(false)}>{busy ? <Loader2 size={12} className="animate-spin" /> : null}Gửi phản hồi</button>
            <button className="btn outline sm" disabled={busy} onClick={() => setForm(false)}>Hủy</button>
          </div>
        </div>)}
    </div>
  )
}
