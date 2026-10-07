import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { AlertCircle, CheckCircle2, Clipboard, ClipboardPaste, Download, Eye, FileUp, Image as ImageIcon, Info, Loader2, Paperclip, Replace, Trash2, UploadCloud, X } from 'lucide-react'
import {
  ApiError, LocalFile, checkFile, del, download, fetchAttachment, forgetAttachment, fromBrowserFile, get, isAiVisionName, isAudioName, pickLocalFiles, uploadAttachment, uploadAttachments, AUDIO_MB, UPLOAD_MB,
} from '../lib/api'
import { bytes as fmtBytes, FILE_ICON } from '../lib/format'
import { KIND_LABEL, extOf, isPreviewable, kindOf } from '../lib/preview'
import type { Attachment } from '../lib/types'
import { FileSource, FileViewer, PreviewModal } from './FileViewer'
import { Empty, Pill } from './ui'
import { AttachAiActions, ExtractModal, TextBadge } from './AttachAi'
import { confirmDialog, toast } from '../store/ui'

const isImg = (n: string) => kindOf(n) === 'image'
const isAiText = (n: string) => ['text', 'md', 'csv'].includes(kindOf(n))

/** Ảnh đính kèm tải qua API (cần token) nên hiển thị bằng data URL. */
export function AttachImage({ id, alt, className, onClick }: { id: number; alt?: string; className?: string; onClick?: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => { let on = true; fetchAttachment(id, true).then((r) => on && setSrc(r.dataUrl)).catch(() => on && setErr(true)); return () => { on = false } }, [id])
  if (err) return <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1"><AlertCircle size={12} />Không tải được ảnh #{id}</span>
  if (!src) return <span className={clsx('inline-flex items-center justify-center bg-brand-50 border border-line-soft rounded-md', className)} style={{ minHeight: 40, minWidth: 60 }}><Loader2 size={16} className="animate-spin text-brand-500" /></span>
  return <img src={src} alt={alt || `Ảnh đính kèm #${id}`} className={clsx(onClick && 'cursor-zoom-in', className)} onClick={onClick} />
}

/** Ảnh thu nhỏ của tệp cục bộ (chưa tải lên). */
function LocalThumb({ file, className }: { file: LocalFile; className?: string }) {
  const url = useMemo(() => (isImg(file.name) && file.bytes ? URL.createObjectURL(new Blob([file.bytes as BlobPart])) : null), [file])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url ? <img src={url} alt="" className={clsx('object-cover rounded-md border border-line-soft', className)} />
    : <span className={clsx('grid place-items-center text-2xl bg-brand-50 rounded-md border border-line-soft', className)}>{FILE_ICON[extOf(file.name)] || '📎'}</span>
}

/** Ô nhỏ hiển thị tệp đính kèm: ảnh → thumbnail, loại khác → biểu tượng + tên. Bấm để xem trước. */
export function AttachChip({ att, size = 64, onOpen }: { att: Attachment; size?: number; onOpen: (a: Attachment) => void }) {
  const image = isImg(att.filename)
  return (
    <button className="group relative border border-line rounded-lg bg-white overflow-hidden cursor-pointer text-left hover:border-brand-400 hover:shadow transition" style={{ width: image ? size : undefined, height: size }}
      title={`${att.filename} — bấm để xem trước`} onClick={() => onOpen(att)}>
      {image ? <AttachImage id={att.id} alt={att.filename} className="w-full h-full object-cover" />
        : <span className="flex items-center gap-2 h-full px-2.5 pr-3"><span className="text-2xl">{FILE_ICON[att.filetype] || '📎'}</span>
          <span className="min-w-0"><span className="block text-xs font-bold truncate max-w-[130px]">{att.filename}</span><span className="block text-[10.5px] text-muted">{KIND_LABEL[kindOf(att.filename)]} · {fmtBytes(att.filesize)}</span></span></span>}
      <span className="absolute inset-0 bg-brand-900/0 group-hover:bg-brand-900/25 transition grid place-items-center opacity-0 group-hover:opacity-100 text-white"><Eye size={18} /></span>
    </button>)
}

