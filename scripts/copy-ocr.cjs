// Sao chép bộ OCR (tesseract.js) vào public/ocr để chạy hoàn toàn ngoại tuyến. Dữ liệu ngôn ngữ vie/eng nằm ở public/ocr/lang.
const fs = require('node:fs'); const path = require('node:path')
const root = path.join(__dirname, '..'); const out = path.join(root, 'public', 'ocr', 'core')
fs.mkdirSync(out, { recursive: true })
const copy = (from, name) => fs.copyFileSync(from, path.join(out, name || path.basename(from)))
copy(path.join(root, 'node_modules/tesseract.js/dist/worker.min.js'))
for (const f of fs.readdirSync(path.join(root, 'node_modules/tesseract.js-core'))) if (/-lstm\.wasm\.js$/.test(f)) copy(path.join(root, 'node_modules/tesseract.js-core', f))
console.log('OCR core:', fs.readdirSync(out).join(', '))
