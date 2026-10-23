import { FormEvent, useEffect, useState } from 'react'
import { BookMarked, Briefcase, CheckCircle2, Clock, Eye, EyeOff, Loader2, Lock, Mail, Server, ShieldCheck, Sprout, User } from 'lucide-react'
import { ApiError, api, deskApi } from '../lib/api'
import { useAuth } from '../store/auth'
import { Seg } from '../components/ui'
import { toast } from '../store/ui'
import { APP_CONFIG } from '../lib/appConfig'
import { PERSONA_LABEL, usePersona } from '../lib/persona'
import { AuthShell } from '../components/AuthShell'
import PersonaPicker from './PersonaPicker'

/** Đổi mã lỗi của máy chủ thành câu thông báo rõ nghĩa, viết bằng văn viết */
function friendlyError(x: unknown, mode: 'in' | 'up') {
  if (!(x instanceof ApiError)) return 'Không có kết nối mạng. Vui lòng kiểm tra Wi-Fi hoặc dữ liệu di động.'
  if (x.status === 401) return 'Email hoặc mật khẩu không chính xác.'
  if (x.status === 429) return 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.'
  if (x.status === 409) return 'Địa chỉ email này đã được đăng ký. Vui lòng chọn Đăng nhập.'
  if (x.status === 403) return /duyệt/i.test(x.message) ? 'Tài khoản đang chờ quản trị viên phê duyệt. Bạn có thể đăng nhập sau khi được phê duyệt.' : 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.'
  if (x.status === 400 && mode === 'up') return 'Thông tin chưa hợp lệ: họ tên tối thiểu 2 ký tự, email đúng định dạng, mật khẩu tối thiểu 10 ký tự.'
  if (x.status === 422) return 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại email và mật khẩu.'
  if (x.status === 0 || x.status >= 500) return 'Không kết nối được tới máy chủ. Vui lòng thử lại sau ít phút.'
  return x.full
}

const PERSONA_ICON = { office: Briefcase, field: Sprout, manager: ShieldCheck }

