import { ReactNode, useState } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'
import { AlertCircle, Bot, ChevronLeft, ChevronRight, Loader2, ShieldAlert, Lock } from 'lucide-react'
import { ApiError } from '../lib/api'
import { FRESH_LABEL, FRESH_TONE, RISK_TONE, SENS_LABEL, STATUS_LABEL, STATUS_TONE, TIER_LABEL, TIER_PLAIN, TIER_TONE, TYPE_LABEL } from '../lib/format'
import type { ItemRow, Tag } from '../lib/types'
import { Pill } from './ui'
import { toast } from '../store/ui'
import { AttachImage } from './Attachments'

export const Loading = ({ text = 'Đang tải…' }: { text?: string }) =>
  <div className="empty"><Loader2 className="animate-spin text-brand-600" size={30} /><div>{text}</div></div>

export function ErrorBox({ error, onRetry }: { error: ApiError | string | null; onRetry?: () => void }) {
  if (!error) return null
  const e = typeof error === 'string' ? null : error
  const forbidden = e?.status === 403
  return (
    <div className={clsx('rounded-lg border p-4 flex items-start gap-3', forbidden ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-red-50 border-red-200 text-red-800')}>
      {forbidden ? <ShieldAlert size={20} className="shrink-0 mt-0.5" /> : <AlertCircle size={20} className="shrink-0 mt-0.5" />}
      <div className="flex-1">
        <div className="font-bold">{forbidden ? 'Vai trò của bạn không đủ quyền' : 'Không tải được dữ liệu'}</div>
        <div className="text-sm opacity-90">{typeof error === "string" ? error : error.full}</div>
      </div>
      {onRetry && !forbidden && <button className="btn outline sm" onClick={onRetry}>Thử lại</button>}
    </div>
  )
}

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total?: number; onPage: (p: number) => void }) {
  if (pages <= 1 && !total) return null
  return (
    <div className="flex items-center justify-between mt-4 text-sm">
      <span className="text-muted">{total != null && `${total.toLocaleString('vi-VN')} bản ghi · `}Trang {page}/{Math.max(1, pages)}</span>
      <div className="flex gap-2">
        <button className="btn outline sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} />Trước</button>
        <button className="btn outline sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Sau<ChevronRight size={14} /></button>
      </div>
    </div>
  )
}

export const StatusPill = ({ s }: { s: string }) => <Pill sm tone={STATUS_TONE[s] || 'gray'}>{STATUS_LABEL[s] || s}</Pill>
export const FreshPill = ({ f }: { f?: string }) => f ? <Pill sm tone={FRESH_TONE[f] || 'gray'}>{FRESH_LABEL[f] || f}</Pill> : null
export const RiskPill = ({ r }: { r: string }) => <Pill sm tone={RISK_TONE[r] || 'gray'}>{r}</Pill>
export const TierPill = ({ tier, plain }: { tier?: string; plain?: boolean }) => tier ? <Pill sm tone={TIER_TONE[tier] || 'gray'}>{(plain ? TIER_PLAIN : TIER_LABEL)[tier] || tier}</Pill> : null
export const TypePill = ({ t }: { t: string }) => <Pill sm tone="soft">{TYPE_LABEL[t] || t}</Pill>

export function ItemBadges({ it }: { it: Pick<ItemRow, 'type' | 'status' | 'risk_level' | 'freshness' | 'sensitivity_level'> }) {
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <TypePill t={it.type} /><StatusPill s={it.status} /><RiskPill r={it.risk_level} /><FreshPill f={it.freshness} />
      {it.sensitivity_level === 'restricted' && <Pill sm tone="bad"><Lock size={11} />{SENS_LABEL.restricted}</Pill>}
    </span>
  )
}

export function Tags({ tags }: { tags?: Tag[] }) {
  if (!tags?.length) return null
  // Nhóm kiến thức đứng trước; thẻ do AI gắn có viền nét đứt và độ tin cậy
  const sorted = [...tags].sort((a, b) => (a.kind === 'category' ? 0 : 1) - (b.kind === 'category' ? 0 : 1))
  return <span className="inline-flex gap-1 flex-wrap">{sorted.map((t) => (
    <span key={t.id} title={t.source === 'ai' ? `AI gắn${t.confidence != null ? ` · độ tin cậy ${Math.round(Number(t.confidence) * 100)}%` : ''}` : t.kind === 'category' ? 'Nhóm kiến thức' : 'Chủ đề'}
      className={clsx('text-xs font-bold rounded-md px-2 py-0.5 inline-flex items-center gap-1', t.kind === 'category' ? 'text-white bg-brand-600 border border-brand-600' : 'text-brand-700 bg-brand-50 border border-brand-200', t.source === 'ai' && '!border-dashed')}>
      {t.kind === 'category' ? '' : '#'}{t.name}{t.source === 'ai' && <Bot size={11} className="opacity-70" />}</span>))}</span>
}

/** Chuẩn hóa trích dẫn nguồn trong câu trả lời AI thành liên kết mở bài:
 *  [doc:12] luôn đổi; [12] hoặc [12, 14] chỉ đổi khi số đó đúng là nguồn của câu trả lời (citeIds) — tránh đụng ngoặc số thường. */
