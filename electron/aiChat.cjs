'use strict'
// Trò chuyện với Claude từ tiến trình chính của Electron (chế độ "Ngoài tài liệu" và "Internet").
// Khóa ANTHROPIC_API_KEY lấy từ .env / biến môi trường (appConfig.getSecret), không bao giờ gửi sang giao diện.
// Chỉ gửi câu hỏi, lịch sử cùng chế độ và tệp người dùng đính kèm; KHÔNG gửi tài liệu nội bộ.
// Không có khóa hoặc tệp Claude không đọc được thì trả { fallback } để giao diện quay về máy chủ Memorable.
const { getSecret } = require('./appConfig.cjs')

const MODEL = 'claude-sonnet-5-5'
const TIMEOUT_MS = 120000
const MAX_IMG = 5 * 1024 * 1024
const MAX_TEXT_CHARS = 200000
const IMG = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', jpe: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
const TEXT_EXT = new Set(['txt', 'md', 'csv', 'json', 'log', 'xml', 'html', 'htm'])

function pickFetch() {
  try {
    const e = require('electron')
    if (e && e.net && typeof e.net.fetch === 'function') return e.net.fetch.bind(e.net)
  } catch { /* không có Electron */ }
  return fetch
}

const SYSTEM_GENERAL = [
  'Bạn là trợ lý AI cho nhân viên một công ty Việt Nam. Trả lời bằng tiếng Việt, rõ ràng, đi thẳng vào vấn đề.',
  'Đây là chế độ kiến thức chung: bạn KHÔNG có quyền truy cập tài liệu nội bộ của công ty. Nếu câu hỏi cần quy định hay tài liệu riêng của công ty, hãy nói rõ và gợi ý người dùng chuyển sang chế độ "Trong tài liệu".',
  'Không chắc thì nói không chắc, không bịa. Nếu người dùng gửi tệp thì trả lời dựa trên nội dung tệp đó. Không yêu cầu hay nhắc lại mật khẩu, khóa bí mật.',
].join(' ')

const SCOPE_RULE = {
  official: 'Chỉ dùng nguồn chính thống (cơ quan nhà nước, tổ chức, trang chính hãng). Nếu không có nguồn chính thống thì nói rõ là chưa xác minh được.',
  balanced: 'Ưu tiên nguồn chính thống (cơ quan nhà nước, tổ chức, trang chính hãng); nguồn khác chỉ dùng bổ sung và nói rõ.',
  open: 'Có thể dùng nhiều loại trang, nhưng ưu tiên trang đáng tin và nói rõ khi nguồn kém tin cậy.',
}
const systemWeb = (scope) => [
  'Bạn là trợ lý AI cho nhân viên một công ty Việt Nam. Hãy tìm trên Internet để trả lời, viết bằng tiếng Việt, rõ ràng.',
  SCOPE_RULE[scope] || SCOPE_RULE.balanced,
  'Nêu ngày của thông tin khi có, nói rõ khi các nguồn mâu thuẫn hoặc không tìm thấy. Chỉ gửi đi câu hỏi, đừng suy diễn thông tin nội bộ công ty. Không yêu cầu hay nhắc lại mật khẩu, khóa bí mật.',
].join(' ')

/** Chuẩn hóa lịch sử: bắt đầu bằng user, xen kẽ vai, ghép các lượt liên tiếp cùng vai, tối đa 10 lượt. */
function normalize(messages) {
  const out = []
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue
    const text = String(m.content || '').trim().slice(0, 6000)
    if (!text) continue
    if (!out.length && m.role !== 'user') continue
    const last = out[out.length - 1]
    if (last && last.role === m.role) last.content += '\n\n' + text
    else out.push({ role: m.role, content: text })
  }
  const trimmed = out.slice(-10)
  while (trimmed.length && trimmed[0].role !== 'user') trimmed.shift()
  return trimmed
}

