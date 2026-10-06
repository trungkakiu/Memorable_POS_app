// Tạo bản xem trước cho các loại tệp mà API cho phép: pdf, docx, xlsx, pptx, ảnh (png, jpg/jfif, webp, gif, bmp, avif; TIFF/HEIC chỉ tải về), txt, md, csv.
// Mọi thứ chạy ngay trong ứng dụng (không gửi tệp đi đâu); thư viện nặng được nạp khi cần.
import { parseCsv } from './csv'
import { AUDIO_MIME, DOWNLOAD_ONLY_IMAGE, IMAGE_MIME } from './api'

export type FileKind = 'image' | 'rawimage' | 'audio' | 'pdf' | 'text' | 'md' | 'csv' | 'docx' | 'xlsx' | 'pptx' | 'archive' | 'office' | 'other'

export const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase()
export function kindOf(name: string): FileKind {
  const e = extOf(name)
  if (DOWNLOAD_ONLY_IMAGE.includes(e)) return 'rawimage'
  if (IMAGE_MIME[e]) return 'image'
  if (AUDIO_MIME[e]) return 'audio'
  if (e === 'pdf') return 'pdf'
  if (['txt', 'log', 'json', 'xml', 'yaml', 'yml'].includes(e)) return 'text'
  if (e === 'md') return 'md'
  if (e === 'csv' || e === 'tsv') return 'csv'
  if (e === 'docx') return 'docx'
  if (e === 'xlsx') return 'xlsx'
  if (e === 'pptx') return 'pptx'
  if (e === 'zip') return 'archive'
  if (['doc', 'xls', 'ppt', 'odt', 'ods', 'odp', 'rtf'].includes(e)) return 'office'
  return 'other'
}
export const KIND_LABEL: Record<FileKind, string> = {
  image: 'Ảnh', rawimage: 'Ảnh (TIFF/HEIC, tải về để xem)', audio: 'Ghi âm', pdf: 'PDF', text: 'Văn bản', md: 'Markdown', csv: 'Bảng CSV', docx: 'Word', xlsx: 'Excel', pptx: 'PowerPoint', archive: 'Tệp nén', office: 'Tài liệu Office', other: 'Tệp',
}
export const isPreviewable = (name: string) => !['other', 'archive', 'office', 'rawimage'].includes(kindOf(name))
const MIME: Record<string, string> = { ...IMAGE_MIME, ...AUDIO_MIME, pdf: 'application/pdf' }
export const mimeOf = (name: string) => MIME[extOf(name)] || 'application/octet-stream'

export interface Sheet { name: string; rows: string[][]; truncated?: boolean }
export type Preview =
  | { type: 'image'; url: string }
  | { type: 'pdf'; url: string }
  | { type: 'audio'; url: string }
  | { type: 'text'; text: string; truncated?: boolean }
  | { type: 'md'; text: string }
  | { type: 'table'; sheets: Sheet[] }
  | { type: 'html'; html: string; notes?: string[] }
  | { type: 'slides'; slides: string[] }
  | { type: 'none'; reason: string }

const MAX_ROWS = 300
const MAX_COLS = 40
const MAX_TEXT = 300_000
const decode = (b: Uint8Array) => new TextDecoder('utf-8').decode(b)

export const bytesToBase64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s) }
export const base64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

const colIndex = (ref: string) => { const m = /^([A-Z]+)/.exec(ref); if (!m) return 0; return m[1].split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1 }