/** Dải tệp đính kèm của một mục: tự tải khi hiện ra màn hình, bấm để xem trước. Dùng trong chat, tìm kiếm… */
export function AttachStrip({ itemId, size = 56, max = 8, atts: given, label = true }: { itemId?: number; size?: number; max?: number; atts?: Attachment[]; label?: boolean }) {
  const [atts, setAtts] = useState<Attachment[] | null>(given ?? null)
  const [view, setView] = useState<Attachment | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (given || itemId == null) return
    const el = ref.current; if (!el) return
    let done = false
    const load = () => { if (done) return; done = true; get<Attachment[]>(`/items/${itemId}/attachments`).then((r) => setAtts(Array.isArray(r) ? r : [])).catch(() => setAtts([])) }
    // Tải khi hiện ra màn hình; có hẹn giờ dự phòng (cửa sổ ẩn/nền thì IntersectionObserver không chạy) và giãn cách để không dồn yêu cầu.
    const timer = window.setTimeout(load, 700 + Math.random() * 1200)
    if (typeof IntersectionObserver === 'undefined') { load(); return () => window.clearTimeout(timer) }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { window.clearTimeout(timer); load(); io.disconnect() } }, { rootMargin: '120px' })
    io.observe(el)
    return () => { io.disconnect(); window.clearTimeout(timer) }
  }, [itemId, given])
  useEffect(() => { if (given) setAtts(given) }, [given])
  if (atts && atts.length === 0) return <div ref={ref} />
  return (
    <div ref={ref} className="flex flex-col gap-1.5">
      {atts == null ? <div className="h-3" /> : (<>
        {label && <div className="text-[10.5px] font-bold uppercase text-muted tracking-wide flex items-center gap-1"><Paperclip size={11} />Tệp đính kèm ({atts.length})</div>}
        <div className="flex gap-2 flex-wrap">{atts.slice(0, max).map((a) => <AttachChip key={a.id} att={a} size={size} onOpen={setView} />)}
          {atts.length > max && <span className="self-center text-xs text-muted">+{atts.length - max} tệp</span>}</div>
      </>)}
      {view && <PreviewModal src={{ type: 'att', id: view.id, name: view.filename, size: view.filesize }} onClose={() => setView(null)} />}
    </div>)
}

