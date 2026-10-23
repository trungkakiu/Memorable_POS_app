// Màn đầu tiên khi mở ứng dụng: chọn nhóm công việc. Chạm một lựa chọn là vào luôn, không cần nút xác nhận.
import { ReactNode } from 'react'
import { Briefcase, ChevronRight, ShieldCheck, Sprout } from 'lucide-react'
import { AuthShell } from '../components/AuthShell'
import { Persona, usePersona } from '../lib/persona'

function Option({ p, tone, icon, title, scope, desc }: { p: Persona; tone: string; icon: ReactNode; title: string; scope: string; desc: string }) {
  const setPersona = usePersona((s) => s.setPersona)
  return (
    <button className={`au-opt t-${tone}`} onClick={() => setPersona(p)}>
      <span className="ico">{icon}</span>
      <span className="txt"><b>{title}</b><em>{scope}</em><small>{desc}</small></span>
      <ChevronRight size={22} className="go" />
    </button>)
}

export default function PersonaPicker() {
  return (
    <AuthShell tone="neutral">
      <div>
        <h1 className="au-h1">Chọn nhóm công việc</h1>
        <p className="au-lead">Ứng dụng sẽ hiển thị các chức năng phù hợp với nhóm công việc của bạn.</p>
      </div>
      <div className="au-opts">
        <Option p="field" tone="field" icon={<Sprout size={30} />} title="Sản xuất" scope="Nông nghiệp, xưởng, kho" desc="Hỏi đáp bằng giọng nói hoặc hình ảnh, báo sự cố thiết bị, xem hướng dẫn vận hành." />
        <Option p="office" tone="office" icon={<Briefcase size={30} />} title="Văn phòng" scope="Hành chính, kinh doanh, kế toán" desc="Điền giấy tờ, tra cứu quy định, hỏi đáp về tài liệu." />
        <Option p="manager" tone="manager" icon={<ShieldCheck size={30} />} title="Quản lý" scope="Quản lý, kiểm duyệt, quản trị" desc="Duyệt tài liệu, quản lý người dùng, theo dõi sự cố và xem báo cáo." />
      </div>
      <p className="au-note">Bạn có thể đổi nhóm công việc tại màn hình đăng nhập.</p>
    </AuthShell>)
}
