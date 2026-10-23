// Báo hỏng cho khối Sản xuất: nói chuyện gì xảy ra, chọn có phải ngừng việc không, gửi.
// Gửi xong: báo đã gửi tổ trưởng, nếu có cách tự sửa thì gợi ý làm theo từng bước.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { CheckCircle2, Clock, Loader2, Mic, Send, Square, Wrench } from 'lucide-react'
import { ApiError, get, post } from '../lib/api'
import { ago, type IncidentRow, type RunbookSuggestion } from '../lib/incident'
import { toast } from '../store/ui'
import { useVoice } from './voice'

const PLACES = ['Máy móc', 'Điện', 'Nước', 'Kho', 'Vườn, ruộng', 'Xưởng', 'Khác']
const STATE: Record<string, { t: string; cls: string }> = { open: { t: 'Đang chờ', cls: 'wait' }, investigating: { t: 'Đang sửa', cls: 'doing' }, resolved: { t: 'Đã xong', cls: 'done' } }

export default function FieldReport() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  // Từ trang "Xem vườn, máy": câu báo hỏng soạn sẵn, và đã chọn sẵn có phải ngừng việc không
  const pre = sp.get('chuyen') || ''
  const [text, setText] = useState(pre)
  const [stop, setStop] = useState<boolean | null>(pre ? sp.get('ngung') === '1' : null)
  const [place, setPlace] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ id: number; sugg: RunbookSuggestion[] } | null>(null)
  const [mine, setMine] = useState<IncidentRow[]>([])
  const voice = useVoice((t) => setText((cur) => (cur ? `${cur} ${t}` : t)))
  const loadMine = () => get<{ incidents: IncidentRow[] }>('/incidents', { mine: true, limit: 5 }).then((r) => setMine(r.incidents)).catch(() => undefined)
  useEffect(() => { void loadMine() }, [])

  async function submit() {
    const t = text.trim()
    if (t.length < 5) { toast.warn('Vui lòng mô tả rõ hơn sự việc đã xảy ra.'); return }
    setBusy(true)
    try {
      const title = (t.split(/[.!?\n]/)[0] || t).trim().slice(0, 120)
      const inc = await post<{ id: number }>('/incidents', { title: title.length >= 3 ? title : t.slice(0, 120), description: t, system: place || 'Chưa rõ', severity: stop ? 'high' : 'medium' })
      const sugg = await get<RunbookSuggestion[]>('/incidents/suggest-runbooks', { text: `${place} ${t}`.slice(0, 900), limit: 2 }).catch(() => [] as RunbookSuggestion[])
      setDone({ id: inc.id, sugg }); setText(''); setStop(null); setPlace(''); void loadMine()
    } catch (e) { toast.error(e instanceof ApiError ? e.full : e) } finally { setBusy(false) }
  }

  if (done) return (
    <div className="flex flex-col gap-5">
      <div className="fd-ok"><CheckCircle2 size={56} /><b>Đã gửi báo hỏng</b><span>Tổ trưởng và bộ phận kỹ thuật sẽ xem ngay. Mã số của bạn: <b>#{done.id}</b></span></div>
      {done.sugg.length > 0 && (
        <div className="fd-card">
          <b className="block text-[1.1em] mb-2">Trong lúc chờ, có thể tự sửa theo hướng dẫn:</b>
          {done.sugg.map((s) => (
            <button key={s.id} className="fd-guide" onClick={() => nav(`/items/${s.id}?run=1&incident=${done.id}`)}><Wrench size={28} /><span className="min-w-0 flex-1"><b>{s.title}</b><small>{s.steps} bước</small></span><span className="go">Làm theo</span></button>))}
        </div>)}
      <button className="fd-btn soft lg" onClick={() => setDone(null)}>Báo việc khác</button>
    </div>)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="fd-title">Báo hỏng</h1>

      <div className="fd-card">
        <div className="fd-step"><b>1</b>Chuyện gì xảy ra?</div>
        <div className="fd-say">
          <button className={clsx('fd-mic sm', voice.state === 'on' && 'on')} disabled={voice.state === 'busy'} onClick={voice.toggle} aria-label={voice.state === 'on' ? 'Bấm để dừng' : 'Bấm để nói'}>
            {voice.state === 'busy' ? <Loader2 size={40} className="animate-spin" /> : voice.state === 'on' ? <Square size={36} /> : <Mic size={44} />}
          </button>
          <span>{voice.state === 'on' ? `Đang nghe… ${voice.secs} giây. Chạm lần nữa để dừng` : voice.state === 'busy' ? 'Đang chuyển lời nói thành chữ…' : 'Chạm nút rồi nói, hoặc gõ vào ô bên dưới'}</span>
        </div>
        <textarea className="fd-text" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="Ví dụ: Máy bơm số 2 không chạy, có mùi khét." />
      </div>

      <div className="fd-card">
        <div className="fd-step"><b>2</b>Có phải ngừng việc không?</div>
        <div className="fd-two">
          <button className={clsx('fd-choice bad', stop === true && 'on')} onClick={() => setStop(true)}>Có, phải ngừng</button>
          <button className={clsx('fd-choice', stop === false && 'on')} onClick={() => setStop(false)}>Chưa, vẫn làm được</button>
        </div>
      </div>

      <div className="fd-card">
        <div className="fd-step"><b>3</b>Ở đâu? <span className="text-muted font-semibold text-[0.8em]">(không bắt buộc)</span></div>
        <div className="fd-chips">{PLACES.map((p) => <button key={p} className={clsx(place === p && 'on')} onClick={() => setPlace(place === p ? '' : p)}>{p}</button>)}</div>
      </div>

      <button className="fd-btn danger lg" disabled={busy || text.trim().length < 5 || stop === null} onClick={() => void submit()}>
        {busy ? <Loader2 size={28} className="animate-spin" /> : <Send size={28} />}Gửi báo hỏng</button>
      {(text.trim().length >= 5 && stop === null) && <div className="text-center text-muted">Hãy chọn ở bước 2 rồi chạm Gửi</div>}

      {mine.length > 0 && (
        <div className="fd-card">
          <b className="block text-[1.05em] mb-2">Đã báo trước đây</b>
          {mine.map((r) => (
            <div key={r.id} className="fd-mine"><span className={clsx('st', STATE[r.status]?.cls)}>{STATE[r.status]?.t}</span><span className="min-w-0 flex-1"><b>{r.title}</b><small><Clock size={14} />{ago(r.detected_at)}</small></span></div>))}
        </div>)}
    </div>)
}
