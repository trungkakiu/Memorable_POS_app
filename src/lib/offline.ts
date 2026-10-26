import { create } from 'zustand'

/**
 * Chế độ ngoại tuyến nhẹ cho bản máy tính:
 *  - Lưu tạm một số kết quả GET (tài liệu, quy trình, sự cố...) để vẫn đọc được khi mất mạng.
 *  - Xếp hàng việc báo sự cố khi mất mạng, tự gửi lại khi có mạng.
 * Dữ liệu chỉ nằm trong bộ nhớ trình duyệt của ứng dụng và bị xóa khi đăng xuất.
 */
const CACHE_KEY = 'memorable.offline.cache.v1'
const QUEUE_KEY = 'memorable.offline.queue.v1'
const MAX_ENTRIES = 60
const MAX_BYTES = 2_500_000

export interface QueuedCall { id: number; method: string; path: string; body: unknown; at: number }
interface Entry { t: number; d: unknown }

const CACHEABLE = /^\/(items|runbooks|incidents|spaces|tags|templates|synonyms|catalog|search)(\/|$)/
const QUEUEABLE = [/^\/incidents$/]

export const isCacheable = (path: string) => CACHEABLE.test(path)
export const isQueueable = (method: string, path: string) => method.toUpperCase() === 'POST' && QUEUEABLE.some((r) => r.test(path))
export const cacheKey = (path: string, query?: object) => `${path}?${JSON.stringify(query ?? {})}`

function read<T>(k: string, fallback: T): T {
  try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : fallback } catch { return fallback }
}

export function cachePut(key: string, data: unknown) {
  try {
    const all = read<Record<string, Entry>>(CACHE_KEY, {})
    all[key] = { t: Date.now(), d: data }
    let keys = Object.keys(all).sort((a, b) => all[b].t - all[a].t)
    for (const k of keys.slice(MAX_ENTRIES)) delete all[k]
    keys = keys.slice(0, MAX_ENTRIES)
    let json = JSON.stringify(all)
    while (json.length > MAX_BYTES && keys.length > 1) { delete all[keys.pop() as string]; json = JSON.stringify(all) }
    localStorage.setItem(CACHE_KEY, json)
  } catch { /* bộ nhớ đầy hoặc bị chặn: bỏ qua, ứng dụng vẫn chạy bình thường */ }
}

export function cacheGet(key: string): Entry | null {
  return read<Record<string, Entry>>(CACHE_KEY, {})[key] ?? null
}

/** Xóa dữ liệu lưu tạm (khi đăng xuất, tránh để lại nội dung hạn chế trên máy dùng chung). Hàng chờ gửi được giữ lại. */
export function clearOfflineCache() {
  try { localStorage.removeItem(CACHE_KEY) } catch { /* bỏ qua */ }
}

export const queueList = () => read<QueuedCall[]>(QUEUE_KEY, [])

export function queueSet(q: QueuedCall[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch { /* bỏ qua */ }
  useOffline.getState().setPending(q.length)
}

export function queueAdd(c: { method: string; path: string; body: unknown }) {
  const q = queueList()
  q.push({ ...c, id: Date.now() * 1000 + Math.floor(Math.random() * 1000), at: Date.now() })
  queueSet(q)
}

interface S {
  offline: boolean
  /** Đang hiển thị dữ liệu đã lưu trên máy, không phải dữ liệu mới nhất */
  stale: boolean
  pending: number
  setOffline: (v: boolean) => void
  setStale: (v: boolean) => void
  setPending: (n: number) => void
}

export const useOffline = create<S>((set) => ({
  offline: false,
  stale: false,
  pending: queueList().length,
  setOffline: (v) => set((s) => (s.offline === v && (v || !s.stale) ? s : { offline: v, stale: v ? s.stale : false })),
  setStale: (v) => set((s) => (s.stale === v ? s : { stale: v })),
  setPending: (n) => set((s) => (s.pending === n ? s : { pending: n })),
}))