/** Lưới tệp đính kèm có khung xem trước nhúng sẵn (tự mở tệp xem được đầu tiên). */
export function AttachmentGrid({ atts, canWrite, onChange, onInsert, inline = true }: { atts: Attachment[]; canWrite: boolean; onChange: () => void; onInsert?: (md: string) => void; inline?: boolean }) {
  const [sel, setSel] = useState<number | null>(null)
  const [modal, setModal] = useState<Attachment | null>(null)
  useEffect(() => {
    if (!inline) return
    if (sel != null && atts.some((a) => a.id === sel)) return
    setSel(atts.find((a) => isPreviewable(a.filename))?.id ?? null)
  }, [atts, inline]) // eslint-disable-line
  async function dl(a: Attachment) { try { const r = await download(`/attachments/${a.id}/download`, undefined, a.filename); if (r.ok) toast.ok('Đã tải tệp') } catch (e) { toast.error(e) } }
  async function rm(a: Attachment) {
    if (!(await confirmDialog('Gỡ tệp đính kèm', `Gỡ “${a.filename}” khỏi mục?`, { danger: true, okText: 'Gỡ' }))) return
    try { await del(`/attachments/${a.id}`); forgetAttachment(a.id); toast.ok('Đã gỡ tệp'); onChange() } catch (e) { toast.error(e) }
  }
  const md = (a: Attachment) => `![${a.filename.replace(/\.[^.]+$/, '')}](attachment:${a.id})`
  if (atts.length === 0) return <Empty text="Chưa có tệp đính kèm" icon={<FileUp size={34} strokeWidth={1.5} />} />
  const current = atts.find((a) => a.id === sel)
  return (
    <div className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {atts.map((a) => {
          const image = isImg(a.filename); const can = isPreviewable(a.filename)
          return (
            <div key={a.id} className={clsx('border rounded-lg bg-white overflow-hidden flex flex-col transition', sel === a.id ? 'border-brand-500 ring-2 ring-brand-200' : 'border-line')}>
              <button className={clsx('h-28 bg-brand-50 grid place-items-center border-0 border-b border-line-soft p-0', can ? 'cursor-pointer' : 'cursor-default')}
                onClick={() => { if (!can) return; if (inline) setSel(a.id); else setModal(a) }} aria-label={`Xem ${a.filename}`}>
                {image ? <AttachImage id={a.id} alt={a.filename} className="max-h-28 max-w-full object-contain" /> : <span className="text-5xl">{FILE_ICON[a.filetype] || '📎'}</span>}
              </button>
              <div className="p-3 flex flex-col gap-2 flex-1">
                <div className="min-w-0"><div className="font-bold truncate" title={a.filename}>{a.filename}</div>
                  <div className="text-xs text-muted flex items-center gap-1.5 mt-0.5 flex-wrap">{KIND_LABEL[kindOf(a.filename)]} · {fmtBytes(a.filesize)}
                    <TextBadge att={a} /></div></div>
                <div className="flex gap-1.5 flex-wrap mt-auto">
                  {can && <button className="btn outline sm" onClick={() => (inline ? setSel(a.id) : setModal(a))}><Eye size={13} />Xem</button>}
                  <button className="btn outline sm" onClick={() => dl(a)}><Download size={13} />Tải</button>
                  <AttachAiActions att={a} onChanged={onChange} />
                  {image && <button className="btn outline sm" title="Sao chép mã Markdown để dán vào nội dung" onClick={() => { void navigator.clipboard.writeText(md(a)); toast.ok('Đã sao chép mã Markdown ảnh') }}><Clipboard size={13} />MD</button>}
                  {image && onInsert && <button className="btn sm" onClick={() => onInsert(md(a))}><Replace size={13} />Chèn vào nội dung</button>}
                  {canWrite && <button className="btn ghost sm icon ml-auto" title="Gỡ tệp" onClick={() => rm(a)}><Trash2 size={14} /></button>}
                </div>
              </div>
            </div>)
        })}
      </div>
      {inline && current && isPreviewable(current.filename) && (
        <div className="border border-line rounded-lg p-4 bg-brand-50/40">
          <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-bold uppercase tracking-wide text-muted">Xem trước</span>
            <button className="btn ghost sm" onClick={() => setModal(current)}>Mở rộng</button></div>
          <FileViewer key={current.id} toolbar src={{ type: 'att', id: current.id, name: current.filename, size: current.filesize, att: current }} height={440} />
        </div>)}
      {modal && <PreviewModal src={{ type: 'att', id: modal.id, name: modal.filename, size: modal.filesize, att: modal }} onClose={() => setModal(null)} />}
    </div>)
}

type Job = { key: number; file: LocalFile; status: 'wait' | 'run' | 'ok' | 'err'; msg?: string; masked?: boolean; warn?: string[]; needMask?: boolean; attId?: number }
let jobSeq = 1