export default function Login() {
  const login = useAuth((s) => s.login)
  const persona = usePersona((s) => s.persona)
  const setPersona = usePersona((s) => s.setPersona)
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [server, setServer] = useState('')
  const [editSrv, setEditSrv] = useState(false)
  const [showSrv, setShowSrv] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    deskApi().getConfig().then((r) => { if (r.data) { setServer(r.data.serverUrl); if (r.data.email) setEmail(r.data.email) } }).catch(() => undefined)
  }, [])
  useEffect(() => { setErr(''); if (persona === 'manager') setMode('in') }, [persona])

  async function saveServer() {
    const r = await deskApi().setConfig({ serverUrl: server })
    if (!r.ok) return toast.error(r.error)
    setServer(r.data!.serverUrl); setEditSrv(false); toast.ok('Đã lưu địa chỉ máy chủ')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      if (mode === 'up') {
        // Tài khoản tự đăng ký phải chờ quản trị viên duyệt, chưa đăng nhập được ngay
        await api('POST', '/user/register', { body: { name, email, password }, auth: false })
        setSent(true); setPassword('')
        return
      }
      await login(email.trim(), password)
    } catch (x) { setErr(friendlyError(x, mode)) } finally { setBusy(false) }
  }
  const pwShort = mode === 'up' && password.length > 0 && password.length < 10
  const canGo = !busy && !!email && !!password && !(mode === 'up' && (!name || pwShort))

  // Mở ứng dụng lần đầu: hỏi "Bạn là ai?"
  if (!persona) return <PersonaPicker />

  const srvBlock = (
    <div className="login-srv">
      {!showSrv ? (
        <button type="button" className="btn ghost sm" onClick={() => setShowSrv(true)}><Server size={14} />Cài đặt kết nối</button>
      ) : !editSrv ? (
        <div className="flex items-center gap-2 text-sm text-muted"><Server size={15} /><span className="truncate flex-1">Máy chủ: <b className="text-ink">{server || '…'}</b></span>
          <button type="button" className="btn ghost sm" onClick={() => setEditSrv(true)}>Đổi</button></div>
      ) : (
        <div className="flex gap-2"><input className="input" value={server} onChange={(e) => setServer(e.target.value)} placeholder={APP_CONFIG.server} />
          <button type="button" className="btn sm" onClick={saveServer}>Lưu</button></div>
      )}
    </div>)

  // ---------------------------------------------------------------- Nhóm Sản xuất: khung đăng nhập mới (chữ lớn, văn viết)
  if (persona === 'field') {
    if (sent) return (
      <AuthShell tone="field">
        <div className="au-done"><span className="ico"><CheckCircle2 size={44} /></span>
          <h1 className="au-h1">Đã gửi đăng ký</h1>
          <p className="au-lead">Yêu cầu đăng ký cho <b>{email}</b> đã được ghi nhận. Tài khoản có hiệu lực sau khi quản trị viên phê duyệt. Sau đó bạn đăng nhập bằng email và mật khẩu vừa tạo.</p>
        </div>
        <button className="au-btn" onClick={() => { setSent(false); setMode('in') }}>Quay lại đăng nhập</button>
      </AuthShell>)
    return (
      <AuthShell tone="field">
        <div className="au-chip">
          <span className="min-w-0 flex-1"><span className="cap">Nhóm công việc</span><b>{PERSONA_LABEL[persona]}</b></span>
          <button type="button" onClick={() => setPersona(null)}>Đổi nhóm</button>
        </div>
        <div>
          <h1 className="au-h1">{mode === 'in' ? 'Đăng nhập' : 'Đăng ký tài khoản'}</h1>
          <p className="au-lead">{mode === 'in' ? 'Sử dụng tài khoản do doanh nghiệp cấp.' : 'Tài khoản có hiệu lực sau khi quản trị viên phê duyệt.'}</p>
        </div>
        <form onSubmit={submit} className="au-form" noValidate>
          {mode === 'up' && (
            <label className="au-field"><span>Họ và tên</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Nguyễn Văn A" autoComplete="name" /></label>)}
          <label className="au-field"><span>Địa chỉ email</span>
            <input type="email" inputMode="email" autoCapitalize="none" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@congty.vn" autoComplete="username" /></label>
          <label className="au-field"><span>{mode === 'up' ? 'Mật khẩu (tối thiểu 10 ký tự)' : 'Mật khẩu'}</span>
            <span className="au-pw"><input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{show ? <EyeOff size={22} /> : <Eye size={22} />}</button></span>
          </label>
          {pwShort && <div className="au-hint">Mật khẩu cần tối thiểu 10 ký tự.</div>}
          {err && <div className="au-err" role="alert">{err}</div>}
          <button className="au-btn" disabled={!canGo}>{busy ? <Loader2 size={24} className="animate-spin" /> : mode === 'in' ? 'Đăng nhập' : 'Gửi đăng ký'}</button>
        </form>
        {mode === 'in' && <p className="au-help">Quên mật khẩu? Vui lòng liên hệ quản trị viên để được cấp lại.</p>}
        <div className="au-switch">
          {mode === 'in'
            ? <>Chưa có tài khoản? <button type="button" onClick={() => setMode('up')}>Đăng ký</button></>
            : <>Đã có tài khoản? <button type="button" onClick={() => setMode('in')}>Đăng nhập</button></>}
        </div>
        <div className="au-srv">
          {!showSrv ? (
            <button type="button" className="au-link" onClick={() => setShowSrv(true)}><Server size={16} />Cài đặt kết nối</button>
          ) : !editSrv ? (
            <div className="row"><span className="min-w-0 flex-1">Máy chủ: <b>{server || '…'}</b></span><button type="button" className="au-link" onClick={() => setEditSrv(true)}>Thay đổi</button></div>
          ) : (
            <div className="edit"><label htmlFor="au-srv-in">Địa chỉ máy chủ</label>
              <div className="row"><input id="au-srv-in" value={server} onChange={(e) => setServer(e.target.value)} placeholder={APP_CONFIG.server} autoCapitalize="none" />
                <button type="button" className="au-btn sm" onClick={() => void saveServer()}>Lưu</button></div></div>
          )}
        </div>
      </AuthShell>)
  }

  // ---------------------------------------------------------------- Văn phòng và Quản lý
  const PIco = PERSONA_ICON[persona]
  if (sent) return (
    <div className="h-full grid place-items-center bg-surface p-6">
      <div className="card w-full max-w-md !p-8 flex flex-col items-center gap-4 text-center">
        <span className="w-16 h-16 rounded-full bg-green-50 text-green-700 grid place-items-center"><Clock size={34} /></span>
        <h2 className="m-0 text-2xl font-black text-ink">Đã gửi đăng ký</h2>
        <p className="m-0 text-muted leading-relaxed">Quản trị viên sẽ xem và duyệt tài khoản <b className="text-ink">{email}</b>. Khi được duyệt, bạn đăng nhập bằng email và mật khẩu vừa tạo.</p>
        <button className="btn lg w-full" onClick={() => { setSent(false); setMode('in') }}>Về trang đăng nhập</button>
      </div>
    </div>)

  return (
    <div className="h-full grid lg:grid-cols-[1.1fr_1fr] bg-surface">
      <div className="hidden lg:flex flex-col justify-between p-14 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg,#8b45f5 0%,#5a1fa8 60%,#3f1677 100%)' }}>
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-md bg-white/10" />
        <div className="absolute -left-16 bottom-10 w-72 h-72 rounded-md bg-white/10" />
        <div className="flex items-center gap-3 relative">
          <div className="w-12 h-12 rounded-lg bg-white/20 grid place-items-center"><BookMarked size={26} /></div>
          <div className="font-black text-2xl tracking-tight">MEMORABLE</div>
        </div>
        <div className="relative">
          {persona === 'manager' ? (<>
            <h1 className="text-5xl font-black leading-tight m-0">Quản lý tri thức<br />của công ty.</h1>
            <p className="text-white/80 text-lg mt-5 max-w-lg">Duyệt tài liệu, quản lý người dùng và khối làm việc, theo dõi sự cố, xem báo cáo sử dụng và chi phí AI.</p>
          </>) : (<>
            <h1 className="text-5xl font-black leading-tight m-0">Tài liệu công ty.<br />Hỏi là có.<br />Đúng bản đã duyệt.</h1>
            <p className="text-white/80 text-lg mt-5 max-w-lg">Điền giấy tờ, tra quy định, ghi âm cuộc họp thành chữ. Hỏi trợ lý bằng tiếng Việt, gửi ảnh hay tệp để hỏi.</p>
          </>)}
        </div>
        <div className="relative text-white/70 text-sm">© {new Date().getFullYear()} Memorable Desktop</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="card w-full max-w-md !p-8 flex flex-col gap-5">
          <div className="login-who"><PIco size={18} /><span className="flex-1 min-w-0 truncate">Nhóm công việc: <b>{PERSONA_LABEL[persona]}</b></span>
            <button type="button" className="btn ghost sm" onClick={() => setPersona(null)}>Đổi nhóm</button></div>
          <div>
            {persona !== 'manager' && <Seg sm value={mode} onChange={(m) => { setMode(m); setErr('') }} options={[{ value: 'in', label: 'Đăng nhập' }, { value: 'up', label: 'Đăng ký' }]} />}
            <h2 className="mt-4 mb-0 text-3xl font-black text-brand-700">{mode === 'in' ? 'Đăng nhập' : 'Tạo tài khoản'}</h2>
            <p className="text-muted mt-1 mb-0">{mode === 'in' ? (persona === 'manager' ? 'Dùng tài khoản quản lý được cấp' : 'Nhập email và mật khẩu được cấp') : 'Sau khi gửi, quản trị viên duyệt thì bạn mới đăng nhập được'}</p>
          </div>
          {mode === 'up' && (
            <div className="field"><label>Họ tên</label>
              <div className="search-box"><User size={17} /><input className="input !rounded-lg" value={name} minLength={2} onChange={(e) => setName(e.target.value)} placeholder="Nguyễn Văn An" /></div></div>
          )}
          <div className="field"><label>Email</label>
            <div className="search-box"><Mail size={17} /><input className="input !rounded-lg" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="an@congty.vn" autoComplete="username" /></div></div>
          <div className="field"><label>Mật khẩu{mode === 'up' && ' (tối thiểu 10 ký tự)'}</label>
            <div className="search-box"><Lock size={17} />
              <input className="input !rounded-lg !pr-11" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted cursor-pointer bg-transparent border-0" onClick={() => setShow(!show)} aria-label="Hiện mật khẩu">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            {pwShort && <span className="text-xs text-red-600 font-semibold">Mật khẩu cần ít nhất 10 ký tự</span>}
          </div>
          {err && <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2 text-sm font-semibold">{err}</div>}
          <button className="btn lg block" disabled={!canGo}>{busy ? 'Đang xử lý…' : mode === 'in' ? 'Đăng nhập' : 'Gửi đăng ký'}</button>
          {mode === 'in' && <p className="m-0 text-center text-sm text-muted">Quên mật khẩu? Hãy nhờ quản trị viên đặt lại.</p>}
          {srvBlock}
        </form>
      </div>
    </div>
  )
}
