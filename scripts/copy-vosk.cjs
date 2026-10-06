// Tách worker của vosk-browser (vốn nhúng base64 rồi chạy từ blob:) ra public/vosk/vosk-worker.js.
// Worker chạy từ tệp riêng không kế thừa CSP của trang, nên trang vẫn giữ script-src chặt (không cần 'unsafe-eval').
// Mô hình tiếng Việt public/vosk/vi.tar.gz: vosk-model-small-vn-0.4 (alphacephei.com), đóng gói lại dạng tar.gz có thư mục gốc.
const fs = require('node:fs'); const path = require('node:path')
const root = path.join(__dirname, '..'); const out = path.join(root, 'public', 'vosk')
fs.mkdirSync(out, { recursive: true })
const src = fs.readFileSync(path.join(root, 'node_modules/vosk-browser/dist/vosk.js'), 'utf8')
const key = "createBase64WorkerFactory('"; const i = src.lastIndexOf(key); const j = src.indexOf("'", i + key.length)
if (i < 0 || j < 0) throw new Error('Không tìm thấy worker trong vosk-browser')
const code = Buffer.from(src.slice(i + key.length, j), 'base64').toString('utf8')
// giống createURL() của thư viện: bỏ dòng chú thích đầu tiên
fs.writeFileSync(path.join(out, 'vosk-worker.js'), code.substring(code.indexOf('\n', 10) + 1))
console.log('Vosk worker:', (fs.statSync(path.join(out, 'vosk-worker.js')).size / 1e6).toFixed(1), 'MB')
