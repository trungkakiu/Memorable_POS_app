// "Bạn là ai?": chọn ngay khi mở ứng dụng, lưu trên máy này. Quyết định màn đăng nhập và giao diện sau khi vào.
//  - office:  nhân viên văn phòng (hành chính, kinh doanh): giao diện người đọc đầy đủ
//  - field:   người làm vườn, xưởng, kho (ít dùng máy tính): giao diện siêu đơn giản, nói để hỏi
//  - manager: quản lý, kiểm duyệt, quản trị: giao diện quản lý
// Quyền thật vẫn do tài khoản quyết định: tài khoản Người đọc không vào được giao diện quản lý,
// và khối làm việc đã lưu trên máy chủ thắng lựa chọn trên máy.
import { create } from 'zustand'
import { useAuth } from '../store/auth'

export type Persona = 'office' | 'field' | 'manager'
const KEY = 'memorable.persona'
const read = (): Persona | null => { try { const v = localStorage.getItem(KEY); return v === 'office' || v === 'field' || v === 'manager' ? v : null } catch { return null } }

export const PERSONA_LABEL: Record<Persona, string> = { office: 'Văn phòng', field: 'Sản xuất', manager: 'Quản lý' }

export const usePersona = create<{ persona: Persona | null; setPersona: (p: Persona | null) => void }>((set) => ({
  persona: read(),
  setPersona: (p) => { try { if (p) localStorage.setItem(KEY, p); else localStorage.removeItem(KEY) } catch { /* bỏ qua */ } set({ persona: p }) },
}))

/** Đang ở giao diện khối Sản xuất không (cùng cách tính với App.tsx). */
export function useIsField() {
  const persona = usePersona((s) => s.persona)
  return useAuth((s) => !!s.user && (s.user.role === 'reader' ? (s.user.audience || persona) === 'field' : persona === 'field'))
}
