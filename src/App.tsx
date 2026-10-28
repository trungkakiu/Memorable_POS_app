import { ReactElement, useEffect } from 'react'
import { usePersona } from './lib/persona'
import { toast } from './store/ui'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/layout/Layout'
import { ConfirmHost, Toasts } from './components/ui'
import { OfflineBanner } from './components/OfflineBanner'
import { can, Cap } from './lib/permissions'
import { useAuth } from './store/auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Items from './pages/Items'
import ItemForm from './pages/ItemForm'
import ItemDetail from './pages/ItemDetail'
import Search from './pages/Search'
import Ai from './pages/Ai'
import { ReviewQueue, Tasks } from './pages/Review'
import { NotificationsPage } from './components/Notifications'
import IncidentCenter from './pages/IncidentCenter'
import RunbookImport from './pages/RunbookImport'
import IncidentHelp from './reader/IncidentHelp'
import { TimeLogs } from './pages/Measure'
import Reports from './pages/Reports'
import { Synonyms, Spaces, Tags, Templates } from './pages/Catalog'
import { AgentChat, AgentForm, AgentList, AgentMemoryPage, SkillsLibrary } from './pages/Agents'
import { AdminSettings, Audit, Connection, Users } from './pages/Admin'
import DataHealth from './pages/DataHealth'
import DataTransfer from './pages/DataTransfer'
import Devices from './pages/Devices'
// Giao diện Người đọc (thư viện tri thức đơn giản)
import ReaderLayout from './reader/ReaderLayout'
import { ReaderBrowse, ReaderHome, ReaderList, ReaderMe, ReaderSearch } from './reader/Pages'
import ReaderRead from './reader/Read'
import { LocalFileAsk } from './reader/MyFile'
import { PrivateFilePage } from './reader/HomeChat'
import ReaderCompare from './reader/Compare'
import ReaderMemory from './reader/Memory'
import { AdminTranscribePage, ReaderTranscribePage } from './components/Transcribe'
import { CompareDocs } from './pages/KnowledgePages'
import ImportHub from './pages/ImportHub'
import WebSources from './pages/WebSources'
import { AdminAutofillPage, ReaderAutofillPage } from './components/Autofill'
import { useUiMode } from './reader/common'
import AudiencePicker from './reader/AudiencePicker'
// Giao diện khối Sản xuất
import FieldLayout from './field/FieldLayout'
import FieldHome from './field/FieldHome'
import FieldAsk from './field/FieldAsk'
import FieldReport from './field/FieldReport'
import FieldGuides from './field/FieldGuides'
import FieldFarm from './field/FieldFarm'

