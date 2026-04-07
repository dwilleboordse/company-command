import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { LayoutDashboard, BarChart2, Target, Calendar, Video, LogOut, Settings, TrendingUp, Camera } from 'lucide-react'

export default function Layout() {
  const { profile, signOut, isCEO } = useAuth()
  const navigate = useNavigate()
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null)
  const fileRef = useRef()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files[0]
    if (!file || !profile) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `avatars/${profile.id}.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!uploadError) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = data.publicUrl
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
      setAvatarUrl(url)
    }
    setUploading(false)
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '??'

  return (
    <div className="app-layout">
      <aside className="sidebar">
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
          <div className="user-chip" onClick={() => fileRef.current?.click()} title="Click to change profile photo">
            <div className="user-avatar" style={{ position: 'relative' }}>
              {avatarUrl || profile?.avatar_url
                ? <img src={avatarUrl || profile?.avatar_url} alt="avatar" />
                : initials}
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                <Camera size={12} color="#fff" />
              </div>
            </div>
            <div className="user-info">
              <div className="user-name">{profile?.full_name || 'Loading...'}</div>
              <div className="user-role">{uploading ? 'Uploading...' : profile?.role || ''}</div>
            </div>
            <button className="sign-out-btn" onClick={e => { e.stopPropagation(); handleSignOut() }} title="Sign out">
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
