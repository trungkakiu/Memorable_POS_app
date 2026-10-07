import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  AudioLines, Wand2, BookMarked, Brain, ChevronDown, FileSearch, GitCompare, Clock, Compass, FolderOpen, History, Home, LayoutDashboard, LogOut, Menu, MessageCircleQuestion, Minus, PlayCircle, Plus, Search, Star, Timer, Type, X,
} from 'lucide-react'
import { ApiError, get, post } from '../lib/api'
import { ROLE_LABEL, WORK_TYPE, num, todayStr } from '../lib/format'
import { Modal } from '../components/ui'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { toast } from '../store/ui'
import type { ItemRow, ItemType } from '../lib/types'
import { AssistantPanel } from './Assistant'
import { TOPIC_COLORS, TYPE_ICON, TYPE_PLAIN, addRecent, useReaderUi, useUiMode } from './common'
import { useWorkspace } from './workspace'

const TYPES: ItemType[] = ['runbook', 'article', 'document', 'prompt']
const TYPE_RAIL: Record<ItemType, string> = { runbook: 'Xử lý sự cố', article: 'Bài viết', document: 'Tài liệu', prompt: 'Câu lệnh mẫu AI' }

// ---------------------------------------------------------------- Ghi giờ làm nhanh
function TimeDialog({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(todayStr())
  const [hours, setHours] = useState(1)
  const [type, setType] = useState(() => { try { return localStorage.getItem('memorable.reader.worktype') || 'training' } catch { return 'training' } })
  const [ai, setAi] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [today, setToday] = useState<number | null>(null)
  useEffect(() => { get<{ time_logs: { hours: string | number }[] }>('/time-logs', { from: todayStr(), to: todayStr(), limit: 100 }).then((r) => setToday(r.time_logs.reduce((a, b) => a + Number(b.hours), 0))).catch(() => undefined) }, [])
  async function save() {
    setBusy(true)
    try {
      await post('/time-logs', { log_date: date, work_type: type, hours, claude_supported: ai, notes: notes.trim() || undefined })
      try { localStorage.setItem('memorable.reader.worktype', type) } catch { /* bỏ qua */ }
      toast.ok('Đã ghi giờ làm'); onClose()
    } catch (e) { toast.error(e instanceof ApiError ? e.full : e) } finally { setBusy(false) }
  }
  return (
    <Modal title="Ghi giờ làm" size="sm" onClose={onClose} footer={<><button className="rd-btn secondary sm" onClick={onClose}>Hủy</button><button className="rd-btn sm" disabled={busy || hours < 0.25 || date > todayStr()} onClick={save}>Ghi giờ</button></>}>
      <div className="rd flex flex-col gap-4 !min-h-0 !bg-none" style={{ background: 'none' }}>
        {today != null && <div className="rd-callout info !p-3 text-[0.92em]"><Clock size={18} className="shrink-0 mt-0.5" />Hôm nay bạn đã ghi <b>{num(today, 2)} giờ</b>.</div>}
        <div><div className="font-bold mb-2">Bạn làm bao lâu?</div>
          <div className="flex gap-2 flex-wrap">{[0.5, 1, 2, 3, 4, 6, 8].map((h) => <button key={h} className={clsx('rd-btn sm', hours === h ? '' : 'secondary')} style={{ padding: '0 14px' }} onClick={() => setHours(h)}>{h} giờ</button>)}</div></div>
        <label className="flex flex-col gap-1.5"><span className="font-bold">Bạn làm việc gì?</span>
          <select className="select !h-[50px] !text-[1em]" value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(WORK_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="flex flex-col gap-1.5"><span className="font-bold">Ngày làm</span><input type="date" className="input !h-[50px] !text-[1em]" max={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="flex items-center gap-3 cursor-pointer font-semibold"><input type="checkbox" className="w-5 h-5 accent-[#7a2ee6]" checked={ai} onChange={(e) => setAi(e.target.checked)} />Có dùng trợ lý AI hỗ trợ</label>
        <label className="flex flex-col gap-1.5"><span className="font-bold">Ghi chú (không bắt buộc)</span><input className="input !h-[50px] !text-[1em]" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} /></label>
      </div>
    </Modal>)
}

// ---------------------------------------------------------------- Thanh bên theo luồng việc
function RailLink({ to, icon, label, badge, onClick, active }: { to?: string; icon: ReactNode; label: string; badge?: number | string; onClick?: () => void; active?: boolean }) {
  const nav = useNavigate(); const loc = useLocation()
  const on = active ?? (to ? (to.includes('?') ? loc.pathname + loc.search === to : to === '/' ? loc.pathname === '/' : loc.pathname === to || loc.pathname.startsWith(to + '/')) : false)
  return (
    <button className={clsx('rd-rail-link', on && 'on')} onClick={() => (onClick ? onClick() : to && nav(to))}>
      <span className="ico">{icon}</span><span className="lbl">{label}</span>{badge != null && badge !== 0 && <span className="bdg">{badge}</span>}
    </button>)
}

function Rail({ onTime, onClose }: { onTime: () => void; onClose: () => void }) {
  const spaces = useAuth((s) => s.spaces)
  const runs = useWorkspace((s) => Object.keys(s.runs).length)
  const favs = useWorkspace((s) => s.favs.length)
  const chat = useChat()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [allSpaces, setAllSpaces] = useState(false)
  useEffect(() => { TYPES.forEach((t) => get<{ total: number }>('/items', { limit: 1, type: t }).then((r) => setCounts((c) => ({ ...c, [t]: r.total }))).catch(() => undefined)) }, [])
  const shown = allSpaces ? spaces : spaces.slice(0, 5)
  return (
    <aside className="rd-rail" aria-label="Điều hướng">
      <div className="rd-rail-head"><b>Menu</b><button onClick={onClose} aria-label="Đóng menu"><X size={20} /></button></div>
      <div className="grp"><div className="cap">Bắt đầu</div>
        <RailLink to="/" icon={<Home size={19} />} label="Trang chủ" />
      </div>
      <div className="grp"><div className="cap">Việc của tôi</div>
        <RailLink to="/me?tab=runs" icon={<PlayCircle size={19} />} label="Đang làm dở" badge={runs} />
        <RailLink to="/me?tab=saved" icon={<Star size={19} />} label="Đã lưu" badge={favs} />
        <RailLink to="/me?tab=recent" icon={<History size={19} />} label="Đã xem gần đây" />
        <RailLink to="/memory" icon={<Brain size={19} />} label="Trợ lý ghi nhớ" />
      </div>
      <div className="grp"><div className="cap">Thư viện</div>
        {TYPES.map((t) => { const Ico = TYPE_ICON[t]; return <RailLink key={t} to={`/browse/type/${t}`} icon={<Ico size={19} />} label={TYPE_RAIL[t]} badge={counts[t]} /> })}
      </div>
      <div className="grp"><div className="cap">Chủ đề</div>
        {shown.map((s, i) => <RailLink key={s.id} to={`/browse/space/${s.id}`} icon={<FolderOpen size={19} style={{ color: TOPIC_COLORS[i % TOPIC_COLORS.length] }} />} label={s.name} />)}
        {spaces.length > 5 && <button className="rd-rail-more" onClick={() => setAllSpaces(!allSpaces)}>{allSpaces ? 'Thu gọn' : `Xem thêm ${spaces.length - 5} chủ đề`}<ChevronDown size={14} className={clsx(allSpaces && 'rotate-180')} /></button>}
        {spaces.length === 0 && <div className="px-3 py-2 text-[0.85em] text-muted">Chưa có chủ đề</div>}
      </div>
      <div className="grp"><div className="cap">Công cụ</div>
        <RailLink onClick={() => { if (location.hash === '#/' || location.hash === '') window.dispatchEvent(new CustomEvent('rd:focus-chat')); else chat.setOpen(!chat.open) }} active={chat.open} icon={<MessageCircleQuestion size={19} />} label="Hỏi trợ lý" />
        <RailLink onClick={() => { window.location.hash = '#/'; setTimeout(() => window.dispatchEvent(new CustomEvent('rd:focus-chat')), 150) }} icon={<FileSearch size={19} />} label="Hỏi về tệp của tôi" />
        <RailLink to="/autofill" icon={<Wand2 size={19} />} label="Điền mẫu tự động" />
        <RailLink to="/transcribe" icon={<AudioLines size={19} />} label="Chép lời ghi âm" />
        <RailLink to="/compare" icon={<GitCompare size={19} />} label="So sánh các bài" />
        <RailLink onClick={onTime} icon={<Timer size={19} />} label="Ghi giờ làm" />
      </div>
    </aside>)
}

// ---------------------------------------------------------------- Ô tìm kiếm có gợi ý ngay khi gõ
function SearchBox() {
  const nav = useNavigate(); const loc = useLocation(); const chat = useChat()
  const [q, setQ] = useState('')
  const [sugg, setSugg] = useState<ItemRow[]>([])
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState(-1)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (loc.pathname === '/search') setQ(new URLSearchParams(loc.search).get('q') || ''); else if (loc.pathname === '/') setQ('') }, [loc.pathname, loc.search])
  useEffect(() => {
    const t = q.trim(); if (t.length < 2) { setSugg([]); return }
    setBusy(true)
    const h = setTimeout(() => { get<{ results: ItemRow[] }>('/search', { q: t, limit: 5 }).then((r) => { setSugg(r.results || []); setCur(-1) }).catch(() => setSugg([])).finally(() => setBusy(false)) }, 260)
    return () => clearTimeout(h)
  }, [q])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.getElementById('rd-q')?.focus(); setOpen(true) } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [])
  const go = (e?: FormEvent) => { e?.preventDefault(); const s = q.trim(); if (!s) return; if (cur >= 0 && sugg[cur]) { nav(`/items/${sugg[cur].id}`); setOpen(false); return } addRecent(s); setOpen(false); nav(`/search?q=${encodeURIComponent(s)}`) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCur((c) => Math.min(sugg.length - 1, c + 1)) } else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(-1, c - 1)) } else if (e.key === 'Escape') setOpen(false)
  }
  return (
    <div className="rd-search-wrap" ref={box}>
      <form className="rd-search" onSubmit={go} role="search">
        <Search size={20} />
        <input id="rd-q" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={onKey} placeholder="Tìm hướng dẫn, quy định… (Ctrl+K)" autoComplete="off" aria-label="Tìm kiếm" />
        <button type="submit" disabled={!q.trim()}>Tìm</button>
      </form>
      {open && q.trim().length >= 2 && (
        <div className="rd-suggest" role="listbox">
          {sugg.map((s, i) => { const Ico = TYPE_ICON[s.type]; return (
            <button key={s.id} role="option" aria-selected={cur === i} className={clsx('row', cur === i && 'cur')} onMouseEnter={() => setCur(i)} onClick={() => { nav(`/items/${s.id}`); setOpen(false) }}>
              <span className="rd-ico md" style={{ width: 38, height: 38 }}><Ico size={19} /></span><span className="min-w-0 flex-1"><span className="block font-bold truncate">{s.title}</span><span className="block text-[0.8em] text-muted">{TYPE_PLAIN[s.type]}{s.space?.name ? ` · ${s.space.name}` : ''}</span></span></button>) })}
          {busy && sugg.length === 0 && <div className="px-4 py-3 text-muted text-[0.92em]">Đang tìm…</div>}
          {!busy && sugg.length === 0 && <div className="px-4 py-3 text-muted text-[0.92em]">Chưa thấy bài khớp — thử hỏi trợ lý bên dưới.</div>}
          <div className="foot">
            <button onClick={() => go()}><Search size={16} />Xem tất cả kết quả cho “{q.trim()}”</button>
            <button onClick={() => { setOpen(false); chat.setOpen(true); void chat.ask(q.trim(), 'documents'); setQ('') }}><MessageCircleQuestion size={16} />Hỏi trợ lý: “{q.trim().slice(0, 40)}”</button>
          </div>
        </div>)}
    </div>)
}

