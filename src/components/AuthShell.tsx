// Khung chung cho màn "Chọn nhóm công việc" và màn đăng nhập: đầu trang có tên thương hiệu, bên dưới là tấm nội dung trắng.
import { ReactNode } from 'react'
import { BookMarked } from 'lucide-react'

export type AuthTone = 'field' | 'office' | 'neutral'

export function AuthShell({ tone = 'neutral', children }: { tone?: AuthTone; children: ReactNode }) {
  return (
    <div className={`au-wrap t-${tone}`}>
      <header className="au-top">
        <span className="mark" aria-hidden><BookMarked size={26} /></span>
        <div><b>Memorable</b><small>Kho tri thức và vận hành doanh nghiệp</small></div>
      </header>
      <main className="au-sheet"><div className="au-in">{children}</div></main>
    </div>)
}
