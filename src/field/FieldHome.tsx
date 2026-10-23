// Trang chủ khối Sản xuất: một việc chính nổi bật (Nói để hỏi), các việc khác là dòng lớn bên dưới.
// Nói để hỏi: micro bật luôn. Chụp ảnh để hỏi: mở máy ảnh luôn.
import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpenCheck, Camera, ChevronRight, Mic, PlayCircle, Siren, Sprout } from 'lucide-react'
import { useAuth } from '../store/auth'
import { useWorkspace } from '../reader/workspace'
import { useIotDevices } from './iot'

function Row({ icon, label, sub, tone, onClick }: { icon: ReactNode; label: string; sub: string; tone: string; onClick: () => void }) {
  return (
    <button className={`fd-row ${tone}`} onClick={onClick}>
      <span className="ico">{icon}</span>
      <span className="txt"><b>{label}</b><small>{sub}</small></span>
      <ChevronRight className="go" size={26} />
    </button>)
}

export default function FieldHome() {
  const nav = useNavigate()
  const user = useAuth((s) => s.user)!
  const runs = useWorkspace((s) => s.runs)
  const first = user.name.trim().split(/\s+/).slice(-1)[0] || user.name
  const doing = Object.values(runs).sort((a, b) => b.at - a.at)[0]
  // Chỉ hiện "Xem vườn, máy" khi công ty đã cài cảm biến; có chỗ nguy hiểm thì báo ngay trên đầu trang
  const { devices } = useIotDevices(60000)
  const bad = (devices || []).filter((d) => d.status === 'bad').length
  const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div className="flex flex-col gap-4">
      <div><p className="fd-date">{today}</p><h1 className="fd-hello">Chào {first}</h1><p className="fd-sub">Hôm nay bạn cần gì?</p></div>
      {bad > 0 && <button className="fd-alert" onClick={() => nav('/so-lieu')}><Siren size={28} /><span className="flex-1">Có {bad} chỗ nguy hiểm. Chạm để xem.</span><ChevronRight size={24} /></button>}
      {doing && (
        <button className="fd-doing" onClick={() => nav(`/items/${doing.itemId}?resume=1`)}>
          <PlayCircle size={32} /><span className="min-w-0 flex-1"><b>Việc đang làm dở</b><small>{doing.title}</small></span><span className="go">Tiếp tục</span>
        </button>)}
      <button className="fd-hero" onClick={() => nav('/hoi?cach=noi')}>
        <span className="ico"><Mic size={40} /></span>
        <span className="txt"><b>Nói để hỏi</b><small>Chạm rồi nói câu hỏi</small></span>
      </button>
      <div className="fd-rows">
        <Row tone="blue" icon={<Camera size={28} />} label="Chụp ảnh để hỏi" sub="Cây bệnh, máy lạ, giấy tờ" onClick={() => nav('/hoi?cach=anh')} />
        <Row tone="red" icon={<Siren size={28} />} label="Báo hỏng" sub="Máy hỏng, mất điện, mất nước" onClick={() => nav('/bao-hong')} />
        {!!devices?.length && <Row tone="teal" icon={<Sprout size={28} />} label="Xem vườn, máy" sub="Nhiệt độ, độ ẩm, mực nước" onClick={() => nav('/so-lieu')} />}
        <Row tone="amber" icon={<BookOpenCheck size={28} />} label="Cách làm việc" sub="Làm theo từng bước" onClick={() => nav('/huong-dan')} />
      </div>
    </div>)
}
