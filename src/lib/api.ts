import { useCallback, useEffect, useRef, useState } from 'react'

type Reply<T> = { ok: boolean; data?: T; error?: string }
interface Desk {
  request: (a: { method?: string; path: string; query?: object; body?: unknown; token?: string | null }) => Promise<Reply<{ status: number; ok: boolean; json: { RD: unknown; RC: number; RM: string } | null; text?: string }>>
  download: (a: { path: string; query?: object; token?: string | null; filename?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<Reply<{ ok: boolean; canceled?: boolean; filePath?: string; error?: string }>>
  uploadForm: (a: { path: string; query?: object; token?: string | null; files: { name: string; bytes: Uint8Array }[]; confirmMasked?: boolean; fields?: Record<string, string | number | boolean | undefined> }) => Promise<Reply<{ status: number; ok: boolean; json: { RD: unknown; RM: string } | null }>>
  pickFiles: (a: { imagesOnly?: boolean }) => Promise<Reply<{ name: string; size: number; bytes: Uint8Array | null }[]>>
  openExternal: (a: { name: string; base64: string }) => Promise<Reply<boolean>>
  blob: (a: { path: string; token?: string | null }) => Promise<Reply<{ ok: boolean; status?: number; error?: string; mime?: string; name?: string; base64?: string; size?: number }>>
  ping: () => Promise<Reply<{ online: boolean; ms: number; message?: string }>>
  getConfig: () => Promise<Reply<{ serverUrl: string; email?: string }>>
  setConfig: (p: { serverUrl?: string; email?: string }) => Promise<Reply<{ serverUrl: string; email?: string }>>
  info: () => Promise<Reply<{ version: string; electron: string; node: string; userData: string; platform: string }>>
  toggleFullscreen: () => Promise<Reply<boolean>>
  saveFile: (a: { content: string; filename: string; filters?: { name: string; extensions: string[] }[] }) => Promise<Reply<{ ok: boolean; canceled?: boolean; filePath?: string }>>
  openText: (a: { filters?: { name: string; extensions: string[] }[] }) => Promise<Reply<{ name: string; text: string } | null>>
}
declare global { interface Window { desk: Desk } }

export class ApiError extends Error {
  status: number
  errors?: Record<string, string> | unknown
  constructor(message: string, status: number, errors?: unknown) { super(message); this.status = status; this.errors = errors }
  /** Gộp RM + danh sách lỗi từng trường thành một câu dễ đọc. */
  get full() {
    const e = this.errors
    if (e && typeof e === 'object') {
      const parts = Array.isArray(e) ? e.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
        : Object.entries(e as Record<string, unknown>).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      if (parts.length) return `${this.message} (${parts.join('; ')})`
    }
    return this.message
  }
}

let token: string | null = null
let onUnauthorized: (() => void) | null = null
export const setToken = (t: string | null) => { token = t }
export const getToken = () => token
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }

const desk = () => {
  if (!window.desk) throw new Error('Ứng dụng phải chạy trong Electron (npm run dev hoặc bản cài đặt)')
  return window.desk
}
export const deskApi = desk

function unwrap<T>(r: Reply<{ status: number; ok: boolean; json: { RD: unknown; RC: number; RM: string } | null; text?: string }>, auth: boolean): T {
  if (!r.ok || !r.data) throw new ApiError(r.error || 'Lỗi kết nối', 0)
  const { status, ok, json, text } = r.data
  if (status === 401 && auth) onUnauthorized?.()
  if (!ok) {
    const errs = (json?.RD as { errors?: unknown } | null)?.errors
    throw new ApiError(json?.RM || text || `Lỗi HTTP ${status}`, status, errs)
  }
  return (json ? json.RD : null) as T
}

export interface Opts { query?: Record<string, unknown>; body?: unknown; auth?: boolean }
export async function api<T = any>(method: string, path: string, o: Opts = {}): Promise<T> {
  const auth = o.auth !== false
  const r = await desk().request({ method, path, query: o.query, body: o.body, token: auth ? token : null })
  return unwrap<T>(r, auth)
}
export const get = <T = any>(path: string, query?: Record<string, unknown>) => api<T>('GET', path, { query })
export const post = <T = any>(path: string, body?: unknown, query?: Record<string, unknown>) => api<T>('POST', path, { body: body ?? {}, query })
export const put = <T = any>(path: string, body?: unknown) => api<T>('PUT', path, { body: body ?? {} })
export const patch = <T = any>(path: string, body?: unknown) => api<T>('PATCH', path, { body: body ?? {} })
export const del = <T = any>(path: string, query?: Record<string, unknown>) => api<T>('DELETE', path, { query })

export async function download(path: string, query?: Record<string, unknown>, filename?: string, filters?: { name: string; extensions: string[] }[]) {
  const r = await desk().download({ path, query, token, filename, filters })
  if (!r.ok || !r.data) throw new ApiError(r.error || 'Lỗi tải xuống', 0)
  if (!r.data.ok && !r.data.canceled) throw new ApiError(r.data.error || 'Tải xuống thất bại', 0)
  return r.data
}

export interface LocalFile { name: string; size: number; bytes: Uint8Array | null; preview?: string }
export const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'txt', 'md', 'csv', 'tsv', 'log', 'json', 'xml', 'yaml', 'yml', 'zip']
export const MAX_UPLOAD = 10 * 1024 * 1024
export const MAX_FILES_PER_REQUEST = 10
export const isImageName = (n: string) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(n)
/** Ảnh/PDF mà AI nhìn được (POST /ai/analyze, /attachments/{id}/ai-extract). */
export const isAiVisionName = (n: string) => /\.(png|jpe?g|gif|webp|pdf)$/i.test(n)
export const isTextName = (n: string) => /\.(txt|md|csv|tsv|log|json|xml|ya?ml)$/i.test(n)

