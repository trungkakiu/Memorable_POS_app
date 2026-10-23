import { useEffect, useState } from 'react'
import { ApiError, get } from '../lib/api'
import { Stat } from './ui'
import { ErrorBox, Loading, Section } from './shared'

interface Usage { month_start: string; spent_usd: number; budget_usd: number; remaining_usd: number; calls: number; by_feature: { feature: string; status: string; calls: number; cost_usd: number; input_tokens: number; output_tokens: number }[] }

/** Mức dùng AI trong tháng: chi phí so với ngân sách và chi tiết theo tính năng (cho vai trò xem báo cáo) */
export default function AiUsage() {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [err, setErr] = useState<ApiError | null>(null)
  useEffect(() => { get<Usage>('/ai/usage').then(setUsage).catch(setErr) }, [])
  const pct = usage ? Math.min(100, (usage.spent_usd / Math.max(0.0001, usage.budget_usd)) * 100) : 0
  return (
    <Section title="Mức dùng AI trong tháng" sub="Chi phí AI so với ngân sách đã đặt; vượt ngân sách thì AI tạm dừng">
      {err ? <ErrorBox error={err} /> : !usage ? <Loading /> : (<>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          <Stat label="Đã chi" value={`$${usage.spent_usd}`} /><Stat label="Ngân sách" value={`$${usage.budget_usd}`} /><Stat label="Còn lại" value={`$${usage.remaining_usd}`} /><Stat label="Số lần gọi" value={usage.calls} />
        </div>
        <div className="progress mb-5"><i style={{ width: `${pct}%` }} /></div>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Tính năng</th><th>Trạng thái</th><th className="num">Lần gọi</th><th className="num">Token vào</th><th className="num">Token ra</th><th className="num">Chi phí</th></tr></thead><tbody>
          {usage.by_feature.length === 0 && <tr><td colSpan={6} className="text-muted text-center">Tháng này chưa dùng AI</td></tr>}
          {usage.by_feature.map((f, i) => <tr key={i}><td className="font-bold">{f.feature}</td><td>{f.status}</td><td className="num">{f.calls}</td><td className="num">{f.input_tokens.toLocaleString('vi-VN')}</td><td className="num">{f.output_tokens.toLocaleString('vi-VN')}</td><td className="num font-bold">${f.cost_usd}</td></tr>)}
        </tbody></table></div></>)}
    </Section>)
}