export async function parseXlsx(bytes: Uint8Array): Promise<Sheet[]> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(bytes)
  const parser = new DOMParser()
  const xml = async (p: string) => { const f = zip.file(p); return f ? parser.parseFromString(await f.async('string'), 'application/xml') : null }
  const ss = await xml('xl/sharedStrings.xml')
  const shared = ss ? Array.from(ss.getElementsByTagName('si')).map((si) => Array.from(si.getElementsByTagName('t')).map((t) => t.textContent || '').join('')) : []
  const wb = await xml('xl/workbook.xml'); const rels = await xml('xl/_rels/workbook.xml.rels')
  const relMap = new Map<string, string>()
  rels && Array.from(rels.getElementsByTagName('Relationship')).forEach((r) => relMap.set(r.getAttribute('Id') || '', (r.getAttribute('Target') || '').replace(/^\/?(xl\/)?/, 'xl/')))
  const sheetDefs = wb ? Array.from(wb.getElementsByTagName('sheet')) : []
  const out: Sheet[] = []
  for (let i = 0; i < sheetDefs.length && i < 12; i++) {
    const d = sheetDefs[i]
    const rid = d.getAttribute('r:id') || d.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || ''
    const path = relMap.get(rid) || `xl/worksheets/sheet${i + 1}.xml`
    const doc = await xml(path); if (!doc) continue
    const rows: string[][] = []; let truncated = false
    for (const row of Array.from(doc.getElementsByTagName('row'))) {
      if (rows.length >= MAX_ROWS) { truncated = true; break }
      const r: string[] = []
      for (const c of Array.from(row.getElementsByTagName('c'))) {
        const idx = Math.min(colIndex(c.getAttribute('r') || ''), MAX_COLS - 1)
        const t = c.getAttribute('t'); const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
        let val = v
        if (t === 's') val = shared[Number(v)] ?? ''
        else if (t === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map((x) => x.textContent || '').join('')
        else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE'
        while (r.length <= idx) r.push('')
        r[idx] = val
      }
      rows.push(r)
    }
    out.push({ name: d.getAttribute('name') || `Sheet ${i + 1}`, rows, truncated })
  }
  return out
}

export async function parsePptx(bytes: Uint8Array): Promise<string[]> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(bytes)
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]))
  const parser = new DOMParser(); const slides: string[] = []
  for (const n of names.slice(0, 80)) {
    const doc = parser.parseFromString(await zip.files[n].async('string'), 'application/xml')
    const paras = Array.from(doc.getElementsByTagName('a:p')).map((p) => Array.from(p.getElementsByTagName('a:t')).map((t) => t.textContent || '').join('')).filter((t) => t.trim())
    slides.push(paras.join('\n'))
  }
  return slides
}

/** Tạo bản xem trước từ nội dung nhị phân. Ném lỗi nếu tệp hỏng. */
export async function buildPreview(name: string, bytes: Uint8Array): Promise<Preview> {
  const kind = kindOf(name)
  switch (kind) {
    case 'image': return { type: 'image', url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(name) })) }
    case 'pdf': return { type: 'pdf', url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })) }
    case 'audio': return { type: 'audio', url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(name) })) }
    case 'text': { const t = decode(bytes); return { type: 'text', text: t.slice(0, MAX_TEXT), truncated: t.length > MAX_TEXT } }
    case 'md': return { type: 'md', text: decode(bytes).slice(0, MAX_TEXT) }
    case 'csv': {
      const rows = parseCsv(decode(bytes).replace(/^﻿/, '')); const truncated = rows.length > MAX_ROWS
      return { type: 'table', sheets: [{ name: 'CSV', rows: rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS)), truncated }] }
    }
    case 'xlsx': { const sheets = await parseXlsx(bytes); return sheets.length ? { type: 'table', sheets } : { type: 'none', reason: 'Bảng tính không có dữ liệu để hiển thị' } }
    case 'pptx': { const slides = await parsePptx(bytes); return slides.length ? { type: 'slides', slides } : { type: 'none', reason: 'Không đọc được nội dung các slide' } }
    case 'docx': {
      const mammoth = await import('mammoth')
      const res = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer })
      const DOMPurify = (await import('dompurify')).default
      const html = DOMPurify.sanitize(res.value, { USE_PROFILES: { html: true } })
      return { type: 'html', html, notes: res.messages.filter((m) => m.type === 'warning' && !/Unrecognised|style/i.test(m.message)).slice(0, 3).map((m) => m.message) }
    }
    case 'rawimage': return { type: 'none', reason: `Ảnh .${extOf(name).toUpperCase()} (thường từ máy scan hoặc iPhone) chưa hiển thị được trong ứng dụng — hãy tải về hoặc mở bằng ứng dụng của máy. AI vẫn đọc được ảnh này.` }
    default: return { type: 'none', reason: 'Loại tệp này chưa xem trước được trong ứng dụng' }
  }
}

export const releasePreview = (p: Preview | null | undefined) => { if (p && (p.type === 'image' || p.type === 'pdf' || p.type === 'audio')) URL.revokeObjectURL(p.url) }
