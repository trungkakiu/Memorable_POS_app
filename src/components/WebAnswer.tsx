// Hiển thị câu trả lời tìm trên Internet: trích dẫn [n] bấm được, mức xác minh, thẻ nguồn (hạng nguồn, liên kết còn mở được không),
// câu hỏi gợi ý tiếp theo, đánh giá hữu ích. `plain`: lời lẽ cho người đọc; không plain: thêm số liệu kỹ thuật cho quản trị.
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { AlertTriangle, BadgeCheck, CircleHelp, ExternalLink, Globe2, History, Link2Off, Lock, RefreshCw, ShieldAlert, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Md } from './shared'
import type { LearnedRef, WebCitation, WebInfo } from '../store/chat'

export const TIER_STYLE: Record<WebCitation['tier'], { label: string; cls: string; icon: ReactNode }> = {
  official: { label: 'Chính thống', cls: 'bg-green-50 text-green-800 border-green-200', icon: <BadgeCheck size={13} /> },
  trusted: { label: 'Đáng tin', cls: 'bg-sky-50 text-sky-800 border-sky-200', icon: <ShieldCheck size={13} /> },
  unverified: { label: 'Chưa xác minh', cls: 'bg-slate-100 text-slate-700 border-slate-200', icon: <CircleHelp size={13} /> },
  blocked: { label: 'Bị chặn', cls: 'bg-red-50 text-red-800 border-red-200', icon: <ShieldAlert size={13} /> },
}
const LINK_TEXT: Record<string, { t: string; bad?: boolean }> = {
  ok: { t: 'Liên kết mở được' }, restricted: { t: 'Trang chặn kiểm tra tự động' }, broken: { t: 'Liên kết hỏng', bad: true }, unreachable: { t: 'Không mở được', bad: true },
  refused: { t: 'Không kiểm tra' }, skipped: { t: 'Không kiểm tra' },
}
const LEVEL = { high: { t: 'Cao', c: '#16a34a' }, medium: { t: 'Khá', c: '#d97706' }, low: { t: 'Thấp', c: '#dc2626' } }

/** Đổi [n] trong câu trả lời thành liên kết tới nguồn tương ứng */
export const linkWebCites = (text: string, cites: WebCitation[]) =>
  text.replace(/\[(\d{1,2})\](?!\()/g, (m, n) => { const c = cites.find((x) => x.n === Number(n)); return c ? `[\\[${n}\\]](${c.url})` : m })

const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '')

export function SourceCard({ c, plain }: { c: WebCitation; plain?: boolean }) {
  const t = TIER_STYLE[c.tier] || TIER_STYLE.unverified
  const link = LINK_TEXT[c.link || 'skipped']
  return (
    <a href={c.url} target="_blank" rel="noreferrer noopener" className={clsx('flex items-start gap-3 rounded-lg border bg-white no-underline text-ink hover:border-brand-300 hover:shadow-sm transition', plain ? 'p-3.5' : 'p-2.5', link?.bad && 'opacity-80')}>
      <span className={clsx('shrink-0 grid place-items-center rounded-md font-black text-brand-700 bg-brand-50', plain ? 'w-8 h-8' : 'w-6 h-6 text-xs')}>{c.n}</span>
      <span className="min-w-0 flex-1">
        <span className={clsx('block font-bold leading-snug line-clamp-2', !plain && 'text-[13px]')}>{c.title || c.host}</span>
        <span className="flex flex-wrap items-center gap-1.5 mt-1 text-[0.8em]">
          <span className="text-muted">{c.host}</span>
          <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold', t.cls)} title={c.source_name || undefined}>{t.icon}{t.label}</span>
          {link && <span className={clsx('inline-flex items-center gap-1', link.bad ? 'text-red-700 font-bold' : 'text-muted')}>{link.bad && <Link2Off size={12} />}{link.t}{!plain && c.http_status ? ` (${c.http_status})` : ''}</span>}
        </span>
        {!plain && c.source_name && <span className="block text-[11.5px] text-muted mt-0.5">{c.source_name}{c.rule === 'suffix' ? ' · theo đuôi tên miền' : ''}</span>}
      </span>
      <ExternalLink size={15} className="shrink-0 text-muted mt-1" />
    </a>)
}

