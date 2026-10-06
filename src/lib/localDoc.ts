// Đọc tệp ngay trên máy người dùng: trích chữ (Word, Excel, PowerPoint, PDF, ảnh bằng OCR, văn bản…),
// chia đoạn, chọn các đoạn liên quan tới câu hỏi và che dữ liệu nhạy cảm — chỉ phần trích mới được gửi cho AI.
import { AUDIO_EXT, DOWNLOAD_ONLY_IMAGE, IMAGE_EXT, IMAGE_MIME, type LocalFile } from './api'
import { extOf, parsePptx, parseXlsx } from './preview'
import { ocrImage } from './ocr'

export interface LocalDoc {
  name: string; size: number; kind: 'image' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'office' | 'text'; method: string
  text: string; pages: string[] | null; chars: number; truncated: boolean; ocrConfidence?: number; pageCount?: number
}
export type Progress = (p: { stage: string; pct?: number }) => void

const MAX_CHARS = 600_000
const TEXT_EXT = ['txt', 'md', 'csv', 'tsv', 'log', 'json', 'xml', 'yaml', 'yml']
// Ảnh đọc chữ được ngay trên máy (trình duyệt giải mã được); TIFF/HEIC cần máy chủ chuyển định dạng
const IMG_EXT = IMAGE_EXT.filter((e) => !DOWNLOAD_ONLY_IMAGE.includes(e))
const decode = (b: Uint8Array) => new TextDecoder('utf-8').decode(b).replace(/^﻿/, '')
const cap = (s: string) => (s.length > MAX_CHARS ? { t: s.slice(0, MAX_CHARS), cut: true } : { t: s, cut: false })

export function kindOfLocal(name: string): LocalDoc['kind'] | 'unsupported' {
  const e = extOf(name)
  if (IMG_EXT.includes(e)) return 'image'
  if (e === 'pdf') return 'pdf'
  if (e === 'docx') return 'docx'
  if (e === 'xlsx') return 'xlsx'
  if (e === 'pptx') return 'pptx'
  if (['odt', 'ods', 'odp', 'rtf'].includes(e)) return 'office'
  if (TEXT_EXT.includes(e)) return 'text'
  return 'unsupported'
}
export const LOCAL_ACCEPT = [...TEXT_EXT, ...IMG_EXT, 'pdf', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'rtf']

async function pdfText(bytes: Uint8Array, onProgress?: Progress) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.({ stage: `Đọc trang ${i}/${pdf.numPages}`, pct: i / pdf.numPages })
    const page = await pdf.getPage(i)
    const tc = await page.getTextContent()
    let line = ''; let out = ''
    for (const it of tc.items as { str?: string; hasEOL?: boolean }[]) { line += it.str ?? ''; if (it.hasEOL) { out += line + '\n'; line = '' } else line += ' ' }
    pages.push((out + line).replace(/[ \t]+\n/g, '\n').trim())
  }
  // PDF dạng ảnh quét (gần như không có chữ): OCR tối đa 6 trang đầu
  const avg = pages.reduce((a, b) => a + b.length, 0) / Math.max(1, pages.length)
  let method = 'Trích chữ từ PDF'; let conf: number | undefined
  if (avg < 40) {
    const limit = Math.min(pdf.numPages, 6)
    for (let i = 1; i <= limit; i++) {
      onProgress?.({ stage: `PDF dạng ảnh — đang OCR trang ${i}/${limit}`, pct: (i - 1) / limit })
      const page = await pdf.getPage(i)
      const vp = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas'); canvas.width = vp.width; canvas.height = vp.height
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
      const r = await ocrImage(canvas, (p) => onProgress?.({ stage: `PDF dạng ảnh — đang OCR trang ${i}/${limit}`, pct: (i - 1 + p) / limit }))
      pages[i - 1] = r.text; conf = r.confidence
    }
    method = `OCR trên máy (${limit}/${pdf.numPages} trang đầu)`
  }
  return { pages, method, conf, count: pdf.numPages }
}

