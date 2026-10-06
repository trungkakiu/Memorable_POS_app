import { create } from 'zustand'
import type { ItemType } from '../lib/types'

// Không gian làm việc cá nhân của người đọc: bài đã lưu, đã xem, việc làm dở.
// Lưu cục bộ trên máy (theo từng tài khoản) vì API không có mục "yêu thích".
export interface Fav { id: number; title: string; type: ItemType; at: number }
export interface Rec { id: number; title: string; type: ItemType; at: number }
export interface RunStep { index: number; action: string; expected: string; dangerous: boolean }
export interface RunState {
  itemId: number; title: string; runId: number; idx: number; total: number
  steps: RunStep[]; results: Record<number, 'done' | 'skipped' | 'failed'>; at: number
  verification?: string; rollback?: string; contact?: string
}

interface WS {
  uid: number | null
  favs: Fav[]
  recent: Rec[]
  runs: Record<number, RunState>
  lastVisit: number
  prevVisit: number
  readerAgent: number | null
  init: (uid: number) => void
  toggleFav: (it: { id: number; title: string; type: ItemType }) => boolean
  addRecent: (it: { id: number; title: string; type: ItemType }) => void
  clearRecent: () => void
  saveRun: (r: RunState) => void
  clearRun: (itemId: number) => void
  /** Bài không còn (đã xóa hoặc không còn quyền xem): gỡ khỏi Đã lưu, Đã xem, Đang làm dở. Trả về số chỗ đã gỡ. */
  forgetItem: (itemId: number) => number
  setReaderAgent: (id: number | null) => void
}

const key = (uid: number) => `memorable.ws.${uid}`
function persist(s: WS) {
  if (s.uid == null) return
  try { localStorage.setItem(key(s.uid), JSON.stringify({ favs: s.favs, recent: s.recent, runs: s.runs, lastVisit: s.lastVisit, readerAgent: s.readerAgent })) } catch { /* bỏ qua */ }
}

export const useWorkspace = create<WS>((set, get) => ({
  uid: null, favs: [], recent: [], runs: {}, lastVisit: 0, prevVisit: 0, readerAgent: null,
  init: (uid) => {
    if (get().uid === uid) return
    let d: Partial<WS> = {}
    try { d = JSON.parse(localStorage.getItem(key(uid)) || '{}') } catch { /* bỏ qua */ }
    const now = Date.now()
    set({ uid, favs: d.favs || [], recent: d.recent || [], runs: d.runs || {}, prevVisit: d.lastVisit || 0, lastVisit: now, readerAgent: d.readerAgent ?? null })
    persist(get())
  },
  toggleFav: (it) => {
    const has = get().favs.some((f) => f.id === it.id)
    set((s) => ({ favs: has ? s.favs.filter((f) => f.id !== it.id) : [{ id: it.id, title: it.title, type: it.type, at: Date.now() }, ...s.favs].slice(0, 100) }))
    persist(get()); return !has
  },
  addRecent: (it) => { set((s) => ({ recent: [{ id: it.id, title: it.title, type: it.type, at: Date.now() }, ...s.recent.filter((r) => r.id !== it.id)].slice(0, 30) })); persist(get()) },
  clearRecent: () => { set({ recent: [] }); persist(get()) },
  saveRun: (r) => { set((s) => ({ runs: { ...s.runs, [r.itemId]: r } })); persist(get()) },
  clearRun: (itemId) => { set((s) => { const n = { ...s.runs }; delete n[itemId]; return { runs: n } }); persist(get()) },
  setReaderAgent: (id) => { set({ readerAgent: id }); persist(get()) },
  forgetItem: (itemId) => {
    const s = get(); const n = (s.favs.some((f) => f.id === itemId) ? 1 : 0) + (s.recent.some((r) => r.id === itemId) ? 1 : 0) + (s.runs[itemId] ? 1 : 0)
    if (!n) return 0
    const runs = { ...s.runs }; delete runs[itemId]
    set({ favs: s.favs.filter((f) => f.id !== itemId), recent: s.recent.filter((r) => r.id !== itemId), runs }); persist(get())
    return n
  },
}))

// ---- Bài đang xem: để khung trợ lý biết ngữ cảnh ----
export interface Ctx { id: number; title: string; type: ItemType; hasFiles?: boolean }
interface CtxStore { item: Ctx | null; setItem: (i: Ctx | null) => void }
export const useReaderCtx = create<CtxStore>((set) => ({ item: null, setItem: (item) => set({ item }) }))
