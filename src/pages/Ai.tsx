import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { can } from '../lib/permissions'
import { Pill, PageHeader } from '../components/ui'
import { AgentBar, Composer, DropOverlay, Messages, useChatDrop } from '../components/chat/Chat'
import { useAuth } from '../store/auth'
import { AiStatus, useChat } from '../store/chat'
import { SearchTabs } from '../components/PageTabs'

// Tình trạng AI: 4 điều kiện chính luôn hiện; danh sách tính năng (vài chục mục) gói trong nút bật/tắt để đầu trang gọn
function StatusBadges({ s }: { s: AiStatus }) {
  const [open, setOpen] = useState(false)
  const B = ({ ok, l }: { ok: boolean; l: string }) => <Pill sm tone={ok ? 'ok' : 'bad'}>{ok ? '✓' : '✗'} {l}</Pill>
  const n = s.features?.length || 0
  return (
    <div className="flex flex-col gap-2 items-end max-w-full">
      <div className="flex gap-2 flex-wrap items-center justify-end">
        <B ok={s.api_key_configured} l="Khóa API" /><B ok={s.enabled} l="Đã bật" /><B ok={s.data_policy_approved} l="Chính sách dữ liệu" /><B ok={s.budget_set} l="Ngân sách" />
        {n > 0 && <button type="button" className="more-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Ẩn' : 'Xem'} {n} tính năng đang bật</button>}
      </div>
      {open && <div className="flex gap-1.5 flex-wrap justify-end max-h-[120px] overflow-y-auto">{s.features.map((f) => <Pill key={f} sm tone="soft">{f}</Pill>)}</div>}
    </div>)
}

export default function Ai() {
  const user = useAuth((s) => s.user)!
  const nav = useNavigate()
  const c = useChat()
  const canAsk = can(user.role, 'ask')
  const drop = useChatDrop()
  useEffect(() => { void c.loadStatus() }, []) // eslint-disable-line
  const st = c.status
  return (
    <div className="chat-page flex flex-col gap-4">
      <SearchTabs />
      <PageHeader title="Hỏi đáp có trích nguồn" subtitle="Trợ lý chỉ trả lời dựa trên các mục bạn được xem; mục “Hạn chế” không bao giờ gửi cho AI. Có thể mở nhanh ở mọi trang bằng bóng chat (Ctrl+J)." actions={<>{st && <StatusBadges s={st} />}<button className="btn outline" onClick={c.clear}><Trash2 size={15} />Xóa hội thoại</button></>} />
      {st && !st.ready && <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 p-3 flex gap-2 items-center text-sm font-semibold"><AlertTriangle size={18} />AI chưa sẵn sàng — quản trị viên cần cấu hình khóa, bật công tắc, duyệt chính sách dữ liệu và đặt ngân sách (mục Cấu hình máy chủ).</div>}
      {!canAsk && <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm font-semibold">Vai trò của bạn không được dùng chức năng hỏi đáp AI.</div>}
      <div className="chat-panel !static !w-full !h-auto flex-1 min-h-0 !animate-none" style={{ position: 'relative', inset: 'auto' }} {...drop.props}>
        <DropOverlay show={drop.over} />
        <AgentBar />
        <div className="chat-body !p-5"><Messages msgs={c.msgs} busy={c.busy} onPick={(q) => void c.ask(q)} onAsk={(q, m) => void c.ask(q, m)} onOpenItem={(id) => nav(`/items/${id}`)} /></div>
        <Composer drop={drop} disabled={!canAsk} placeholder="Đặt câu hỏi, hoặc kéo thả / dán tệp & ảnh để lưu vào kho tri thức…" />
      </div>
    </div>
  )
}
