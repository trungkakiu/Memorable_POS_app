import { ReactNode } from 'react'
import { BookOpen, ClipboardCheck, Gauge, Layers, Settings as Cog, Sparkles, Timer } from 'lucide-react'
import type { Cap } from './permissions'

export interface NavLeaf { to: string; label: string; cap: Cap }
export interface NavGroup { id: string; label: string; short?: string; icon: ReactNode; items: NavLeaf[] }

export const NAV: NavGroup[] = [
  { id: 'home', label: 'Tổng quan', icon: <Gauge size={20} />, items: [
    { to: '/', label: 'Trang chủ', cap: 'read' },
    { to: '/notifications', label: 'Thông báo', cap: 'read' },
  ] },
  { id: 'kb', label: 'Kho tri thức', short: 'Tri thức', icon: <BookOpen size={20} />, items: [
    { to: '/import-knowledge', label: 'Nhập tri thức (AI)', cap: 'write' },
    { to: '/items', label: 'Danh sách tri thức', cap: 'read' },
    { to: '/items/new', label: 'Tạo mục thủ công', cap: 'write' },
    { to: '/search', label: 'Tìm kiếm', cap: 'read' },
    { to: '/templates', label: 'Mẫu nội dung', cap: 'read' },
    { to: '/knowledge', label: 'Nguồn tri thức', cap: 'read' },
    { to: '/knowledge/search', label: 'Tìm đoạn nội dung', cap: 'ask' },
    { to: '/compare', label: 'So sánh tài liệu', cap: 'ask' },
  ] },
  { id: 'ai', label: 'Trợ lý AI', icon: <Sparkles size={20} />, items: [
    { to: '/ai', label: 'Hỏi đáp có trích nguồn', cap: 'read' },
    { to: '/transcribe', label: 'Chép lời ghi âm', cap: 'ask' },
    { to: '/web-sources', label: 'Nguồn Internet & câu trả lời đã học', cap: 'moderate' },
    { to: '/agents', label: 'Agent của tôi', cap: 'ask' },
    { to: '/agents/new', label: 'Tạo Agent mới', cap: 'ask' },
    { to: '/agents/skills', label: 'Thư viện skill', cap: 'ask' },
    { to: '/agents/memory', label: 'Trí nhớ và hội thoại', cap: 'ask' },
    { to: '/ai/tools', label: 'Gợi ý · Trùng lặp · Kiểm thử', cap: 'write' },
  ] },
  { id: 'review', label: 'Duyệt & vận hành', short: 'Vận hành', icon: <ClipboardCheck size={20} />, items: [
    { to: '/reviews', label: 'Hàng đợi duyệt', cap: 'moderate' },
    { to: '/tasks', label: 'Việc rà soát của tôi', cap: 'read' },
    { to: '/incidents', label: 'Sổ sự cố (MTTR)', cap: 'read' },
  ] },
  { id: 'measure', label: 'Đo lường', icon: <Timer size={20} />, items: [
    { to: '/timelogs', label: 'Giờ công', cap: 'timelog' },
    { to: '/costs', label: 'Chi phí', cap: 'report' },
    { to: '/benchmarks', label: 'Bài đo baseline', cap: 'report' },
    { to: '/reports', label: 'Báo cáo & KPI', cap: 'report' },
    { to: '/audit', label: 'Nhật ký kiểm toán', cap: 'moderate' },
  ] },
  { id: 'catalog', label: 'Danh mục', icon: <Layers size={20} />, items: [
    { to: '/tags', label: 'Thẻ và nhóm kiến thức', cap: 'read' },
    { to: '/synonyms', label: 'Từ đồng nghĩa', cap: 'read' },
    { to: '/spaces', label: 'Mảng nội dung', cap: 'read' },
    { to: '/import', label: 'Nhập hàng loạt', cap: 'moderate' },
    { to: '/export', label: 'Xuất toàn bộ dữ liệu', cap: 'admin' },
  ] },
  { id: 'system', label: 'Hệ thống', icon: <Cog size={20} />, items: [
    { to: '/users', label: 'Người dùng & vai trò', cap: 'admin' },
    { to: '/admin-settings', label: 'Cấu hình máy chủ', cap: 'admin' },
    { to: '/connection', label: 'Kết nối & tài khoản', cap: 'read' },
  ] },
]
