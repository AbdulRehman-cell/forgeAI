import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import AppLayout from '@/components/layout/AppLayout'

// Pages
import Landing from '@/pages/Landing'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Repositories from '@/pages/Repositories'
import Builder from '@/pages/Builder'
import RepositoryDetail from '@/pages/RepositoryDetail'
import Workspace from '@/pages/Workspace'
import TaskHistory from '@/pages/TaskHistory'
import Settings from '@/pages/Settings'
import Pricing from '@/pages/Pricing'
import Dashboards from '@/pages/Dashboards'
import DashboardBuilder from '@/pages/DashboardBuilder'
import DashboardDetail from '@/pages/DashboardDetail'
import Search from '@/pages/Search'
import ShareReport from '@/pages/ShareReport'
import Leads from '@/pages/Leads'
import Outreach from '@/pages/Outreach'
import ApprovalPage from '@/pages/ApprovalPage'
import TeamSettings from '@/pages/TeamSettings'
import TeamAccept from '@/pages/TeamAccept'

import NotFound from '@/pages/NotFound'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/share/:token" element={<ShareReport />} />
        <Route path="/approve/:token" element={<ApprovalPage />} />
        <Route path="/team/accept" element={<TeamAccept />} />

        <Route element={<PrivateRoute><AppLayout /></PrivateRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/builder" element={<Builder />} />
          <Route path="/repositories" element={<Repositories />} />
          <Route path="/repositories/:id" element={<RepositoryDetail />} />
          <Route path="/repositories/:id/workspace" element={<Workspace />} />
          <Route path="/dashboards" element={<Dashboards />} />
          <Route path="/dashboards/new" element={<DashboardBuilder />} />
          <Route path="/dashboards/:id" element={<DashboardDetail />} />
          <Route path="/tasks" element={<TaskHistory />} />
          <Route path="/search" element={<Search />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/outreach" element={<Outreach />} />
          <Route path="/team" element={<TeamSettings />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/pricing" element={<Pricing />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
