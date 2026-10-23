// Lần đầu đăng nhập: người dùng chọn mình làm ở khối nào. Mỗi khối có giao diện và việc cần làm khác nhau.
// Chọn một lần; muốn đổi thì nhờ quản trị viên (máy chủ chặn tự đổi).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Briefcase, CheckCircle2, Loader2, LogOut, Sprout } from 'lucide-react'
import { ApiError } from '../lib/api'
import type { Audience } from '../lib/types'
import { useAuth } from '../store/auth'
import { toast } from '../store/ui'

export default function AudiencePicker() {
  const nav = useNavigate()
  const user = useAuth((s) => s.user)!
  const setAudience = useAuth((s) => s.setAudience)
  const logout = useAuth((s) => s.logout)
  const [pick, setPick] = useState<Audience | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!pick) return
    setBusy(true)
    try { await setAudience(pick); nav('/', { replace: true }) } catch (e) { toast.error(e instanceof ApiError ? e.full : e) } finally { setBusy(false) }
  }
  const first = user.name.trim().split(/\s+/).slice(-1)[0] || user.name
  return (
    <div className="rd ap-wrap">
      <div className="ap-card">
        <h1>Chào {first}! Bạn làm ở khối nào?</h1>
        <p>Chọn để ứng dụng chỉ hiện những việc bạn cần. Chỉ chọn một lần; muốn đổi thì nhờ quản trị viên.</p>
        <div className="ap-opts">
          <button className={clsx('ap-opt', pick === 'office' && 'on')} onClick={() => setPick('office')} aria-pressed={pick === 'office'}>
            <span className="ico office"><Briefcase size={40} /></span>
            <b>Văn phòng</b><span>Hành chính, kinh doanh, kế toán, nhân sự. Làm giấy tờ, tra quy định, hỏi trợ lý.</span>
            {pick === 'office' && <CheckCircle2 className="tick" size={30} />}
          </button>
          <button className={clsx('ap-opt', pick === 'field' && 'on')} onClick={() => setPick('field')} aria-pressed={pick === 'field'}>
            <span className="ico field"><Sprout size={40} /></span>
            <b>Sản xuất</b><span>Vườn, ruộng, xưởng, kho. Nói để hỏi, chụp ảnh để hỏi, báo hỏng, làm theo hướng dẫn.</span>
            {pick === 'field' && <CheckCircle2 className="tick" size={30} />}
          </button>
        </div>
        <button className="rd-btn lg w-full" disabled={!pick || busy} onClick={() => void save()}>{busy ? <Loader2 size={22} className="animate-spin" /> : null}{pick ? `Chọn khối ${pick === 'office' ? 'Văn phòng' : 'Sản xuất'}` : 'Hãy chọn một khối ở trên'}</button>
        <button className="ap-out" onClick={() => { logout(); nav('/login') }}><LogOut size={18} />Đăng xuất</button>
      </div>
    </div>)
}
