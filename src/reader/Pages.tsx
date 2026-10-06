import { FormEvent, ReactNode, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, AudioLines, Layers, Clock, Compass, FileSearch, ShieldCheck, TextSearch, FolderOpen, Frown, Loader2, MessageCircleQuestion, Mic, Plus, Search, SearchX, Smile, ThumbsDown, ThumbsUp, Star, History, PlayCircle, Timer } from 'lucide-react'
import { ApiError, get, post } from '../lib/api'
import type { ItemRow, ItemType, KSearchResult, Space } from '../lib/types'
import { PassageCard, PolicySelect, useIsOfficial } from '../components/Knowledge'
import { AttachStrip } from '../components/Attachments'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { toast } from '../store/ui'
import { useWorkspace } from './workspace'
import Composer from './Composer'
import { TOPIC_COLORS, TYPE_DESC, TYPE_ICON, TYPE_PLAIN, TYPE_SHORT, friendlyDate } from './common'

const TYPES: ItemType[] = ['runbook', 'article', 'document', 'prompt']

function Loading({ text = 'Đang tải…' }: { text?: string }) {
  return <div className="rd-card p-10 flex flex-col items-center gap-3 text-muted"><Loader2 size={32} className="animate-spin text-brand-500" />{text}</div>
}
function Problem({ text, retry }: { text: string; retry?: () => void }) {
  return <div className="rd-callout bad"><Frown size={22} className="shrink-0" /><div><b className="block">Chưa tải được</b>{text}{retry && <div className="mt-2"><button className="rd-btn secondary sm" onClick={retry}>Thử lại</button></div>}</div></div>
}
export function FavStar({ it, className }: { it: { id: number; title: string; type: ItemType }; className?: string }) {
  const on = useWorkspace((s) => s.favs.some((f) => f.id === it.id))
  return (
    <button className={`rd-star ${on ? 'on' : ''} ${className || ''}`} aria-pressed={on} title={on ? 'Bỏ khỏi mục Đã lưu' : 'Lưu bài này để xem lại'}
      onClick={(e) => { e.stopPropagation(); const added = useWorkspace.getState().toggleFav(it); toast.ok(added ? 'Đã lưu bài này' : 'Đã bỏ khỏi mục Đã lưu') }}><Star size={22} /></button>)
}

export function ItemRowCard({ it, snippet, isNew }: { it: Pick<ItemRow, 'id' | 'type' | 'title' | 'summary' | 'updated_at' | 'next_review_date' | 'freshness' | 'status'> & { space?: { name: string } }; snippet?: string; isNew?: boolean }) {
  const nav = useNavigate()
  const Ico = TYPE_ICON[it.type]
  const old = it.freshness === 'overdue' || it.status === 'overdue'
  const official = useIsOfficial(it.id)
  return (
    <div className="flex gap-3 items-stretch">
      <button className="rd-row flex-1 min-w-0" onClick={() => nav(`/items/${it.id}`)}>
        <span className="rd-ico lg"><Ico size={28} /></span>
        <span className="min-w-0 flex-1">
          <span className="ttl block">{it.title}{isNew && <span className="rd-new ml-2">Mới</span>}</span>
          {(snippet || it.summary) && <span className="snip block">{snippet || it.summary}</span>}
          <span className="meta">
            <span className="rd-chip">{TYPE_PLAIN[it.type]}</span>
            {official && <span className="rd-chip ok"><ShieldCheck size={13} />Chính thống</span>}
            {it.space?.name && <span className="flex items-center gap-1.5"><FolderOpen size={14} />{it.space.name}</span>}
            {it.updated_at && <span className="flex items-center gap-1.5"><Clock size={14} />Cập nhật {friendlyDate(it.updated_at)}</span>}
            {old && <span className="rd-chip warn">Có thể đã cũ</span>}
          </span>
        </span>
        <ArrowRight size={22} className="text-brand-600 self-center shrink-0" />
      </button>
      <FavStar it={it} className="self-center" />
    </div>)
}

