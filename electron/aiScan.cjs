'use strict'
// Đọc CCCD/giấy tờ bằng Claude, gọi thẳng từ tiến trình chính của Electron.
// Khóa ANTHROPIC_API_KEY lấy từ .env / biến môi trường (appConfig.getSecret), không bao giờ gửi sang giao diện.
// Không có khóa hoặc loại tệp Claude không đọc được thì trả { fallback } để giao diện quay về máy chủ Memorable.
const { getSecret } = require('./appConfig.cjs')

const MODEL = 'claude-sonnet-5-5'
const TIMEOUT_MS = 90000
const MAX_BYTES = 5 * 1024 * 1024 // giới hạn mỗi ảnh của API
const IMG = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', jpe: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

// Trong Electron dùng net.fetch (kho chứng chỉ của hệ điều hành); chạy Node thuần thì dùng fetch.
function pickFetch() {
  try {
    const e = require('electron')
    if (e && e.net && typeof e.net.fetch === 'function') return e.net.fetch.bind(e.net)
  } catch { /* không có Electron */ }
  return fetch
}

function buildPrompt(fields) {
  const list = fields.map((f) => `- ${f.key}: ${f.label}${f.hint ? ' (' + f.hint + ')' : ''}`).join('\n')
  return [
    'Đây là ảnh/PDF mặt trước và/hoặc mặt sau của giấy tờ tùy thân (CCCD/CMND). Hãy đọc và trích các thông tin sau.',
    'Chỉ dùng đúng các khóa trong danh sách, chép nguyên văn như in trên giấy tờ (ngày giữ dạng dd/mm/yyyy). Trường nào không thấy hoặc không chắc thì bỏ qua, không đoán.',
    'Danh sách trường:', list, '',
    'Chỉ trả về một đối tượng JSON, không kèm giải thích, dạng:',
    '{"values":{"<khóa>":"<giá trị>"},"document_type":"cccd|cmnd|other|null","unclear":["<khóa đọc chưa chắc>"],"warnings":["<lưu ý bằng tiếng Việt, ví dụ ảnh mờ, lóa>"]}',
  ].join('\n')
}

async function scanId({ files, fields }) {
  const key = getSecret('ANTHROPIC_API_KEY')
  if (!key) return { fallback: 'NO_KEY' }
  if (!Array.isArray(files) || !files.length || !Array.isArray(fields) || !fields.length) return { fallback: 'NO_INPUT' }

  const content = []
  for (const f of files) {
    if (!f || !f.bytes) return { fallback: 'NO_BYTES' }
    const ext = String(f.name || '').split('.').pop().toLowerCase()
    const buf = Buffer.from(f.bytes)
    const isPdf = ext === 'pdf'
    if (!isPdf && !IMG[ext]) return { fallback: 'UNSUPPORTED_TYPE' }
    if (buf.length > MAX_BYTES) throw new Error(`Tệp "${f.name}" lớn hơn 5 MB, hãy chụp lại hoặc nén nhỏ hơn.`)
    const data = buf.toString('base64')
    content.push(isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: IMG[ext], data } })
  }
  content.push({ type: 'text', text: buildPrompt(fields) })

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res
  try {
    res = await pickFetch()('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content }] }),
      signal: ctrl.signal,
    })
  } catch (e) {
    throw new Error(e && e.name === 'AbortError' ? 'Claude không phản hồi (hết thời gian chờ)' : 'Không kết nối được Claude: ' + (e && e.message ? e.message : e))
  } finally { clearTimeout(timer) }

  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = (json && json.error && json.error.message) || `HTTP ${res.status}`
    throw new Error(res.status === 401 ? 'Khóa Anthropic không hợp lệ hoặc đã bị thu hồi' : 'Claude báo lỗi: ' + msg)
  }
  const text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
  const a = text.indexOf('{'); const b = text.lastIndexOf('}')
  let out = {}
  try { out = JSON.parse(text.slice(a, b + 1)) } catch { throw new Error('Claude trả về dữ liệu không đọc được, hãy thử lại') }

  const known = new Set(fields.map((f) => f.key))
  const values = {}
  for (const [k, v] of Object.entries(out.values || {})) if (known.has(k) && typeof v === 'string' && v.trim()) values[k] = v.trim()
  const strs = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string') : [])
  return { values, document_type: typeof out.document_type === 'string' && out.document_type !== 'null' ? out.document_type : null, unclear: strs(out.unclear).filter((k) => known.has(k)), warnings: strs(out.warnings) }
}

module.exports = { scanId }