import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Trash2, Edit2, Users, Lock } from 'lucide-react'

const ROLE_LABELS = {
  marketing: 'Marketing', media_buyer: 'Media Buyer', creative_strategist: 'Creative Strategist',
  editor: 'Editor', designer: 'Designer', ugc_manager: 'UGC Manager', email_marketer: 'Email Marketer',
  ops_manager: 'Operations Manager', ops_assistant: 'Operations Assistant', hr_manager: 'HR Manager',
  management: 'Management',
}

const DEPT_LABELS = {
  delivery: 'Delivery', marketing: 'Marketing', operations: 'Operations', management: 'Management', support: 'Support'
}

function InviteModal({ onClose, onSave }) {
  const [form, setForm] = useState({ email: '', full_name: '', role: 'athlete', position: 'creative_strategist', department: 'delivery', password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleInvite() {
    if (!form.email || !form.full_name || !form.password) { setError('Email, name, and password are required.'); return }
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          role: form.role,
          position: form.position,
          department: form.department,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create user.')
        setSaving(false)
        return
      }
      onSave()
      setSaving(false)
      onClose()
    } catch (err) {
      setError('Network error. Make sure SUPABASE_SERVICE_ROLE_KEY is set in Vercel.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Add Team Member</h2>
        <p className="text-secondary text-sm mb-4">
          Creates a login for this team member. They use these credentials at the login page. Make sure "Confirm email" is disabled in Supabase Auth settings.
        </p>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group">
          <label>Full Name</label>
          <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Alex Johnson" />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="alex@d-doublemedia.com" />
        </div>
        <div className="form-group">
          <label>Temporary Password</label>
          <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="They can change this" />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>System Role</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="athlete">Athlete (default)</option>
              <option value="management">Management</option>
              <option value="ceo">CEO</option>
            </select>
          </div>
          <div className="form-group">
            <label>Department</label>
            <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
              {Object.entries(DEPT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Position / Role Type</label>
          <select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleInvite} disabled={saving}>{saving ? 'Adding...' : 'Add Member'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function EditProfileModal({ member, onClose, onSave }) {
  const [form, setForm] = useState({
    full_name: member.full_name || '',
    role: member.role || 'athlete',
    position: member.position || '',
    department: member.department || 'delivery',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase.from('profiles').update({ ...form, updated_at: new Date().toISOString() }).eq('id', member.id)
    onSave(); setSaving(false); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Edit {member.full_name}</h2>
        <div className="form-group">
          <label>Full Name</label>
          <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>System Role</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="athlete">Athlete</option>
              <option value="management">Management</option>
              <option value="ceo">CEO</option>
            </select>
          </div>
          <div className="form-group">
            <label>Department</label>
            <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
              {Object.entries(DEPT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Position / Role Type</label>
          <select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}>
            <option value="">— None —</option>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function Admin() {
  const { isCEO, profile } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [tab, setTab] = useState('team')

  useEffect(() => { loadTeam() }, [])

  async function loadTeam() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('department').order('full_name')
    setMembers(data || [])
    setLoading(false)
  }

  if (!isCEO) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Lock size={40} color="var(--text-muted)" />
      <p className="text-muted" style={{ marginTop: 12 }}>CEO access only.</p>
    </div>
  )

  const grouped = members.reduce((acc, m) => {
    const d = m.department || 'other'
    if (!acc[d]) acc[d] = []
    acc[d].push(m)
    return acc
  }, {})

  const roleColor = { ceo: 'amber', management: 'blue', athlete: 'green' }

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">
              Admin
              <span className="ceo-badge"><Lock size={9} /> CEO Only</span>
            </h1>
            <p className="page-subtitle">Team management, roles, and system configuration</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowInvite(true)}>
            <Plus size={15} /> Add Team Member
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="tabs">
          <button className={`tab ${tab === 'team' ? 'active' : ''}`} onClick={() => setTab('team')}>Team Members</button>
          <button className={`tab ${tab === 'access' ? 'active' : ''}`} onClick={() => setTab('access')}>Role Access Guide</button>
        </div>

        {tab === 'team' && (
          <>
            <div className="stat-row">
              <div className="stat-box">
                <div className="stat-box-label">Total Members</div>
                <div className="stat-box-value">{members.length}</div>
              </div>
              <div className="stat-box">
                <div className="stat-box-label">Athletes</div>
                <div className="stat-box-value text-green">{members.filter(m => m.role === 'athlete').length}</div>
              </div>
              <div className="stat-box">
                <div className="stat-box-label">Management</div>
                <div className="stat-box-value text-accent">{members.filter(m => m.role === 'management').length}</div>
              </div>
              <div className="stat-box">
                <div className="stat-box-label">CEO</div>
                <div className="stat-box-value text-amber">{members.filter(m => m.role === 'ceo').length}</div>
              </div>
            </div>

            {loading ? (
              <div className="loading-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
            ) : (
              Object.entries(grouped).map(([dept, deptMembers]) => (
                <div key={dept} style={{ marginBottom: 28 }}>
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="section-title">{DEPT_LABELS[dept] || dept}</h3>
                    <span className={`dept-tag ${dept}`}>{deptMembers.length} members</span>
                  </div>
                  <div className="card" style={{ padding: 0 }}>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Position</th>
                            <th>Role</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deptMembers.map(m => (
                            <tr key={m.id}>
                              <td>
                                <div className="flex items-center gap-2">
                                  <div className="user-avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
                                    {m.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                  </div>
                                  <span className="fw-600">{m.full_name}</span>
                                  {m.id === profile?.id && <span className="badge blue" style={{ fontSize: 9 }}>You</span>}
                                </div>
                              </td>
                              <td className="text-secondary font-mono text-sm">{m.email}</td>
                              <td className="text-secondary text-sm">{ROLE_LABELS[m.position] || '—'}</td>
                              <td><span className={`badge ${roleColor[m.role] || 'gray'}`}>{m.role}</span></td>
                              <td>
                                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditMember(m)}>
                                  <Edit2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {tab === 'access' && (
          <div className="card" style={{ maxWidth: 600 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Role Access Matrix</h3>
            {[
              { role: 'CEO', color: 'amber', access: ['Dashboard (all)', 'KPIs (all departments)', 'Milestones (all)', 'Calendar (all team)', 'Meetings (all)', 'CEO Models (private)', 'Admin panel', 'Add/edit KPIs', 'Update any KPI value'] },
              { role: 'Management', color: 'blue', access: ['Dashboard (team view)', 'KPIs (team + management metrics)', 'Milestones (all, can update)', 'Calendar (all team)', 'Meetings (all + recap)', 'Add/edit KPIs', 'Update KPI values'] },
              { role: 'Athlete', color: 'green', access: ['Dashboard (own KPIs + milestones)', 'KPIs (own role only, read)', 'Milestones (own role, can update status)', 'Calendar (own days + week outcomes)', 'Meetings (own prep only)'] },
            ].map(({ role, color, access }) => (
              <div key={role} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`badge ${color}`}>{role}</span>
                </div>
                <ul style={{ paddingLeft: 0, listStyle: 'none' }}>
                  {access.map((a, i) => (
                    <li key={i} className="flex items-center gap-2" style={{ padding: '4px 0', fontSize: 12 }}>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onSave={loadTeam} />}
      {editMember && <EditProfileModal member={editMember} onClose={() => setEditMember(null)} onSave={loadTeam} />}
    </>
  )
}
