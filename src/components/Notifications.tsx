import { ReactNode, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { AlertTriangle, Bell, BellOff, CalendarClock, CheckCheck, CheckCircle2, ClipboardCheck, FileText, GitCompare, ShieldCheck, Undo2, UserCheck } from 'lucide-react'
import { post, useGet } from '../lib/api'
import { dt, noticeText, noticeType } from '../lib/format'
import { ago } from '../lib/incident'
import type { Notice } from '../lib/types'
import { itemIdOf, useNotices } from '../store/notices'
import { toast } from '../store/ui'
import { ErrorBox, Loading, Pager } from './shared'
import { Empty, PageHeader } from './ui'

// Biểu tượng và màu theo loại thông báo: nhìn là biết việc gì cần làm, không phải đọc hết
type Tone = 'ok' | 'warn' | 'bad' | 'info'
const META: Record<string, { icon: ReactNode; tone: Tone }> = {
  review_requested: { icon: <ClipboardCheck size={17} />, tone: 'warn' },
  item_approved: { icon: <CheckCircle2 size={17} />, tone: 'ok' },
  item_returned: { icon: <Undo2 size={17} />, tone: 'bad' },
  item_rejected: { icon: <Undo2 size={17} />, tone: 'bad' },
  review_due: { icon: <CalendarClock size={17} />, tone: 'warn' },
  review_overdue: { icon: <AlertTriangle size={17} />, tone: 'bad' },
  review_escalation: { icon: <AlertTriangle size={17} />, tone: 'bad' },
  conflict_detected: { icon: <GitCompare size={17} />, tone: 'warn' },
  text_review: { icon: <FileText size={17} />, tone: 'info' },
  official_source: { icon: <ShieldCheck size={17} />, tone: 'ok' },
  account_pending: { icon: <UserCheck size={17} />, tone: 'warn' },
}
const meta = (t: string) => META[t] || { icon: <Bell size={17} />, tone: 'info' as Tone }

/** Mở một thông báo: đánh dấu đã đọc rồi đi tới bài liên quan (nếu có) */
function useOpenNotice(after?: () => void) {
  const nav = useNavigate()
  const refresh = useNotices((s) => s.refresh)
  return async (x: Notice, to?: () => void) => {
    if (x.status === 'unread') { await post(`/notifications/${x.id}/read`).catch(() => undefined); void refresh(); after?.() }
    if (x.type === 'account_pending') { to?.(); nav('/users'); return }
    const id = itemIdOf(x.content)
    if (id) { to?.(); nav(`/items/${id}`) }
  }
}

function NoticeRow({ x, onOpen, plain }: { x: Notice; onOpen: (x: Notice) => void; plain?: boolean }) {
  const m = meta(x.type)
  return (
    <button type="button" className={clsx('nt-row', x.status === 'unread' && 'unread')} onClick={() => onOpen(x)}>
      <span className={clsx('nt-ico', m.tone)}>{m.icon}</span>
      <span className="nt-body"><b>{noticeType(x.type)}</b><span className="nt-msg">{noticeText(x.content, plain)}</span><small title={dt(x.created_at)}>{ago(x.created_at)}</small></span>
      {x.status === 'unread' && <i className="nt-dot" aria-label="Chưa đọc" />}
    </button>)
}

/** Chuông thông báo: số chưa đọc và hộp xem nhanh 8 thông báo mới nhất. `reader` = giao diện người dùng (nút to), `allPath` = trang đầy đủ. */
export function NotificationBell({ reader, allPath }: { reader?: boolean; allPath: string }) {
  const n = useNotices()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const openNotice = useOpenNotice()
  useEffect(() => {
    if (!open) return
    void n.refresh()
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h); window.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('keydown', k) }
  }, [open]) // eslint-disable-line
  const readAll = async () => { await post('/notifications/read-all').catch(() => undefined); void n.refresh() }
  const badge = n.unread > 0 ? (n.unread > 99 ? '99+' : String(n.unread)) : null
  return (
    <div className="nt-wrap" ref={box}>
      {reader ? (
        <button className="rd-btn secondary sm nt-bellbtn" onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open} aria-label={`Thông báo${badge ? `, ${badge} chưa đọc` : ''}`}>
          <Bell size={19} />{badge && <span className="nt-badge">{badge}</span>}
        </button>
      ) : (
        <button className="icon-btn" title="Thông báo" onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open} aria-label="Thông báo">
          <Bell size={21} />{badge && <span className="dot">{badge}</span>}
        </button>)}
      {open && (
        <div className="nt-pop" role="dialog" aria-label="Thông báo">
          <div className="nt-head"><b>Thông báo</b>{n.unread > 0 && <button type="button" onClick={() => void readAll()}><CheckCheck size={14} />Đánh dấu đã đọc tất cả</button>}</div>
          <div className="nt-scroll">
            {n.items.length === 0
              ? <div className="nt-none"><BellOff size={26} />Chưa có thông báo nào</div>
              : n.items.slice(0, 8).map((x) => <NoticeRow key={x.id} x={x} plain={reader} onOpen={(y) => void openNotice(y, () => setOpen(false))} />)}
          </div>
          <button type="button" className="nt-foot" onClick={() => { setOpen(false); nav(allPath) }}>Xem tất cả thông báo</button>
        </div>)}
    </div>)
}

