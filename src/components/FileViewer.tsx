import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'
import { AlertCircle, Download, ExternalLink, FileQuestion, Loader2, Maximize2, Minimize2, Presentation } from 'lucide-react'
import { ApiError, deskApi, download, fetchAttachment } from '../lib/api'
import { bytes as fmtBytes, FILE_ICON } from '../lib/format'
import { KIND_LABEL, Preview, base64ToBytes, buildPreview, bytesToBase64, extOf, kindOf, releasePreview } from '../lib/preview'
import { Modal, Pill } from './ui'
import { AttachAiActions, TextBadge } from './AttachAi'
import type { Attachment } from '../lib/types'
import { toast } from '../store/ui'

export type FileSource =
  | { type: 'att'; id: number; name: string; size?: number; att?: Attachment }
  | { type: 'local'; name: string; bytes: Uint8Array }

// Bản xem trước của tệp đính kèm trên máy chủ được nhớ lại để mở lần sau không phải tải lại.
const attCache = new Map<number, Promise<{ preview: Preview; base64: string }>>()
function loadAtt(id: number, name: string) {
  let p = attCache.get(id)
  if (!p) {
    p = fetchAttachment(id, kindOf(name) === 'image').then(async (r) => ({ preview: await buildPreview(name, base64ToBytes(r.base64)), base64: r.base64 }))
    p.catch(() => attCache.delete(id))
    attCache.set(id, p)
  }
  return p
}

export const forgetPreview = (id: number) => { attCache.delete(id) }

