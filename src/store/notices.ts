import { create } from 'zustand'
import { deskApi, get } from '../lib/api'
import { can } from '../lib/permissions'
import { useAuth } from './auth'
import type { Notice } from '../lib/types'

interface S {
  items: Notice[]
  unread: number
  queue: number
  tasks: number
  online: boolean | null
  ms: number | null
  refresh: () => Promise<void>
  ping: () => Promise<void>
}

const BASE_TITLE = typeof document !== 'undefined' ? document.title : ''
let seenMax: number | null = null
const nativeOn = () => { try { return localStorage.getItem('memorable.notify.native') !== 'off' } catch { return true } }
/** Hiện thông báo của hệ điều hành khi có thông báo mới và cửa sổ không đang được xem. */
function nativeNotify(list: Notice[]) {
  try {
    if (!nativeOn() || typeof Notification === 'undefined' || document.hasFocus() || list.length === 0) return
    const show = () => {
      const first = list[0]
      const body = list.length > 1 ? `${first.content}\n… và ${list.length - 1} thông báo khác` : first.content
      const n = new Notification('Memorable', { body })
      n.onclick = () => { window.focus() }
    }
    if (Notification.permission === 'granted') show()
    else if (Notification.permission !== 'denied') void Notification.requestPermission().then((p) => { if (p === 'granted') show() })
  } catch { /* hệ điều hành chặn thông báo: bỏ qua */ }
}

export const useNotices = create<S>((set) => ({
  items: [], unread: 0, queue: 0, tasks: 0, online: null, ms: null,
  refresh: async () => {
    try {
      const r = await get<{ notifications: Notice[]; unread: number }>('/notifications', { limit: 12 })
      const top = r.notifications.reduce((a, n) => Math.max(a, n.id), 0)
      if (seenMax !== null) nativeNotify(r.notifications.filter((n) => n.status === 'unread' && n.id > (seenMax as number)))
      seenMax = Math.max(seenMax ?? 0, top)
      set({ items: r.notifications, unread: r.unread })
      try { document.title = r.unread > 0 ? `(${r.unread}) ${BASE_TITLE}` : BASE_TITLE } catch { /* bỏ qua */ }
    } catch { /* offline hoặc hết phiên — bỏ qua */ }
    const role = useAuth.getState().user?.role
    if (can(role, 'moderate')) get<{ total: number }>('/reviews/queue', { limit: 1 }).then((r) => set({ queue: r.total })).catch(() => undefined)
    get<unknown[]>('/reviews/tasks').then((r) => set({ tasks: Array.isArray(r) ? r.length : 0 })).catch(() => undefined)
  },
  ping: async () => {
    try {
      const r = await deskApi().ping()
      set({ online: !!r.data?.online, ms: r.data?.ms ?? null })
    } catch { set({ online: false, ms: null }) }
  },
}))

/** Lấy mã mục từ nội dung thông báo dạng: Item #12 "..." */
export const itemIdOf = (content: string) => { const m = /#(\d+)/.exec(content); return m ? Number(m[1]) : null }
