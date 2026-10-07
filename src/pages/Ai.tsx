import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Sparkles, Trash2 } from 'lucide-react'
import { get, post } from '../lib/api'
import { can } from '../lib/permissions'
import { money } from '../lib/format'
import { Pill, PageHeader, Field, Stat } from '../components/ui'
import { ErrorBox, Loading, Section, useBusy } from '../components/shared'
import { AgentBar, Composer, DropOverlay, Messages, useChatDrop } from '../components/chat/Chat'
import { useAuth } from '../store/auth'
import { AiStatus, useChat } from '../store/chat'
import type { ApiError } from '../lib/api'

// Tình trạng AI: 4 điều kiện chính luôn hiện; danh sách tính năng (vài chục mục) gói trong nút bật/tắt để đầu trang gọn
function StatusBadges({ s }: { s: AiStatus }) {
  const [open, setOpen] = useState(false)
  const B = ({ ok, l }: { ok: boolean; l: string }) => <Pill sm tone={ok ? 'ok' : 'bad'}>{ok ? '✓' : '✗'} {l}</Pill>
  const n = s.features?.length || 0
  return (
    <div className="flex flex-col gap-2 items-end max-w-full">
      <div className="flex gap-2 flex-wrap items-center justify-end">
        <B ok={s.api_key_configured} l="Khóa API" /><B ok={s.enabled} l="Đã bật" /><B ok={s.data_policy_approved} l="Chính sách dữ liệu" /><B ok={s.budget_set} l="Ngân sách" />
        {n > 0 && <button type="button" className="more-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Ẩn' : 'Xem'} {n} tính năng đang bật</button>}
      </div>
      {open && <div className="flex gap-1.5 flex-wrap justify-end max-h-[120px] overflow-y-auto">{s.features.map((f) => <Pill key={f} sm tone="soft">{f}</Pill>)}</div>}
    </div>)
}

export default function Ai() {
  const user = useAuth((s) => s.user)!
  const nav = useNavigate()
  const c = useChat()
  const canAsk = can(user.role, 'ask')
  const drop = useChatDrop()
  useEffect(() => { void c.loadStatus() }, []) // eslint-disable-line
  const st = c.status
  return (
    <div className="chat-page flex flex-col gap-4">
      <PageHeader title="Hỏi đáp có trích nguồn" subtitle="Trợ lý chỉ trả lời dựa trên các mục bạn được xem; mục “Hạn chế” không bao giờ gửi cho AI. Có thể mở nhanh ở mọi trang bằng bóng chat (Ctrl+J)." actions={<>{st && <StatusBadges s={st} />}<button className="btn outline" onClick={c.clear}><Trash2 size={15} />Xóa hội thoại</button></>} />
      {st && !st.ready && <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 p-3 flex gap-2 items-center text-sm font-semibold"><AlertTriangle size={18} />AI chưa sẵn sàng — quản trị viên cần cấu hình khóa, bật công tắc, duyệt chính sách dữ liệu và đặt ngân sách (mục Cấu hình máy chủ).</div>}
      {!canAsk && <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm font-semibold">Vai trò của bạn không được dùng chức năng hỏi đáp AI.</div>}
      <div className="chat-panel !static !w-full !h-auto flex-1 min-h-0 !animate-none" style={{ position: 'relative', inset: 'auto' }} {...drop.props}>
        <DropOverlay show={drop.over} />
        <AgentBar />
        <div className="chat-body !p-5"><Messages msgs={c.msgs} busy={c.busy} onPick={(q) => void c.ask(q)} onAsk={(q, m) => void c.ask(q, m)} onOpenItem={(id) => nav(`/items/${id}`)} /></div>
        <Composer drop={drop} disabled={!canAsk} placeholder="Đặt câu hỏi, hoặc kéo thả / dán tệp & ảnh để lưu vào kho tri thức…" />
      </div>
    </div>
  )
}

interface Usage { month_start: string; spent_usd: number; budget_usd: number; remaining_usd: number; calls: number; by_feature: { feature: string; status: string; calls: number; cost_usd: number; input_tokens: number; output_tokens: number }[] }
export function AiTools() {
  const nav = useNavigate()
  const user = useAuth((s) => s.user)!
  const [usage, setUsage] = useState<Usage | null>(null)
  const [uerr, setUerr] = useState<ApiError | null>(null)
  const [st, setSt] = useState<AiStatus | null>(null)
  const [itemId, setItemId] = useState('')
  const [sugg, setSugg] = useState<any>(null)
  const [dups, setDups] = useState<any>(null)
  const [tests, setTests] = useState<any>(null)
  const { busy, run } = useBusy()
  useEffect(() => {
    get<AiStatus>('/ai/status').then(setSt).catch(() => undefined)
    if (can(user.role, 'report')) get<Usage>('/ai/usage').then(setUsage).catch(setUerr)
  }, []) // eslint-disable-line
  const id = Number(itemId)
  const ok = Number.isInteger(id) && id > 0
  return (
    <div className="flex flex-col gap-5 max-w-[1200px]">
      <PageHeader title="Công cụ AI cho nội dung" subtitle="Dành cho người đóng góp trở lên — chọn một mục theo mã số rồi chạy" actions={st && <StatusBadges s={st} />} />
      <Section title="Chọn mục">
        <div className="flex gap-3 items-end flex-wrap">
          <Field label="Mã mục (ID)" className="w-48"><input className="input" inputMode="numeric" value={itemId} onChange={(e) => setItemId(e.target.value.replace(/\D/g, ''))} placeholder="12" /></Field>
          <button className="btn outline" disabled={!ok} onClick={() => nav(`/items/${id}`)}>Mở mục</button>
          <button className="btn" disabled={!ok || busy} onClick={async () => { const r = await run(() => post('/ai/suggest', { item_id: id })); if (r) setSugg(r) }}><Sparkles size={15} />Gợi ý tóm tắt / thẻ / rủi ro</button>
          <button className="btn" disabled={!ok || busy} onClick={async () => { const r = await run(() => post('/ai/duplicates', { item_id: id })); if (r) setDups(r) }}>Phát hiện trùng / mâu thuẫn</button>
          <button className="btn" disabled={!ok || busy} onClick={async () => { const r = await run(() => post('/ai/prompt-tests/run', { item_id: id })); if (r) setTests(r) }}>Chạy kiểm thử prompt</button>
        </div>
      </Section>
      {busy && <Loading text="AI đang xử lý…" />}
      {sugg && <Section title="Gợi ý"><div className="grid gap-2 text-sm"><div><b>Tóm tắt:</b> {sugg.summary}</div><div><b>Rủi ro:</b> <Pill sm tone="warn">{sugg.risk_level}</Pill> {sugg.risk_reason}</div>
        <div className="flex gap-1 flex-wrap"><b>Thẻ:</b>{(sugg.tags || []).map((t: any) => <Pill key={t.id} sm tone="soft">#{t.name}</Pill>)}</div>
        {sugg.missing_info?.length > 0 && <div><b>Còn thiếu:</b> {sugg.missing_info.join(' · ')}</div>}<div className="text-xs text-muted">{sugg.note}</div></div></Section>}
      {dups && <Section title={`Trùng lặp / mâu thuẫn (đã so ${dups.compared} mục)`}>{dups.findings?.length ? dups.findings.map((x: any) => <div key={x.item_id} className="p-3 border border-line rounded-lg mb-2"><Pill sm tone={x.relation === 'contradicts' ? 'bad' : 'warn'}>{x.relation}</Pill> <b>#{x.item_id} {x.title}</b><div className="text-sm mt-1">{x.reason}</div></div>) : <div className="text-green-700 font-semibold">Không phát hiện vấn đề.</div>}</Section>}
      {tests && <Section title={`Kết quả kiểm thử · v${tests.version}`}>{tests.results.map((r: any) => <div key={r.test_id} className="p-3 border border-line rounded-lg mb-2 flex gap-3"><Pill sm tone={r.result === 'pass' ? 'ok' : r.result === 'fail' ? 'bad' : 'gray'}>{r.result}</Pill><div><b>{r.test_name}</b><div className="text-sm text-muted">{r.detail}</div></div></div>)}</Section>}
      {can(user.role, 'report') && (
        <Section title="Mức dùng AI trong tháng">
          {uerr ? <ErrorBox error={uerr} /> : !usage ? <Loading /> : (<>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
              <Stat label="Đã chi" value={`$${usage.spent_usd}`} /><Stat label="Ngân sách" value={`$${usage.budget_usd}`} /><Stat label="Còn lại" value={`$${usage.remaining_usd}`} /><Stat label="Số lần gọi" value={usage.calls} /></div>
            <div className="progress mb-5"><i style={{ width: `${Math.min(100, (usage.spent_usd / Math.max(0.0001, usage.budget_usd)) * 100)}%` }} /></div>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Tính năng</th><th>Trạng thái</th><th className="num">Lần gọi</th><th className="num">Token vào</th><th className="num">Token ra</th><th className="num">Chi phí</th></tr></thead><tbody>
              {usage.by_feature.map((f, i) => <tr key={i}><td className="font-bold">{f.feature}</td><td>{f.status}</td><td className="num">{f.calls}</td><td className="num">{f.input_tokens.toLocaleString('vi-VN')}</td><td className="num">{f.output_tokens.toLocaleString('vi-VN')}</td><td className="num">${f.cost_usd}</td></tr>)}</tbody></table></div></>)}
        </Section>)}
      <div className="hidden">{money(0)}</div>
    </div>
  )
}
