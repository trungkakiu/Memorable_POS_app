import { deskApi } from './api'

export type CsvCol<T> = { header: string; value: (row: T) => string | number | null | undefined }

export function toCsv<T>(rows: T[], cols: CsvCol<T>[]) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.map((c) => esc(c.header)).join(','), ...rows.map((r) => cols.map((c) => esc(c.value(r))).join(','))].join('\r\n')
}

/** Lưu CSV (có BOM để Excel đọc đúng tiếng Việt). */
export async function exportCsv<T>(filename: string, rows: T[], cols: CsvCol<T>[]) {
  const r = await deskApi().saveFile({ content: '﻿' + toCsv(rows, cols), filename, filters: [{ name: 'CSV', extensions: ['csv'] }] })
  return r.data
}

/** Phân tích CSV đơn giản (có hỗ trợ dấu ngoặc kép) → mảng object theo dòng tiêu đề. */
export function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, '')); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}