export default function ReaderLayout() {
  const user = useAuth((s) => s.user)!
  const logout = useAuth((s) => s.logout)
  const { scale, setScale } = useReaderUi()
  const setSimple = useUiMode((s) => s.setSimple)
  const chat = useChat()
  const init = useWorkspace((s) => s.init)
  const nav = useNavigate(); const loc = useLocation()
  const [menu, setMenu] = useState(false)
  const [time, setTime] = useState(false)
  // Màn hẹp: thanh bên thành menu trượt, đóng khi chuyển trang
  const [navOpen, setNavOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // Trang chủ có sẵn khung trợ lý lớn: không mở thêm cửa sổ trợ lý nhỏ
  const onHome = loc.pathname === '/'
  const pageAsk = loc.pathname === '/ai' || onHome
  const dockOpen = chat.open && !pageAsk
  const toggleAssistant = () => { if (onHome) window.dispatchEvent(new CustomEvent('rd:focus-chat')); else chat.toggle() }

  useEffect(() => { init(user.id) }, [user.id]) // eslint-disable-line
  useEffect(() => { const h = () => setTime(true); window.addEventListener('rd:time', h); return () => window.removeEventListener('rd:time', h) }, [])
  useEffect(() => { document.querySelector('.rd-scroll')?.scrollTo({ top: 0 }); setNavOpen(false) }, [loc.pathname, loc.search])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); toggleAssistant() }
      if (e.key === 'Escape') setNavOpen(false)
      if (e.key === 'Escape' && chat.open && !document.querySelector('.modal-backdrop') && document.activeElement?.tagName !== 'INPUT') chat.setOpen(false)
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [chat.open, onHome]) // eslint-disable-line
  const initials = useMemo(() => user.name.trim().charAt(0).toUpperCase(), [user.name])

  return (
    <div className={clsx('rd rd-shell', navOpen && 'nav-open', dockOpen && 'dock-open')} style={{ ['--rd-scale' as string]: scale }}>
      <header className="rd-top">
        <div className="rd-top-in">
          <button className="rd-burger" onClick={() => setNavOpen(true)} aria-label="Mở menu" aria-expanded={navOpen}><Menu size={22} /></button>
          <button className="rd-logo" onClick={() => nav('/')} aria-label="Về trang chủ">
            <span className="mark"><BookMarked size={24} /></span>
            <span><span className="t1 block">Thư viện tri thức</span><span className="t2 block">Tìm · Làm theo · Hỏi trợ lý</span></span>
          </button>
          <SearchBox />
          <button className={clsx('rd-btn sm', !(chat.open && !onHome) && 'secondary')} onClick={toggleAssistant} aria-pressed={chat.open && !onHome} title="Mở / đóng trợ lý (Ctrl+J)" aria-label="Hỏi trợ lý"><MessageCircleQuestion size={19} /><span className="rd-hide-sm">Hỏi trợ lý</span></button>
          <div className="relative" ref={menuRef}>
            <button className="flex items-center gap-2.5 h-[50px] pl-1.5 pr-3 rounded-lg border border-line bg-white cursor-pointer hover:bg-brand-50" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}>
              <span className="w-9 h-9 rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-white font-extrabold grid place-items-center">{initials}</span>
              <span className="text-left hidden 2xl:block leading-tight"><span className="block font-bold text-[0.85em] max-w-[120px] truncate">{user.name}</span><span className="block text-[0.72em] text-muted">{ROLE_LABEL[user.role]}</span></span>
              <ChevronDown size={16} className="text-muted" />
            </button>
            {menu && (
              <div className="absolute right-0 top-[58px] w-[300px] bg-white border border-line rounded-lg shadow-[0_24px_50px_-18px_rgba(60,20,120,.5)] p-3 z-50 flex flex-col gap-3" role="menu">
                <div className="px-1"><div className="font-extrabold">{user.name}</div><div className="text-sm text-muted">{user.email}</div></div>
                <div className="border-t border-line-soft pt-3">
                  <div className="text-[0.75em] font-bold uppercase text-muted tracking-wide mb-2 flex items-center gap-1.5"><Type size={13} />Cỡ chữ</div>
                  <div className="flex items-center gap-2">
                    <button className="rd-btn secondary sm flex-1" onClick={() => setScale(scale - 0.08)} aria-label="Giảm cỡ chữ"><Minus size={16} />Nhỏ</button>
                    <button className="rd-btn secondary sm flex-1" onClick={() => setScale(scale + 0.08)} aria-label="Tăng cỡ chữ"><Plus size={16} />To</button>
                  </div>
                  <div className="text-xs text-muted mt-1.5 text-center">Đang ở mức {Math.round(scale * 100)}%</div>
                </div>
                {user.role !== 'reader' && <button className="rd-tool" onClick={() => { setSimple(false); setMenu(false) }}><LayoutDashboard size={18} />Chuyển về giao diện quản lý</button>}
                <button className="rd-tool" onClick={() => { logout(); nav('/login') }}><LogOut size={18} />Đăng xuất</button>
              </div>)}
          </div>
        </div>
      </header>
      <div className="rd-body">
        <Rail onTime={() => setTime(true)} onClose={() => setNavOpen(false)} />
        {navOpen && <div className="rd-nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden />}
        <main className="rd-scroll"><div className="rd-main"><div className="rd-wrap"><Outlet /></div></div></main>
        {dockOpen && <aside className="rd-dock" aria-label="Trợ lý"><AssistantPanel onClose={() => chat.setOpen(false)} /></aside>}
      </div>
      {time && <TimeDialog onClose={() => setTime(false)} />}
    </div>
  )
}