async function zipXmlText(bytes: Uint8Array, entry: string, paraTags: RegExp) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(bytes); const f = zip.file(entry)
  if (!f) return ''
  const xml = await f.async('string')
  return xml.replace(paraTags, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim()
}
function rtfText(raw: string) {
  return raw.replace(/\\par[d]?/g, '\n').replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode(Number(n) < 0 ? Number(n) + 65536 : Number(n)))
    .replace(/\{\\\*[^{}]*\}/g, '').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** Trích chữ từ tệp trên máy. Ném Error tiếng Việt khi không đọc được. */
export async function readLocalFile(f: LocalFile, onProgress?: Progress): Promise<LocalDoc> {
  if (!f.bytes) throw new Error('Không đọc được nội dung tệp (quá dung lượng cho phép?)')
  const kind = kindOfLocal(f.name); const e = extOf(f.name)
  if (kind === 'unsupported') throw new Error(AUDIO_EXT.includes(e) ? 'Đây là file ghi âm — máy này không tự nghe được. Hãy dùng “Chép lời ghi âm” (ở thanh bên trái) để AI chuyển thành chữ, rồi hỏi về nội dung.' : DOWNLOAD_ONLY_IMAGE.includes(e) ? `Ảnh .${e.toUpperCase()} (thường từ máy scan hoặc iPhone) chưa đọc được ngay trên máy — hãy chọn cách “Nhờ trợ lý đọc và đối chiếu”, máy chủ sẽ tự chuyển định dạng.` : ['doc', 'xls', 'ppt'].includes(e) ?'Tệp Office bản cũ (doc/xls/ppt) chưa đọc được — hãy lưu lại thành docx, xlsx, pptx hoặc pdf.' : e === 'zip' ? 'Chưa đọc được tệp nén — hãy giải nén rồi chọn từng tệp.' : `Loại tệp .${e} chưa hỗ trợ.`)
  const base = { name: f.name, size: f.size, kind }
  onProgress?.({ stage: 'Đang đọc tệp…' })
  if (kind === 'text') { const { t, cut } = cap(decode(f.bytes)); return { ...base, method: 'Đọc văn bản', text: t, pages: null, chars: t.length, truncated: cut } }
  if (kind === 'docx') {
    const mammoth = await import('mammoth')
    const r = await mammoth.extractRawText({ arrayBuffer: f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer })
    const { t, cut } = cap(r.value.trim()); return { ...base, method: 'Trích chữ từ Word', text: t, pages: null, chars: t.length, truncated: cut }
  }
  if (kind === 'xlsx') {
    const sheets = await parseXlsx(f.bytes)
    const txt = sheets.map((s) => `Bảng tính “${s.name}”\n` + s.rows.map((r) => r.map((c) => (c ?? '').trim()).join(' | ')).join('\n')).join('\n\n')
    const { t, cut } = cap(txt); return { ...base, method: 'Trích chữ từ Excel', text: t, pages: null, chars: t.length, truncated: cut || sheets.some((s) => s.truncated) }
  }
  if (kind === 'pptx') {
    const slides = await parsePptx(f.bytes)
    const pages = slides.map((s, i) => `[Slide ${i + 1}]\n${s}`)
    const { t, cut } = cap(pages.join('\n\n')); return { ...base, method: 'Trích chữ từ PowerPoint', text: t, pages, chars: t.length, truncated: cut, pageCount: slides.length }
  }
  if (kind === 'office') {
    let txt = ''
    if (e === 'rtf') txt = rtfText(decode(f.bytes))
    else txt = await zipXmlText(f.bytes, 'content.xml', /<\/(text:p|text:h|table:table-row|draw:page)>/g)
    const { t, cut } = cap(txt); return { ...base, method: 'Trích chữ từ tài liệu', text: t, pages: null, chars: t.length, truncated: cut }
  }
  if (kind === 'pdf') {
    const r = await pdfText(f.bytes, onProgress)
    const text = r.pages.map((p, i) => `[Trang ${i + 1}]\n${p}`).join('\n\n'); const { t, cut } = cap(text)
    return { ...base, method: r.method, text: t, pages: r.pages, chars: t.length, truncated: cut, ocrConfidence: r.conf, pageCount: r.count }
  }
  // ảnh: OCR trên máy
  onProgress?.({ stage: 'Đang tải bộ đọc chữ trong ảnh…', pct: 0 })
  const blob = new Blob([f.bytes as BlobPart], { type: IMAGE_MIME[e] || 'application/octet-stream' })
  // Bộ đọc chữ chỉ nhận PNG/JPEG/BMP/GIF/WebP: các định dạng khác (AVIF…) được trình duyệt giải mã rồi vẽ lại thành PNG
  let src: Blob | HTMLCanvasElement = blob
  if (!['png', 'jpg', 'jpeg', 'jfif', 'jpe', 'pjpeg', 'pjp', 'bmp', 'gif', 'webp'].includes(e)) {
    try {
      const bmp = await createImageBitmap(blob)
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
      c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close(); src = c
    } catch { throw new Error(`Không mở được ảnh .${e} trên máy này — hãy chọn cách “Nhờ trợ lý đọc và đối chiếu”.`) }
  }
  const r = await ocrImage(src, (p) => onProgress?.({ stage: 'Đang đọc chữ trong ảnh…', pct: p }))
  const { t, cut } = cap(r.text)
  return { ...base, method: 'OCR trên máy', text: t, pages: null, chars: t.length, truncated: cut, ocrConfidence: r.confidence }
}