function Section({ icon, title, sub, right, children }: { icon?: ReactNode; title: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-end justify-between gap-3 mb-3.5 flex-wrap"><div><h2 className="rd-h2 !mb-0">{icon}{title}</h2>{sub && <p className="rd-sub !mb-0 mt-1">{sub}</p>}</div>{right}</div>
      {children}
    </section>)
}
export function MiniRow({ id, title, type, at }: { id: number; title: string; type: ItemType; at?: number }) {
  const nav = useNavigate(); const Ico = TYPE_ICON[type]
  return (
    <button className="flex items-center gap-3 w-full p-2.5 rounded-md bg-transparent border-0 cursor-pointer text-left hover:bg-brand-50 font-[inherit] text-inherit" onClick={() => nav(`/items/${id}`)}>
      <span className="rd-ico md" style={{ width: 40, height: 40 }}><Ico size={20} /></span>
      <span className="min-w-0 flex-1"><span className="block font-bold leading-snug line-clamp-2">{title}</span><span className="block text-[0.8em] text-muted">{TYPE_SHORT[type]}{at ? ` · ${friendlyDate(new Date(at).toISOString())}` : ''}</span></span>
    </button>)
}

// ====================================================================
//  Bàn làm việc (trang chủ): đi thẳng vào việc đang cần
// ====================================================================
export function ReaderHome() {
  const nav = useNavigate()
  const user = useAuth((s) => s.user)!
  const spaces = useAuth((s) => s.spaces)
  const chat = useChat()
  const { favs, recent, runs, prevVisit } = useWorkspace()
  const [news, setNews] = useState<ItemRow[] | null>(null)
  const [err, setErr] = useState('')
  const first = user.name.trim().split(/\s+/).slice(-1)[0] || user.name
  const hour = new Date().getHours()
  const hello = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'
  const runList = Object.values(runs).sort((a, b) => b.at - a.at)

  useEffect(() => { get<{ items: ItemRow[] }>('/items', { limit: 6, sort: 'updated' }).then((r) => setNews(r.items)).catch((e) => setErr((e as ApiError).full)) }, [])
  const ask = (t: string) => { if (chat.agentId) chat.selectAgent(null); chat.setOpen(true); void chat.ask(t, chat.mode === 'general' ? 'documents' : chat.mode) }

  const intents = [
    { t: 'Đang có sự cố', d: 'Tìm cách xử lý, làm theo từng bước', ico: <TYPE_ICON.runbook size={26} />, act: () => nav('/browse/type/runbook'), hot: true },
    { t: 'Tìm cách làm việc', d: 'Gõ vấn đề, mình tìm bài phù hợp', ico: <Search size={26} />, act: () => { document.getElementById('rd-q')?.focus() } },
    { t: 'Tra quy định, tài liệu', d: 'Quy trình, biểu mẫu, hướng dẫn', ico: <TYPE_ICON.document size={26} />, act: () => nav('/browse/type/document') },
    { t: 'Hỏi về tệp của tôi', d: 'Kéo ảnh, PDF, Word… vào để hỏi', ico: <FileSearch size={26} />, act: () => nav('/my-file') },
    { t: 'Chép lời ghi âm', d: 'Biến ghi âm cuộc họp thành chữ', ico: <AudioLines size={26} />, act: () => nav('/transcribe') },
    { t: 'Dùng câu lệnh AI sẵn', d: 'Điền thông tin rồi sao chép', ico: <TYPE_ICON.prompt size={26} />, act: () => nav('/browse/type/prompt') },
  ]

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div><h1 className="rd-h2 !text-[1.9em] !mb-1">{hello}, {first}!</h1><p className="rd-sub !mb-0">Hôm nay bạn cần làm gì? Chọn một việc bên dưới hoặc gõ vào ô tìm kiếm.</p></div>
        <span className="rd-chip gray capitalize"><Clock size={15} />{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}</span>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {intents.map((a) => (
          <button key={a.t} className="rd-card click rd-intent" style={a.hot ? { borderColor: '#fda29b', background: 'linear-gradient(135deg,#fffbfa,#fff)' } : undefined} onClick={a.act}>
            <span className={`rd-ico md ${a.hot ? '' : 'g'}`} style={a.hot ? { background: '#fee4e2', color: '#d92d20' } : undefined}>{a.ico}</span>
            <span className="min-w-0"><span className="t block">{a.t}</span><span className="d block">{a.d}</span></span>
          </button>))}
      </div>

      <section className="flex flex-col gap-2">
        <Composer onSend={ask} placeholder="Hỏi trợ lý AI bất cứ điều gì — ví dụ: Máy in không in được thì làm thế nào?" />
        <div className="flex gap-x-4 gap-y-1 flex-wrap text-[0.8em] text-muted px-1">
          <span><b className="text-ink-2">Enter</b> để gửi · <b className="text-ink-2">Shift+Enter</b> xuống dòng</span>
          <span className="flex items-center gap-1"><Mic size={13} />Bấm micro để nói, chữ hiện ngay (nhận dạng trên máy)</span>
          <span className="flex items-center gap-1"><Plus size={13} />Thêm hoặc kéo thả tệp, ảnh để hỏi về tệp</span>
        </div>
      </section>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-8 items-start">
        <div className="flex flex-col gap-8">
          {runList.length > 0 ? (
            <Section icon={<PlayCircle size={26} className="text-brand-600" />} title="Làm tiếp việc đang dở" sub="Bạn đang làm dở các hướng dẫn này.">
              <div className="flex flex-col gap-3">{runList.map((r) => {
                const done = Object.keys(r.results).length
                return (
                  <div key={r.itemId} className="rd-card rd-resume p-5 flex items-center gap-5 flex-wrap">
                    <span className="rd-ico md g"><PlayCircle size={24} /></span>
                    <div className="min-w-0 flex-1 basis-[240px]"><div className="font-black leading-snug">{r.title}</div>
                      <div className="text-[0.88em] text-muted mt-1">Đã làm {done}/{r.total} bước · {friendlyDate(new Date(r.at).toISOString())}</div>
                      <div className="rd-bar mt-2.5"><i style={{ width: `${(done / Math.max(1, r.total)) * 100}%` }} /></div></div>
                    <button className="rd-btn" onClick={() => nav(`/items/${r.itemId}?resume=1`)}>Làm tiếp<ArrowRight size={18} /></button>
                  </div>)
              })}</div>
            </Section>
          ) : recent.length > 0 ? (
            <Section icon={<History size={26} className="text-brand-600" />} title="Xem lại gần đây" right={<button className="rd-btn secondary sm" onClick={() => nav('/me?tab=recent')}>Xem tất cả</button>}>
              <div className="rd-card p-2 grid md:grid-cols-2 gap-x-2">{recent.slice(0, 4).map((r) => <MiniRow key={r.id} {...r} />)}</div>
            </Section>
          ) : (
            <div className="rd-card p-8 flex items-center gap-6 flex-wrap"><span className="rd-ico lg g"><Compass size={30} /></span>
              <div className="flex-1 min-w-[240px]"><div className="text-[1.2em] font-black">Bắt đầu thật dễ</div><div className="text-muted mt-1 leading-relaxed">Gõ vấn đề của bạn vào ô tìm kiếm phía trên, hoặc chọn một việc ở trên. Những bài bạn xem và lưu sẽ hiện ở đây để quay lại nhanh.</div></div></div>
          )}

          <Section icon={<Clock size={26} className="text-brand-600" />} title="Mới cập nhật" sub={prevVisit ? 'Có nhãn “Mới” là bài thay đổi từ lần cuối bạn ghé thư viện.' : 'Những bài vừa được thêm hoặc chỉnh sửa gần đây.'}>
            {err ? <Problem text={err} /> : !news ? <Loading /> : news.length === 0 ? <div className="rd-card p-8 text-center text-muted">Chưa có bài nào.</div> : (
              <div className="flex flex-col gap-3.5">{news.map((it) => <ItemRowCard key={it.id} it={it} isNew={!!prevVisit && !!it.updated_at && new Date(it.updated_at).getTime() > prevVisit} />)}</div>)}
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rd-card p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between"><div className="font-black flex items-center gap-2"><Star size={20} className="text-amber-500" />Đã lưu</div><button className="rd-btn secondary sm" onClick={() => nav('/me?tab=saved')}>Tất cả</button></div>
            {favs.length === 0 ? <div className="text-muted text-[0.92em] leading-relaxed py-1">Bấm dấu <Star size={14} className="inline -mt-0.5" /> ở mỗi bài để lưu lại những bài hay dùng.</div> : favs.slice(0, 5).map((f) => <MiniRow key={f.id} {...f} />)}
          </div>
          <div className="rd-card p-5 flex flex-col gap-3">
            <div className="font-black">Công cụ nhanh</div>
            <button className="rd-tool" onClick={() => window.dispatchEvent(new CustomEvent('rd:time'))}><Timer size={20} />Ghi giờ làm hôm nay</button>
            <button className="rd-tool" onClick={() => nav('/browse')}><Compass size={20} />Duyệt tất cả chủ đề</button>
            <button className="rd-tool" onClick={() => chat.setOpen(true)}><MessageCircleQuestion size={20} />Mở trợ lý</button>
          </div>
          {spaces.length > 0 && <div className="rd-card p-5 flex flex-col gap-3"><div className="font-black">Chủ đề</div>
            <div className="flex gap-2 flex-wrap">{spaces.map((s, i) => <button key={s.id} className="rd-chip" style={{ background: TOPIC_COLORS[i % TOPIC_COLORS.length] + '1c', color: TOPIC_COLORS[i % TOPIC_COLORS.length], cursor: 'pointer', border: 0, padding: '9px 15px', fontSize: '.9em' }} onClick={() => nav(`/browse/space/${s.id}`)}>{s.name}</button>)}</div></div>}
        </div>
      </div>
    </div>)
}

