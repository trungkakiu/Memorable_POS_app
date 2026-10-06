'use strict'
// Vỏ Electron: chỉ mở cửa sổ giao diện và làm cầu nối HTTP tới Memorable API
// (tránh CORS khi tải từ file://). KHÔNG có cơ sở dữ liệu / backend riêng.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const isDev = process.env.ELECTRON_DEV === '1'
const DEFAULT_SERVER = process.env.MEMORABLE_SERVER || 'http://26.118.183.122:3001'
let mainWin = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus() }
  })
}

// ---------- Cấu hình (địa chỉ máy chủ, email gần nhất) ----------
const cfgFile = () => path.join(app.getPath('userData'), 'config.json')
function readCfg() {
  try { return { serverUrl: DEFAULT_SERVER, ...JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) } } catch { return { serverUrl: DEFAULT_SERVER } }
}
function writeCfg(patch) {
  const next = { ...readCfg(), ...patch }
  fs.mkdirSync(path.dirname(cfgFile()), { recursive: true })
  fs.writeFileSync(cfgFile(), JSON.stringify(next, null, 2))
  return next
}
const baseUrl = () => String(readCfg().serverUrl || DEFAULT_SERVER).trim().replace(/\/+$/, '')

// ---------- HTTP tới Memorable API ----------
function buildUrl(p, query) {
  const u = new URL(baseUrl() + p)
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v))
  }
  return u
}
async function doFetch(url, init, timeout = 30000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    const code = e.cause && e.cause.code
    throw new Error(e.name === 'AbortError' ? 'Máy chủ không phản hồi (hết thời gian chờ)' : `Không kết nối được máy chủ${code ? ' (' + code + ')' : ''}: ${baseUrl()}`)
  } finally { clearTimeout(t) }
}
const authHeaders = (token) => (token ? { Authorization: `Bearer ${token}` } : {})

async function httpRequest({ method = 'GET', path: p, query, body, token }) {
  const headers = { Accept: 'application/json', ...authHeaders(token) }
  let payload
  if (body !== undefined && body !== null) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
  const res = await doFetch(buildUrl(p, query), { method, headers, body: payload })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* không phải JSON */ }
  return { status: res.status, ok: res.ok, json, text: json ? undefined : text.slice(0, 2000) }
}

async function httpDownload({ path: p, query, token, filename, filters }) {
  const res = await doFetch(buildUrl(p, query), { headers: authHeaders(token) }, 120000)
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { msg = (await res.json()).RM || msg } catch { /* ignore */ }
    return { ok: false, status: res.status, error: msg }
  }
  let name = filename
  const cd = res.headers.get('content-disposition') || ''
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="?([^";]+)"?/i.exec(cd)
  if (m) { try { name = decodeURIComponent(m[1]) } catch { name = m[1] } }
  const { canceled, filePath } = await dialog.showSaveDialog(mainWin, { defaultPath: name || 'tai-xuong', filters })
  if (canceled || !filePath) return { ok: false, canceled: true }
  fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()))
  shell.showItemInFolder(filePath)
  return { ok: true, filePath }
}

