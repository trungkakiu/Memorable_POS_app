import { ReactNode } from 'react'
import { BookOpen, Bot, ClipboardCheck, Gauge, Layers, Settings as Cog, Siren, Sparkles, Timer } from 'lucide-react'
import type { Cap } from './permissions'

export interface NavLeaf { to: string; label: string; cap: Cap }
export interface NavGroup { id: string; label: string; short?: string; icon: ReactNode; items: NavLeaf[] }

// Thứ tự nhóm theo tần suất dùng: theo dõi → xử lý sự cố → tri thức → AI → duyệt → đo lường → danh mục → hệ thống.
// Trong mỗi nhóm: mục xem/dùng hằng ngày trước, mục tạo/nhập sau.
export const NAV: NavGroup[] = [
  { id: 'home', label: 'Tổng quan', icon: <Gauge size={20} />, items: [
    { to: '/', label: 'Trang chủ', cap: 'read' },
    { to: '/notifications', label: 'Thông báo', cap: 'read' },
  ] },
  { id: 'incident', label: 'Xử lý sự cố', short: 'Sự cố', icon: <Siren size={20} />, items: [
    { to: '/incidents', label: 'Trung tâm sự cố', cap: 'read' },
    { to: '/items?type=runbook', label: 'Quy trình xử lý', cap: 'read' },
    { to: '/runbooks/import', label: 'Nhập quy trình (Word/CSV)', cap: 'write' },
  ] },
  { id: 'kb', label: 'Kho tri thức', short: 'Tri thức', icon: <BookOpen size={20} />, items: [
    { to: '/items', label: 'Danh sách tri thức', cap: 'read' },
    { to: '/search', label: 'Tìm kiếm', cap: 'read' },
    { to: '/knowledge', label: 'Nguồn tri thức', cap: 'read' },
    { to: '/knowledge/search', label: 'Tìm đoạn nội dung', cap: 'ask' },
    { to: '/compare', label: 'So sánh tài liệu', cap: 'ask' },
    { to: '/import-knowledge', label: 'Nhập tri thức (AI)', cap: 'write' },
    { to: '/items/new', label: 'Tạo mục thủ công', cap: 'write' },
    { to: '/templates', label: 'Mẫu nội dung', cap: 'read' },
  ] },
  { id: 'ai', label: 'Trợ lý AI', short: 'AI', icon: <Sparkles size={20} />, items: [
    { to: '/ai', label: 'Hỏi đáp có trích nguồn', cap: 'read' },
    { to: '/autofill', label: 'Điền mẫu tự động', cap: 'ask' },
    { to: '/transcribe', label: 'Chép lời ghi âm', cap: 'ask' },
    { to: '/web-sources', label: 'Nguồn Internet & câu trả lời đã học', cap: 'moderate' },
    { to: '/ai/tools', label: 'Gợi ý · Trùng lặp · Kiểm thử', cap: 'write' },
  ] },
  { id: 'agents', label: 'Agent', icon: <Bot size={20} />, items: [
    { to: '/agents', label: 'Agent của tôi', cap: 'ask' },
    { to: '/agents/new', label: 'Tạo Agent mới', cap: 'ask' },
    { to: '/agents/skills', label: 'Thư viện skill', cap: 'ask' },
    { to: '/agents/memory', label: 'Trí nhớ và hội thoại', cap: 'ask' },
  ] },
  { id: 'review', label: 'Duyệt & rà soát', short: 'Duyệt', icon: <ClipboardCheck size={20} />, items: [
    { to: '/reviews', label: 'Hàng đợi duyệt', cap: 'moderate' },
    { to: '/tasks', label: 'Việc rà soát của tôi', cap: 'read' },
  ] },
  { id: 'measure', label: 'Đo lường', icon: <Timer size={20} />, items: [
    { to: '/reports', label: 'Báo cáo & KPI', cap: 'report' },
    { to: '/timelogs', label: 'Giờ công', cap: 'timelog' },
    { to: '/costs', label: 'Chi phí', cap: 'report' },
    { to: '/benchmarks', label: 'Bài đo baseline', cap: 'report' },
  ] },
  { id: 'catalog', label: 'Danh mục', icon: <Layers size={20} />, items: [
    { to: '/spaces', label: 'Mảng nội dung', cap: 'read' },
    { to: '/tags', label: 'Thẻ và nhóm kiến thức', cap: 'read' },
    { to: '/synonyms', label: 'Từ đồng nghĩa', cap: 'read' },
    { to: '/import', label: 'Nhập hàng loạt', cap: 'moderate' },
    { to: '/export', label: 'Xuất toàn bộ dữ liệu', cap: 'admin' },
  ] },
  { id: 'system', label: 'Hệ thống', icon: <Cog size={20} />, items: [
    { to: '/users', label: 'Người dùng & vai trò', cap: 'admin' },
    { to: '/admin-settings', label: 'Cấu hình máy chủ', cap: 'admin' },
    { to: '/audit', label: 'Nhật ký kiểm toán', cap: 'moderate' },
    { to: '/connection', label: 'Kết nối & tài khoản', cap: 'read' },
  ] },
]