// ====================================================================
//  Chia đoạn và chọn đoạn liên quan (BM25 đơn giản, không dấu)
// ====================================================================
export interface Chunk { label: string; text: string; idx: number }
const STOP = new Set(['la', 'va', 'cua', 'cho', 'cac', 'nhung', 'mot', 'duoc', 'trong', 'khi', 'the', 'nao', 'gi', 'co', 'khong', 'nay', 'do', 'de', 'voi', 'hay', 'thi', 'bi', 'tu', 'den', 'ra', 'vao', 'se', 'da', 'dang', 'toi', 'ban', 'cai', 'minh', 've', 'o', 'the', 'and', 'the', 'of', 'to', 'is', 'in'])
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
const tokens = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t))

export function chunkDoc(doc: LocalDoc, size = 650): Chunk[] {
  const out: Chunk[] = []
  const push = (label: string, text: string) => { const t = text.trim(); if (t.length > 1) out.push({ label, text: t, idx: out.length }) }
  const split = (label: string, body: string) => {
    const paras = body.split(/\n{2,}|\n(?=[-•*\d]+[.)] )/).map((p) => p.trim()).filter(Boolean)
    let cur = ''
    for (const p of paras) {
      if (p.length > size * 1.4) { if (cur) { push(label, cur); cur = '' } for (let i = 0; i < p.length; i += size) push(label, p.slice(i, i + size)); continue }
      if ((cur + '\n' + p).length > size && cur) { push(label, cur); cur = p } else cur = cur ? cur + '\n' + p : p
    }
    if (cur) push(label, cur)
  }
  if (doc.pages && doc.kind !== 'pptx') doc.pages.forEach((p, i) => split(`trang ${i + 1}`, p))
  else if (doc.pages) doc.pages.forEach((p, i) => split(`slide ${i + 1}`, p.replace(/^\[Slide \d+\]\n?/, '')))
  else split('', doc.text)
  return out.map((c, i) => ({ ...c, label: c.label || `đoạn ${i + 1}` }))
}

