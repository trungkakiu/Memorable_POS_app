// Khung trò chuyện lớn ở trang chủ: gộp trợ lý (tài liệu công ty / + kiến thức chung / tìm trên Internet) và hỏi về tệp
// (ảnh, PDF, Word, Excel, ghi âm: AI nhìn và đọc trực tiếp) vào MỘT khung kiểu ChatGPT. Dùng chung hội thoại với thanh trợ lý
// ở các trang khác (store useChat). Trên trang chủ không còn cửa sổ trợ lý nhỏ.
import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  ArrowRight, ArrowUp, AudioLines, BookOpen, Check, CheckCircle2, FileText, GitCompare, Globe2, History, ImagePlus, Lightbulb, ListChecks, Loader2, Lock,
  MessageCircleQuestion, Mic, Paperclip, Plus, RotateCcw, ScanText, Search, ShieldCheck, Sparkles, Trash2, UploadCloud, Wand2, Wrench, X,
} from 'lucide-react'
import { LocalFile } from '../lib/api'
import { Recorder, startRecorder, sttError, transcribeFile } from '../lib/stt'
import { AskMode, WEB_SCOPE_LABEL, WebScope, useChat } from '../store/chat'
import { toast } from '../store/ui'
import { AttachTray, FileThumb, useAttachments } from '../components/FileKit'
import { PreviewModal } from '../components/FileViewer'
import { Bubble, useLearnedSuggestions } from './Assistant'
import { TYPE_ICON } from './common'
import { queueTemplate, takeQueued } from './fileQueue'
import { isTemplateName } from '../components/Autofill'

type Where = 'documents' | 'hybrid' | 'web'
const MODES: { k: Where; icon: ReactNode; t: string; d: string; feature: string }[] = [
  { k: 'documents', icon: <BookOpen size={16} />, t: 'Tài liệu công ty', d: 'Chỉ trả lời từ tài liệu đã duyệt, luôn kèm bài gốc', feature: 'ask' },
  { k: 'hybrid', icon: <Lightbulb size={16} />, t: '+ Kiến thức chung', d: 'Ưu tiên tài liệu; thiếu thì AI bổ sung, có ghi rõ', feature: 'ask_hybrid' },
  { k: 'web', icon: <Globe2 size={16} />, t: 'Tìm trên Internet', d: 'Ưu tiên trang chính thống, luôn ghi nguồn và kiểm tra nguồn', feature: 'web_search' },
]
const STARTERS: Record<'text' | 'web' | 'file', { icon: ReactNode; t: string }[]> = {
  text: [
    { icon: <Wrench size={17} />, t: 'Máy in không in được thì làm thế nào?' },
    { icon: <ListChecks size={17} />, t: 'Quy trình xử lý khi hệ thống báo lỗi timeout?' },
    { icon: <FileText size={17} />, t: 'Hướng dẫn sao lưu dữ liệu hằng ngày' },
    { icon: <ScanText size={17} />, t: 'Gửi ảnh chụp lỗi hoặc giấy tờ để hỏi' },
  ],
  web: [
    { icon: <Globe2 size={17} />, t: 'Mức lương cơ sở hiện nay là bao nhiêu?' },
    { icon: <Globe2 size={17} />, t: 'Thời hạn nộp tờ khai thuế GTGT theo quý?' },
    { icon: <Globe2 size={17} />, t: 'Cách ký số một file PDF bằng USB token?' },
  ],
  file: [
    { icon: <FileText size={17} />, t: 'Tệp này nói về gì? Tóm tắt giúp tôi' },
    { icon: <ScanText size={17} />, t: 'Đọc lại toàn bộ chữ trong ảnh/tệp' },
    { icon: <ListChecks size={17} />, t: 'Liệt kê các con số, ngày tháng, tên quan trọng' },
    { icon: <Wrench size={17} />, t: 'Ảnh chụp lỗi này nghĩa là gì, xử lý thế nào?' },
  ],
}

