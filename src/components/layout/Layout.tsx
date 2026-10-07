import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Bell, BookMarked, Menu, X, Sparkles, ChevronDown, Cloud, CloudOff, HelpCircle, LogOut, Maximize2, Plus, Search, PanelLeftClose, PanelLeftOpen, ArrowRight, CheckCheck } from 'lucide-react'
import { NAV } from '../../lib/nav'
import { can } from '../../lib/permissions'
import { deskApi, post } from '../../lib/api'
import { dt, NOTICE_TYPE, ROLE_LABEL } from '../../lib/format'
import { useAuth } from '../../store/auth'
import { itemIdOf, useNotices } from '../../store/notices'
import { Modal } from '../ui'
import { useUiMode } from '../../reader/common'
import ChatWidget from '../chat/Chat'

function useGroups() {
  const user = useAuth((s) => s.user)!
  return useMemo(() => NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(user.role, i.cap)) })).filter((g) => g.items.length), [user.role])
}
const isOn = (path: string, to: string) => (to === '/' ? path === '/' : to === '/items' ? /^\/items(\/\d+.*)?$/.test(path) : to === '/agents' ? /^\/agents(\/\d+.*)?$/.test(path) : to === '/ai' ? path === '/ai' : path === to || path.startsWith(to + '/'))

function Header({ onMenu }: { onMenu: () => void }) {
  const user = useAuth((s) => s.user)!
  const logout = useAuth((s) => s.logout)
  const nav = useNavigate()
  const loc = useLocation()
  const n = useNotices()
  const [help, setHelp] = useState(false)
  const groups = useGroups()
  const active = groups.find((g) => g.items.some((i) => isOn(loc.pathname, i.to)))?.id

  return (
    <header className="app-header">
      <button className="icon-btn app-burger" onClick={onMenu} aria-label="Mở menu"><Menu size={22} /></button>
      <div className="brand">
        <div className="logo"><BookMarked size={24} /></div>
        <div>
          <div className="t1">MEMORABLE</div>
          <div className="t2">Kho tri thức &amp; vận hành nhóm</div>
        </div>
      </div>
      <nav className="topnav">
        {groups.map((g) => (
          <div className="nav-item" key={g.id}>
            <button className={clsx(active === g.id && 'on')} onClick={() => nav(g.items[0].to)}>{g.short ?? g.label}<ChevronDown size={13} /></button>
            <div className="menu">{g.items.map((i) => <a key={i.to} onClick={() => nav(i.to)}>{i.label}</a>)}</div>
          </div>
        ))}
      </nav>
      <div className="hdr-right">
        <button className="btn outline sm" onClick={() => nav('/connection')} title={n.online ? `Máy chủ phản hồi ${n.ms} ms` : 'Không kết nối được máy chủ'}>
          {n.online ? <Cloud size={15} /> : <CloudOff size={15} />}<span className="hidden min-[1500px]:inline">{n.online === null ? '…' : n.online ? 'Online' : 'Offline'}</span>
        </button>
        <button className="btn outline sm" onClick={() => useUiMode.getState().setSimple(true)} title="Chuyển sang giao diện đọc đơn giản, chữ lớn"><span className="hdr-simple">Giao diện đơn giản</span><span className="hdr-simple-short">Đơn giản</span></button>
        <div className="user-chip" title={user.email}><span className="av">{user.name.trim().charAt(0).toUpperCase()}</span><div><div className="n">{user.name}</div><div className="r">{ROLE_LABEL[user.role]}</div></div></div>
        <button className="icon-btn" title="Toàn màn hình (F11)" onClick={() => deskApi().toggleFullscreen()}><Maximize2 size={19} /></button>
        <button className="icon-btn" title="Trợ giúp" onClick={() => setHelp(true)}><HelpCircle size={21} /></button>
        <button className="icon-btn" title="Thông báo" onClick={() => nav('/notifications')}>
          <Bell size={21} />{n.unread > 0 && <span className="dot">{n.unread > 99 ? '99+' : n.unread}</span>}
        </button>
        <button className="icon-btn" title="Đăng xuất" onClick={() => { logout(); nav('/login') }}><LogOut size={21} /></button>
      </div>
      {help && (
        <Modal title="Trợ giúp nhanh" size="md" onClose={() => setHelp(false)}>
          <div className="flex flex-col gap-3 leading-relaxed">
            <p className="m-0"><b>Vòng đời một mục:</b> Nháp → Gửi duyệt → Chờ duyệt → Đã duyệt → (đến hạn) Quá hạn → Gia hạn hoặc sửa. Mục mức <b>R1</b> xuất bản ngay khi gửi, <b>R2</b> cần 1 người duyệt, <b>R3</b> cần 2 người duyệt (khác chủ sở hữu).</p>
            <p className="m-0"><b>Vai trò:</b> Người đọc · Người đóng góp · Kiểm duyệt viên · Quản trị · Người bảo trợ. Menu và nút bấm tự ẩn theo quyền của bạn; thao tác sai quyền sẽ nhận thông báo 403 từ máy chủ.</p>
            <p className="m-0"><b>Phím tắt:</b> <span className="kbd">F11</span> toàn màn hình · <span className="kbd">Ctrl</span>+<span className="kbd">K</span> tìm kiếm nhanh · <span className="kbd">Esc</span> đóng hộp thoại.</p>
          </div>
        </Modal>
      )}
    </header>
  )
}