/** Vùng tải lên: kéo-thả, chọn nhiều tệp, chọn ảnh, dán ảnh từ clipboard (Ctrl+V). */
export function Uploader({ itemId, onUploaded, compact }: { itemId: number; onUploaded: () => void; compact?: boolean }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [over, setOver] = useState(false)
  const [confirmMasked, setConfirmMasked] = useState(false)
  const [local, setLocal] = useState<FileSource | null>(null)
  const [extract, setExtract] = useState<{ id: number; filename: string } | null>(null)
  const running = useRef(false)
  const zone = useRef<HTMLDivElement>(null)
  const patch = (key: number, p: Partial<Job>) => setJobs((j) => j.map((x) => (x.key === key ? { ...x, ...p } : x)))

  const runQueue = useCallback(async (list: Job[], masked: boolean) => {
    if (running.current || !list.length) return
    running.current = true
    list.forEach((j) => patch(j.key, { status: 'run', msg: undefined }))
    try {
      // Gửi cả lô bằng multipart/form-data (tối đa 10 tệp mỗi yêu cầu); API báo riêng từng tệp.
      const outs = await uploadAttachments(itemId, list.map((j) => j.file), masked || list.some((j) => j.masked))
      let any = false
      outs.forEach((o) => {
        const j = list.find((x) => x.file === o.file)
        if (!j) return
        if (o.ok && o.att) {
          any = true
          patch(j.key, { status: 'ok', attId: o.att.id, warn: [...(o.att.warnings || []), ...(o.att.duplicate_of ? [`Trùng với tệp #${o.att.duplicate_of}`] : [])] })
        } else {
          const st = o.status || 0; const text = isAiText(j.file.name)
          patch(j.key, { status: 'err', msg: st === 409 ? 'Tệp này đã được đính kèm vào mục' : st === 413 ? `Tệp vượt quá ${UPLOAD_MB} MB (hoặc quá 10 tệp một lần)` : st === 415 ? (o.message || 'Loại tệp không được phép hoặc nội dung không khớp đuôi tệp') : st === 403 ? 'Chỉ chủ sở hữu mục (hoặc quản trị) mới được đính kèm' : (o.message || 'Tải lên thất bại'), needMask: st === 422 && text })
        }
      })
      if (any) onUploaded()
    } catch (e) {
      list.forEach((j) => patch(j.key, { status: 'err', msg: (e as Error).message }))
    } finally { running.current = false }
  }, [itemId, onUploaded])

  const enqueue = useCallback((files: LocalFile[]) => {
    if (!files.length) return
    const list: Job[] = files.map((file) => {
      const bad = checkFile(file)
      return { key: jobSeq++, file, status: bad ? 'err' : 'wait', msg: bad || undefined }
    })
    setJobs((j) => [...list, ...j].slice(0, 30))
    void runQueue(list.filter((x) => x.status === 'wait'), confirmMasked)
  }, [runQueue, confirmMasked])

  async function pick(images: boolean) { try { enqueue(await pickLocalFiles(images)) } catch (e) { toast.error(e) } }
  async function onDrop(e: DragEvent) {
    e.preventDefault(); setOver(false)
    const fs = Array.from(e.dataTransfer.files)
    if (fs.length) enqueue(await Promise.all(fs.map(fromBrowserFile)))
  }
  useEffect(() => {
    const h = async (e: ClipboardEvent) => {
      if (!zone.current || !zone.current.offsetParent) return
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName) && !zone.current.contains(t)) return
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'))
      if (!files.length) return
      e.preventDefault()
      const named = files.map((f, i) => new File([f], f.name && f.name !== 'image.png' ? f.name : `anh-dan-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}-${i + 1}.${f.type.includes('jpeg') ? 'jpg' : 'png'}`, { type: f.type }))
      enqueue(await Promise.all(named.map(fromBrowserFile)))
    }
    document.addEventListener('paste', h)
    return () => document.removeEventListener('paste', h)
  }, [enqueue])

  const retryMasked = (j: Job) => { patch(j.key, { masked: true, status: 'wait', msg: undefined }); void runQueue([{ ...j, masked: true }], true) }
  const busy = jobs.some((j) => j.status === 'run' || j.status === 'wait')

  return (
    <div className="flex flex-col gap-3">
      <div ref={zone} tabIndex={0}
        className={clsx('border-2 border-dashed rounded-lg text-center transition-colors outline-none', compact ? 'p-4' : 'p-7', over ? 'border-brand-500 bg-brand-100' : 'border-brand-200 bg-brand-50 hover:border-brand-400')}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <UploadCloud size={compact ? 26 : 34} className="mx-auto text-brand-500" strokeWidth={1.6} />
        <div className="font-bold mt-1.5">Kéo thả tệp vào đây hoặc dán ảnh (Ctrl+V)</div>
        <div className="text-xs text-muted mt-1">Ảnh, PDF, Word/Excel/PowerPoint, văn bản, CSV, JSON, ZIP… · tối đa {UPLOAD_MB} MB/tệp · 10 tệp mỗi lần</div>
        <div className="flex gap-2 justify-center mt-3 flex-wrap">
          <button className="btn" disabled={busy} onClick={() => pick(false)}><FileUp size={15} />Chọn tệp</button>
          <button className="btn outline" disabled={busy} onClick={() => pick(true)}><ImageIcon size={15} />Chọn ảnh</button>
          <span className="hidden md:inline-flex items-center gap-1 text-xs text-muted px-2"><ClipboardPaste size={13} />hoặc Ctrl+V để dán ảnh chụp màn hình</span>
        </div>
        <label className="check text-xs mt-3 justify-center"><input type="checkbox" checked={confirmMasked} onChange={(e) => setConfirmMasked(e.target.checked)} />Tệp văn bản đã che bí mật (confirm_masked)</label>
      </div>
      <div className="flex items-start gap-2 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2"><Info size={14} className="shrink-0 mt-0.5" />
        <span>Hệ thống <b>tự đọc chữ</b> của docx, xlsx, pptx, odt/ods/odp, rtf, txt, md, csv, tsv, log, json, xml, yaml. <b>Ảnh và PDF</b> chỉ được lưu — bấm <b>“AI đọc chữ”</b> sau khi tải lên để tìm kiếm/AI dùng được. <b>File ghi âm</b> (mp3, m4a, wav…, tối đa {AUDIO_MB} MB) được AI chép lời. doc/xls/ppt bản cũ chưa đọc được (hãy chuyển sang bản mới).</span></div>
      {jobs.length > 0 && (
        <div className="border border-line rounded-lg divide-y divide-line-soft bg-white">
          {jobs.map((j) => (
            <div key={j.key} className="flex items-center gap-3 px-3 py-2 text-sm">
              <button className="shrink-0 border-0 bg-transparent p-0 cursor-pointer" title="Xem trước tệp" onClick={() => j.file.bytes && setLocal({ type: 'local', name: j.file.name, bytes: j.file.bytes })}><LocalThumb file={j.file} className="w-10 h-10" /></button>
              <div className="min-w-0 flex-1"><div className="font-semibold truncate">{j.file.name} <span className="text-muted font-normal text-xs">{fmtBytes(j.file.size)}</span></div>
                {j.status === 'err' && <div className="text-xs text-red-700">{j.msg}</div>}
                {j.status === 'ok' && <div className="text-xs text-green-700">Đã tải lên{j.warn?.length ? ` · ${j.warn.join(' · ')}` : ''}</div>}
                {j.status === 'wait' && <div className="text-xs text-muted">Đang chờ…</div>}
                {j.status === 'run' && <div className="text-xs text-brand-700">Đang tải lên…</div>}</div>
              {j.status === 'run' || j.status === 'wait' ? <Loader2 size={16} className={clsx('text-brand-500 shrink-0', j.status === 'run' && 'animate-spin')} /> : j.status === 'ok' ? <CheckCircle2 size={16} className="text-green-600 shrink-0" /> : <AlertCircle size={16} className="text-red-600 shrink-0" />}
              {j.needMask && <button className="btn outline sm" onClick={() => retryMasked(j)}>Đã che bí mật — thử lại</button>}
              {j.status === 'ok' && j.attId && (isAiVisionName(j.file.name) || isAudioName(j.file.name)) && <button className="btn outline sm" onClick={() => setExtract({ id: j.attId!, filename: j.file.name })}>{isAudioName(j.file.name) ? 'AI chép lời' : 'AI đọc chữ'}</button>}
              {(j.status === 'ok' || j.status === 'err') && <button className="btn ghost sm icon" aria-label="Bỏ" onClick={() => setJobs((x) => x.filter((y) => y.key !== j.key))}><X size={14} /></button>}
            </div>))}
        </div>)}
      {local && <PreviewModal src={local} onClose={() => setLocal(null)} />}
      {extract && <ExtractModal att={extract} onClose={() => setExtract(null)} onDone={onUploaded} />}
    </div>)
}

