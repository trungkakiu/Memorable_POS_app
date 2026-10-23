// Cách làm việc cho khối Sản xuất: danh sách hướng dẫn làm theo từng bước, chữ to, có ô tìm.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpenCheck, Loader2, Search } from 'lucide-react'
import { ApiError, get } from '../lib/api'
import type { ItemRow } from '../lib/types'

export default function FieldGuides() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<ItemRow[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const h = setTimeout(() => {
      get<{ items: ItemRow[] }>('/items', { type: 'runbook', q: q.trim() || undefined, limit: 50, sort: 'title' })
        .then((r) => { setRows(r.items); setErr('') }).catch((e) => setErr(e instanceof ApiError ? e.full : String(e)))
    }, q ? 300 : 0)
    return () => clearTimeout(h)
  }, [q])
  return (
    <div className="flex flex-col gap-5">
      <h1 className="fd-title">Cách làm việc</h1>
      <label className="fd-search"><Search size={26} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm: máy bơm, bón phân…" aria-label="Tìm hướng dẫn" /></label>
      {err && <div className="fd-card text-red-700">{err}</div>}
      {!rows && !err && <div className="fd-wait"><Loader2 size={30} className="animate-spin" />Đang tải…</div>}
      {rows && rows.length === 0 && <div className="fd-card text-center text-muted">{q ? 'Không thấy hướng dẫn nào khớp. Thử từ khác, hoặc bấm "Hỏi" để hỏi trợ lý.' : 'Chưa có hướng dẫn nào.'}</div>}
      <div className="flex flex-col gap-3">
        {rows?.map((it) => (
          <button key={it.id} className="fd-guide" onClick={() => nav(`/items/${it.id}`)}>
            <BookOpenCheck size={30} /><span className="min-w-0 flex-1"><b>{it.title}</b>{it.summary && <small>{it.summary}</small>}</span><span className="go">Xem</span>
          </button>))}
      </div>
    </div>)
}