export function VerifyMeter({ v, plain }: { v: WebInfo['verification']; plain?: boolean }) {
  const lv = LEVEL[v.level] || LEVEL.low
  return (
    <div className="rounded-lg border border-line-soft bg-white px-3.5 py-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <ShieldCheck size={18} style={{ color: lv.c }} />
        <b>Độ tin cậy của nguồn: <span style={{ color: lv.c }}>{lv.t}</span></b>
        {!plain && <span className="text-muted text-xs">{v.score}/100</span>}
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><i className="block h-full rounded-full" style={{ width: `${Math.max(4, v.score)}%`, background: lv.c }} /></div>
      {v.notes?.length > 0 && <ul className="m-0 pl-5 text-[0.88em] text-ink-2 leading-relaxed">{v.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {!plain && v.coverage !== undefined && <div className="text-[11.5px] text-muted font-mono">chính thống {v.official ?? 0} · đáng tin {v.trusted ?? 0} · chưa xác minh {v.unverified ?? 0} · trang độc lập {v.sites ?? 0} · liên kết tốt {v.links_ok ?? 0}/hỏng {v.links_bad ?? 0} · độ phủ trích dẫn {Math.round((v.coverage || 0) * 100)}%</div>}
    </div>)
}

/** Phần riêng của câu trả lời Internet (đặt sau nội dung trả lời) */
export function WebBlock({ w, plain, onAsk, onRate, onOpenLearned, onRefresh }: {
  w: WebInfo; plain?: boolean; onAsk?: (q: string) => void; onRate?: (helpful: boolean) => void; onOpenLearned?: (id: number) => void; onRefresh?: () => void
}) {
  const official = w.citations.filter((c) => c.tier === 'official').length
  return (
    <div className="flex flex-col gap-3 mt-3 w-full">
      {w.learned && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2.5 text-[0.9em] flex gap-2 items-start">
          <History size={17} className="shrink-0 mt-0.5" />
          <div className="flex-1">Câu trả lời đã được kiểm chứng ngày <b>{fmtDate(w.learned.learned_at)}</b> (chủ đề “{w.learned.topic}”), có thể đã cũ.
            {onRefresh && <div className="mt-1.5"><button className="inline-flex items-center gap-1.5 font-bold text-brand-700 bg-transparent border-0 p-0 cursor-pointer" onClick={onRefresh}><RefreshCw size={14} />Tìm lại thông tin mới nhất</button></div>}</div>
        </div>)}
      {w.fallback_used && <div className="text-[0.85em] text-muted flex items-center gap-1.5"><Globe2 size={14} />Các trang chính thống chưa có thông tin này nên trợ lý đã tìm rộng hơn trên Internet.</div>}
      {w.citations.length > 0 && <VerifyMeter v={w.verification} plain={plain} />}
      {w.citations.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[0.82em] font-bold text-muted">Nguồn{official ? ` (${official} trang chính thống)` : ''} — bấm để mở trang gốc:</div>
          {w.citations.map((c) => <SourceCard key={c.n} c={c} plain={plain} />)}
        </div>)}
      {!plain && (w.queries?.length || w.consulted_count) ? <div className="text-[11.5px] text-muted">Đã tìm: {(w.queries || []).map((q) => `“${q}”`).join(', ')}{w.consulted_count ? ` · xem qua ${w.consulted_count} trang` : ''} · phạm vi {w.scope} → {w.scope_used}</div> : null}
      {w.similar && w.similar.length > 0 && onOpenLearned && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[0.82em] font-bold text-muted">Câu hỏi tương tự đã được trả lời trước đây:</div>
          <div className="flex flex-wrap gap-1.5">{w.similar.map((s: LearnedRef) => <button key={s.id} className="web-chip" onClick={() => onOpenLearned(s.id)} title={`Chủ đề: ${s.topic}`}><History size={13} />{s.question}</button>)}</div>
        </div>)}
      {w.suggestions.length > 0 && onAsk && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[0.82em] font-bold text-muted flex items-center gap-1.5"><Sparkles size={13} />Có thể bạn muốn hỏi tiếp:</div>
          <div className="flex flex-wrap gap-1.5">{w.suggestions.map((s) => <button key={s} className="web-chip" onClick={() => onAsk(s)}>{s}</button>)}</div>
        </div>)}
      {onRate && w.citations.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-[0.88em]">
          {w.feedback ? <span className="text-muted">{w.feedback === 'up' ? 'Cảm ơn bạn! Câu trả lời này sẽ được dùng để gợi ý cho người hỏi sau.' : 'Cảm ơn bạn đã báo. Mình sẽ bớt gợi ý câu trả lời này.'}</span> : (<>
            <span className="text-muted">Câu trả lời có hữu ích không?</span>
            <button className="web-chip" onClick={() => onRate(true)}><ThumbsUp size={14} />Hữu ích</button>
            <button className="web-chip" onClick={() => onRate(false)}><ThumbsDown size={14} />Chưa đúng</button>
          </>)}
        </div>)}
      {plain && <div className="text-[0.82em] text-muted flex items-start gap-1.5"><Lock size={13} className="shrink-0 mt-0.5" />Chỉ câu hỏi của bạn được dùng để tìm trên Internet, không gửi tài liệu của công ty. Thông tin trên mạng có thể thay đổi: việc quan trọng hãy mở trang gốc để kiểm tra.</div>}
      {w.citations.length === 0 && !w.learned && <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 text-[0.9em] flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />Câu trả lời không có nguồn đi kèm, chỉ nên tham khảo.</div>}
    </div>)
}

/** Nội dung câu trả lời Internet (markdown, trích dẫn bấm được) */
export function WebText({ text, w }: { text: string; w: WebInfo }) {
  return <Md>{linkWebCites(text, w.citations)}</Md>
}
