// Số tiền bằng chữ tiếng Việt, tính ngay trên máy khi người dùng sửa số tiền (cùng quy tắc với máy chủ: utils/vnNumber.js).
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
const UNITS = ['', 'nghìn', 'triệu']

const readGroup = (n: number, full: boolean) => {
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), u = n % 10
  const out: string[] = []
  if (h > 0 || full) out.push(`${DIGITS[h]} trăm`)
  if (t === 0) { if (u > 0 && (h > 0 || full)) out.push('linh') }
  else if (t === 1) out.push('mười')
  else out.push(`${DIGITS[t]} mươi`)
  if (u > 0) out.push(u === 1 && t > 1 ? 'mốt' : u === 5 && t > 0 ? 'lăm' : DIGITS[u])
  return out.join(' ')
}
const belowBillion = (n: number, lead: boolean) => {
  const groups = [Math.floor(n / 1e6), Math.floor((n % 1e6) / 1000), n % 1000]
  const words: string[] = []
  groups.forEach((g, i) => { if (g) words.push([readGroup(g, lead || words.length > 0), UNITS[2 - i]].filter(Boolean).join(' ')) })
  return words.join(' ')
}
export const readInteger = (num: number): string => {
  const n = Math.floor(Math.abs(num))
  if (n === 0) return 'không'
  if (n < 1e9) return belowBillion(n, false)
  const rest = n % 1e9
  return [`${readInteger(Math.floor(n / 1e9))} tỷ`, rest ? belowBillion(rest, true) : ''].filter(Boolean).join(' ')
}

/** "5.400.000", "5,400,000 đ", "5400000" -> 5400000 */
export const parseAmount = (s: string | number): number | null => {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null
  const t = String(s || '').replace(/[^\d.,-]/g, '')
  if (!/\d/.test(t)) return null
  const dec = /[.,](\d{1,2})$/.exec(t)
  const n = Number(`${(dec ? t.slice(0, -dec[0].length) : t).replace(/[.,]/g, '')}${dec ? `.${dec[1]}` : ''}`)
  return Number.isFinite(n) ? n : null
}

const UNIT_WORDS: [RegExp, number][] = [[/^(tỷ|tỉ)$/, 1e9], [/^(triệu|tr)$/, 1e6], [/^(nghìn|ngàn|k)$/, 1e3]]
/** Đọc cả kiểu nói: "5,4 triệu", "2 tỷ 300 triệu", "500k" */
export const parseSpokenAmount = (s: string | number): number | null => {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null
  const t = String(s || '').toLowerCase().replace(/(đồng|vnđ|vnd|đ)\.?/g, ' ').trim()
  if (!t) return null
  if (!/[a-zà-ỹ]/i.test(t)) return parseAmount(t)
  const parts = t.match(/[\d.,]+\s*[a-zà-ỹ]+/gi)
  if (!parts || parts.join('').replace(/\s+/g, '') !== t.replace(/\s+/g, '')) return null
  let total = 0
  for (const p of parts) {
    const m = /^([\d.,]+)\s*([a-zà-ỹ]+)$/i.exec(p.trim())
    const unit = m && UNIT_WORDS.find(([re]) => re.test(m[2]))
    if (!m || !unit) return null
    total += Number(m[1].replace(',', '.')) * unit[1]
  }
  return Math.round(total)
}

export const amountInWords = (value: string | number, currency = 'đồng') => {
  const n = parseSpokenAmount(value)
  if (n === null) return ''
  const text = `${readInteger(n)} ${currency}`.trim()
  return (n < 0 ? 'Âm ' : '') + text.charAt(0).toUpperCase() + text.slice(1)
}

/** 5400000 -> "5.400.000" (giữ phần lẻ: "1.250.000,50") */
export const formatAmount = (value: string | number) => {
  const n = parseSpokenAmount(value)
  if (n === null) return String(value ?? '')
  const cents = Math.round(Math.abs(n) * 100) % 100
  const int = Math.trunc(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${n < 0 ? '-' : ''}${int}${cents ? `,${String(cents).padStart(2, '0')}` : ''}`
}
