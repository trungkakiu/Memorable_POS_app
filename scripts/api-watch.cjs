// Theo dõi thay đổi API của backend Memorable so với bản mốc mà giao diện đã đồng bộ (api/openapi.baseline.json).
//
//   npm run api:check            so sánh, in thay đổi; thoát mã 1 nếu backend đã đổi
//   npm run api:check -- --json  in kết quả dạng JSON (cho máy đọc)
//   npm run api:accept           sau khi đã cập nhật giao diện: lấy spec hiện tại làm mốc mới
//
// Nguồn spec (theo thứ tự ưu tiên):
//   1. Mã nguồn backend: BACKEND_DIR (mặc định ../Memorable) — sinh spec trực tiếp từ route + tài liệu, không ghi gì vào backend
//   2. API_DOCS_URL (ví dụ http://26.118.183.122:3002/openapi.json)
//   3. BACKEND_DIR/docs/openapi.json (bản build sẵn, có thể cũ)
const fs = require('node:fs'); const path = require('node:path'); const { execFileSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const baselineFile = path.join(root, 'api', 'openapi.baseline.json')
const backendDir = path.resolve(root, process.env.BACKEND_DIR || '../Memorable')
const args = process.argv.slice(2)
const asJson = args.includes('--json'); const accept = args.includes('--accept')

async function loadCurrent() {
  if (fs.existsSync(path.join(backendDir, 'src', 'docs', 'openapi.js'))) {
    const code = "const { app } = require('./src/app'); const { buildSpec } = require('./src/docs/openapi'); process.stdout.write(JSON.stringify(buildSpec(app, { baseUrl: process.env.API_URL || 'http://localhost:3001' }))); process.exit(0)"
    try { return { source: `mã nguồn ${backendDir}`, spec: JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: backendDir, maxBuffer: 64 << 20, timeout: 90000, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8')) } } catch { /* thử nguồn khác */ }
  }
  if (process.env.API_DOCS_URL) {
    try { const r = await fetch(process.env.API_DOCS_URL); if (r.ok) return { source: process.env.API_DOCS_URL, spec: await r.json() } } catch { /* thử nguồn khác */ }
  }
  const built = path.join(backendDir, 'docs', 'openapi.json')
  if (fs.existsSync(built)) return { source: built + ' (bản build sẵn)', spec: JSON.parse(fs.readFileSync(built, 'utf8')) }
  throw new Error('Không lấy được spec: đặt BACKEND_DIR tới thư mục backend hoặc API_DOCS_URL tới openapi.json')
}

// Khóa cấu hình và tính năng AI mà backend đọc (để phát hiện cấu hình mới cần đưa vào trang quản trị)
function backendKeys() {
  const out = new Set(); const feats = new Set()
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.js')) { const s = fs.readFileSync(p, 'utf8'); for (const m of s.matchAll(/getSetting\('([a-z0-9_]+)'/g)) out.add(m[1]); for (const m of s.matchAll(/'(ai_feature_[a-z0-9_]+)'/g)) feats.add(m[1]) } } }
  try { walk(path.join(backendDir, 'src')) } catch { return null }
  return [...new Set([...out, ...feats])].sort()
}
function frontendKeys() { const s = fs.readFileSync(path.join(root, 'src', 'pages', 'Admin.tsx'), 'utf8'); return new Set([...s.matchAll(/key: '([a-z0-9_]+)'/g)].map((m) => m[1])) }

const ops = (spec) => { const o = {}; for (const [p, ms] of Object.entries(spec.paths || {})) for (const [m, op] of Object.entries(ms)) if (['get', 'post', 'put', 'patch', 'delete'].includes(m)) o[`${m.toUpperCase()} ${p}`] = op; return o }
const params = (op) => (op.parameters || []).map((x) => `${x.in}:${x.name}`).sort()
const bodyFields = (op) => { const c = op.requestBody && Object.values(op.requestBody.content || {})[0]; const pr = c && c.schema && c.schema.properties; return pr ? Object.keys(pr).sort() : [] }
const codes = (op) => Object.keys(op.responses || {}).sort()
const diffList = (a, b) => ({ added: b.filter((x) => !a.includes(x)), removed: a.filter((x) => !b.includes(x)) })

;(async () => {
  const { source, spec } = await loadCurrent()
  if (accept || !fs.existsSync(baselineFile)) {
    fs.mkdirSync(path.dirname(baselineFile), { recursive: true }); fs.writeFileSync(baselineFile, JSON.stringify(spec, null, 1) + '\n')
    console.log(`Đã lưu mốc mới (${Object.keys(ops(spec)).length} thao tác) từ ${source}`); return
  }
  const A = ops(JSON.parse(fs.readFileSync(baselineFile, 'utf8'))); const B = ops(spec)
  const added = Object.keys(B).filter((k) => !A[k]).map((k) => ({ op: k, summary: B[k].summary || '' }))
  const removed = Object.keys(A).filter((k) => !B[k])
  const changed = []
  for (const k of Object.keys(B)) if (A[k]) {
    const d = { op: k }; let any = false
    for (const [name, fn] of [['params', params], ['body', bodyFields], ['responses', codes]]) { const x = diffList(fn(A[k]), fn(B[k])); if (x.added.length || x.removed.length) { d[name] = x; any = true } }
    if (any) changed.push(d)
  }
  const keys = backendKeys(); const fe = frontendKeys(); const missingKeys = keys ? keys.filter((k) => !fe.has(k)) : []
  const result = { source, baseline_ops: Object.keys(A).length, current_ops: Object.keys(B).length, added, removed, changed, settings_missing_in_ui: missingKeys }
  const dirty = added.length || removed.length || changed.length || missingKeys.length
  if (asJson) { console.log(JSON.stringify(result, null, 2)); process.exit(dirty ? 1 : 0) }
  console.log(`Nguồn: ${source}\nMốc: ${result.baseline_ops} thao tác · Hiện tại: ${result.current_ops} thao tác\n`)
  if (!dirty) { console.log('Không có thay đổi API nào so với mốc — giao diện đang khớp backend.'); return }
  if (added.length) { console.log(`+ THÊM (${added.length})`); added.forEach((a) => console.log(`  ${a.op}${a.summary && !a.summary.startsWith(a.op.split(' ')[0]) ? ' — ' + a.summary.slice(0, 110) : ''}`)) }
  if (removed.length) { console.log(`- BỎ (${removed.length})`); removed.forEach((r) => console.log('  ' + r)) }
  if (changed.length) {
    console.log(`~ ĐỔI (${changed.length})`)
    for (const c of changed) {
      const parts = []
      for (const n of ['params', 'body', 'responses']) if (c[n]) parts.push(`${n} ${c[n].added.map((x) => '+' + x).join(' ')} ${c[n].removed.map((x) => '-' + x).join(' ')}`.trim())
      console.log(`  ${c.op} | ${parts.join(' ; ')}`)
    }
  }
  if (missingKeys.length) { console.log(`! KHÓA CẤU HÌNH CHƯA CÓ TRÊN TRANG QUẢN TRỊ (${missingKeys.length})`); missingKeys.forEach((k) => console.log('  ' + k)) }
  console.log('\nCập nhật giao diện xong thì chạy: npm run api:accept')
  process.exit(1)
})().catch((e) => { console.error(e.message || e); process.exit(2) })
