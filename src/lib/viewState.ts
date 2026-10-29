// Ghi nhớ trạng thái xem (tab, bộ lọc...) trên máy, riêng cho từng tài khoản. Lỗi đọc/ghi (chế độ riêng tư, hết dung lượng) thì bỏ qua.
import { useCallback, useState } from 'react'
import { useAuth } from '../store/auth'

const STORE = 'memorable.view.v1'
const readAll = (): Record<string, unknown> => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {} } catch { return {} } }
const scoped = (key: string) => `${useAuth.getState().user?.id ?? 0}:${key}`

export function loadView<T>(key: string): T | undefined { return readAll()[scoped(key)] as T | undefined }
export function saveView(key: string, value: unknown) {
  try { const all = readAll(); all[scoped(key)] = value; localStorage.setItem(STORE, JSON.stringify(all)) } catch { /* bỏ qua */ }
}

/** Như useState nhưng nhớ giá trị cho lần mở sau. */
export function useRememberedState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => loadView<T>(key) ?? initial)
  const set = useCallback((n: T) => { setV(n); saveView(key, n) }, [key])
  return [v, set]
}