export function linkCitations(text: string, citeIds?: number[], titles?: Record<number, string>) {
  const label = (n: number) => { const t = titles?.[n]; return t ? `📄 ${t.length > 42 ? t.slice(0, 40) + '…' : t}`.replace(/[[\]]/g, '') : `tài liệu #${n}` }
  const gap = (str: string, off: number) => (off > 0 && !/\s|\(/.test(str[off - 1]) ? ' ' : '')
  let s = text.replace(/\[doc:(\d+)\]/g, (_m, n: string, off: number, str: string) => `${gap(str, off)}[${label(Number(n))}](#/items/${n})`)
  if (citeIds && citeIds.length) {
    const ok = new Set(citeIds)
    s = s.replace(/\[(\d+(?:\s*[,;]\s*\d+)*)\](?!\()/g, (all, list: string, off: number, str: string) => {
      const ids = list.split(/\s*[,;]\s*/).map(Number)
      return ids.every((n) => ok.has(n)) ? gap(str, off) + ids.map((n) => `[${label(n)}](#/items/${n})`).join(' ') : all
    })
  }
  return s
}

const PLAIN_TERMS: [RegExp, string][] = [
  [/\b(?:source\s+)?tier\s+official\b/gi, 'nguồn chính thống'], [/\b(?:source\s+)?tier\s+reviewed\b/gi, 'nguồn đã kiểm duyệt'],
  [/\b(?:source\s+)?tier\s+unreviewed\b/gi, 'nguồn chưa được kiểm duyệt'], [/\b(?:source\s+)?tier\s+stale\b/gi, 'nguồn đã cũ, cần rà soát lại'],
  [/\bunreviewed\b/gi, 'chưa kiểm duyệt'], [/\breviewed\b/gi, 'đã kiểm duyệt'], [/\bstale\b/gi, 'đã cũ'],
  [/\bsource_policy\b/gi, 'cách chọn nguồn'], [/\bgrounded\b/gi, 'có căn cứ'], [/\bpassages?\b/gi, 'đoạn trích'], [/\bchunks?\b/gi, 'đoạn'],
  [/\bitem\s*#?(\d+)/gi, 'bài #$1'], [/\bOCR\b/g, 'đọc chữ từ ảnh'],
]
/** Thay vài thuật ngữ kỹ thuật AI hay dùng bằng lời thường cho người đọc. */
export const plainWords = (s: string) => PLAIN_TERMS.reduce((acc, [re, to]) => acc.replace(re, to), s)

export function Md({ children, citeIds, citeTitles }: { children: string; citeIds?: number[]; citeTitles?: Record<number, string> }) {
  return (
    <div className="md-body">
      <Markdown remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith('attachment:') ? url : defaultUrlTransform(url))}
        components={{
          a: ({ href, children: c }) => (href && href.startsWith('#/')
            ? <a href={href} onClick={(e) => { e.preventDefault(); window.location.hash = href }} className="cite">{c}</a>
            : <a href={href} target="_blank" rel="noreferrer noopener">{c}</a>),
          img: ({ src, alt }) => { const m = typeof src === 'string' ? /^attachment:(\d+)$/.exec(src) : null; return m ? <AttachImage id={Number(m[1])} alt={alt} className="max-w-full rounded-md border border-line" /> : <img src={src as string} alt={alt} /> },
        }}>{linkCitations(children, citeIds, citeTitles)}</Markdown>
    </div>
  )
}

export function TagPicker({ all, value, onChange }: { all: Tag[]; value: number[]; onChange: (v: number[]) => void }) {
  const [q, setQ] = useState('')
  const list = all.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : value.length >= 20 ? (toast.warn('Tối đa 20 thẻ'), value) : [...value, id])
  return (
    <div className="border-[1.5px] border-line rounded-lg p-3 flex flex-col gap-2">
      <input className="input !py-1.5" placeholder="Lọc thẻ…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-auto">
        {list.length === 0 && <span className="text-muted text-sm">Chưa có thẻ nào{all.length === 0 ? ' (kiểm duyệt viên có thể tạo ở mục Thẻ)' : ''}</span>}
        {list.map((t) => (
          <button type="button" key={t.id} onClick={() => toggle(t.id)}
            className={clsx('text-xs font-bold rounded-md px-3 py-1 border cursor-pointer', value.includes(t.id) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-brand-700 border-brand-200 hover:bg-brand-50')}>
            #{t.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Chạy một thao tác bất đồng bộ với trạng thái busy + toast kết quả. */
export function useBusy() {
  const [busy, setBusy] = useState(false)
  async function run<T>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> {
    setBusy(true)
    try { const r = await fn(); if (okMsg) toast.ok(okMsg); return r } catch (e) { toast.error(e instanceof ApiError ? e.full : e); return undefined } finally { setBusy(false) }
  }
  return { busy, run }
}

export const Spin = () => <Loader2 size={15} className="animate-spin" />
export function Section({ title, right, children, className }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('panel', className)}>
      <div className="panel-head"><div className="panel-title">{title}</div>{right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}</div>
      <div className="panel-body">{children}</div>
    </section>
  )
}
export const KV = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="kv"><span className="k">{k}</span><span className="v">{v ?? '—'}</span></div>
)
