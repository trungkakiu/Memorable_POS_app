// Khung ứng dụng khối Sản xuất (nông dân, công nhân): ít nút, mỗi màn chỉ một việc.
// Trên: tên ứng dụng và tài khoản. Dưới: 4 việc chính luôn trong tầm ngón cái.
import { ReactNode, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Bell, Home, LayoutDashboard, LogOut, Mic, Siren, Sprout } from 'lucide-react'
import { Sheet, SheetRow } from '../components/Sheet'
import { useAuth } from '../store/auth'
import { useNotices } from '../store/notices'
import { useReaderUi, useUiMode } from '../reader/common'
import { usePersona } from '../lib/persona'
import { useWorkspace } from '../reader/workspace'
import { stopSpeak } from './speak'

// Ba cỡ chữ để chọn, mặc định "Vừa"
const SIZES = [{ l: 'Nhỏ', v: 1.06 }, { l: 'Vừa', v: 1.2 }, { l: 'Lớn', v: 1.36 }]

function Tab({ to, icon, label, badge }: { to: string; icon: ReactNode; label: string; badge?: number }) {
  const nav = useNavigate(); const loc = useLocation()
  const on = to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to)
  return (
    <button className={clsx(on && 'on')} onClick={() => nav(to)} aria-current={on ? 'page' : undefined}>
      <span className="ico">{icon}{!!badge && <i className="bdg">{badge > 99 ? '99+' : badge}</i>}</span>{label}
    </button>)
}

export default function FieldLayout() {
  const user = useAuth((s) => s.user)!
  const logout = useAuth((s) => s.logout)
  const nav = useNavigate(); const loc = useLocation()
  const { scale, setScale } = useReaderUi()
  const init = useWorkspace((s) => s.init)
  const unread = useNotices((s) => s.unread)
  const refresh = useNotices((s) => s.refresh)
  const [menu, setMenu] = useState(false)
  useEffect(() => { init(user.id) }, [user.id]) // eslint-disable-line
  // Lần đầu dùng khối Sản xuất trên máy này: chữ mặc định "Vừa" (lớn hơn giao diện văn phòng)
  useEffect(() => { try { if (localStorage.getItem('memorable.reader.scale') === null) setScale(1.2) } catch { /* bỏ qua */ } }, []) // eslint-disable-line
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 45000); return () => clearInterval(t) }, []) // eslint-disable-line
  useEffect(() => { document.querySelector('.fd-main')?.scrollTo({ top: 0 }); setMenu(false); stopSpeak() }, [loc.pathname])
  // Chữ trong khối Sản xuất mặc định lớn hơn giao diện văn phòng; người dùng chọn Nhỏ, Vừa hoặc Lớn
  const fs = Math.max(scale, 1.06)
  const current = SIZES.reduce((a, b) => (Math.abs(b.v - fs) < Math.abs(a.v - fs) ? b : a))
  return (
    <div className="rd fd-shell" style={{ ['--rd-scale' as string]: fs }}>
      <header className="fd-top">
        <button className="fd-brand" onClick={() => nav('/')} aria-label="Về trang chủ"><span className="mark"><Sprout size={22} /></span><span>Memorable</span></button>
        <button className="fd-me" onClick={() => setMenu(true)} aria-label="Tài khoản và cỡ chữ"><span className="av">{user.name.trim().charAt(0).toUpperCase()}</span></button>
      </header>
      <main className="fd-main"><div className="fd-wrap"><Outlet /></div></main>
      <nav className="fd-tabbar" aria-label="Việc chính">
        <Tab to="/" icon={<Home size={26} />} label="Trang chủ" />
        <Tab to="/hoi" icon={<Mic size={26} />} label="Hỏi" />
        <Tab to="/bao-hong" icon={<Siren size={26} />} label="Báo hỏng" />
        <Tab to="/thong-bao" icon={<Bell size={26} />} label="Tin mới" badge={unread} />
      </nav>
      {menu && (
        <Sheet title={user.name} onClose={() => setMenu(false)}>
          <div className="fd-sizes" role="radiogroup" aria-label="Cỡ chữ">
            <span className="cap">Cỡ chữ</span>
            {SIZES.map((s) => <button key={s.l} role="radio" aria-checked={current.l === s.l} className={clsx(current.l === s.l && 'on')} onClick={() => setScale(s.v)} style={{ fontSize: `${s.v}em` }}>{s.l}</button>)}
          </div>
          {user.role !== 'reader' && <SheetRow icon={<LayoutDashboard size={24} />} label="Giao diện quản lý" hint="Chuyển về màn hình dành cho quản lý" onClick={() => { usePersona.getState().setPersona('manager'); useUiMode.getState().setSimple(false) }} />}
          <SheetRow tone="danger" icon={<LogOut size={24} />} label="Đăng xuất" onClick={() => { logout(); nav('/login') }} />
        </Sheet>)}
    </div>)
}