// ====================================================================
//  Của tôi: đang làm dở · đã lưu · đã xem gần đây
// ====================================================================
export function ReaderMe() {
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') || 'runs') as 'runs' | 'saved' | 'recent'
  const { favs, recent, runs, clearRun, clearRecent } = useWorkspace()
  const runList = Object.values(runs).sort((a, b) => b.at - a.at)
  const go = (t: string) => setSp({ tab: t }, { replace: true })
  const tabs = [{ v: 'runs', l: `Đang làm dở (${runList.length})` }, { v: 'saved', l: `Đã lưu (${favs.length})` }, { v: 'recent', l: 'Đã xem gần đây' }]
  const empty = (icon: ReactNode, t: string, d: string) => <div className="rd-card p-12 text-center flex flex-col items-center gap-3 text-muted">{icon}<b className="text-ink text-[1.15em]">{t}</b><span className="max-w-[420px] leading-relaxed">{d}</span></div>
  return (
    <div className="flex flex-col gap-6">
      <div><h1 className="rd-h2 !text-[1.8em]">Việc của tôi</h1><p className="rd-sub !mb-0">Mọi thứ bạn đang làm, đã lưu và đã xem — để quay lại nhanh.</p></div>
      <div className="flex gap-2.5 flex-wrap">{tabs.map((t) => <button key={t.v} className={`rd-btn sm ${tab === t.v ? '' : 'secondary'}`} onClick={() => go(t.v)}>{t.l}</button>)}</div>
      {tab === 'runs' && (runList.length === 0 ? empty(<PlayCircle size={40} className="text-brand-300" />, 'Không có việc nào đang dở', 'Khi bạn bắt đầu “làm theo từng bước” ở một hướng dẫn rồi thoát giữa chừng, việc đó sẽ hiện ở đây để làm tiếp.')
        : <div className="flex flex-col gap-3.5">{runList.map((r) => { const done = Object.keys(r.results).length; return (
          <div key={r.itemId} className="rd-card rd-resume p-5 flex items-center gap-5 flex-wrap"><span className="rd-ico md g"><PlayCircle size={24} /></span>
            <div className="min-w-0 flex-1 basis-[240px]"><div className="font-black leading-snug">{r.title}</div><div className="text-[0.88em] text-muted mt-1">Đã làm {done}/{r.total} bước · {friendlyDate(new Date(r.at).toISOString())}</div><div className="rd-bar mt-2.5"><i style={{ width: `${(done / Math.max(1, r.total)) * 100}%` }} /></div></div>
            <button className="rd-btn" onClick={() => nav(`/items/${r.itemId}?resume=1`)}>Làm tiếp<ArrowRight size={18} /></button>
            <button className="rd-btn secondary" onClick={() => clearRun(r.itemId)}>Bỏ việc này</button></div>) })}</div>)}
      {tab === 'saved' && (favs.length === 0 ? empty(<Star size={40} className="text-amber-300" />, 'Chưa lưu bài nào', 'Bấm dấu ngôi sao cạnh tiêu đề bài (hoặc ở danh sách) để lưu những bài bạn hay dùng.')
        : <div className="rd-card p-2 flex flex-col">{favs.map((f) => (
          <div key={f.id} className="flex items-center gap-2"><div className="flex-1 min-w-0"><MiniRow {...f} at={f.at} /></div><FavStar it={f} /></div>))}</div>)}
      {tab === 'recent' && (recent.length === 0 ? empty(<History size={40} className="text-brand-300" />, 'Chưa xem bài nào', 'Những bài bạn mở sẽ hiện ở đây.')
        : <><div className="flex justify-end"><button className="rd-btn secondary sm" onClick={clearRecent}>Xóa lịch sử</button></div>
          <div className="rd-card p-2 flex flex-col">{recent.map((r) => <MiniRow key={r.id} {...r} at={r.at} />)}</div></>)}
    </div>)
}