/** Chọn các đoạn liên quan nhất tới câu hỏi trong giới hạn `budget` ký tự; giữ thứ tự trong tệp. */
export function pickChunks(chunks: Chunk[], query: string, budget: number): Chunk[] {
  if (!chunks.length) return []
  const q = Array.from(new Set(tokens(query)))
  const docs = chunks.map((c) => tokens(c.text))
  const N = docs.length; const avg = docs.reduce((a, d) => a + d.length, 0) / N || 1
  const df = new Map<string, number>(); docs.forEach((d) => new Set(d).forEach((t) => df.set(t, (df.get(t) || 0) + 1)))
  const scored = chunks.map((c, i) => {
    const tf = new Map<string, number>(); docs[i].forEach((t) => tf.set(t, (tf.get(t) || 0) + 1))
    let s = 0
    for (const t of q) { const f = tf.get(t) || 0; if (!f) continue; const idf = Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5)); s += idf * ((f * 2.5) / (f + 1.5 * (0.25 + 0.75 * (docs[i].length / avg)))) }
    if (q.length > 1 && fold(c.text).includes(fold(query).trim())) s += 2
    return { c, s }
  })
  let pick: Chunk[] = []
  if (scored.some((x) => x.s > 0)) {
    let used = 0
    for (const x of scored.filter((y) => y.s > 0).sort((a, b) => b.s - a.s)) { if (used + x.c.text.length > budget && pick.length) continue; pick.push(x.c); used += x.c.text.length; if (used >= budget) break }
  } else pick = sampleChunks(chunks, budget)
  return pick.sort((a, b) => a.idx - b.idx)
}
/** Lấy các đoạn rải đều trong tệp (dùng cho câu hỏi chung như "tóm tắt"). */
export function sampleChunks(chunks: Chunk[], budget: number): Chunk[] {
  const out: Chunk[] = []; let used = 0
  const n = Math.max(1, Math.min(chunks.length, Math.floor(budget / 450)))
  for (let i = 0; i < n; i++) { const c = chunks[Math.floor((i * chunks.length) / n)]; if (used + c.text.length > budget && out.length) break; if (!out.includes(c)) { out.push(c); used += c.text.length } }
  return out
}
/** Chia tệp thành các phần liên tiếp (<= size ký tự) để tóm tắt từng phần. */
export function segments(chunks: Chunk[], size: number, max: number): Chunk[][] {
  const segs: Chunk[][] = []; let cur: Chunk[] = []; let used = 0
  for (const c of chunks) { if (used + c.text.length > size && cur.length) { segs.push(cur); cur = []; used = 0 } cur.push(c); used += c.text.length }
  if (cur.length) segs.push(cur)
  if (segs.length <= max) return segs
  const pick: Chunk[][] = []; for (let i = 0; i < max; i++) pick.push(segs[Math.floor((i * segs.length) / max)])
  return pick
}

// ====================================================================
//  Che dữ liệu nhạy cảm trước khi gửi (máy chủ chặn mật khẩu, khóa, số điện thoại…)
// ====================================================================
export function redact(text: string): { text: string; count: number } {
  let count = 0
  const sub = (re: RegExp, to: string) => { text = text.replace(re, (...m: string[]) => { count++; return to.replace('$1', m[1] ?? '') }) }
  sub(/(mật\s*khẩu|password|passwd|pwd|api[\s_-]*key|secret|token)\s*[:=]\s*\S+/gi, '$1: [ẨN]')
  sub(/\b(?:sk|pk|ghp|AKIA|xox[bap])[-_A-Za-z0-9]{16,}\b/g, '[ẨN]')
  sub(/\b[A-Za-z0-9+/_-]{36,}={0,2}\b/g, '[ẨN]')
  sub(/(?:\+?84|0)[\s.\-()]?\d(?:[\s.\-()]?\d){7,10}/g, '[SĐT]')
  sub(/\b\d{9,14}\b/g, '[SỐ ẨN]')
  sub(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
  return { text, count }
}

// Móc kiểm thử cho smoke test của bản đóng gói (không ảnh hưởng người dùng).
if (typeof window !== 'undefined') (window as unknown as { __readLocal?: typeof readLocalFile }).__readLocal = readLocalFile