// Ảnh: các biến thể JPEG (jfif, jpe, pjpeg, pjp) là cùng định dạng; TIFF/HEIC chỉ tải về nhưng AI vẫn đọc được
const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', jpe: 'image/jpeg', pjpeg: 'image/jpeg', pjp: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif' }
const IMAGE_EXT = Object.keys(IMAGE_MIME)
// File ghi âm: AI chép lời trên máy chủ; được tới 25 MB (cuộc họp dài)
const AUDIO_MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac', amr: 'audio/amr', wma: 'audio/x-ms-wma', '3gp': 'audio/3gpp' }
const AUDIO_EXT = Object.keys(AUDIO_MIME)
const MIME = { ...IMAGE_MIME, ...AUDIO_MIME, pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', zip: 'application/zip' }
const ALLOWED = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', ...IMAGE_EXT, ...AUDIO_EXT, 'txt', 'md', 'csv', 'tsv', 'log', 'json', 'xml', 'yaml', 'yml', 'zip']
const MAX_UPLOAD = 10 * 1024 * 1024
const MAX_AUDIO_UPLOAD = 25 * 1024 * 1024
const extOfName = (n) => String(n || '').split('.').pop().toLowerCase()
const maxFor = (name) => (AUDIO_EXT.includes(extOfName(name)) ? MAX_AUDIO_UPLOAD : MAX_UPLOAD)

/** Tải tối đa 10 tệp một lần bằng multipart/form-data (trường "file"); API báo riêng từng tệp: uploaded / rejected. */
async function httpUploadForm({ path: p, query, token, files, confirmMasked, fields }) {
  const form = new FormData()
  for (const f of files || []) {
    const ext = String(f.name || '').split('.').pop().toLowerCase()
    if (!ALLOWED.includes(ext)) return { status: 415, ok: false, json: { RM: `Loại tệp .${ext} không được phép`, RD: null } }
    const buf = Buffer.from(f.bytes)
    if (buf.length === 0) return { status: 400, ok: false, json: { RM: 'Tệp rỗng', RD: null } }
    if (buf.length > maxFor(f.name)) return { status: 413, ok: false, json: { RM: AUDIO_EXT.includes(ext) ? 'File ghi âm vượt quá 25 MB' : 'Tệp vượt quá 10 MB', RD: null } }
    form.append('file', new Blob([buf], { type: MIME[ext] || 'application/octet-stream' }), f.name)
  }
  if (confirmMasked) form.append('confirm_masked', 'true')
  for (const [k, v] of Object.entries(fields || {})) if (v !== undefined && v !== null && v !== '') form.append(k, String(v))
  const res = await doFetch(buildUrl(p, query), { method: 'POST', headers: { Accept: 'application/json', ...authHeaders(token) }, body: form }, 900000)
  let json = null
  try { json = await res.json() } catch { /* ignore */ }
  return { status: res.status, ok: res.ok, json }
}

/** Hộp thoại chọn nhiều tệp; đọc nội dung ngay trong tiến trình chính. */
async function filePick({ imagesOnly, audioOnly }) {
  const exts = imagesOnly ? IMAGE_EXT : audioOnly ? AUDIO_EXT : ALLOWED
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: imagesOnly ? 'Ảnh' : audioOnly ? 'File ghi âm (tối đa 25 MB)' : 'Tệp cho phép (tối đa 10 MB, ghi âm 25 MB)', extensions: exts }],
  })
  if (canceled) return []
  return filePaths.slice(0, 20).map((f) => {
    const size = fs.statSync(f).size
    return { name: path.basename(f), size, bytes: size <= maxFor(f) ? new Uint8Array(fs.readFileSync(f)) : null }
  })
}

/** Tải nội dung tệp đính kèm về dạng base64 để xem trước (ảnh, văn bản). */
async function httpBlob({ path: p, token }) {
  const res = await doFetch(buildUrl(p), { headers: authHeaders(token) }, 120000)
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { msg = (await res.json()).RM || msg } catch { /* ignore */ }
    return { ok: false, status: res.status, error: msg }
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const cd = res.headers.get('content-disposition') || ''
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="?([^";]+)"?/i.exec(cd)
  const name = m ? decodeURIComponent(m[1]) : ''
  if (buf.length > maxFor(name)) return { ok: false, status: 413, error: 'Tệp quá lớn để xem trước' }
  let mime = (res.headers.get('content-type') || '').split(';')[0]
  if (!mime || mime === 'application/octet-stream') mime = MIME[name.split('.').pop().toLowerCase()] || 'application/octet-stream'
  return { ok: true, mime, name, base64: buf.toString('base64'), size: buf.length }
}

