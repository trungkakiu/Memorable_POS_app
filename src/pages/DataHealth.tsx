import { useSearchParams } from 'react-router-dom'
import { Database, ScanSearch } from 'lucide-react'
import { PageTabs } from '../components/PageTabs'
import { can } from '../lib/permissions'
import { useAuth } from '../store/auth'
import { KnowledgeSearch, KnowledgeSources } from './KnowledgePages'

/** Sức khỏe dữ liệu: tệp nào đã được đọc và ghi nhớ, và công cụ thử xem AI lấy được đoạn nào khi tìm. */
export default function DataHealth() {
  const role = useAuth((s) => s.user?.role)
  const [sp] = useSearchParams()
  const askOk = can(role, 'ask')
  const tab = sp.get('tab') === 'search' && askOk ? 'search' : 'sources'
  return (
    <div className="flex flex-col gap-4">
      <PageTabs tabs={[
        { to: '/knowledge', label: 'Nguồn tri thức đã đọc', icon: <Database size={15} />, on: tab === 'sources' },
        { to: '/knowledge?tab=search', label: 'Thử tìm đoạn nội dung', icon: <ScanSearch size={15} />, hidden: !askOk, on: tab === 'search' },
      ]} />
      {tab === 'search' ? <KnowledgeSearch /> : <KnowledgeSources />}
    </div>)
}
