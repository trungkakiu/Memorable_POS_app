import { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Bot, Brain, Library, MessageCircleQuestion, Search } from 'lucide-react'
import { can } from '../lib/permissions'
import { useAuth } from '../store/auth'

export interface TabDef { to: string; label: string; icon?: ReactNode; hidden?: boolean; on?: boolean }

/** Thanh tab bằng đường dẫn: gom các trang cùng chủ đề thành một mục menu, vẫn giữ nguyên địa chỉ từng trang. */
export function PageTabs({ tabs }: { tabs: TabDef[] }) {
  const nav = useNavigate()
  const loc = useLocation()
  const here = loc.pathname + loc.search
  const isOn = (t: TabDef) => t.on ?? (t.to.includes('?') ? here === t.to : loc.pathname === t.to)
  const shown = tabs.filter((t) => !t.hidden)
  if (shown.length < 2) return null
  return (
    <div className="page-tabs" role="tablist">
      {shown.map((t) => <button key={t.to} role="tab" aria-selected={isOn(t)} className={clsx(isOn(t) && 'on')} onClick={() => nav(t.to)}>{t.icon}{t.label}</button>)}
    </div>)
}

/** Tìm bài và hỏi trợ lý AI: hai cách tìm tri thức, chung một mục menu */
export function SearchTabs() {
  const role = useAuth((s) => s.user?.role)
  return <PageTabs tabs={[
    { to: '/search', label: 'Tìm bài', icon: <Search size={15} /> },
    { to: '/ai', label: 'Hỏi trợ lý AI', icon: <MessageCircleQuestion size={15} />, hidden: !can(role, 'ask') },
  ]} />
}

/** Agent cá nhân: danh sách, thư viện kỹ năng, trí nhớ */
export function AgentTabs() {
  return <PageTabs tabs={[
    { to: '/agents', label: 'Agent của tôi', icon: <Bot size={15} /> },
    { to: '/agents/skills', label: 'Thư viện kỹ năng', icon: <Library size={15} /> },
    { to: '/agents/memory', label: 'Trí nhớ và hội thoại', icon: <Brain size={15} /> },
  ]} />
}