/** Chọn tệp sẵn cho mục CHƯA tạo; tải lên ngay sau khi mục được tạo. */
export function PendingFiles({ files, onChange }: { files: LocalFile[]; onChange: (f: LocalFile[]) => void }) {
  const [over, setOver] = useState(false)
  const [local, setLocal] = useState<FileSource | null>(null)
  const add = (list: LocalFile[]) => {
    const ok: LocalFile[] = []
    for (const f of list) { const bad = checkFile(f); if (bad) toast.warn(`${f.name}: ${bad}`); else ok.push(f) }
    onChange([...files, ...ok].slice(0, 20))
  }
  return (
    <div className="flex flex-col gap-3">
      <div className={clsx('border-2 border-dashed rounded-lg text-center p-5 transition-colors', over ? 'border-brand-500 bg-brand-100' : 'border-brand-200 bg-brand-50')}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={async (e) => { e.preventDefault(); setOver(false); add(await Promise.all(Array.from(e.dataTransfer.files).map(fromBrowserFile))) }}>
        <UploadCloud size={28} className="mx-auto text-brand-500" strokeWidth={1.6} />
        <div className="font-bold mt-1">Đính kèm tệp / ảnh (sẽ tải lên sau khi tạo mục)</div>
        <div className="flex gap-2 justify-center mt-3"><button className="btn sm" onClick={async () => { try { add(await pickLocalFiles(false)) } catch (e) { toast.error(e) } }}><FileUp size={14} />Chọn tệp</button>
          <button className="btn outline sm" onClick={async () => { try { add(await pickLocalFiles(true)) } catch (e) { toast.error(e) } }}><ImageIcon size={14} />Chọn ảnh</button></div>
      </div>
      {files.length > 0 && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">{files.map((f, i) => (
          <div key={i} className="flex items-center gap-3 border border-line rounded-lg p-2 bg-white">
            <button className="border-0 bg-transparent p-0 cursor-pointer" title="Xem trước" onClick={() => f.bytes && setLocal({ type: 'local', name: f.name, bytes: f.bytes })}><LocalThumb file={f} className="w-12 h-12" /></button>
            <div className="min-w-0 flex-1"><div className="font-semibold truncate text-sm">{f.name}</div><div className="text-xs text-muted">{KIND_LABEL[kindOf(f.name)]} · {fmtBytes(f.size)}</div></div>
            <button className="btn ghost sm icon" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label="Bỏ tệp"><X size={14} /></button></div>))}</div>)}
      {local && <PreviewModal src={local} onClose={() => setLocal(null)} />}
    </div>)
}

/** Tải các tệp chờ lên mục vừa tạo; trả về số tệp thành công và danh sách lỗi. */
export async function uploadPending(itemId: number, files: LocalFile[], confirmMasked: boolean) {
  const errors: string[] = []; let ok = 0
  for (const f of files) {
    try { await uploadAttachment(itemId, f, confirmMasked); ok++ } catch (e) { errors.push(`${f.name}: ${(e as ApiError).full ?? e}`) }
  }
  return { ok, errors }
}

export { LocalThumb }
