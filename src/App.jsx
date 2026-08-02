import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import OKRs from './pages/OKRs'
import Calendar from './pages/Calendar'
import Meetings from './pages/Meetings'
import CEOModels from './pages/CEOModels'
import Admin from './pages/Admin'
import Clients from './pages/Clients'
import TeamHealth from './pages/TeamHealth'
import ClientRoster from './pages/ClientRoster'
import Onboarding from './pages/Onboarding'
import SpendTracker from './pages/SpendTracker'
import ChangeLog from './pages/ChangeLog'
import Rewards from './pages/Rewards'
import Analytics from './pages/Analytics'
import HundredDayPlan from './pages/HundredDayPlan'
import Accountability from './pages/Accountability'
import ChurnAnalysis from './pages/ChurnAnalysis'

function PR({ children, ceo=false, mgmt=false, ops=false }) {
  const { user, profile, loading, isOps } = useAuth()
  if (loading) return <div className="loading-screen"><div className="spinner"/></div>
  if (!user) return <Navigate to="/login" replace/>
  if (ceo && profile?.role!=='ceo') return <Navigate to="/" replace/>
  if (mgmt && !['ceo','management'].includes(profile?.role) && !(ops && isOps)) return <Navigate to="/" replace/>
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen"><div className="spinner"/></div>
  return (
    <Routes>
      <Route path="/login" element={user?<Navigate to="/" replace/>:<Login/>}/>
      <Route path="/" element={<PR><Layout/></PR>}>
        <Route index element={<Dashboard/>}/>
        <Route path="okrs" element={<OKRs/>}/>
        <Route path="100-day-plan" element={<HundredDayPlan/>}/>
        <Route path="calendar" element={<Calendar/>}/>
        <Route path="meetings" element={<Meetings/>}/>
        <Route path="spend" element={<SpendTracker/>}/>
        <Route path="changelog" element={<ChangeLog/>}/>
        <Route path="rewards" element={<Rewards/>}/>
        <Route path="accountability" element={<PR mgmt ops><Accountability/></PR>}/>
        <Route path="clients" element={<PR mgmt ops><Clients/></PR>}/>
        <Route path="team-health" element={<PR mgmt ops><TeamHealth/></PR>}/>
        <Route path="analytics" element={<PR mgmt><Analytics/></PR>}/>
        <Route path="churn-analysis" element={<PR mgmt><ChurnAnalysis/></PR>}/>
        <Route path="client-roster" element={<PR mgmt ops><ClientRoster/></PR>}/>
        <Route path="onboarding" element={<PR><Onboarding/></PR>}/>
        <Route path="ceo" element={<PR ceo><CEOModels/></PR>}/>
        <Route path="admin" element={<PR ceo><Admin/></PR>}/>
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
