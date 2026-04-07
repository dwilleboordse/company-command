import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, BarChart2, Target, Calendar, Users,
  LogOut, Settings, TrendingUp, Video
} from 'lucide-react'

export default function Layout() {
  const { profile, signOut, isCEO, isManagement } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '??'

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Double U</h1>
          <p>Command Center</p>
        </div>

        <nav className="sidebar-nav">
          <p className="nav-section-label">Overview</p>
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={16} /> Dashboard
          </NavLink>

          <p className="nav-section-label">Performance</p>
          <NavLink to="/kpis" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <BarChart2 size={16} /> KPIs
          </NavLink>
          <NavLink to="/milestones" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Target size={16} /> Milestones
          </NavLink>

          <p className="nav-section-label">Planning</p>
          <NavLink to="/calendar" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Calendar size={16} /> Calendar
          </NavLink>
          <NavLink to="/meetings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Video size={16} /> Meetings
          </NavLink>

          {isCEO && (
            <>
              <p className="nav-section-label">CEO Only</p>
              <NavLink to="/ceo" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <TrendingUp size={16} /> Models
              </NavLink>
              <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Settings size={16} /> Admin
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name">{profile?.full_name || 'Loading...'}</div>
              <div className="user-role">{profile?.role || ''}</div>
            </div>
            <button className="sign-out-btn" onClick={handleSignOut} title="Sign out">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