/** Kiểm tra tệp phía máy khách trước khi gửi; trả về thông báo lỗi hoặc null. */
export function checkFile(f: { name: string; size: number }): string | null {
  const ext = f.name.split('.').pop()?.toLowerCase() || ''
  if (!ALLOWED_EXT.includes(ext)) return `Loại .${ext} không được phép`
  if (f.size === 0) return 'Tệp rỗng'
  if (f.size > MAX_UPLOAD) return 'Vượt quá 10 MB'
  return null
}

export async function pickLocalFiles(imagesOnly = false): Promise<LocalFile[]> {
  const r = await desk().pickFiles({ imagesOnly })
  if (!r.ok) throw new ApiError(r.error || 'Không mở được hộp thoại chọn tệp', 0)
  return r.data || []
}
/** Chuyển File (kéo-thả / dán) thành LocalFile. */
export async function fromBrowserFile(f: File): Promise<LocalFile> {
  const bytes = f.size <= MAX_UPLOAD ? new Uint8Array(await f.arrayBuffer()) : null
  return { name: f.name || `anh-${Date.now()}.png`, size: f.size, bytes }
}

export interface UploadedAtt {
  id: number; filename: string; filetype: string; kind?: string; filesize: number; duplicate_of: number | null; warnings: string[]
  viewable_inline?: boolean; text_source?: string | null; ai_readable?: boolean; text_extracted?: boolean
}
export interface UploadOutcome { file: LocalFile; ok: boolean; att?: UploadedAtt; status?: number; message?: string; findings?: unknown }

/** Tải nhiều tệp (tối đa 10 mỗi yêu cầu) bằng multipart; trả kết quả riêng từng tệp. Không ném lỗi theo từng tệp. */
export async function uploadAttachments(itemId: number, files: LocalFile[], confirmMasked = false): Promise<UploadOutcome[]> {
  const out: UploadOutcome[] = []
  const valid: LocalFile[] = []
  for (const f of files) {
    const bad = checkFile(f)
    if (bad || !f.bytes) out.push({ file: f, ok: false, status: 0, message: bad || 'Không đọc được nội dung tệp' })
    else valid.push(f)
  }
  for (let i = 0; i < valid.length; i += MAX_FILES_PER_REQUEST) {
    const batch = valid.slice(i, i + MAX_FILES_PER_REQUEST)
    const r = await desk().uploadForm({ path: `/items/${itemId}/attachments`, token, files: batch.map((f) => ({ name: f.name, bytes: f.bytes! })), confirmMasked })
    if (!r.ok || !r.data) { batch.forEach((f) => out.push({ file: f, ok: false, status: 0, message: r.error || 'Lỗi tải lên' })); continue }
    const d = r.data
    if (d.status === 401) onUnauthorized?.()
    const rd = (d.json?.RD || {}) as { uploaded?: UploadedAtt[]; rejected?: { filename: string; status: number; message: string; findings?: unknown }[]; errors?: unknown }
    const uploaded = rd.uploaded || []; const rejected = rd.rejected || []
    for (const f of batch) {
      const ok = uploaded.find((u) => u.filename === f.name)
      const rej = rejected.find((x) => x.filename === f.name)
      if (ok) out.push({ file: f, ok: true, att: ok })
      else if (rej) out.push({ file: f, ok: false, status: rej.status, message: rej.message, findings: rej.findings })
      else out.push({ file: f, ok: false, status: d.status, message: d.json?.RM || `Lỗi HTTP ${d.status}` })
    }
  }
  return out
}

