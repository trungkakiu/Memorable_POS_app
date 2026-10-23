import { useSearchParams } from 'react-router-dom'
import { Download, Upload } from 'lucide-react'
import { PageTabs } from '../components/PageTabs'
import { can } from '../lib/permissions'
import { useAuth } from '../store/auth'
import { ExportFull, ImportItems } from './Admin'

/** Nhập và xuất dữ liệu hàng loạt (CSV/JSON, sao lưu toàn bộ): công cụ cho quản trị, gộp một chỗ. */
export default function DataTransfer() {
  const role = useAuth((s) => s.user?.role)
  const [sp] = useSearchParams()
  const canImport = can(role, 'moderate'); const canExport = can(role, 'admin')
  const want = sp.get('tab') === 'export' ? 'export' : 'import'
  const tab = want === 'export' && canExport ? 'export' : canImport ? 'import' : 'export'
  return (
    <div className="flex flex-col gap-4">
      <PageTabs tabs={[
        { to: '/data', label: 'Nhập hàng loạt (CSV/JSON)', icon: <Upload size={15} />, hidden: !canImport, on: tab === 'import' },
        { to: '/data?tab=export', label: 'Sao lưu toàn bộ dữ liệu', icon: <Download size={15} />, hidden: !canExport, on: tab === 'export' },
      ]} />
      {tab === 'export' ? <ExportFull /> : <ImportItems />}
    </div>)
}
