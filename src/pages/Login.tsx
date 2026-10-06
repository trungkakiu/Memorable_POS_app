import { FormEvent, useEffect, useState } from 'react'
import { BookMarked, Eye, EyeOff, Lock, Mail, Server, User } from 'lucide-react'
import { ApiError, api, deskApi } from '../lib/api'
import { useAuth } from '../store/auth'
import { Seg } from '../components/ui'
import { toast } from '../store/ui'

export default function Login() {
  const login = useAuth((s) => s.login)
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [server, setServer] = useState('')
  const [editSrv, setEditSrv] = useState(false)

  useEffect(() => {
    deskApi().getConfig().then((r) => { if (r.data) { setServer(r.data.serverUrl); if (r.data.email) setEmail(r.data.email) } }).catch(() => undefined)
  }, [])

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
        await api('POST', '/user/register', { body: { name, email, password }, auth: false })
        toast.ok('Đăng ký thành công (vai trò Người đọc). Đang đăng nhập…')
      }
      await login(email, password)
    } catch (x) { setErr(x instanceof ApiError ? x.full : (x as Error).message) } finally { setBusy(false) }
  }
  const pwShort = mode === 'up' && password.length > 0 && password.length < 10

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
          <h1 className="text-5xl font-black leading-tight m-0">Tri thức nhóm.<br />Tìm nhanh.<br />Duyệt chuẩn.</h1>
          <p className="text-white/80 text-lg mt-5 max-w-lg">Ứng dụng máy tính cho kho tri thức: tài liệu, bài viết, prompt, runbook — tìm kiếm tiếng Việt, quy trình duyệt theo mức rủi ro, đo lường và trợ lý AI.</p>
        </div>
        <div className="relative text-white/70 text-sm">© {new Date().getFullYear()} Memorable Desktop</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="card w-full max-w-md !p-8 flex flex-col gap-5">
          <div>
            <Seg sm value={mode} onChange={(m) => { setMode(m); setErr('') }} options={[{ value: 'in', label: 'Đăng nhập' }, { value: 'up', label: 'Đăng ký' }]} />
            <h2 className="mt-4 mb-0 text-3xl font-black text-brand-700 uppercase">{mode === 'in' ? 'Chào mừng trở lại' : 'Tạo tài khoản'}</h2>
            <p className="text-muted mt-1 mb-0">{mode === 'in' ? 'Đăng nhập bằng email công ty' : 'Tài khoản mới có vai trò Người đọc; quản trị viên có thể nâng quyền'}</p>
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
          <button className="btn lg block" disabled={busy || !email || !password || (mode === 'up' && (!name || pwShort))}>{busy ? 'Đang xử lý…' : mode === 'in' ? 'Đăng nhập' : 'Đăng ký & đăng nhập'}</button>
          <div className="border-t border-line pt-4">
            {!editSrv ? (
              <div className="flex items-center gap-2 text-sm text-muted"><Server size={15} /><span className="truncate flex-1">Máy chủ: <b className="text-ink">{server || '…'}</b></span>
                <button type="button" className="btn ghost sm" onClick={() => setEditSrv(true)}>Đổi</button></div>
            ) : (
              <div className="flex gap-2"><input className="input" value={server} onChange={(e) => setServer(e.target.value)} placeholder="http://26.118.183.122:3001" />
                <button type="button" className="btn sm" onClick={saveServer}>Lưu</button></div>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