const dayLabel = (iso: string) => {
  const d = new Date(iso)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  return same(d, new Date()) ? 'Hôm nay' : same(d, new Date(Date.now() - 86400000)) ? 'Hôm qua' : 'Trước đó'
}
const TABS: { v: '' | 'unread' | 'read'; l: string }[] = [{ v: '', l: 'Tất cả' }, { v: 'unread', l: 'Chưa đọc' }, { v: 'read', l: 'Đã đọc' }]

/** Trang thông báo đầy đủ, dùng chung cho quản lý (`/notifications`) và người dùng (`/thong-bao`) */
export function NotificationsPage({ reader }: { reader?: boolean }) {
  const n = useNotices()
  const [status, setStatus] = useState<'' | 'unread' | 'read'>('')
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useGet<{ notifications: Notice[]; unread: number; total: number; page: number; pages: number }>('/notifications', { page, limit: 20, status: status || undefined })
  const openNotice = useOpenNotice(reload)
  const [busy, setBusy] = useState(false)
  async function readAll() {
    setBusy(true)
    try { const r = await post<{ updated: number }>('/notifications/read-all'); toast.ok(`Đã đánh dấu ${r?.updated ?? 0} thông báo đã đọc`); void n.refresh(); reload() } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  const groups: [string, Notice[]][] = []
  for (const x of data?.notifications || []) {
    const k = dayLabel(x.created_at)
    const g = groups.find(([l]) => l === k)
    if (g) g[1].push(x); else groups.push([k, [x]])
  }
  const unread = data?.unread ?? n.unread
  const readAllBtn = unread > 0 && <button className={reader ? 'rd-btn sm' : 'btn'} disabled={busy} onClick={() => void readAll()}><CheckCheck size={reader ? 17 : 15} />Đánh dấu đã đọc tất cả</button>
  const tabs = (
    <div className="page-tabs" role="tablist">
      {TABS.map((t) => <button key={t.v} role="tab" aria-selected={status === t.v} className={clsx(status === t.v && 'on')} onClick={() => { setStatus(t.v); setPage(1) }}>{t.l}{t.v === 'unread' && unread > 0 ? <b>{unread}</b> : null}</button>)}
    </div>)
  return (
    <div className={clsx('flex flex-col gap-4 max-w-[860px]', reader && 'gap-5')}>
      {reader
        ? <div className="flex items-end justify-between gap-3 flex-wrap"><div><h1 className="rd-h2 !text-[1.8em]">Thông báo</h1><p className="rd-sub !mb-0">{unread > 0 ? `Bạn có ${unread} thông báo chưa đọc.` : 'Bạn đã xem hết thông báo.'}</p></div>{readAllBtn}</div>
        : <PageHeader title="Thông báo" subtitle={unread > 0 ? `${unread} chưa đọc` : 'Đã xem hết'} actions={readAllBtn || undefined} />}
      {tabs}
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && data.notifications.length === 0 && (reader
        ? <div className="rd-card p-10 text-center text-muted flex flex-col items-center gap-3"><BellOff size={38} className="text-brand-300" /><b className="text-ink text-[1.1em]">{status === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}</b></div>
        : <Empty text={status === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'} icon={<BellOff size={34} strokeWidth={1.5} />} />)}
      {groups.map(([label, list]) => (
        <div key={label} className="flex flex-col gap-2">
          <div className="nt-day">{label}</div>
          <div className={clsx(reader ? 'rd-card' : 'card', 'nt-list')}>{list.map((x) => <NoticeRow key={x.id} x={x} plain={reader} onOpen={(y) => void openNotice(y)} />)}</div>
        </div>))}
      {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
    </div>)
}