// ---------- Cửa sổ ----------
function createWindow() {
  mainWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1280, minHeight: 720,
    show: false, backgroundColor: '#f6f4fb', title: 'Memorable Desktop',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false,
    },
  })
  mainWin.once('ready-to-show', () => { mainWin.maximize(); mainWin.show() })
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWin.webContents.on('will-navigate', (e, url) => { if (!isDev && !url.startsWith('file:')) e.preventDefault() })
  if (isDev) mainWin.loadURL('http://localhost:5173')
  else mainWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  if (process.env.ELECTRON_SMOKE) {
    mainWin.webContents.on('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 1500))
      const r = await mainWin.webContents.executeJavaScript(`JSON.stringify({ desk: typeof window.desk, keys: Object.keys(window.desk||{}), text: document.body.innerText.slice(0, 120), ping: null })`)
      const ping = await httpRequest({ path: '/' }).then((x) => x.status).catch((e) => e.message)
      console.log('SMOKE', r, 'serverStatus', ping)
      if (process.env.ELECTRON_SMOKE === 'doc') {
        try { console.log('SMOKEDOC', await mainWin.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'smoke-doc.js'), 'utf8'))) } catch (e) { console.log('SMOKEDOC error', e && e.message) }
      }
      app.quit()
    })
  }
  mainWin.on('closed', () => { mainWin = null })
}

function registerIpc() {
  const wrap = (fn) => async (_e, arg) => {
    try { return { ok: true, data: await fn(arg || {}) } } catch (err) { return { ok: false, error: err && err.message ? err.message : String(err) } }
  }
  ipcMain.handle('http:request', wrap(httpRequest))
  ipcMain.handle('http:download', wrap(httpDownload))
  ipcMain.handle('http:uploadForm', wrap(httpUploadForm))
  ipcMain.handle('file:pick', wrap(filePick))
  ipcMain.handle('http:blob', wrap(httpBlob))
  // Mở tệp bằng ứng dụng mặc định của máy (Word, Excel, trình đọc PDF…) qua một bản sao tạm.
  ipcMain.handle('file:openExternal', wrap(async ({ name, base64 }) => {
    const safe = path.basename(String(name || 'tep')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    const ext = safe.split('.').pop().toLowerCase()
    if (!ALLOWED.includes(ext)) throw new Error('Loại tệp này không được mở từ ứng dụng')
    const dir = path.join(require('node:os').tmpdir(), 'memorable-preview')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, Date.now() + '-' + safe)
    fs.writeFileSync(file, Buffer.from(String(base64 || ''), 'base64'))
    const err = await shell.openPath(file)
    if (err) throw new Error(err)
    return true
  }))
  ipcMain.handle('http:ping', wrap(async () => {
    const t0 = Date.now()
    const r = await httpRequest({ path: '/' })
    return { online: r.ok, ms: Date.now() - t0, message: r.json && r.json.RM }
  }))
  ipcMain.handle('cfg:get', wrap(() => readCfg()))
  ipcMain.handle('cfg:set', wrap((patch) => {
    const out = {}
    if (typeof patch.serverUrl === 'string') {
      const u = patch.serverUrl.trim().replace(/\/+$/, '')
      if (!/^https?:\/\/[^\s/]+/i.test(u)) throw new Error('Địa chỉ máy chủ phải bắt đầu bằng http:// hoặc https://')
      out.serverUrl = u
    }
    if (typeof patch.email === 'string') out.email = patch.email
    return writeCfg(out)
  }))
  ipcMain.handle('app:info', wrap(() => ({
    version: app.getVersion(), electron: process.versions.electron, node: process.versions.node,
    userData: app.getPath('userData'), platform: process.platform,
  })))
  ipcMain.handle('app:toggleFullscreen', wrap(() => {
    if (!mainWin) return false
    mainWin.setFullScreen(!mainWin.isFullScreen())
    return mainWin.isFullScreen()
  }))
  ipcMain.handle('file:save', wrap(async ({ content, filename, filters }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWin, { defaultPath: filename, filters })
    if (canceled || !filePath) return { ok: false, canceled: true }
    fs.writeFileSync(filePath, content, 'utf8')
    shell.showItemInFolder(filePath)
    return { ok: true, filePath }
  }))
  ipcMain.handle('file:openText', wrap(async ({ filters }) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, { properties: ['openFile'], filters })
    if (canceled || !filePaths[0]) return null
    const st = fs.statSync(filePaths[0])
    if (st.size > 8 * 1024 * 1024) throw new Error('Tệp quá lớn (tối đa 8 MB)')
    return { name: path.basename(filePaths[0]), text: fs.readFileSync(filePaths[0], 'utf8') }
  }))
}

app.whenReady().then(() => {
  registerIpc()
  if (!isDev) Menu.setApplicationMenu(null)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
