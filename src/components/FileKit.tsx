// Đính kèm tệp cho khung trò chuyện kiểu ChatGPT: chọn, kéo thả, dán ảnh (Ctrl+V), khay tệp có ảnh thu nhỏ, lưới tệp trong tin nhắn.
import { ClipboardEvent, DragEvent, useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'
import { IMAGE_MIME, LocalFile, checkFile, fromBrowserFile, isImageName, pickLocalFiles } from '../lib/api'
import { bytes as fmtBytes, FILE_ICON } from '../lib/format'
import { extOf } from '../lib/preview'
import { toast } from '../store/ui'

export const MAX_CHAT_FILES = 5
const key = (f: { name: string; size: number }) => `${f.name}|${f.size}`

/** Đặt tên cho ảnh dán từ khay nhớ tạm (trình duyệt luôn gọi là image.png) */
export const pastedName = (f: File, i = 0) => (f.name && f.name !== 'image.png' ? f.name : `anh-dan-${new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '')}${i ? `-${i + 1}` : ''}.${f.type.includes('jpeg') ? 'jpg' : 'png'}`)

/** Quản lý tệp đang chờ gửi: kiểm tra loại và dung lượng, bỏ trùng, tối đa `max` tệp. */
export function useAttachments(max = MAX_CHAT_FILES) {
  const [files, setFiles] = useState<LocalFile[]>([])
  const [over, setOver] = useState(false)
  const add = useCallback((list: LocalFile[]) => {
    const ok: LocalFile[] = []
    for (const f of list) {
      const bad = checkFile(f) || (!f.bytes ? 'không đọc được tệp' : null)
      if (bad) toast.warn(`${f.name}: ${bad}`); else ok.push(f)
    }
    if (!ok.length) return
    setFiles((cur) => {
      const merged = [...cur.filter((c) => !ok.some((n) => key(n) === key(c))), ...ok]
      if (merged.length > max) toast.warn(`Mỗi lần gửi tối đa ${max} tệp`)
      return merged.slice(0, max)
    })
  }, [max])
  const addBrowser = useCallback(async (list: File[]) => add(await Promise.all(list.map((f, i) => fromBrowserFile(new File([f], pastedName(f, i), { type: f.type }))))), [add])
  const pick = useCallback(async (only: boolean | 'image' | 'audio' = false) => { try { add(await pickLocalFiles(only)) } catch (e) { toast.error(e) } }, [add])
  const onPaste = useCallback((e: ClipboardEvent | globalThis.ClipboardEvent) => {
    const list = Array.from(e.clipboardData?.files || [])
    if (!list.length) return
    e.preventDefault(); void addBrowser(list)
  }, [addBrowser])
  const dropProps = {
    onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true) } },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(false) },
    onDrop: (e: DragEvent) => { e.preventDefault(); setOver(false); const list = Array.from(e.dataTransfer.files); if (list.length) void addBrowser(list) },
  }
  return { files, add, addBrowser, pick, onPaste, dropProps, over, remove: (i: number) => setFiles((c) => c.filter((_, j) => j !== i)), clear: () => setFiles([]) }
}

/** Ảnh thu nhỏ hoặc biểu tượng loại tệp */
export function FileThumb({ name, bytes, className }: { name: string; bytes?: Uint8Array | null; className?: string }) {
  // Tạo và thu hồi đường dẫn ảnh trong cùng một effect (an toàn cả khi React chạy effect hai lần)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!bytes || !isImageName(name)) { setUrl(null); return }
    const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: IMAGE_MIME[extOf(name)] || 'image/*' }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [name, bytes])
  return url
    ? <img src={url} alt={name} className={clsx('object-cover', className)} />
    : <span className={clsx('grid place-items-center text-2xl bg-brand-50', className)} aria-hidden>{FILE_ICON[extOf(name)] || '📎'}</span>
}

/** Khay tệp đang chờ gửi (trên ô nhập) */
export function AttachTray({ files, onRemove, onOpen }: { files: LocalFile[]; onRemove: (i: number) => void; onOpen?: (f: LocalFile) => void }) {
  if (!files.length) return null
  return (
    <div className="fk-tray">
      {files.map((f, i) => (
        <div key={`${f.name}|${f.size}`} className={clsx('fk-tile', isImageName(f.name) && 'img')} title={`${f.name} · ${fmtBytes(f.size)}`}>
          <button className="fk-open" onClick={() => onOpen?.(f)} aria-label={`Xem ${f.name}`}><FileThumb name={f.name} bytes={f.bytes} className="fk-th" /></button>
          {!isImageName(f.name) && <span className="fk-meta"><b>{f.name}</b><small>{fmtBytes(f.size)}</small></span>}
          <button className="fk-x" onClick={() => onRemove(i)} aria-label={`Bỏ ${f.name}`}><X size={13} /></button>
        </div>))}
    </div>)
}

/** Lưới tệp trong tin nhắn đã gửi: ảnh hiện thu nhỏ, tệp khác hiện thẻ tên */
export function SentFiles({ files, onOpen, align = 'end' }: { files: { name: string; size: number; bytes?: Uint8Array | null; error?: string }[]; onOpen?: (i: number) => void; align?: 'start' | 'end' }) {
  if (!files.length) return null
  return (
    <div className={clsx('fk-sent', align === 'end' ? 'justify-end' : 'justify-start')}>
      {files.map((f, i) => isImageName(f.name) && f.bytes
        ? <button key={i} className="fk-sent-img" onClick={() => onOpen?.(i)} title={f.name}><FileThumb name={f.name} bytes={f.bytes} className="w-full h-full" /></button>
        : <button key={i} className={clsx('fk-sent-file', f.error && 'err')} onClick={() => onOpen?.(i)} title={f.error || f.name}>
          <FileThumb name={f.name} className="w-9 h-9 rounded-md !text-xl" /><span className="min-w-0 text-left"><b>{f.name}</b><small>{f.error || fmtBytes(f.size)}</small></span></button>)}
    </div>)
}
