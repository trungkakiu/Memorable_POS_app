import { ReactNode } from 'react'
import { BarChart3, BookOpen, ClipboardCheck, Gauge, Layers, Settings as Cog, Siren, Sparkles } from 'lucide-react'
import type { Cap } from './permissions'

export interface NavLeaf { to: string; label: string; cap: Cap }
export interface NavGroup { id: string; label: string; short?: string; icon: ReactNode; items: NavLeaf[] }

// Thứ tự theo tần suất dùng: tổng quan → xử lý sự cố → tri thức → AI → duyệt → báo cáo → danh mục → hệ thống.
// Các trang cùng chủ đề gộp thành một mục có tab (tìm bài + hỏi AI, Agent + kỹ năng + trí nhớ, Báo cáo + đo lường...).
// Nhóm chỉ có một mục hiện thành đường dẫn trực tiếp, không cần mở rộng.
export const NAV: NavGroup[] = [
  { id: 'home', label: 'Tổng quan', icon: <Gauge size={20} />, items: [
    { to: '/', label: 'Trang chủ', cap: 'read' },
  ] },
  { id: 'incident', label: 'Xử lý sự cố', short: 'Sự cố', icon: <Siren size={20} />, items: [
    { to: '/incidents', label: 'Trung tâm sự cố', cap: 'read' },
    { to: '/items?type=runbook', label: 'Quy trình xử lý', cap: 'read' },
  ] },
  { id: 'kb', label: 'Kho tri thức', short: 'Tri thức', icon: <BookOpen size={20} />, items: [
    { to: '/items', label: 'Danh sách tri thức', cap: 'read' },
    { to: '/search', label: 'Tìm kiếm & hỏi đáp', cap: 'read' },
    { to: '/import-knowledge', label: 'Nhập tri thức', cap: 'write' },
  ] },
  { id: 'ai', label: 'Trợ lý AI', short: 'AI', icon: <Sparkles size={20} />, items: [
    { to: '/autofill', label: 'Điền mẫu tự động', cap: 'ask' },
    { to: '/transcribe', label: 'Chép lời ghi âm', cap: 'ask' },
    { to: '/agents', label: 'Agent cá nhân', cap: 'ask' },
    { to: '/web-sources', label: 'Nguồn Internet đã học', cap: 'moderate' },
  ] },
  { id: 'review', label: 'Duyệt & rà soát', short: 'Duyệt', icon: <ClipboardCheck size={20} />, items: [
    { to: '/reviews', label: 'Hàng đợi duyệt', cap: 'moderate' },
    { to: '/tasks', label: 'Việc rà soát của tôi', cap: 'read' },
  ] },
  { id: 'report', label: 'Báo cáo', icon: <BarChart3 size={20} />, items: [
    { to: '/reports', label: 'Báo cáo & chỉ số', cap: 'report' },
    { to: '/timelogs', label: 'Ghi giờ công', cap: 'timelog' },
  ] },
  { id: 'catalog', label: 'Danh mục', icon: <Layers size={20} />, items: [
    { to: '/spaces', label: 'Mảng nội dung', cap: 'read' },
    { to: '/tags', label: 'Thẻ và nhóm kiến thức', cap: 'read' },
    { to: '/synonyms', label: 'Từ đồng nghĩa', cap: 'read' },
    { to: '/templates', label: 'Mẫu nội dung', cap: 'read' },
  ] },
  { id: 'system', label: 'Hệ thống', icon: <Cog size={20} />, items: [
    { to: '/users', label: 'Người dùng & vai trò', cap: 'admin' },
    { to: '/devices', label: 'Cảm biến IoT', cap: 'admin' },
    { to: '/admin-settings', label: 'Cấu hình máy chủ', cap: 'admin' },
    { to: '/audit', label: 'Nhật ký kiểm toán', cap: 'moderate' },
    { to: '/knowledge', label: 'Sức khỏe dữ liệu', cap: 'read' },
    { to: '/data', label: 'Nhập / xuất dữ liệu', cap: 'moderate' },
    { to: '/connection', label: 'Kết nối & tài khoản', cap: 'read' },
  ] },
]
