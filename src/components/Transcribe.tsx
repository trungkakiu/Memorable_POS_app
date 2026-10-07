// Chép lời ghi âm bằng AI: chọn file ghi âm hoặc ghi âm ngay trong ứng dụng -> AI chép thành chữ có mốc thời gian.
// Bấm mốc thời gian để nghe lại đúng đoạn đó; sửa chữ, sao chép, lưu tệp, hỏi trợ lý về nội dung, hoặc soạn thành bài tri thức.
// Dùng chung cho giao diện người đọc (thân thiện) và quản trị (thêm số liệu kỹ thuật).
import { DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertTriangle, Check, ClipboardCopy, Download, FilePlus2, Languages, Loader2, MessageCircleQuestion, Mic, Pencil, Play, RotateCcw, Sparkles, Trash2, UploadCloud, X,
} from 'lucide-react'
import { AUDIO_EXT, AUDIO_MIME, LocalFile, checkFile, deskApi, fromBrowserFile, isAudioName, pickLocalFiles, AUDIO_MB } from '../lib/api'
import { bytes as fmtBytes } from '../lib/format'
import { extOf } from '../lib/preview'
import { can } from '../lib/permissions'
import { Recorder, SttLanguage, Transcript, clock, startRecorder, sttError, transcribeFile } from '../lib/stt'
import { queueImportFiles } from '../lib/smartImport'
import { queueMyFile } from '../reader/fileQueue'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { toast } from '../store/ui'
import { PageHeader } from './ui'

// File ghi âm do nơi khác chuyển sang (kéo vào khung hỏi, chọn từ menu +)
let queued: LocalFile | null = null
export const queueAudio = (f: LocalFile) => { queued = f }

const MAX_REC_SECONDS = 30 * 60 // ghi âm trong ứng dụng tối đa 30 phút (khoảng 7 MB)
const BARS = 36
const LANGS: { value: SttLanguage; label: string }[] = [{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'Tiếng Anh' }, { value: 'auto', label: 'Tự nhận biết' }]

type Variant = 'reader' | 'admin'
const UI = {
  reader: { card: 'rd-card p-6', btn: 'rd-btn', btn2: 'rd-btn secondary sm', big: 'rd-btn lg', chip: 'rd-chip', warn: 'rd-callout warn', bad: 'rd-callout bad', info: 'rd-callout info !py-3 text-[0.92em]' },
  admin: {
    card: 'card !p-5', btn: 'btn', btn2: 'btn outline sm', big: 'btn', chip: 'pill',
    warn: 'rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2.5 flex gap-2 text-sm', bad: 'rounded-lg bg-red-50 border border-red-200 text-red-800 px-3 py-2.5 flex gap-2 text-sm',
    info: 'rounded-lg bg-brand-50 border border-line-soft text-ink-2 px-3 py-2.5 flex gap-2 text-[13px]',
  },
}

// Lời chép trả về một khối liền: chia thành đoạn văn khoảng 500 ký tự theo ranh giới câu cho dễ đọc
const paragraphs = (text: string, size = 500) => {
  const out: string[] = []; let cur = ''
  for (const s of text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+/)) { if (cur && cur.length + s.length > size) { out.push(cur); cur = s } else cur = cur ? `${cur} ${s}` : s }
  if (cur) out.push(cur)
  return out
}
const baseName = (n: string) => n.replace(/\.[^.]+$/, '') || 'ghi-am'
const toTxtFile = (name: string, text: string): LocalFile => { const bytes = new TextEncoder().encode(text); return { name, size: bytes.length, bytes } }

