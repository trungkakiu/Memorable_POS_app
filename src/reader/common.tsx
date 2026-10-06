import { ComponentType } from 'react'
import { BookOpen, FileText, LifeBuoy, Sparkles } from 'lucide-react'
import { create } from 'zustand'
import type { ItemType } from '../lib/types'

/** Tên gọi dễ hiểu cho từng loại nội dung (thay cho document / article / prompt / runbook). */
export const TYPE_PLAIN: Record<ItemType, string> = { document: 'Tài liệu', article: 'Bài viết', prompt: 'Câu lệnh mẫu cho AI', runbook: 'Hướng dẫn xử lý sự cố' }
export const TYPE_SHORT: Record<ItemType, string> = { document: 'Tài liệu', article: 'Bài viết', prompt: 'Câu lệnh AI', runbook: 'Xử lý sự cố' }
export const TYPE_DESC: Record<ItemType, string> = {
  document: 'Quy định, biểu mẫu, tài liệu tham khảo',
  article: 'Bài viết kiến thức, kinh nghiệm làm việc',
  prompt: 'Câu lệnh soạn sẵn để dùng với trợ lý AI',
  runbook: 'Các bước làm theo khi gặp sự cố',
}
export const TYPE_ICON: Record<ItemType, ComponentType<{ size?: number }>> = { document: FileText, article: BookOpen, prompt: Sparkles, runbook: LifeBuoy }

export function friendlyDate(s?: string | null) {
  if (!s) return ''
  const d = new Date(s); if (Number.isNaN(d.getTime())) return s
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return 'hôm nay'
  if (days === 1) return 'hôm qua'
  if (days < 7) return `${days} ngày trước`
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`
  return `ngày ${d.getDate()} tháng ${d.getMonth() + 1}, ${d.getFullYear()}`
}

// ---- Cỡ chữ (người dùng chỉnh to nhỏ tùy ý, nhớ lại cho lần sau) ----
const KEY = 'memorable.reader.scale'
const initial = () => { try { const v = Number(localStorage.getItem(KEY)); return v >= 0.9 && v <= 1.5 ? v : 1.08 } catch { return 1.08 } }
interface ReaderUi { scale: number; setScale: (n: number) => void }
export const useReaderUi = create<ReaderUi>((set) => ({
  scale: initial(),
  setScale: (n) => { const v = Math.min(1.5, Math.max(0.9, Math.round(n * 100) / 100)); try { localStorage.setItem(KEY, String(v)) } catch { /* bỏ qua */ } set({ scale: v }) },
}))

// ---- Từ khóa tìm gần đây ----
const RKEY = 'memorable.reader.recent'
export const getRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RKEY) || '[]') } catch { return [] } }
export const addRecent = (q: string) => { try { const s = q.trim(); if (!s) return; localStorage.setItem(RKEY, JSON.stringify([s, ...getRecent().filter((x) => x !== s)].slice(0, 6))) } catch { /* bỏ qua */ } }

// ---- Chế độ giao diện đơn giản (người đọc luôn dùng; vai trò khác có thể bật) ----
const SKEY = 'memorable.ui.simple'
interface Mode { simple: boolean; setSimple: (v: boolean) => void }
export const useUiMode = create<Mode>((set) => ({
  simple: (() => { try { return localStorage.getItem(SKEY) === '1' } catch { return false } })(),
  setSimple: (v) => { try { localStorage.setItem(SKEY, v ? '1' : '0') } catch { /* bỏ qua */ } set({ simple: v }) },
}))

export const TOPIC_COLORS = ['#7a2ee6', '#db2777', '#0891b2', '#16a34a', '#ea580c', '#4f46e5', '#0d9488', '#c026d3']