// ====================================================================
//  Kết quả tìm kiếm
// ====================================================================
interface Hit extends ItemRow { snippet?: string }
interface SResp { session_id: number; query: string; results: Hit[]; total: number; page: number; pages: number }
// ---------------------------------------------------------------- Đoạn khớp nhất (tìm theo nội dung bên trong tài liệu và tệp)
function PassagesBlock({ q }: { q: string }) {
  const nav = useNavigate()
  const { policy, setPolicy } = useChat()
  const [res, setRes] = useState<KSearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [all, setAll] = useState(false)
  useEffect(() => {
    const t = q.trim(); if (t.length < 3) { setRes(null); return }
    let dead = false; setLoading(true); setErr('')
    get<KSearchResult>('/knowledge/search', { q: t.slice(0, 300), limit: 8, expand: false, ...(policy !== 'auto' ? { source_policy: policy } : {}) })
      .then((r) => { if (!dead) setRes(r) }).catch((e) => { if (!dead) { setRes(null); setErr((e as ApiError).status === 503 || (e as ApiError).status === 404 ? '' : (e as ApiError).full) } }).finally(() => { if (!dead) setLoading(false) })
    return () => { dead = true }
  }, [q, policy])
  if (!loading && !res && !err) return null
  const list = res?.passages || []
  const shown = all ? list : list.slice(0, 3)
  return (
    <div className="rd-card p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="rd-ico md g"><TextSearch size={22} /></span>
        <div className="flex-1 min-w-[200px]"><div className="font-black text-[1.1em]">Đoạn khớp nhất trong nội dung</div><div className="text-[0.88em] text-muted">Tìm cả bên trong tệp đính kèm, có ghi rõ trang và mục.</div></div>
        <span className="flex items-center gap-2 text-[0.9em] font-semibold">Nguồn dùng<span className="w-[190px]"><PolicySelect plain value={policy} onChange={setPolicy} /></span></span>
      </div>
      {loading && <Loading text="Đang tìm đoạn khớp…" />}
      {err && <Problem text={err} />}
      {res && list.length === 0 && !loading && <div className="text-muted">Chưa có đoạn nội dung nào khớp rõ.{res.stats.excluded_by_policy ? ` (${res.stats.excluded_by_policy} đoạn bị loại do bạn chọn chỉ dùng nguồn đáng tin hơn.)` : ''}</div>}
      <div className="flex flex-col gap-3">{shown.map((p) => <PassageCard key={p.chunk_id} p={p} q={q} plain onOpen={(id) => nav(`/items/${id}`)} />)}</div>
      {list.length > 3 && <button className="rd-btn secondary sm self-start" onClick={() => setAll(!all)}>{all ? 'Thu gọn' : `Xem thêm ${list.length - 3} đoạn`}</button>}
      {res && res.stats.excluded_by_policy > 0 && list.length > 0 && <div className="text-[0.82em] text-muted">{res.stats.excluded_by_policy} đoạn bị ẩn vì chưa phải nguồn đáng tin theo lựa chọn của bạn.</div>}
    </div>)
}