export default function TranscribeWorkbench({ variant = 'reader' }: { variant?: Variant }) {
  const c = UI[variant]
  const admin = variant === 'admin'
  const nav = useNavigate()
  const role = useAuth((s) => s.user?.role)
  const status = useChat((s) => s.status)
  const off = !!status && !status.features.includes('transcribe')

  const [file, setFile] = useState<LocalFile | null>(null)
  const [recordedSecs, setRecordedSecs] = useState<number | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [lang, setLang] = useState<SttLanguage>('vi')
  const [hints, setHints] = useState('')
  const [over, setOver] = useState(false)
  const [rec, setRec] = useState<'off' | 'starting' | 'on'>('off')
  const [secs, setSecs] = useState(0)
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0))
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<Transcript | null>(null)
  const [edit, setEdit] = useState(false)
  const [text, setText] = useState('')
  const recorder = useRef<Recorder | null>(null)
  const player = useRef<HTMLAudioElement>(null)

  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file?.bytes) { setUrl(null); return }
    const u = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: AUDIO_MIME[extOf(file.name)] || 'audio/webm' }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  useEffect(() => { void useChat.getState().loadStatus(); if (queued) { const f = queued; queued = null; choose(f) } }, []) // eslint-disable-line
  useEffect(() => () => recorder.current?.cancel(), [])
  useEffect(() => { if (rec !== 'on') return; setSecs(0); const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t) }, [rec])
  useEffect(() => { if (!busy) return; setElapsed(0); const t = setInterval(() => setElapsed((s) => s + 1), 1000); return () => clearInterval(t) }, [busy])

  function choose(f: LocalFile, recorded: number | null = null) {
    if (!isAudioName(f.name)) return toast.warn(`${f.name}: đây không phải file ghi âm (nhận ${AUDIO_EXT.join(', ')})`)
    const bad = checkFile(f); if (bad || !f.bytes) return toast.warn(`${f.name}: ${bad || 'không đọc được tệp'}`)
    setFile(f); setRecordedSecs(recorded); setDuration(recorded); setRes(null); setErr(''); setEdit(false)
  }
  async function pick() { try { const [f] = await pickLocalFiles('audio'); if (f) choose(f) } catch (e) { toast.error(e) } }
  async function onDrop(e: DragEvent) { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) choose(await fromBrowserFile(f)) }
  function reset() { setFile(null); setRes(null); setErr(''); setEdit(false); setRecordedSecs(null); setDuration(null) }

  async function startRec() {
    if (rec !== 'off') return
    setRec('starting'); setLevels(Array(BARS).fill(0))
    try {
      recorder.current = await startRecorder({ onLevel: (l) => setLevels((x) => [...x.slice(1), l]), maxSeconds: MAX_REC_SECONDS, onLimit: () => { toast.info('Đã ghi đủ 30 phút, tự dừng để chép lời.'); void stopRec() } })
      reset(); setRec('on')
    } catch (e) { setRec('off'); toast.error((e as Error).message) }
  }
  async function stopRec() {
    const r = recorder.current; if (!r) return
    recorder.current = null; const took = secs; setRec('off')
    const f = await r.stop()
    if (!f) return toast.warn('Chưa ghi được tiếng nào. Hãy thử lại và nói gần micro hơn.')
    choose(f, took)
    void run(f)
  }
  function cancelRec() { recorder.current?.cancel(); recorder.current = null; setRec('off') }

  async function run(f = file) {
    if (!f || busy) return
    setBusy(true); setErr(''); setRes(null); setEdit(false)
    try {
      const r = await transcribeFile(f, { language: lang, hints })
      setRes(r); setText(r.text)
      if (r.duration_sec) setDuration(r.duration_sec)
      if (!r.text) setErr('Không nghe thấy lời nói nào trong bản ghi. Hãy kiểm tra lại file (có thể chỉ có nhạc hoặc tiếng ồn).')
    } catch (e) { setErr(sttError(e)) } finally { setBusy(false) }
  }

  const seek = (t: number) => { const p = player.current; if (!p) return; p.currentTime = t; void p.play().catch(() => undefined) }
  const edited = !!res && text !== res.text
  // Văn bản để sao chép / lưu: bản đã sửa, hoặc lời chép kèm mốc thời gian
  const plain = () => (!res ? '' : edited || res.segments.length <= 1 ? text : res.segments.filter((s) => s.text).map((s) => `[${clock(s.start)}] ${s.text}`).join('\n\n'))
  const header = () => `Lời chép từ bản ghi: ${file?.name || res?.filename || ''}${duration ? ` (dài ${clock(duration)})` : ''}\nAI chép lời, có thể nghe nhầm tên riêng và con số.\n\n`
  async function copy() { try { await navigator.clipboard.writeText(plain()); toast.ok('Đã sao chép lời chép') } catch { toast.error('Không sao chép được') } }
  async function save() {
    const r = await deskApi().saveFile({ content: header() + plain(), filename: `${baseName(file?.name || 'ghi-am')}-loi-chep.txt`, filters: [{ name: 'Văn bản', extensions: ['txt'] }] })
    if (r.ok && r.data?.ok) toast.ok('Đã lưu tệp')
  }
  function askAbout() { queueMyFile(toTxtFile(`${baseName(file?.name || 'ghi-am')}-loi-chep.txt`, header() + plain())); nav('/my-file') }
  function toKnowledge() { queueImportFiles([toTxtFile(`${baseName(file?.name || 'ghi-am')}-loi-chep.txt`, header() + plain())]); nav('/import-knowledge') }

  const estimate = duration ? Math.ceil((duration / 60) * 2.5) + 6 : null
  const recording = rec !== 'off'

  return (
    <div className="flex flex-col gap-5">
      {off && <div className={c.warn}><AlertTriangle size={20} className="shrink-0 mt-0.5" /><div>Tính năng <b>chép lời bằng AI</b> đang tắt trên máy chủ. {admin ? 'Bật lại ở Quản trị › Cài đặt AI (ai_feature_transcribe).' : 'Hãy báo quản trị viên để bật.'}</div></div>}

      {/* ---- Chọn nguồn âm thanh ---- */}
      {!file && !recording && (
        <div className="grid md:grid-cols-[1.4fr_1fr] gap-4">
          <div className={clsx(c.card, 'text-center flex flex-col items-center gap-3 border-dashed !border-2 transition', over ? '!border-[#7a2ee6] bg-brand-50' : '!border-brand-200')}
            onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => void onDrop(e)}>
            <span className={admin ? 'tsc-ico' : 'rd-ico lg g'}><UploadCloud size={30} /></span>
            <div className={admin ? 'font-bold text-[15px]' : 'text-[1.25em] font-black'}>Kéo file ghi âm vào đây</div>
            <div className="text-muted max-w-[460px] leading-relaxed text-[0.92em]">Ghi âm cuộc họp, cuộc gọi, bài giảng, ghi chú giọng nói… Nhận mp3, m4a (iPhone), wav, ogg, opus, webm, amr, aac, flac, wma, 3gp. Tối đa {AUDIO_MB} MB.</div>
            <button className={c.big} disabled={off} onClick={() => void pick()}><UploadCloud size={admin ? 15 : 22} />Chọn file ghi âm</button>
          </div>
          <div className={clsx(c.card, 'flex flex-col items-center justify-center text-center gap-3')}>
            <button className="tsc-mic" disabled={off} onClick={() => void startRec()} aria-label="Bắt đầu ghi âm"><Mic size={34} /></button>
            <div className={admin ? 'font-bold text-[15px]' : 'text-[1.15em] font-black'}>Ghi âm ngay</div>
            <div className="text-muted text-[0.9em] leading-relaxed max-w-[300px]">Bấm nút, nói, rồi bấm “Xong”. AI sẽ chép lời ngay sau đó.</div>
          </div>
        </div>)}

      {/* ---- Đang ghi âm ---- */}
      {recording && (
        <div className={clsx(c.card, 'flex flex-col items-center gap-4 text-center')} aria-live="polite">
          <div className="flex items-center gap-3 font-black text-[1.4em]"><span className="tsc-dot" />{clock(secs)}</div>
          <div className="tsc-bars">{levels.map((l, i) => <i key={i} style={{ height: `${Math.max(6, Math.round(l * 100))}%` }} />)}</div>
          <div className="text-muted text-[0.92em]">{rec === 'starting' ? 'Đang mở micro…' : 'Đang ghi âm — cứ nói tự nhiên, tối đa 30 phút'}</div>
          <div className="flex gap-3 flex-wrap justify-center">
            <button className={c.btn2} onClick={cancelRec}><X size={17} />Hủy</button>
            <button className={c.big} disabled={rec !== 'on'} onClick={() => void stopRec()}><Check size={admin ? 15 : 22} />Xong, chép lời</button>
          </div>
        </div>)}

      {/* ---- File đã chọn ---- */}
      {file && (
        <div className={clsx(c.card, 'flex flex-col gap-4')}>
          <div className="flex items-center gap-4 flex-wrap">
            <span className={admin ? 'tsc-ico text-xl' : 'rd-ico lg text-3xl'}>🎧</span>
            <div className="min-w-0 flex-1 basis-[220px]"><div className={clsx('font-black break-words', !admin && 'text-[1.1em]')}>{file.name}</div>
              <div className="text-[0.88em] text-muted mt-1">{fmtBytes(file.size)}{duration ? ` · dài ${clock(duration)}` : ''}{recordedSecs != null ? ' · vừa ghi trong ứng dụng' : ''}</div></div>
            <button className={c.btn2} disabled={busy} onClick={() => void pick()}><RotateCcw size={16} />Đổi file</button>
            <button className={c.btn2} disabled={busy} onClick={reset}><Trash2 size={16} />Bỏ</button>
          </div>
          {url && <audio ref={player} src={url} controls preload="metadata" className="w-full" onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0 && !res) setDuration(d) }} />}

          {!res && !busy && (
            <div className="flex flex-col gap-3">
              <div className="grid sm:grid-cols-[auto_1fr] gap-3 items-end">
                <label className="flex flex-col gap-1.5 text-[0.9em] font-bold"><span className="flex items-center gap-1.5"><Languages size={16} />Ngôn ngữ nói</span>
                  <select className={admin ? 'select' : 'tsc-field'} value={lang} onChange={(e) => setLang(e.target.value as SttLanguage)}>{LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select></label>
                <label className="flex flex-col gap-1.5 text-[0.9em] font-bold">Tên riêng, mã số, thuật ngữ có trong bản ghi <span className="font-normal text-muted">(không bắt buộc — giúp AI nghe đúng hơn)</span>
                  <input className={admin ? 'input' : 'tsc-field'} value={hints} maxLength={300} placeholder="Ví dụ: KHO-4471, chị Lan, kiểm kê" onChange={(e) => setHints(e.target.value)} /></label>
              </div>
              <div><button className={c.big} disabled={off} onClick={() => void run()}><Sparkles size={admin ? 15 : 22} />Chép lời bằng AI</button></div>
            </div>)}

          {busy && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3 font-bold"><Loader2 size={22} className="animate-spin text-brand-500" />AI đang nghe và chép lời… {clock(elapsed)}</div>
              <div className="tsc-progress"><i /></div>
              <div className="text-[0.88em] text-muted">{estimate ? `Bản ghi dài ${clock(duration!)}, thường mất khoảng ${estimate < 60 ? `${estimate} giây` : `${Math.ceil(estimate / 60)} phút`}. ` : ''}Bản ghi dài được chia thành từng đoạn ở chỗ ngắt nghỉ và chép cùng lúc.</div>
            </div>)}
        </div>)}

      {err && <div className={c.bad}><AlertTriangle size={20} className="shrink-0 mt-0.5" /><div><b className="block">Chưa chép lời được</b>{err}</div></div>}

      {/* ---- Kết quả ---- */}
      {res && res.text && (
        <div className={clsx(c.card, 'flex flex-col gap-4')}>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={clsx('font-black mr-auto', admin ? 'text-[15px]' : 'text-[1.2em]')}>Lời chép</div>
            <button className={c.btn2} onClick={() => setEdit(!edit)}>{edit ? <Check size={16} /> : <Pencil size={16} />}{edit ? 'Xong' : 'Sửa chữ'}</button>
            <button className={c.btn2} onClick={() => void copy()}><ClipboardCopy size={16} />Sao chép</button>
            <button className={c.btn2} onClick={() => void save()}><Download size={16} />Lưu tệp</button>
          </div>

          {admin && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-[12.5px]">
              {[['Độ dài', clock(res.duration_sec)], ['Số đoạn', String(res.segments.length)], ['Ký tự', res.text.length.toLocaleString('vi-VN')], ['Ngôn ngữ', res.language], ['Mô hình', res.model || '—'], ['Chi phí', `$${res.cost_usd}`]].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line-soft bg-brand-50 px-3 py-2"><div className="text-muted">{k}</div><div className="font-bold font-mono break-all">{v}</div></div>))}
            </div>)}

          {edit ? (
            <textarea className="tsc-edit" value={text} onChange={(e) => setText(e.target.value)} aria-label="Sửa lời chép" />
          ) : edited ? (
            <div className="tsc-text whitespace-pre-wrap">{text}</div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[60vh] overflow-auto pr-1">
              {res.segments.filter((s) => s.text).map((s) => (
                <div key={s.index} className="tsc-seg">
                  {res.segments.length > 1 && <button className="tsc-time" title="Nghe lại đoạn này" onClick={() => seek(s.start)}><Play size={13} fill="currentColor" />{clock(s.start)}</button>}
                  <div className="tsc-text">{paragraphs(s.text).map((p, i) => <p key={i}>{p}</p>)}</div>
                </div>))}
            </div>)}
          {edited && !edit && <div className="text-[0.85em] text-muted">Bạn đã sửa lời chép. <button className="underline font-bold" onClick={() => setText(res.text)}>Khôi phục bản AI chép</button></div>}

          <div className={c.info}><AlertTriangle size={18} className="shrink-0 mt-0.5" /><div>Chữ do AI nghe có thể <b>nhầm tên riêng và con số</b>. Bấm vào mốc thời gian để nghe lại đúng đoạn đó và sửa nếu cần.{res.notes?.length ? ` ${res.notes.join(' ')}` : ''}</div></div>

          <div className="flex gap-3 flex-wrap">
            <button className={c.btn} onClick={askAbout}><MessageCircleQuestion size={admin ? 15 : 20} />Hỏi trợ lý về nội dung này</button>
            {admin && can(role, 'write') && <button className={c.btn} onClick={toKnowledge}><FilePlus2 size={15} />Soạn thành bài tri thức (AI)</button>}
            <button className={admin ? 'btn outline' : 'rd-btn secondary'} disabled={busy} onClick={() => void run()}><RotateCcw size={admin ? 15 : 18} />Chép lại</button>
          </div>
        </div>)}
    </div>)
}

/** Trang người đọc: lời lẽ đơn giản, nút to */
export function ReaderTranscribePage() {
  return (
    <div className="flex flex-col gap-6 max-w-[980px] mx-auto w-full">
      <div><h1 className="rd-h2 !mb-1">Chép lời ghi âm</h1><p className="rd-sub !mb-0">Biến bản ghi âm cuộc họp, cuộc gọi hay ghi chú giọng nói thành chữ. AI chép giúp bạn, có mốc thời gian để bấm nghe lại.</p></div>
      <TranscribeWorkbench variant="reader" />
    </div>)
}

/** Trang quản trị: thêm số liệu kỹ thuật (mô hình, chi phí, số đoạn) và nút soạn thành bài tri thức */
export function AdminTranscribePage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Chép lời ghi âm (AI)" subtitle="POST /ai/transcribe · cắt đoạn ở khoảng lặng, chép song song, có mốc thời gian · không lưu âm thanh" />
      <TranscribeWorkbench variant="admin" />
    </div>)
}
