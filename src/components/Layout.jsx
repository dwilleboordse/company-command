import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../contexts/ThemeContext'
import {
  LayoutDashboard, Target, Calendar, Video, LogOut, Settings, TrendingUp,
  Users, DollarSign, Menu, X, FileText, Trophy, Heart, UserCheck, Sun, Moon,
  ClipboardCheck, BarChart3
} from 'lucide-react'

export default function Layout() {
  const { profile, signOut, isCEO, isManagement, isOps } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null)
  const fileRef = useRef()

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files[0]
    if (!file || !profile) return
    setUploading(true)
    const path = `avatars/${profile.id}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id)
      setAvatarUrl(data.publicUrl)
    }
    setUploading(false)
  }

  const initials =
    profile?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'

  const nl = ({ isActive }) => `nav-item${isActive ? ' active' : ''}`

  return (
    <div className="app-layout">
      <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}>
        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">DU</div>
          <div className="sidebar-logo-text">
            <h1>DDU Media</h1>
            <p>Command Center</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <p className="nav-section-label">Overview</p>
          <NavLink to="/" end className={nl}>
            <LayoutDashboard size={17} /> <span>Dashboard</span>
          </NavLink>

          <p className="nav-section-label">Performance</p>
          <NavLink to="/okrs" className={nl}>
            <Target size={17} /> <span>OKRs</span>
          </NavLink>

          <p className="nav-section-label">Planning</p>
          <NavLink to="/calendar" className={nl}>
            <Calendar size={17} /> <span>Calendar</span>
          </NavLink>
          <NavLink to="/meetings" className={nl}>
            <Video size={17} /> <span>Meetings</span>
          </NavLink>

          <p className="nav-section-label">Tracking</p>
          <NavLink to="/spend" className={nl}>
            <DollarSign size={17} /> <span>Spend Tracker</span>
          </NavLink>
          <NavLink to="/changelog" className={nl}>
            <FileText size={17} /> <span>Change Log</span>
          </NavLink>
          <NavLink to="/rewards" className={nl}>
            <Trophy size={17} /> <span>Rewards</span>
          </NavLink>
          <NavLink to="/onboarding" className={nl}>
            <ClipboardCheck size={17} /> <span>Onboarding</span>
          </NavLink>

          {isManagement && (
            <>
              <p className="nav-section-label">Insights</p>
              <NavLink to="/analytics" className={nl}>
                <BarChart3 size={17} /> <span>Analytics</span>
              </NavLink>
            </>
          )}

          {(isManagement || isOps) && (
            <>
              <p className="nav-section-label">Clients</p>
              <NavLink to="/client-roster" className={nl}>
                <Users size={17} /> <span>Client Roster</span>
              </NavLink>
              <NavLink to="/clients" className={nl}>
                <Heart size={17} /> <span>Client Health</span>
              </NavLink>

              <p className="nav-section-label">Team</p>
              <NavLink to="/team-health" className={nl}>
                <UserCheck size={17} /> <span>Team Health</span>
              </NavLink>
            </>
          )}

          {isCEO && (
            <>
              <p className="nav-section-label">CEO Only</p>
              <NavLink to="/ceo" className={nl}>
                <TrendingUp size={17} /> <span>Models</span>
              </NavLink>
              <NavLink to="/admin" className={nl}>
                <Settings size={17} /> <span>Admin</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <button
            onClick={toggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '9px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg-card-2)',
              cursor: 'pointer',
              marginBottom: 10,
              color: 'var(--text-secondary)',
              fontSize: 12.5,
              fontWeight: 500,
              fontFamily: 'var(--font-body)',
              transition: 'all 0.12s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </span>
            <span
              style={{
                width: 32, height: 18, borderRadius: 100,
                background: theme === 'dark' ? 'var(--accent)' : 'var(--border)',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: theme === 'dark' ? 14 : 2,
                  width: 14, height: 14,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }}
              />
            </span>
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarUpload}
          />
          <div className="user-chip" onClick={() => fileRef.current?.click()}>
            <div className="user-avatar">
              {(avatarUrl || profile?.avatar_url)
                ? <img src={avatarUrl || profile?.avatar_url} alt="" />
                : initials}
            </div>
            <div className="user-info">
              <div className="user-name">{profile?.full_name || 'Loading…'}</div>
              <div className="user-role">
                {uploading ? 'Uploading…' : (profile?.role || '')}
              </div>
            </div>
            <button
              className="sign-out-btn"
              onClick={e => { e.stopPropagation(); handleSignOut() }}
              title="Sign out"
            >
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
