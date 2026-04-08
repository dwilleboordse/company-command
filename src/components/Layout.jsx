import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { LayoutDashboard, BarChart2, Target, Calendar, Video, LogOut, Settings, TrendingUp, Users, DollarSign, Menu, X, FileText } from 'lucide-react'

export default function Layout() {
  const { profile, signOut, isCEO, isManagement } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null)
  const fileRef = useRef()

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  async function handleSignOut() { await signOut(); navigate('/login') }

  async function handleAvatarUpload(e) {
    const file = e.target.files[0]
    if (!file || !profile) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `avatars/${profile.id}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id)
      setAvatarUrl(data.publicUrl)
    }
    setUploading(false)
  }

  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'

  return (
    <div className="app-layout">
      {/* Hamburger */}
      <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}>
        {sidebarOpen ? <X size={18} color="var(--text-primary)" /> : <Menu size={18} color="var(--text-primary)" />}
      </button>

      {/* Overlay */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <h1>DDU MEDIA</h1>
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

          <p className="nav-section-label">Tracking</p>
          <NavLink to="/spend" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <DollarSign size={16} /> Spend Tracker
          </NavLink>

          {isManagement && (
            <>
              <p className="nav-section-label">Clients</p>
              <NavLink to="/clients" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Users size={16} /> Client Health
              </NavLink>
            </>
          )}

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
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
          <div className="user-chip" onClick={() => fileRef.current?.click()}>
            <div className="user-avatar">
              {avatarUrl || profile?.avatar_url
                ? <img src={avatarUrl || profile?.avatar_url} alt="avatar" />
                : initials}
            </div>
            <div className="user-info">
              <div className="user-name">{profile?.full_name || 'Loading...'}</div>
              <div className="user-role">{uploading ? 'Uploading...' : profile?.role || ''}</div>
            </div>
            <button className="sign-out-btn" onClick={e => { e.stopPropagation(); handleSignOut() }}>
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
