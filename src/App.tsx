import { ReactElement } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/layout/Layout'
import { ConfirmHost, Toasts } from './components/ui'
import { can, Cap } from './lib/permissions'
import { useAuth } from './store/auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Items from './pages/Items'
import ItemForm from './pages/ItemForm'
import ItemDetail from './pages/ItemDetail'
import Search from './pages/Search'
import Ai, { AiTools } from './pages/Ai'
import { Notifications, ReviewQueue, Tasks } from './pages/Review'
import Incidents from './pages/Incidents'
import { Benchmarks, Costs, TimeLogs } from './pages/Measure'
import Reports from './pages/Reports'
import { Synonyms, Spaces, Tags, Templates } from './pages/Catalog'
import { AgentChat, AgentForm, AgentList, AgentMemoryPage, SkillsLibrary } from './pages/Agents'
import { AdminSettings, Audit, Connection, ExportFull, ImportItems, Users } from './pages/Admin'
// Giao diện Người đọc (thư viện tri thức đơn giản)
import ReaderLayout from './reader/ReaderLayout'
import { ReaderBrowse, ReaderHome, ReaderList, ReaderMe, ReaderSearch } from './reader/Pages'
import ReaderRead from './reader/Read'
import { AskPage } from './reader/Assistant'
import ReaderMyFile from './reader/MyFile'
import ReaderCompare from './reader/Compare'
import ReaderMemory from './reader/Memory'
import { CompareDocs, KnowledgeSearch, KnowledgeSources } from './pages/KnowledgePages'
import { useUiMode } from './reader/common'

function Guard({ cap, children }: { cap: Cap; children: ReactElement }) {
  const user = useAuth((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (!can(user.role, cap)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const user = useAuth((s) => s.user)
  const simpleMode = useUiMode((s) => s.simple)
  // Người đọc luôn dùng giao diện đơn giản; vai trò khác có thể bật từ menu.
  const simple = !!user && (user.role === 'reader' || simpleMode)
  const g = (cap: Cap, el: ReactElement) => <Guard cap={cap}>{el}</Guard>
  return (
    <>
      <HashRouter>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          {simple ? (
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
              <Route path="ai" element={<AskPage />} />
              <Route path="my-file" element={<ReaderMyFile />} />
              <Route path="compare" element={<ReaderCompare />} />
              <Route path="memory" element={<ReaderMemory />} />
            </Route>
          ) : (
            <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
              <Route index element={<Dashboard />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="items" element={<Items />} />
              <Route path="items/new" element={g('write', <ItemForm />)} />
              <Route path="items/:id" element={<ItemDetail />} />
              <Route path="items/:id/edit" element={g('write', <ItemForm />)} />
              <Route path="search" element={<Search />} />
              <Route path="templates" element={<Templates />} />
              <Route path="ai" element={g('ask', <Ai />)} />
              <Route path="ai/tools" element={g('write', <AiTools />)} />
              <Route path="knowledge" element={<KnowledgeSources />} />
              <Route path="knowledge/search" element={g('ask', <KnowledgeSearch />)} />
              <Route path="compare" element={g('ask', <CompareDocs />)} />
              <Route path="agents" element={g('ask', <AgentList />)} />
              <Route path="agents/new" element={g('ask', <AgentForm />)} />
              <Route path="agents/skills" element={g('ask', <SkillsLibrary />)} />
              <Route path="agents/memory" element={g('ask', <AgentMemoryPage />)} />
              <Route path="agents/:id/chat" element={g('ask', <AgentChat />)} />
              <Route path="agents/:id/edit" element={g('ask', <AgentForm />)} />
              <Route path="reviews" element={g('moderate', <ReviewQueue />)} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="incidents" element={<Incidents />} />
              <Route path="timelogs" element={g('timelog', <TimeLogs />)} />
              <Route path="costs" element={g('report', <Costs />)} />
              <Route path="benchmarks" element={g('report', <Benchmarks />)} />
              <Route path="reports" element={g('report', <Reports />)} />
              <Route path="audit" element={g('moderate', <Audit />)} />
              <Route path="tags" element={<Tags />} />
              <Route path="synonyms" element={<Synonyms />} />
              <Route path="spaces" element={<Spaces />} />
              <Route path="import" element={g('moderate', <ImportItems />)} />
              <Route path="export" element={g('admin', <ExportFull />)} />
              <Route path="users" element={g('admin', <Users />)} />
              <Route path="admin-settings" element={g('admin', <AdminSettings />)} />
              <Route path="connection" element={<Connection />} />
            </Route>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      <Toasts />
      <ConfirmHost />
    </>
  )
}