export function ReaderSearch() {
  const nav = useNavigate()
  const chat = useChat()
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') || ''; const type = (sp.get('type') || '') as ItemType | ''
  const [data, setData] = useState<SResp | null>(null)
  const [more, setMore] = useState<Hit[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [fb, setFb] = useState<'yes' | 'no' | 'sent' | null>(null)
  const [why, setWhy] = useState('')
  const [request, setRequest] = useState(true)

  useEffect(() => {
    if (!q.trim()) return
    setLoading(true); setErr(''); setData(null); setMore([]); setPage(1); setFb(null); setWhy('')
    get<SResp>('/search', { q: q.trim(), limit: 20, page: 1, ...(type ? { type } : {}) }).then(setData).catch((e) => setErr((e as ApiError).full)).finally(() => setLoading(false))
  }, [q, type])

  async function loadMore() {
    const next = page + 1; setLoading(true)
    try { const r = await get<SResp>('/search', { q: q.trim(), limit: 20, page: next, ...(type ? { type } : {}) }); setMore((m) => [...m, ...r.results]); setPage(next) } catch (e) { setErr((e as ApiError).full) } finally { setLoading(false) }
  }
  async function sendFb(helpful: boolean) {
    if (!data) return
    try { await post(`/search/${data.session_id}/feedback`, { helpful, reason: why.trim() || undefined, content_request: !helpful && request ? true : undefined }); setFb('sent'); toast.ok('Cảm ơn bạn đã góp ý!') } catch (e) { toast.error(e) }
  }
  const results = [...(data?.results || []), ...more]
  const setType = (t: string) => { const n = new URLSearchParams(sp); if (t) n.set('type', t); else n.delete('type'); setSp(n, { replace: true }) }

  if (!q.trim()) return <div className="rd-card p-10 text-center flex flex-col gap-3 items-center"><SearchX size={40} className="text-brand-400" /><b className="text-[1.2em]">Hãy gõ điều bạn muốn tìm ở ô phía trên</b><span className="text-muted">Gõ có dấu hay không dấu đều được.</span></div>
  return (
    <div className="flex flex-col gap-6">
      <div>
        <button className="rd-btn secondary sm mb-4" onClick={() => nav(-1)}><ArrowLeft size={16} />Quay lại</button>
        <h1 className="rd-h2 !text-[1.7em]">Kết quả cho “{q}”</h1>
        {data && <p className="rd-sub !mb-0">{data.total === 0 ? 'Không có bài nào khớp.' : `Tìm thấy ${data.total.toLocaleString('vi-VN')} bài.`}</p>}
      </div>
      <div className="flex gap-2.5 flex-wrap items-center">
        <span className="font-bold text-muted mr-1">Lọc theo:</span>
        <button className={`rd-btn sm ${type ? 'secondary' : ''}`} onClick={() => setType('')}>Tất cả</button>
        {TYPES.map((t) => <button key={t} className={`rd-btn sm ${type === t ? '' : 'secondary'}`} onClick={() => setType(t)}>{TYPE_SHORT[t]}</button>)}
      </div>
      {err && <Problem text={err} />}
      {loading && !data && <Loading text="Đang tìm…" />}
      {data && results.length === 0 && (
        <div className="rd-card p-10 text-center flex flex-col gap-4 items-center">
          <SearchX size={44} className="text-brand-400" /><div className="text-[1.25em] font-black">Mình chưa tìm thấy bài nào</div>
          <div className="text-muted max-w-[480px]">Thử gõ ngắn hơn, đổi từ khác, hoặc nhờ trợ lý — trợ lý hiểu cả câu hỏi dài.</div>
          <div className="flex gap-3 flex-wrap justify-center"><button className="rd-btn" onClick={() => { chat.setOpen(true); void chat.ask(q, 'documents') }}><MessageCircleQuestion size={20} />Hỏi trợ lý câu này</button>
            <button className="rd-btn secondary" onClick={() => nav('/browse')}><Compass size={20} />Duyệt theo chủ đề</button></div>
        </div>)}
      {!type && <PassagesBlock q={q} />}
      <div className="flex flex-col gap-3.5">
        {results.map((r) => (
          <div key={r.id} className="flex flex-col gap-2"><ItemRowCard it={r} snippet={r.snippet} /><div className="pl-3"><AttachStrip itemId={r.id} size={52} max={5} label={false} /></div></div>))}
      </div>
      {data && data.page < data.pages && page < data.pages && <div className="text-center"><button className="rd-btn secondary" disabled={loading} onClick={loadMore}>{loading ? <Loader2 size={18} className="animate-spin" /> : null}Xem thêm kết quả</button></div>}

      {data && (
        <div className="rd-card p-6 flex flex-col gap-4">
          {fb === 'sent' ? <div className="flex items-center gap-3 font-bold text-green-700"><Smile size={26} />Cảm ơn bạn! Góp ý của bạn giúp thư viện tốt hơn.</div> : (<>
            <div className="text-[1.1em] font-black">Bạn đã tìm thấy điều cần tìm chưa?</div>
            {fb === null && <div className="flex gap-3 flex-wrap"><button className="rd-btn good" onClick={() => { setFb('yes'); void sendFb(true) }}><ThumbsUp size={20} />Rồi, cảm ơn</button><button className="rd-btn secondary" onClick={() => setFb('no')}><ThumbsDown size={20} />Chưa thấy</button></div>}
            {fb === 'no' && (
              <div className="flex flex-col gap-3 max-w-[640px]">
                <textarea className="w-full border-2 border-line rounded-md p-3 text-[1em] font-[inherit] min-h-[90px] focus:outline-none focus:border-[#7a2ee6]" placeholder="Bạn đang cần tìm gì? (không bắt buộc)" value={why} onChange={(e) => setWhy(e.target.value)} />
                <label className="flex items-center gap-3 cursor-pointer font-semibold"><input type="checkbox" className="w-5 h-5 accent-[#7a2ee6]" checked={request} onChange={(e) => setRequest(e.target.checked)} />Nhờ người phụ trách bổ sung nội dung này vào thư viện</label>
                <div><button className="rd-btn" onClick={() => void sendFb(false)}>Gửi góp ý</button></div>
              </div>)}
          </>)}
        </div>)}
    </div>)
}

// ====================================================================
//  Duyệt theo chủ đề / loại nội dung
// ====================================================================
export function ReaderBrowse() {
  const nav = useNavigate()
  const spaces = useAuth((s) => s.spaces)
  const tags = useAuth((s) => s.tags)
  const groups = tags.filter((t) => t.kind === 'category' && (t.uses ?? 1) > 0).sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0))
  const topics = tags.filter((t) => t.kind !== 'category' && (t.uses ?? 0) > 0).sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0)).slice(0, 24)
  return (
    <div className="flex flex-col gap-10">
      <div><h1 className="rd-h2 !text-[1.8em]"><Compass size={30} className="text-brand-600" />Duyệt thư viện</h1><p className="rd-sub !mb-0">Chọn chủ đề bạn quan tâm, hoặc xem theo loại nội dung.</p></div>
      <section>
        <h2 className="rd-h2">Theo chủ đề</h2>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5 mt-3">
          {spaces.map((s, i) => (
            <button key={s.id} className="rd-card click p-5 flex items-center gap-4" onClick={() => nav(`/browse/space/${s.id}`)}>
              <span className="rd-ico lg" style={{ background: TOPIC_COLORS[i % TOPIC_COLORS.length] + '1f', color: TOPIC_COLORS[i % TOPIC_COLORS.length] }}><FolderOpen size={28} /></span>
              <span className="min-w-0 flex-1"><span className="block text-[1.1em] font-black">{s.name}</span><span className="block text-muted text-[0.9em] line-clamp-2">{s.description || 'Xem các bài trong chủ đề này'}</span></span>
              <ArrowRight size={20} className="text-brand-600" /></button>))}
          {spaces.length === 0 && <div className="rd-card p-8 text-muted">Chưa có chủ đề nào.</div>}
        </div>
      </section>
      {groups.length > 0 && (
        <section>
          <h2 className="rd-h2">Theo nhóm kiến thức</h2>
          <p className="rd-sub">Các bài được trợ lý và người phụ trách xếp vào từng nhóm — một bài có thể thuộc nhiều nhóm.</p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
            {groups.map((g, i) => (
              <button key={g.id} className="rd-card click p-4 flex items-center gap-3" onClick={() => nav(`/browse/tag/${g.id}`)}>
                <span className="rd-ico md" style={{ background: TOPIC_COLORS[(i + 3) % TOPIC_COLORS.length] + '1f', color: TOPIC_COLORS[(i + 3) % TOPIC_COLORS.length] }}><Layers size={22} /></span>
                <span className="min-w-0 flex-1"><span className="block font-black leading-snug">{g.name}</span><span className="block text-muted text-[0.84em]">{g.uses ?? 0} bài</span></span></button>))}
          </div>
        </section>)}
      {topics.length > 0 && (
        <section>
          <h2 className="rd-h2">Chủ đề hay gặp</h2>
          <div className="flex gap-2 flex-wrap mt-3">{topics.map((t) => (
            <button key={t.id} className="rd-chip" style={{ cursor: 'pointer', border: '1px solid #d9c9f7', padding: '9px 14px', fontSize: '.92em' }} onClick={() => nav(`/browse/tag/${t.id}`)}>{t.name}<span className="opacity-60">· {t.uses}</span></button>))}</div>
        </section>)}
      <section>
        <h2 className="rd-h2">Theo loại nội dung</h2>
        <div className="grid sm:grid-cols-2 gap-5 mt-3">
          {TYPES.map((t) => { const Ico = TYPE_ICON[t]; return (
            <button key={t} className="rd-card click p-5 flex items-center gap-4" onClick={() => nav(`/browse/type/${t}`)}>
              <span className="rd-ico lg g"><Ico size={28} /></span>
              <span className="flex-1"><span className="block text-[1.1em] font-black">{TYPE_PLAIN[t]}</span><span className="block text-muted text-[0.9em]">{TYPE_DESC[t]}</span></span><ArrowRight size={20} className="text-brand-600" /></button>) })}
        </div>
      </section>
    </div>)
}

