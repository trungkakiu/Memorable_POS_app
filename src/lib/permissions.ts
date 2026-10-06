import type { Role } from './types'

// Ma trận quyền lấy từ mục "Ai gọi được" của từng API trong Swagger.
export type Cap =
  | 'read'        // mọi người dùng đăng nhập
  | 'write'       // contributor, moderator, admin: tạo/sửa/gửi duyệt/tệp/kiểm thử/sự cố/AI gợi ý
  | 'moderate'    // moderator, admin: duyệt, thẻ/mẫu/từ đồng nghĩa, nhập hàng loạt, nhật ký
  | 'admin'       // admin: người dùng, mảng, cấu hình, xuất toàn bộ
  | 'report'      // moderator, admin, sponsor: báo cáo, xem chi phí/baseline, mức dùng AI
  | 'timelog'     // reader, contributor, moderator, admin: ghi giờ công
  | 'ask'         // reader, contributor, moderator, admin: hỏi AI

const CAPS: Record<Role, Cap[]> = {
  reader: ['read', 'timelog', 'ask'],
  contributor: ['read', 'write', 'timelog', 'ask'],
  moderator: ['read', 'write', 'moderate', 'report', 'timelog', 'ask'],
  admin: ['read', 'write', 'moderate', 'admin', 'report', 'timelog', 'ask'],
  sponsor: ['read', 'report'],
}
export const can = (role: Role | undefined, c: Cap) => !!role && CAPS[role].includes(c)