function fileBlocks(files) {
  const blocks = []
  for (const f of files || []) {
    if (!f || !f.bytes) return null
    const ext = String(f.name || '').split('.').pop().toLowerCase()
    const buf = Buffer.from(f.bytes)
    if (ext === 'pdf') blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } })
    else if (IMG[ext]) {
      if (buf.length > MAX_IMG) throw new Error(`Ảnh "${f.name}" lớn hơn 5 MB, hãy nén nhỏ hơn.`)
      blocks.push({ type: 'image', source: { type: 'base64', media_type: IMG[ext], data: buf.toString('base64') } })
    } else if (TEXT_EXT.has(ext)) {
      blocks.push({ type: 'text', text: `Nội dung tệp "${f.name}":\n${buf.toString('utf8').slice(0, MAX_TEXT_CHARS)}` })
    } else return null
  }
  return blocks
}

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } }

async function chat({ mode, messages, files, webScope }) {
  const key = getSecret('ANTHROPIC_API_KEY')
  if (!key) return { fallback: 'NO_KEY' }
  if (mode !== 'general' && mode !== 'web') return { fallback: 'UNSUPPORTED_MODE' }
  const hist = normalize(messages)
  if (!hist.length || hist[hist.length - 1].role !== 'user') return { fallback: 'NO_INPUT' }
  const extra = mode === 'general' ? fileBlocks(files) : (files && files.length ? null : [])
  if (extra === null) return { fallback: 'UNSUPPORTED_FILE' }

  const msgs = hist.map((m) => ({ role: m.role, content: m.content }))
  if (extra.length) {
    const last = msgs[msgs.length - 1]
    last.content = [...extra, { type: 'text', text: last.content }]
  }
  const body = {
    model: MODEL, max_tokens: 4000, messages: msgs,
    system: mode === 'web' ? systemWeb(webScope) : SYSTEM_GENERAL,
    ...(mode === 'web' ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] } : {}),
  }

  const f = pickFetch()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let content = []; let searches = 0
  try {
    for (let turn = 0; turn < 4; turn++) {
      let res
      try {
        res = await f('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: ctrl.signal,
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch (e) {
        throw new Error(e && e.name === 'AbortError' ? 'Claude không phản hồi (hết thời gian chờ)' : 'Không kết nối được Claude: ' + (e && e.message ? e.message : e))
      }
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = (j && j.error && j.error.message) || `HTTP ${res.status}`
        throw new Error(res.status === 401 ? 'Khóa Anthropic không hợp lệ hoặc đã bị thu hồi'
          : res.status === 429 ? 'Khóa Anthropic đang chạm giới hạn, hãy thử lại sau ít phút'
            : res.status === 529 ? 'Claude đang quá tải, hãy thử lại sau' : 'Claude báo lỗi: ' + msg)
      }
      content = content.concat(j.content || [])
      searches += (j.usage && j.usage.server_tool_use && j.usage.server_tool_use.web_search_requests) || 0
      if (j.stop_reason !== 'pause_turn') break
      body.messages = [...msgs, { role: 'assistant', content }] // máy chủ tạm dừng giữa chừng: tiếp tục lượt
    }
  } finally { clearTimeout(timer) }

  // Ghép văn bản; mỗi nguồn trích dẫn được đánh số [n] theo thứ tự xuất hiện lần đầu
  const index = new Map(); const citations = []
  let answer = ''
  for (const b of content) {
    if (b.type !== 'text') continue
    answer += b.text
    const marks = []
    for (const c of b.citations || []) {
      if (!c.url) continue
      if (!index.has(c.url)) { index.set(c.url, citations.length + 1); citations.push({ n: citations.length + 1, url: c.url, title: c.title || hostOf(c.url), host: hostOf(c.url) }) }
      const n = index.get(c.url)
      if (!marks.includes(n)) marks.push(n)
    }
    if (marks.length) answer += ' ' + marks.map((n) => `[${n}]`).join('')
  }
  answer = answer.trim()
  if (!answer) throw new Error('Claude không trả về nội dung, hãy thử lại')
  return { answer, model: MODEL, citations, searches }
}

module.exports = { chat, normalize }