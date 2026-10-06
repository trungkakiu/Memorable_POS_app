import { create } from 'zustand'

export interface ToastItem { id: number; kind: 'info' | 'error' | 'success' | 'warn'; text: string }
interface ConfirmState { title: string; message: string; danger?: boolean; okText?: string; resolve: (v: boolean) => void }

interface UiState {
  toasts: ToastItem[]
  confirm: ConfirmState | null
  toast: (text: string, kind?: ToastItem['kind']) => void
  dismiss: (id: number) => void
  ask: (title: string, message: string, opts?: { danger?: boolean; okText?: string }) => Promise<boolean>
  closeConfirm: (v: boolean) => void
}

let seq = 1
export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  confirm: null,
  toast: (text, kind = 'info') => {
    const id = seq++
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }))
    setTimeout(() => get().dismiss(id), kind === 'error' ? 6000 : 3200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  ask: (title, message, opts) => new Promise((resolve) => set({ confirm: { title, message, resolve, ...opts } })),
  closeConfirm: (v) => { get().confirm?.resolve(v); set({ confirm: null }) },
}))

export const toast = {
  info: (t: string) => useUi.getState().toast(t, 'info'),
  ok: (t: string) => useUi.getState().toast(t, 'success'),
  warn: (t: string) => useUi.getState().toast(t, 'warn'),
  error: (t: unknown) => useUi.getState().toast(t instanceof Error ? t.message : String(t), 'error'),
}
export const confirmDialog = (title: string, message: string, opts?: { danger?: boolean; okText?: string }) =>
  useUi.getState().ask(title, message, opts)
