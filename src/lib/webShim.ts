// Chỉ dùng khi phát triển trong trình duyệt thường (không có Electron): giả lập cầu nối window.desk bằng fetch.
// Không được đưa vào bản build (được bao bởi import.meta.env.DEV).
import { AUDIO_EXT, IMAGE_EXT } from './api'
import { APP_CONFIG } from './appConfig'
export function installWebShim() {
  if (window.desk) return
  const base = () => localStorage.getItem('shim.server') || APP_CONFIG.devServer
  const url = (p: string, q?: Record<string, unknown>) => {
    const u = new URL(base() + p)
    Object.entries(q || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v)) })
    return u.toString()
  }
  const ok = <T,>(data: T) => Promise.resolve({ ok: true, data })
  const b64 = (buf: ArrayBuffer) => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s) }
  window.desk = {
    request: async ({ method = 'GET', path, query, body, token }) => {
      try {
        const res = await fetch(url(path, query as Record<string, unknown>), { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined })
        const text = await res.text(); let json = null; try { json = JSON.parse(text) } catch { /* */ }
        return { ok: true, data: { status: res.status, ok: res.ok, json, text: json ? undefined : text } }
      } catch (e) { return { ok: false, error: `Không kết nối được máy chủ: ${(e as Error).message}` } }
    },
    download: async () => ok({ ok: false, canceled: true }),
    uploadForm: async ({ path, query, token, files, confirmMasked, fields }) => {
      try {
        const fd = new FormData(); files.forEach((f) => fd.append('file', new Blob([f.bytes as BlobPart]), f.name)); if (confirmMasked) fd.append('confirm_masked', 'true')
        for (const [k, v] of Object.entries(fields || {})) if (v !== undefined && v !== null && v !== '') fd.append(k, String(v))
        const res = await fetch(url(path, query as Record<string, unknown>), { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: fd })
        const text = await res.text(); let json = null; try { json = JSON.parse(text) } catch { /* */ }
        return { ok: true, data: { status: res.status, ok: res.ok, json } }
      } catch (e) { return { ok: false, error: (e as Error).message } }
    },
    pickFiles: ({ imagesOnly, audioOnly }) => new Promise((resolve) => {
      const i = document.createElement('input'); i.type = 'file'; i.multiple = true; if (imagesOnly || audioOnly) i.accept = (audioOnly ? AUDIO_EXT : IMAGE_EXT).map((e) => '.' + e).join(',')
      i.onchange = async () => resolve({ ok: true, data: await Promise.all(Array.from(i.files || []).map(async (f) => ({ name: f.name, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()) }))) })
      i.click()
    }),
    openExternal: async () => ok(true),
    blob: async ({ path, token }) => {
      const res = await fetch(url(path), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) return { ok: true, data: { ok: false, status: res.status, error: `HTTP ${res.status}` } }
      const buf = await res.arrayBuffer()
      return { ok: true, data: { ok: true, mime: res.headers.get('content-type') || 'application/octet-stream', name: 'anh.png', base64: b64(buf), size: buf.byteLength } }
    },
    ping: async () => { const t = Date.now(); try { const r = await fetch(url('/')); return { ok: true, data: { online: r.ok, ms: Date.now() - t } } } catch { return { ok: true, data: { online: false, ms: 0 } } } },
    getConfig: async () => ok({ serverUrl: base(), defaultServer: APP_CONFIG.devServer }),
    setConfig: async (p) => { if (p.serverUrl) localStorage.setItem('shim.server', p.serverUrl); return ok({ serverUrl: base() }) },
    info: async () => ok({ version: 'web', electron: '-', node: '-', userData: '', platform: 'web' }),
    toggleFullscreen: async () => ok(false),
    saveFile: async () => ok({ ok: false, canceled: true }),
    openText: async () => ok(null),
  }
}