export default function HomeChat() {
  const nav = useNavigate()
  const chat = useChat()
  const { msgs, busy, mode, setMode, status, policy, setPolicy, deep, setDeep, webScope, setWebScope, fileCtx, removeFileCtx, clearFileCtx, newConversation, clear, openLearned } = chat
  const has = (f: string) => !status || status.features.includes(f)
  const modes = MODES.filter((x) => has(x.feature))
  const cur: Where = mode === 'hybrid' || mode === 'web' ? mode : 'documents'
  const isWeb = cur === 'web'
  const att = useAttachments()
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState(false)
  const [view, setView] = useState<LocalFile | null>(null)
  const [mic, setMic] = useState<'off' | 'on' | 'busy'>('off')
  const rec = useRef<Recorder | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [sugg, clearSugg] = useLearnedSuggestions(q, !busy && has('web_search') && !att.files.length)
  const visible = msgs.filter((m) => m.role !== 'sys' || !/hội thoại mới/.test(m.text))
  const empty = visible.length === 0
  const withFiles = att.files.length > 0 || (fileCtx.length > 0 && !isWeb)

  useEffect(() => { void chat.loadStatus(); if (chat.agentId) chat.selectAgent(null); if (chat.open) chat.setOpen(false) }, []) // eslint-disable-line
  useEffect(() => { if (mode === 'general') setMode('documents') }, [mode, setMode])
  useEffect(() => { if (status && !modes.some((x) => x.k === cur)) setMode('documents') }, [status]) // eslint-disable-line
  useEffect(() => { if (!empty) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs.length, busy, empty])
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(200, el.scrollHeight) + 'px' }, [q])
  useEffect(() => { const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  useEffect(() => () => rec.current?.cancel(), [])
  // Nút "Hỏi trợ lý" ở thanh trên (trang chủ): đưa con trỏ về khung này
  useEffect(() => { const h = () => { ta.current?.focus(); ta.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }; window.addEventListener('rd:focus-chat', h); return () => window.removeEventListener('rd:focus-chat', h) }, [])
  // Dán ảnh ở bất kỳ đâu trên trang chủ
  useEffect(() => { const h = (e: globalThis.ClipboardEvent) => { const t = e.target as HTMLElement; if (t?.tagName === 'INPUT') return; att.onPaste(e) }; document.addEventListener('paste', h); return () => document.removeEventListener('paste', h) }, [att.onPaste])
  // Tệp và câu hỏi chuyển từ nơi khác (Chép lời ghi âm, kéo thả...): gửi luôn
  const pending = useRef<string | null>(null)
  useEffect(() => { const q0 = takeQueued(); if (q0?.files.length) { att.add(q0.files); pending.current = q0.question || '' } }, []) // eslint-disable-line
  useEffect(() => { if (pending.current !== null && att.files.length) { const t = pending.current; pending.current = null; void send(t) } }, [att.files.length]) // eslint-disable-line

  async function send(textArg?: string, as: AskMode = cur) {
    if (busy || mic !== 'off') return
    const t = (textArg ?? q).trim()
    const files = att.files
    const useFiles = files.length > 0 || (fileCtx.length > 0 && as !== 'web')
    if ((!useFiles && t.length < 3) || (useFiles && !files.length && !t)) return
    setQ(''); clearSugg(); setMenu(false)
    if (as !== cur) setMode(as)
    if (useFiles) { att.clear(); await chat.askFile(files, t); return }
    await chat.ask(t, as)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }
  async function starter(t: string) {
    if (t.startsWith('Gửi ảnh')) { await att.pick(); return }
    if (STARTERS.file.some((s) => s.t === t) && !att.files.length && !fileCtx.length) { setQ(t); await att.pick(); return }
    void send(t)
  }

  async function startMic() {
    if (mic !== 'off') return
    if (!has('transcribe')) return toast.warn('Tính năng nói thành chữ bằng AI đang tắt. Hãy báo quản trị viên.')
    try { rec.current = await startRecorder({ maxSeconds: 300, onLimit: () => void stopMic() }); setMic('on') } catch (e) { toast.error((e as Error).message) }
  }
  async function stopMic() {
    const r = rec.current; if (!r) return
    rec.current = null; setMic('busy')
    try { const f = await r.stop(); if (f) { const said = (await transcribeFile(f)).text.replace(/\s+/g, ' ').trim(); if (said) setQ((c) => (c ? `${c} ${said}` : said)); else toast.warn('Không nghe rõ lời nói. Hãy thử lại.') } } catch (e) { toast.error(sttError(e)) } finally { setMic('off'); ta.current?.focus() }
  }

  const starters = att.files.length || (fileCtx.length && !isWeb) ? STARTERS.file : isWeb ? STARTERS.web : STARTERS.text
  const placeholder = mic === 'on' ? 'Đang nghe… bấm ✓ khi nói xong' : mic === 'busy' ? 'AI đang chép lời…' : withFiles ? 'Hỏi về tệp…' : isWeb ? 'Hỏi điều cần tra cứu trên Internet…' : 'Hỏi trợ lý bất cứ điều gì, hoặc kéo thả ảnh, tệp vào đây…'
  const busyText = withFiles ? 'AI đang xem tệp của bạn…' : isWeb ? 'Đang tìm trên các trang chính thống và kiểm tra nguồn… (10–30 giây)' : 'Mình đang đọc tài liệu…'

  return (
    <section className={clsx('hc', !empty && 'active', att.over && 'over')} {...att.dropProps} aria-label="Trợ lý AI">
      <div className="hc-top">
        <span className="hc-badge"><Sparkles size={18} /></span>
        <div className="min-w-0 flex-1"><b>Trợ lý AI</b><small>{withFiles ? 'Đang hỏi về tệp của bạn' : MODES.find((x) => x.k === cur)!.d}</small></div>
        {!empty && <button className="hc-hb" onClick={newConversation} title="Bắt đầu chủ đề mới (trợ lý không nhớ các câu trước)"><RotateCcw size={15} /><span>Cuộc trò chuyện mới</span></button>}
        {!empty && <button className="hc-hb icon" onClick={clear} title="Xóa cuộc trò chuyện" aria-label="Xóa cuộc trò chuyện"><Trash2 size={15} /></button>}
      </div>

      {!empty && (
        <div className="hc-msgs">
          {visible.map((m) => <Bubble key={m.id} m={m} onOpen={(id) => nav(`/items/${id}`)} onSearch={(t) => nav(`/search?q=${encodeURIComponent(t)}`)} onAsk={(t, md) => void send(t, md)} />)}
          {busy && <div className="rd-bubble bot flex items-center gap-3 text-muted"><Loader2 size={20} className="animate-spin text-brand-500" />{busyText}</div>}
          <div ref={end} />
        </div>)}

      <div className="hc-foot">
        {fileCtx.length > 0 && !isWeb && (
          <div className="fc-ctx !mb-0">
            <span className="cap">AI đang xem:</span>
            {fileCtx.map((f, i) => <span key={`${f.name}|${f.size}`} className="fc-ctx-chip" title={f.name}><FileThumb name={f.name} bytes={f.bytes} className="fc-ctx-th" /><span className="truncate">{f.name}</span><button onClick={() => removeFileCtx(i)} aria-label={`Bỏ ${f.name}`}><X size={12} /></button></span>)}
            <button className="fc-ctx-done" onClick={clearFileCtx} title="Hỏi tiếp mà không kèm tệp">Xong với tệp</button>
          </div>)}
        {sugg.length > 0 && (
          <div className="ask-sugg">
            <div className="cap"><Sparkles size={14} />Đã có câu trả lời kiểm chứng cho câu hỏi tương tự — bấm để xem ngay:</div>
            {sugg.map((s) => <button key={s.id} onClick={() => { setQ(''); clearSugg(); void openLearned(s.id) }}><History size={15} /><span className="flex-1 min-w-0"><b>{s.question}</b><small>{s.topic} · kiểm chứng {new Date(s.learned_at).toLocaleDateString('vi-VN')}</small></span><ArrowRight size={15} /></button>)}
          </div>)}

        {(() => { const tf = att.files.find((f) => isTemplateName(f.name)); return tf && has('fill_template') ? (
          <div className="hc-fill-hint">
            <Wand2 size={17} className="shrink-0" />
            <span className="flex-1 min-w-0"><b>{tf.name}</b> là biểu mẫu cần điền? Lưu làm mẫu để AI điền giúp từ thông tin bạn gửi, giữ nguyên định dạng.</span>
            <button onClick={() => { queueTemplate(tf); att.remove(att.files.indexOf(tf)); nav('/autofill') }}>Điền mẫu tự động<ArrowRight size={15} /></button>
          </div>) : null })()}
        <div className="fc-box">
          <AttachTray files={att.files} onRemove={att.remove} onOpen={setView} />
          <textarea ref={ta} rows={1} value={q} maxLength={2000} placeholder={placeholder} readOnly={mic !== 'off'} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} aria-label="Câu hỏi cho trợ lý" />
          <div className="fc-bar">
            <div className="relative" ref={menuRef}>
              <button className="fc-ico" onClick={() => setMenu(!menu)} aria-label="Thêm tệp và công cụ" title="Thêm tệp, ảnh và công cụ"><Plus size={20} /></button>
              {menu && (
                <div className="fc-menu" role="menu">
                  <button role="menuitem" onClick={() => { setMenu(false); void att.pick() }}><Paperclip size={18} /><span><b>Tải tệp lên để hỏi</b><small>PDF, Word, Excel, PowerPoint, văn bản</small></span></button>
                  <button role="menuitem" onClick={() => { setMenu(false); void att.pick('image') }}><ImagePlus size={18} /><span><b>Thêm ảnh</b><small>Ảnh chụp, ảnh màn hình (hoặc dán Ctrl+V)</small></span></button>
                  <button role="menuitem" onClick={() => { setMenu(false); void att.pick('audio') }}><AudioLines size={18} /><span><b>Thêm file ghi âm</b><small>AI chép lời rồi trả lời</small></span></button>
                  <div className="sep" />
                  <button role="menuitem" onClick={() => { setMenu(false); nav('/autofill') }}><Wand2 size={18} /><span><b>Điền mẫu tự động</b><small>Word, Excel, CSV: AI điền từ thông tin bạn gửi</small></span></button>
                  <button role="menuitem" onClick={() => { setMenu(false); nav('/transcribe') }}><AudioLines size={18} /><span><b>Chép lời ghi âm</b><small>Biến ghi âm cuộc họp thành chữ</small></span></button>
                  <button role="menuitem" onClick={() => { setMenu(false); nav('/compare') }}><GitCompare size={18} /><span><b>So sánh các bài</b><small>Bài nào đúng hơn?</small></span></button>
                  <button role="menuitem" onClick={() => { setMenu(false); nav('/browse/type/prompt') }}><TYPE_ICON.prompt size={18} /><span><b>Câu lệnh AI mẫu</b><small>Điền thông tin rồi sao chép</small></span></button>
                  <button role="menuitem" onClick={() => { setMenu(false); nav('/my-file/private') }}><Lock size={18} /><span><b>Đọc tệp riêng tư trên máy</b><small>Giấy tờ nhạy cảm: tệp không gửi đi nguyên vẹn</small></span></button>
                </div>)}
            </div>
            {modes.length > 1 && (
              <div className="hc-modes" role="radiogroup" aria-label="Trợ lý tìm câu trả lời ở đâu">
                {modes.map((x) => <button key={x.k} role="radio" aria-checked={cur === x.k} className={clsx(cur === x.k && 'on')} onClick={() => setMode(x.k)} title={x.d}>{x.icon}<span>{x.t}</span></button>)}
              </div>)}
            <div className="ml-auto flex items-center gap-2">
              {mic === 'off' ? <button className="fc-ico" onClick={() => void startMic()} title="Nói để nhập câu hỏi (AI chép lời)" aria-label="Nói thành chữ"><Mic size={19} /></button>
                : <>{mic === 'on' && <button className="fc-ico" onClick={() => { rec.current?.cancel(); rec.current = null; setMic('off') }} aria-label="Hủy ghi âm"><X size={18} /></button>}
                  <button className="fc-ico on" onClick={() => void stopMic()} disabled={mic === 'busy'} aria-label="Xong">{mic === 'busy' ? <Loader2 size={18} className="animate-spin" /> : <Check size={19} />}</button></>}
              <button className="fc-send" onClick={() => void send()} disabled={busy || mic !== 'off' || (!att.files.length && q.trim().length < 3)} aria-label="Gửi" title="Gửi (Enter)">{busy ? <Loader2 size={18} className="animate-spin" /> : isWeb && !withFiles ? <Search size={18} /> : <ArrowUp size={20} />}</button>
            </div>
          </div>
        </div>

        <div className="ask-opts hc-opts">
          {isWeb && !withFiles ? (<>
            <label className="opt sel" title="Trang nào được dùng làm nguồn"><Globe2 size={14} />Tìm ở:<select value={webScope} onChange={(e) => setWebScope(e.target.value as WebScope)}>{(Object.keys(WEB_SCOPE_LABEL) as WebScope[]).map((s) => <option key={s} value={s}>{WEB_SCOPE_LABEL[s]}</option>)}</select></label>
            <span className="opt note"><Lock size={13} />Chỉ gửi câu hỏi, không gửi tài liệu công ty</span>
          </>) : (<>
            <label className="opt sel" title="Nguồn tài liệu công ty trợ lý được dùng"><ShieldCheck size={14} />Nguồn:<select value={policy} onChange={(e) => setPolicy(e.target.value as never)}><option value="auto">Tự động</option><option value="reviewed">Đã kiểm duyệt</option><option value="official">Chính thống</option></select></label>
            {!withFiles && <button className={clsx('opt', deep && 'on')} aria-pressed={deep} onClick={() => setDeep(!deep)} title="Xem thêm các bài cùng chủ đề trước khi trả lời — kỹ hơn nhưng chậm hơn">{deep ? <CheckCircle2 size={14} /> : <Search size={14} />}Tìm kỹ</button>}
            {withFiles && <span className="opt note" title="Ở chế độ Internet thì chỉ trả lời theo tệp">{cur === 'web' ? 'Chỉ trả lời theo tệp' : 'AI xem tệp và đối chiếu tài liệu công ty'}</span>}
          </>)}
          <span className="hc-hint"><b>Enter</b> gửi · <b>Shift+Enter</b> xuống dòng · kéo thả hoặc dán ảnh để hỏi về tệp</span>
        </div>

        {empty && (
          <div className="hc-starters">
            {starters.map((s) => <button key={s.t} onClick={() => void starter(s.t)}>{s.icon}<span>{s.t}</span></button>)}
          </div>)}
      </div>

      {att.over && <div className="fc-drop-over"><UploadCloud size={34} />Thả tệp vào đây để hỏi trợ lý</div>}
      {view?.bytes && <PreviewModal src={{ type: 'local', name: view.name, bytes: view.bytes }} onClose={() => setView(null)} />}
    </section>)
}

/** Trang /my-file/private: đọc tệp ngay trên máy (giấy tờ nhạy cảm), không gửi tệp đi nguyên vẹn */
export function PrivateFilePage({ children }: { children: ReactNode }) {
  const nav = useNavigate()
  return (
    <div className="flex flex-col gap-5 max-w-[980px] mx-auto w-full">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div><h1 className="rd-h2 !text-[1.6em] !mb-0"><Lock size={26} className="text-brand-600" />Đọc tệp riêng tư trên máy</h1>
          <p className="rd-sub !mb-0 !mt-1">Dành cho giấy tờ nhạy cảm: tệp được đọc ngay trên máy này, chỉ vài đoạn chữ liên quan được gửi cho trợ lý.</p></div>
        <button className="rd-btn secondary sm" onClick={() => nav('/')}><MessageCircleQuestion size={17} />Về khung trợ lý</button>
      </div>
      {children}
    </div>)
}
