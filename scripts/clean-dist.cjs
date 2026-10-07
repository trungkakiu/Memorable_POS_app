// Xóa sạch dist/ trước khi build: Vite không phải lúc nào cũng dọn được (tệp bị khóa), để lại các bản build cũ
// làm bản cài nặng thêm và còn mã cũ. Xóa từng tệp rồi xóa thư mục rỗng; tệp đang bị khóa thì báo và bỏ qua.
const fs = require('node:fs')
const path = require('node:path')

const dist = path.join(__dirname, '..', 'dist')
let removed = 0
const locked = []
function clean(dir) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { clean(p); try { fs.rmdirSync(p) } catch { /* còn tệp bị khóa */ } }
    else { try { fs.unlinkSync(p); removed++ } catch { locked.push(path.relative(dist, p)) } }
  }
}
clean(dist)
console.log(`Đã dọn dist/: xóa ${removed} tệp${locked.length ? `, ${locked.length} tệp đang bị khóa (bỏ qua): ${locked.slice(0, 5).join(', ')}` : ''}`)
