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

export const useNotices = create<S>((set) => ({
  items: [], unread: 0, queue: 0, tasks: 0, online: null, ms: null,
  refresh: async () => {
    try {
      const r = await get<{ notifications: Notice[]; unread: number }>('/notifications', { limit: 12 })
      set({ items: r.notifications, unread: r.unread })
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