function Guard({ cap, children }: { cap: Cap; children: ReactElement }) {
  const user = useAuth((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (!can(user.role, cap)) return <Navigate to="/" replace />
  return children
}

/** Sau khi đăng nhập: áp lựa chọn "Bạn là ai?" vào tài khoản. */
function useApplyPersona() {
  const user = useAuth((s) => s.user)
  useEffect(() => {
    if (!user) return
    const { persona } = usePersona.getState()
    if (user.role === 'reader') {
      // Lưu khối lên máy chủ ở lần đầu, các lần sau và máy khác vào thẳng đúng giao diện
      if (!user.audience && (persona === 'office' || persona === 'field')) void useAuth.getState().setAudience(persona).catch(() => undefined)
      else if (user.audience && persona && persona !== user.audience) {
        toast.info(persona === 'manager' ? 'Tài khoản này là tài khoản người dùng, không phải quản lý.' : `Tài khoản này thuộc khối ${user.audience === 'field' ? 'Sản xuất' : 'Văn phòng'}. Muốn đổi hãy nhờ quản trị viên.`)
        usePersona.getState().setPersona(user.audience)
      }
    } else useUiMode.getState().setSimple(persona === 'office')
  }, [user?.id]) // eslint-disable-line
}

export default function App() {
  const user = useAuth((s) => s.user)
  const simpleMode = useUiMode((s) => s.simple)
  const persona = usePersona((s) => s.persona)
  const isReader = user?.role === 'reader'
  // Khối làm việc: tài khoản Người đọc theo khối lưu trên máy chủ (chưa có thì lấy lựa chọn "Bạn là ai?" lúc mở ứng dụng);
  // tài khoản quản lý chọn "Sản xuất" / "Văn phòng" thì vào giao diện tương ứng, chọn "Quản lý" thì vào giao diện quản lý.
  const pick = persona === 'office' || persona === 'field' ? persona : null
  const audience = isReader ? user?.audience || pick : null
  const needAudience = !!user && isReader && !audience
  const field = !!user && (isReader ? audience === 'field' : persona === 'field')
  // Người đọc luôn dùng giao diện đơn giản; vai trò khác có thể bật từ menu.
  const simple = !!user && (isReader || simpleMode)
  useApplyPersona()
  const g = (cap: Cap, el: ReactElement) => <Guard cap={cap}>{el}</Guard>
  return (
    <>
      <HashRouter>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          {needAudience ? (
            <Route index element={<AudiencePicker />} />
          ) : field ? (
            <Route element={<FieldLayout />}>
              <Route index element={<FieldHome />} />
              <Route path="hoi" element={<FieldAsk />} />
              <Route path="bao-hong" element={<FieldReport />} />
              <Route path="huong-dan" element={<FieldGuides />} />
              <Route path="so-lieu" element={<FieldFarm />} />
              <Route path="items/:id" element={<ReaderRead />} />
              <Route path="read/:id" element={<ReaderRead />} />
              <Route path="thong-bao" element={<NotificationsPage reader />} />
              <Route path="su-co" element={<Navigate to="/bao-hong" replace />} />
            </Route>
          ) : simple ? (
            <Route element={<ReaderLayout />}>
              <Route index element={<ReaderHome />} />
              <Route path="search" element={<ReaderSearch />} />
              <Route path="me" element={<ReaderMe />} />
              <Route path="browse" element={<ReaderBrowse />} />
              <Route path="browse/space/:id" element={<ReaderList />} />
              <Route path="browse/type/:type" element={<ReaderList />} />
              <Route path="browse/tag/:tag" element={<ReaderList />} />
              <Route path="items/:id" element={<ReaderRead />} />
              <Route path="read/:id" element={<ReaderRead />} />
              <Route path="ai" element={<Navigate to="/" replace />} />
              <Route path="my-file" element={<Navigate to="/" replace />} />
              <Route path="my-file/private" element={<PrivateFilePage><LocalFileAsk /></PrivateFilePage>} />
              <Route path="transcribe" element={<ReaderTranscribePage />} />
              <Route path="autofill" element={<ReaderAutofillPage />} />
              <Route path="compare" element={<ReaderCompare />} />
              <Route path="them-tai-lieu" element={<ImportHub reader />} />
              <Route path="memory" element={<ReaderMemory />} />
              <Route path="su-co" element={<IncidentHelp />} />
              <Route path="thong-bao" element={<NotificationsPage reader />} />
            </Route>
          ) : (
            <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
              <Route index element={<Dashboard />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="items" element={<Items />} />
              <Route path="items/new" element={g('write', <ItemForm />)} />
              <Route path="import-knowledge" element={g('write', <ImportHub />)} />
              <Route path="transcribe" element={g('ask', <AdminTranscribePage />)} />
              <Route path="autofill" element={g('ask', <AdminAutofillPage />)} />
              <Route path="web-sources" element={g('moderate', <WebSources />)} />
              <Route path="items/:id" element={<ItemDetail />} />
              <Route path="items/:id/edit" element={g('write', <ItemForm />)} />
              <Route path="search" element={<Search />} />
              <Route path="templates" element={<Templates />} />
              <Route path="ai" element={g('ask', <Ai />)} />
              <Route path="ai/tools" element={<Navigate to="/reports?tab=ai" replace />} />
              <Route path="knowledge" element={<DataHealth />} />
              <Route path="knowledge/search" element={<Navigate to="/knowledge?tab=search" replace />} />
              <Route path="compare" element={g('ask', <CompareDocs />)} />
              <Route path="agents" element={g('ask', <AgentList />)} />
              <Route path="agents/new" element={g('ask', <AgentForm />)} />
              <Route path="agents/skills" element={g('ask', <SkillsLibrary />)} />
              <Route path="agents/memory" element={g('ask', <AgentMemoryPage />)} />
              <Route path="agents/:id/chat" element={g('ask', <AgentChat />)} />
              <Route path="agents/:id/edit" element={g('ask', <AgentForm />)} />
              <Route path="reviews" element={g('moderate', <ReviewQueue />)} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="incidents" element={<IncidentCenter />} />
              <Route path="runbooks/import" element={g('write', <RunbookImport />)} />
              <Route path="timelogs" element={g('timelog', <TimeLogs />)} />
              <Route path="costs" element={<Navigate to="/reports?tab=cost" replace />} />
              <Route path="benchmarks" element={<Navigate to="/reports?tab=bench" replace />} />
              <Route path="reports" element={g('report', <Reports />)} />
              <Route path="audit" element={g('moderate', <Audit />)} />
              <Route path="tags" element={<Tags />} />
              <Route path="synonyms" element={<Synonyms />} />
              <Route path="spaces" element={<Spaces />} />
              <Route path="data" element={g('moderate', <DataTransfer />)} />
              <Route path="import" element={<Navigate to="/data" replace />} />
              <Route path="export" element={<Navigate to="/data?tab=export" replace />} />
              <Route path="users" element={g('admin', <Users />)} />
              <Route path="devices" element={g('admin', <Devices />)} />
              <Route path="admin-settings" element={g('admin', <AdminSettings />)} />
              <Route path="connection" element={<Connection />} />
            </Route>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      <OfflineBanner /><Toasts />
      <ConfirmHost />
    </>
  )
}