function useLoaded(src: FileSource) {
  const [state, setState] = useState<{ loading: boolean; error: string; preview: Preview | null; base64: string }>({ loading: true, error: '', preview: null, base64: '' })
  const key = src.type === 'att' ? `a${src.id}` : `l${src.name}:${src.bytes.length}`
  useEffect(() => {
    let on = true; let own: Preview | null = null
    setState({ loading: true, error: '', preview: null, base64: '' })
    const p = src.type === 'att'
      ? loadAtt(src.id, src.name)
      : buildPreview(src.name, src.bytes).then((preview) => { own = preview; return { preview, base64: '' } })
    p.then((r) => on && setState({ loading: false, error: '', preview: r.preview, base64: r.base64 }))
      .catch((e) => on && setState({ loading: false, error: e instanceof ApiError ? e.full : `Không xem trước được: ${(e as Error).message}`, preview: null, base64: '' }))
    return () => { on = false; if (own) releasePreview(own) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

export async function openExternally(src: FileSource, base64?: string) {
  try {
    const b64 = base64 || (src.type === 'local' ? bytesToBase64(src.bytes) : (await fetchAttachment(src.id)).base64)
    const r = await deskApi().openExternal({ name: src.name, base64: b64 })
    if (!r.ok) throw new Error(r.error)
    toast.ok('Đã mở bằng ứng dụng mặc định của máy')
  } catch (e) { toast.error(e) }
}

function Body({ p, name, height, ext }: { p: Preview; name: string; height: number | string; ext: () => void }) {
  const [zoom, setZoom] = useState(false)
  const [sheet, setSheet] = useState(0)
  switch (p.type) {
    case 'image':
      return (
        <div className="relative overflow-auto bg-[repeating-conic-gradient(#f3f0fa_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] rounded-lg border border-line-soft" style={{ height }}>
          <button className="btn outline sm absolute top-2 right-2 z-10" onClick={() => setZoom(!zoom)}>{zoom ? <Minimize2 size={13} /> : <Maximize2 size={13} />}{zoom ? 'Vừa khung' : 'Kích thước thật'}</button>
          <div className={clsx('min-h-full grid place-items-center p-3', zoom && 'inline-grid min-w-full')}>
            <img src={p.url} alt={name} className={clsx('rounded-md shadow', zoom ? 'max-w-none' : 'max-w-full max-h-full object-contain')} style={zoom ? undefined : { maxHeight: typeof height === 'number' ? height - 24 : undefined }} />
          </div>
        </div>)
    case 'pdf':
      return (
        <div className="relative rounded-lg border border-line-soft overflow-hidden bg-slate-100" style={{ height }}>
          <iframe title={name} src={p.url} className="w-full h-full border-0" />
          <button className="btn outline sm absolute bottom-3 right-3" onClick={ext}><ExternalLink size={13} />Mở bằng ứng dụng khác</button>
        </div>)
    case 'text':
      return <pre className="m-0 text-[13px] whitespace-pre-wrap font-mono bg-brand-50 border border-line-soft rounded-lg p-4 overflow-auto" style={{ maxHeight: height }}>{p.text}{p.truncated && '\n… (đã cắt bớt, tệp quá dài)'}</pre>
    case 'md':
      return <div className="border border-line-soft rounded-lg p-4 overflow-auto bg-white" style={{ maxHeight: height }}><div className="md-body"><Markdown remarkPlugins={[remarkGfm]}>{p.text}</Markdown></div></div>
    case 'html':
      return (
        <div className="border border-line-soft rounded-lg p-5 overflow-auto bg-white" style={{ maxHeight: height }}>
          <div className="md-body" dangerouslySetInnerHTML={{ __html: p.html }} />
          {p.notes?.length ? <div className="text-xs text-amber-800 mt-3">Một số định dạng phức tạp có thể hiển thị chưa đầy đủ.</div> : null}
        </div>)
    case 'table': {
      const s = p.sheets[Math.min(sheet, p.sheets.length - 1)]
      const cols = Math.max(1, ...s.rows.map((r) => r.length))
      return (
        <div className="flex flex-col gap-2">
          {p.sheets.length > 1 && <div className="flex gap-1.5 flex-wrap">{p.sheets.map((x, i) => <button key={i} className={clsx('cat-chip !py-1 !text-xs', i === sheet && 'on')} onClick={() => setSheet(i)}>{x.name}</button>)}</div>}
          <div className="tbl-wrap !shadow-none" style={{ maxHeight: height }}>
            <table className="tbl"><thead><tr><th className="center w-10">#</th>{Array.from({ length: cols }, (_, i) => <th key={i}>{String.fromCharCode(65 + (i % 26))}{i >= 26 ? Math.floor(i / 26) : ''}</th>)}</tr></thead>
              <tbody>{s.rows.map((r, i) => <tr key={i}><td className="center text-muted">{i + 1}</td>{Array.from({ length: cols }, (_, j) => <td key={j} className="whitespace-nowrap max-w-[280px] truncate" title={r[j]}>{r[j]}</td>)}</tr>)}</tbody></table>
          </div>
          {s.truncated && <div className="text-xs text-muted">Chỉ hiển thị 300 dòng đầu — tải tệp về để xem đầy đủ.</div>}
        </div>)
    }
    case 'slides':
      return (
        <div className="grid sm:grid-cols-2 gap-3 overflow-auto" style={{ maxHeight: height }}>
          {p.slides.map((t, i) => (
            <div key={i} className="border border-line rounded-lg bg-white overflow-hidden">
              <div className="px-3 py-1.5 bg-brand-50 border-b border-line-soft text-[11px] font-bold uppercase text-brand-700 flex items-center gap-1.5"><Presentation size={12} />Slide {i + 1}</div>
              <div className="p-3 text-sm whitespace-pre-wrap leading-relaxed min-h-[96px]">{t || <span className="text-muted">(slide không có văn bản)</span>}</div>
            </div>))}
        </div>)
    default:
      return (
        <div className="empty" style={{ minHeight: 160 }}><FileQuestion size={34} strokeWidth={1.5} /><div className="t">{p.reason}</div>
          <button className="btn outline sm" onClick={ext}><ExternalLink size={13} />Mở bằng ứng dụng mặc định</button></div>)
  }
}

/** Khung xem trước dùng chung cho mọi loại tệp (nhúng trực tiếp trong trang hoặc trong hộp thoại). */
export function FileViewer({ src, height = 460, toolbar = true }: { src: FileSource; height?: number | string; toolbar?: boolean }) {
  const st = useLoaded(src)
  const kind = kindOf(src.name)
  const size = src.type === 'local' ? src.bytes.length : src.size
  const ext = () => void openExternally(src, st.base64 || undefined)
  async function dl() {
    if (src.type !== 'att') return ext()
    try { const r = await download(`/attachments/${src.id}/download`, undefined, src.name); if (r.ok) toast.ok('Đã tải tệp') } catch (e) { toast.error(e) }
  }
  return (
    <div className="flex flex-col gap-2.5 min-w-0">
      {toolbar && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl">{FILE_ICON[extOf(src.name)] || '📎'}</span>
          <b className="truncate min-w-0 flex-1" title={src.name}>{src.name}</b>
          <Pill sm tone="soft">{KIND_LABEL[kind]}</Pill>{size != null && <span className="text-xs text-muted">{fmtBytes(size)}</span>}
          <button className="btn outline sm" onClick={dl}><Download size={13} />{src.type === 'att' ? 'Tải xuống' : 'Mở ngoài'}</button>
          {src.type === 'att' && <button className="btn outline sm" onClick={ext}><ExternalLink size={13} />Mở ngoài</button>}
          {src.type === 'att' && src.att && <><TextBadge att={src.att} /><AttachAiActions att={src.att} /></>}
        </div>)}
      {st.loading ? <div className="empty" style={{ minHeight: 140 }}><Loader2 className="animate-spin text-brand-500" /><div className="t">Đang chuẩn bị bản xem trước…</div></div>
        : st.error ? <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 p-3 text-sm flex gap-2"><AlertCircle size={16} className="shrink-0 mt-0.5" />{st.error}</div>
          : st.preview && <Body p={st.preview} name={src.name} height={height} ext={ext} />}
    </div>)
}

/** Hộp thoại xem trước toàn màn hình nhỏ. */
export function PreviewModal({ src, onClose }: { src: FileSource; onClose: () => void }) {
  const holder = useRef<HTMLDivElement>(null)
  return (
    <Modal title="Xem trước tệp" size="xl" onClose={onClose}>
      <div ref={holder}><FileViewer src={src} height="68vh" /></div>
    </Modal>)
}
