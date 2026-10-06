import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, GitCompare, Star } from 'lucide-react'
import { get } from '../lib/api'
import type { ItemDetail } from '../lib/types'
import { ComparePanel } from '../components/Knowledge'
import { useWorkspace } from './workspace'

/** "So sánh các bài": chọn 2–5 bài, trợ lý chỉ ra điểm chung, điểm khác và chỗ mâu thuẫn. */
export default function ReaderCompare() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const favs = useWorkspace((s) => s.favs)
  const [initial, setInitial] = useState<{ id: number; title: string }[] | null>(null)
  const [key, setKey] = useState(0)

  useEffect(() => {
    const ids = (sp.get('ids') || '').split(',').map(Number).filter((n) => n > 0).slice(0, 5)
    if (!ids.length) { setInitial([]); return }
    Promise.all(ids.map((id) => get<ItemDetail>(`/items/${id}`).then((d) => ({ id, title: d.title })).catch(() => null))).then((r) => setInitial(r.filter(Boolean) as { id: number; title: string }[]))
  }, [sp])

  return (
    <div className="flex flex-col gap-6 max-w-[980px] mx-auto w-full">
      <div>
        <button className="rd-btn secondary sm mb-4" onClick={() => nav(-1)}><ArrowLeft size={16} />Quay lại</button>
        <h1 className="rd-h2 !text-[1.8em]"><GitCompare size={30} className="text-brand-600" />So sánh các bài</h1>
        <p className="rd-sub !mb-0">Khi hai bài nói về cùng một việc, trợ lý sẽ chỉ ra chỗ giống, chỗ khác và chỗ đang mâu thuẫn — để bạn biết nên làm theo bài nào.</p>
      </div>
      {favs.length >= 2 && initial && (
        <div className="rd-card p-4 flex items-center gap-3 flex-wrap">
          <Star size={20} className="text-amber-500" /><b>Chọn nhanh từ bài đã lưu:</b>
          {favs.slice(0, 5).map((f) => <button key={f.id} className="rd-btn secondary sm" onClick={() => { setInitial((x) => { const cur = x || []; return cur.some((d) => d.id === f.id) || cur.length >= 5 ? cur : [...cur, { id: f.id, title: f.title }] }); setKey((k) => k + 1) }}>{f.title.slice(0, 40)}</button>)}
        </div>)}
      {initial && <ComparePanel key={key + ':' + (sp.get('ids') || '')} initial={initial} plain onOpen={(id) => nav(`/items/${id}`)} />}
    </div>)
}