export function ReaderList() {
  const { id, type, tag } = useParams()
  const nav = useNavigate()
  const spaces = useAuth((s) => s.spaces)
  const allTags = useAuth((s) => s.tags)
  const tagRow = tag ? allTags.find((t) => t.id === Number(tag)) : undefined
  const [relTags, setRelTags] = useState<{ id: number; name: string; kind: string; shared_items: number }[]>([])
  useEffect(() => { setRelTags([]); if (tag) get<{ related: { id: number; name: string; kind: string; shared_items: number }[] }>(`/tags/${tag}/related`, { limit: 8 }).then((r) => setRelTags(r.related || [])).catch(() => undefined) }, [tag])
  const [items, setItems] = useState<ItemRow[]>([])
  const [page, setPage] = useState(1); const [pages, setPages] = useState(1); const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true); const [err, setErr] = useState('')
  const [sort, setSort] = useState<'updated' | 'title'>('updated')
  const [onlyOfficial, setOnlyOfficial] = useState(false)
  const space = id ? spaces.find((s) => s.id === Number(id)) : undefined
  const tt = type as ItemType | undefined
  const title = space ? space.name : tt ? TYPE_PLAIN[tt] : tagRow ? tagRow.name : 'Danh sách'

  const load = async (p: number, replace: boolean) => {
    setLoading(true); setErr('')
    try {
      const r = await get<{ items: ItemRow[]; total: number; pages: number }>('/items', { limit: 15, page: p, sort, ...(id ? { space_id: id } : {}), ...(tt ? { type: tt } : {}), ...(tag ? { tag } : {}), ...(onlyOfficial ? { is_official: true } : {}) })
      setItems((x) => (replace ? r.items : [...x, ...r.items])); setPage(p); setPages(r.pages); setTotal(r.total)
    } catch (e) { setErr((e as ApiError).full) } finally { setLoading(false) }
  }
  useEffect(() => { void load(1, true) }, [id, type, tag, sort, onlyOfficial]) // eslint-disable-line

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button className="rd-btn secondary sm mb-4" onClick={() => nav('/browse')}><ArrowLeft size={16} />Tất cả chủ đề</button>
        <h1 className="rd-h2 !text-[1.8em]">{title}</h1>
        <p className="rd-sub !mb-0">{space?.description || (tt ? TYPE_DESC[tt] : tagRow ? (tagRow.description || (tagRow.kind === 'category' ? 'Nhóm kiến thức' : 'Chủ đề')) : '')}{!loading && ` · ${total} bài`}</p>
      </div>
      {relTags.length > 0 && <div className="flex gap-2 flex-wrap items-center"><span className="font-bold text-muted mr-1">Hay đi cùng:</span>{relTags.map((r) => <button key={r.id} className="rd-btn secondary sm" onClick={() => nav(`/browse/tag/${r.id}`)}>{r.name}</button>)}</div>}
      <div className="flex gap-2.5 items-center flex-wrap"><span className="font-bold text-muted">Sắp xếp:</span>
        <button className={`rd-btn sm ${sort === 'updated' ? '' : 'secondary'}`} onClick={() => setSort('updated')}>Mới cập nhật</button>
        <button className={`rd-btn sm ${sort === 'title' ? '' : 'secondary'}`} onClick={() => setSort('title')}>Theo tên A → Z</button>
        <span className="w-px h-6 bg-line mx-1" />
        <button className={`rd-btn sm ${onlyOfficial ? '' : 'secondary'}`} onClick={() => setOnlyOfficial(!onlyOfficial)} title="Chỉ hiện các bài đã được kiểm duyệt xác nhận là bản chính thức"><ShieldCheck size={16} />Chỉ nguồn chính thống</button></div>
      {err && <Problem text={err} retry={() => void load(1, true)} />}
      {loading && items.length === 0 && <Loading />}
      {!loading && !err && items.length === 0 && <div className="rd-card p-10 text-center text-muted flex flex-col items-center gap-3"><FolderOpen size={40} className="text-brand-300" />Chưa có bài nào ở đây.</div>}
      <div className="flex flex-col gap-3.5">{items.map((it) => <ItemRowCard key={it.id} it={it} />)}</div>
      {page < pages && <div className="text-center"><button className="rd-btn secondary" disabled={loading} onClick={() => void load(page + 1, false)}>{loading && <Loader2 size={18} className="animate-spin" />}Xem thêm</button></div>}
    </div>)
}