const LS_OPEN = 'memorable.sb.open'
const LS_COL = 'memorable.sb.collapsed'
const readOpen = (): string[] | null => { try { const v = JSON.parse(localStorage.getItem(LS_OPEN) || 'null'); return Array.isArray(v) ? v : null } catch { return null } }

// Màn hẹp (dưới 1024px): thanh bên là menu trượt, luôn ở dạng đầy đủ
const useNarrow = () => {
  const q = '(max-width: 1023px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches)
  useEffect(() => { const m = window.matchMedia(q); const h = () => setNarrow(m.matches); m.addEventListener('change', h); return () => m.removeEventListener('change', h) }, [])
  return narrow
}

function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const user = useAuth((s) => s.user)!
  const loc = useLocation()
  const nav = useNavigate()
  const groups = useGroups()
  const n = useNotices()
  const activeId = groups.find((g) => g.items.some((i) => isOn(loc.pathname, i.to)))?.id
  const [collapsedPref, setCollapsed] = useState(() => localStorage.getItem(LS_COL) === '1')
  const narrow = useNarrow()
  const collapsed = collapsedPref && !narrow
  const [open, setOpen] = useState<string[]>(() => readOpen() ?? ['home'])
  useEffect(() => { if (activeId) setOpen((o) => (o.includes(activeId) ? o : [...o, activeId])) }, [activeId])
  useEffect(() => { try { localStorage.setItem(LS_OPEN, JSON.stringify(open)) } catch { /* bỏ qua */ } }, [open])
  useEffect(() => { try { localStorage.setItem(LS_COL, collapsedPref ? '1' : '0') } catch { /* bỏ qua */ } }, [collapsedPref])

  // Số đếm hiển thị cạnh từng mục
  const badge = (to: string): number => (to === '/notifications' ? n.unread : to === '/reviews' ? n.queue : to === '/tasks' ? n.tasks : 0)
  const groupBadge = (g: (typeof groups)[number]) => g.items.reduce((a, i) => a + badge(i.to), 0)
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))

  async function openNotice(x: (typeof n.items)[number]) {
    if (x.status === 'unread') { await post(`/notifications/${x.id}/read`).catch(() => undefined); n.refresh() }
    const id = itemIdOf(x.content)
    nav(id ? `/items/${id}` : '/notifications')
  }

  return (
    <aside className={clsx('sidebar', collapsed && 'collapsed', mobileOpen && 'mobile-open')} aria-label="Điều hướng chính">
      <div className="sb-mobile-head"><b>Menu</b><button className="icon-btn" onClick={onClose} aria-label="Đóng menu"><X size={20} /></button></div>
      <div className="sb-top">
        {can(user.role, 'write') && (
          <button className="sb-cta" onClick={() => nav('/import-knowledge')} title="Nhập tri thức mới: AI đọc tệp và điền sẵn"><Sparkles size={18} /><span className="lbl">Nhập tri thức</span></button>
        )}
        <button className="sb-search" onClick={() => nav('/search')} title="Tìm kiếm nhanh (Ctrl+K)"><Search size={16} /><span className="lbl">Tìm kiếm nhanh</span><kbd className="lbl">Ctrl K</kbd></button>
      </div>

      <nav className="sb-nav">
        {!collapsed && <div className="sb-label">Điều hướng</div>}
        {groups.map((g) => {
          const isActive = activeId === g.id
          const isOpen = open.includes(g.id) && !collapsed
          const gb = groupBadge(g)
          return (
            <div key={g.id} className="sb-group">
              <button className={clsx('sb-head', isActive && 'active', isOpen && 'open')} title={collapsed ? g.label : undefined}
                onClick={() => (collapsed ? nav(g.items[0].to) : toggle(g.id))} aria-expanded={isOpen}>
                <span className="ico">{g.icon}{gb > 0 && (collapsed || !isOpen) && <i className="pip" />}</span>
                <span className="lbl">{g.label}</span>
                <ChevronDown size={15} className="chev lbl" />
              </button>
              {isOpen && (
                <div className="sb-sub">
                  {g.items.map((i) => {
                    const b = badge(i.to)
                    return (
                      <NavLink key={i.to} to={i.to} end className={clsx('sb-link', isOn(loc.pathname, i.to) && 'on')}>
                        <i className="dot" /><span className="txt">{i.label}</span>{b > 0 && <span className="sb-badge">{b > 99 ? '99+' : b}</span>}
                      </NavLink>)
                  })}
                </div>)}
            </div>)
        })}
      </nav>

      {!collapsed && (
        <div className="sb-notif">
          <div className="head">
            <span className="ttl"><Bell size={14} />Thông báo mới</span>
            {n.unread > 0 ? <span className="sb-badge">{n.unread}</span> : <button className="more" onClick={() => nav('/notifications')}>Xem tất cả</button>}
          </div>
          <div className="list">
            {n.items.length === 0 && <div className="none"><CheckCheck size={16} />Bạn đã xem hết thông báo</div>}
            {n.items.slice(0, 3).map((x) => (
              <button key={x.id} className={clsx('row', x.status === 'unread' && 'unread')} onClick={() => openNotice(x)}>
                <i className="dot" />
                <span className="body"><b>{NOTICE_TYPE[x.type] || x.type}</b><span className="msg">{x.content}</span></span>
                <span className="time">{dt(x.created_at).slice(0, 5)}</span>
              </button>))}
          </div>
          {n.items.length > 0 && <button className="foot" onClick={() => nav('/notifications')}>Xem tất cả thông báo<ArrowRight size={13} /></button>}
        </div>)}

      <button className="sb-toggle" onClick={() => setCollapsed(!collapsedPref)} title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'} aria-label="Thu gọn / mở rộng thanh bên">
        {collapsed ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={17} /><span className="lbl">Thu gọn</span></>}
      </button>
    </aside>
  )
}

export default function Layout() {
  const n = useNotices()
  const nav = useNavigate()
  const loc = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { setMenuOpen(false) }, [loc.pathname])
  useEffect(() => {
    n.refresh(); n.ping()
    const a = setInterval(n.refresh, 45000)
    const b = setInterval(n.ping, 30000)
    const k = (e: KeyboardEvent) => {
      if (e.key === 'F11') { e.preventDefault(); deskApi().toggleFullscreen() }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); nav('/search') }
    }
    window.addEventListener('keydown', k)
    return () => { clearInterval(a); clearInterval(b); window.removeEventListener('keydown', k) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="h-full flex flex-col">
      <Header onMenu={() => setMenuOpen(true)} />
      <div className="flex flex-1 min-h-0">
        <Sidebar mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        {menuOpen && <div className="app-nav-backdrop" onClick={() => setMenuOpen(false)} aria-hidden />}
        <main className="app-main flex-1 min-w-0 overflow-auto p-5"><div className="page-enter main-wrap"><Outlet /></div></main>
      </div>
      <ChatWidget />
    </div>
  )
}