/** Tải một tệp lên mục; ném ApiError nếu bị từ chối. */
export async function uploadAttachment(itemId: number, f: LocalFile, confirmMasked = false) {
  const [o] = await uploadAttachments(itemId, [f], confirmMasked)
  if (!o.ok) throw new ApiError(o.message || 'Tải lên thất bại', o.status || 0)
  return o.att!
}

const blobCache = new Map<number, Promise<{ mime: string; name: string; dataUrl: string; base64: string }>>()
/** Tải nội dung tệp đính kèm (có cache) để xem trước. */
export function fetchAttachment(id: number, view = false) {
  let p = blobCache.get(id)
  if (!p) {
    p = desk().blob({ path: `/attachments/${id}/${view ? 'view' : 'download'}`, token }).then((r) => {
      if (!r.ok || !r.data) throw new ApiError(r.error || 'Lỗi tải tệp', 0)
      const d = r.data
      if (!d.ok) { if (d.status === 401) onUnauthorized?.(); throw new ApiError(d.error || `Lỗi HTTP ${d.status}`, d.status || 0) }
      return { mime: d.mime || 'application/octet-stream', name: d.name || '', base64: d.base64 || '', dataUrl: `data:${d.mime};base64,${d.base64}` }
    })
    p.catch(() => blobCache.delete(id))
    blobCache.set(id, p)
  }
  return p
}
export const forgetAttachment = (id: number) => { blobCache.delete(id) }
export const decodeBase64Text = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))

export interface Paged<T> { total: number; page: number; limit: number; pages: number; rows: T[] }

/** Hook tải dữ liệu GET; tự tải lại khi path/query đổi; reload() để tải lại thủ công. */
export function useGet<T = any>(path: string | null, query?: Record<string, unknown>, enabled = true) {
  const [data, setData] = useState<T | undefined>()
  const [loading, setLoading] = useState(!!path && enabled)
  const [error, setError] = useState<ApiError | null>(null)
  const seq = useRef(0)
  const key = JSON.stringify([path, query, enabled])
  const reload = useCallback(async () => {
    if (!path || !enabled) { setLoading(false); return }
    const id = ++seq.current
    setLoading(true)
    try {
      const d = await get<T>(path, query)
      if (id === seq.current) { setData(d); setError(null) }
    } catch (e) {
      if (id === seq.current) setError(e instanceof ApiError ? e : new ApiError((e as Error).message, 0))
    } finally { if (id === seq.current) setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => { reload() }, [reload])
  return { data, loading, error, reload, setData }
}

/** Hỏi bằng tệp: gửi thẳng tối đa 5 tệp (ảnh/PDF/Word/Excel…) kèm câu hỏi; máy chủ đọc, đối chiếu kho rồi trả lời. Tệp không được lưu. */
export async function askWithFiles<T>(files: LocalFile[], fields: { question?: string; mode?: string; source_policy?: string; item_ids?: string }): Promise<T> {
  const valid = files.filter((f) => f.bytes && !checkFile(f)).slice(0, 5)
  if (!valid.length) throw new ApiError('Không có tệp hợp lệ để gửi (tối đa 10 MB mỗi tệp, đúng loại cho phép)', 422)
  const r = await desk().uploadForm({ path: '/ai/ask-file', token, files: valid.map((f) => ({ name: f.name, bytes: f.bytes! })), fields })
  if (!r.ok || !r.data) throw new ApiError(r.error || 'Không gửi được tệp', 0)
  const d = r.data
  if (d.status === 401) onUnauthorized?.()
  const body = d.json as { RD: unknown; RM: string } | null
  if (!d.ok) { const rd = (body?.RD || null) as { errors?: unknown; skipped?: unknown } | null; throw new ApiError(body?.RM || `Lỗi HTTP ${d.status}`, d.status, rd?.errors ?? rd?.skipped) }
  return body?.RD as T
}
