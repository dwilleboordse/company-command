import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import KPIs from './pages/KPIs'
import Milestones from './pages/Milestones'
import Calendar from './pages/Calendar'
import Meetings from './pages/Meetings'
import CEOModels from './pages/CEOModels'
import Admin from './pages/Admin'
import Clients from './pages/Clients'
import SpendTracker from './pages/SpendTracker'
import ChangeLog from './pages/ChangeLog'
import Rewards from './pages/Rewards'

function ProtectedRoute({ children, requireCEO=false, requireManagement=false }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="loading-screen"><div className="spinner"/></div>
  if (!user) return <Navigate to="/login" replace/>
  if (requireCEO && profile?.role !== 'ceo') return <Navigate to="/" replace/>
  if (requireManagement && !['ceo','management'].includes(profile?.role)) return <Navigate to="/" replace/>
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen"><div className="spinner"/></div>
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace/> : <Login/>}/>
      <Route path="/" element={<ProtectedRoute><Layout/></ProtectedRoute>}>
        <Route index element={<Dashboard/>}/>
        <Route path="kpis" element={<KPIs/>}/>
        <Route path="milestones" element={<Milestones/>}/>
        <Route path="calendar" element={<Calendar/>}/>
        <Route path="meetings" element={<Meetings/>}/>
        <Route path="spend" element={<SpendTracker/>}/>
        <Route path="changelog" element={<ChangeLog/>}/>
        <Route path="rewards" element={<Rewards/>}/>
        <Route path="clients" element={<ProtectedRoute requireManagement><Clients/></ProtectedRoute>}/>
        <Route path="ceo" element={<ProtectedRoute requireCEO><CEOModels/></ProtectedRoute>}/>
        <Route path="admin" element={<ProtectedRoute requireCEO><Admin/></ProtectedRoute>}/>
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes/>
      </AuthProvider>
    </BrowserRouter>
  )
}
