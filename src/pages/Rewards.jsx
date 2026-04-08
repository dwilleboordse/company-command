import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { computeAndAwardBadges, getLeaderboard } from '../lib/badges'

const CATEGORY_LABELS = {
  performance: 'Performance', milestones: 'Milestones', consistency: 'Consistency',
  spend: 'Spend', role: 'Role-Specific', team: 'Team'
}
const CATEGORY_COLORS = {
  performance: '#3b82f6', milestones: '#8b5cf6', consistency: '#22c55e',
  spend: '#f59e0b', role: '#f43f5e', team: '#06b6d4'
}

function initials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
}
function formatPosition(pos) {
  const map = { creative_strategist:'Creative Strategist', media_buyer:'Media Buyer', editor:'Editor', designer:'Designer', ugc_manager:'UGC Manager', email_marketer:'Email Marketer', ops_manager:'Ops Manager', ops_assistant:'Ops Assistant', hr_manager:'HR Manager', marketing:'Marketing', management:'Management' }
  return map[pos] || pos || '—'
}

function BadgeCard({ badge, earned, earnedAt }) {
  return (
    <div style={{
      background: earned ? 'var(--bg-card)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${earned ? CATEGORY_COLORS[badge.category]+'40' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '16px',
      position: 'relative',
      opacity: earned ? 1 : 0.45,
      transition: 'all 0.15s',
    }}>
      {earned && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          width: 8, height: 8, borderRadius: '50%',
          background: CATEGORY_COLORS[badge.category],
        }} />
      )}
      <div style={{ fontSize: 32, marginBottom: 8, lineHeight: 1 }}>{badge.icon}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{badge.name}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 8 }}>{badge.description}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: CATEGORY_COLORS[badge.category], background: CATEGORY_COLORS[badge.category]+'18', padding: '1px 6px', borderRadius: 100 }}>
          +{badge.points} pts
        </span>
        {earned && earnedAt && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {new Date(earnedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        {!earned && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Locked</span>}
      </div>
    </div>
  )
}

function MyBadges({ profile }) {
  const [allBadges, setAllBadges] = useState([])
  const [earnedBadges, setEarnedBadges] = useState([])
  const [totalPoints, setTotalPoints] = useState(0)
  const [newBadges, setNewBadges] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('all')
  const [computing, setComputing] = useState(false)

  useEffect(() => { load() }, [profile])

  async function load() {
    setLoading(true)

    // Compute badges first
    if (profile?.id && profile?.position) {
      setComputing(true)
      const newlyEarned = await computeAndAwardBadges(profile.id, profile.position)
      setNewBadges(newlyEarned)
      setComputing(false)
    }

    const [{ data: defs }, { data: earned }, { data: points }] = await Promise.all([
      supabase.from('badge_definitions').select('*').order('category').order('points'),
      supabase.from('user_badges').select('*').eq('user_id', profile.id),
      supabase.from('user_points').select('points').eq('user_id', profile.id),
    ])

    setAllBadges(defs || [])
    setEarnedBadges(earned || [])
    setTotalPoints((points || []).reduce((s, p) => s + p.points, 0))
    setLoading(false)
  }

  const earnedMap = Object.fromEntries((earnedBadges || []).map(b => [b.badge_id, b]))
  const earnedCount = earnedBadges.length
  const totalCount = allBadges.length

  // Filter badges relevant to this user's role
  const relevantBadges = allBadges.filter(b => !b.role_filter || b.role_filter === profile?.position)

  const categories = ['all', ...new Set(relevantBadges.map(b => b.category))]
  const filtered = activeCategory === 'all' ? relevantBadges : relevantBadges.filter(b => b.category === activeCategory)

  // Group by category for display
  const grouped = filtered.reduce((acc, b) => {
    if (!acc[b.category]) acc[b.category] = []
    acc[b.category].push(b)
    return acc
  }, {})

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      {/* New badge notification */}
      {newBadges.length > 0 && (
        <div style={{ marginBottom: 20, padding: '16px 20px', background: 'rgba(59,130,246,0.08)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 24 }}>🎉</div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>New badge{newBadges.length > 1 ? 's' : ''} unlocked!</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {newBadges.join(', ')} — keep it up.
            </div>
          </div>
        </div>
      )}

      {/* Points summary */}
      <div className="stat-row" style={{ marginBottom: 20 }}>
        <div className="stat-box">
          <div className="stat-box-label">Total Points</div>
          <div className="stat-box-value text-accent">{totalPoints.toLocaleString()}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Badges Earned</div>
          <div className="stat-box-value text-green">{earnedCount}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Available</div>
          <div className="stat-box-value">{relevantBadges.length}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Completion</div>
          <div className="stat-box-value text-amber">{relevantBadges.length ? Math.round((earnedCount / relevantBadges.length) * 100) : 0}%</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 24, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${relevantBadges.length ? (earnedCount / relevantBadges.length) * 100 : 0}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--green))', borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>

      {/* Category tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {categories.map(cat => (
          <button key={cat} className={`tab ${activeCategory === cat ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>
            {cat === 'all' ? 'All' : CATEGORY_LABELS[cat] || cat}
            {cat !== 'all' && (
              <span style={{ marginLeft: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {relevantBadges.filter(b => b.category === cat && earnedMap[b.id]).length}/{relevantBadges.filter(b => b.category === cat).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Badge grid */}
      {Object.entries(grouped).map(([cat, badges]) => (
        <div key={cat} style={{ marginBottom: 28 }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: CATEGORY_COLORS[cat] }}>{CATEGORY_LABELS[cat]}</h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {badges.filter(b => earnedMap[b.id]).length}/{badges.length}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {badges.map(badge => (
              <BadgeCard
                key={badge.id}
                badge={badge}
                earned={!!earnedMap[badge.id]}
                earnedAt={earnedMap[badge.id]?.earned_at}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Leaderboard() {
  const { profile } = useAuth()
  const [board, setBoard] = useState([])
  const [loading, setLoading] = useState(true)
  const [allBadgeDefs, setAllBadgeDefs] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [data, { data: defs }] = await Promise.all([
      getLeaderboard(),
      supabase.from('badge_definitions').select('*'),
    ])
    setBoard(data)
    setAllBadgeDefs(Object.fromEntries((defs || []).map(d => [d.id, d])))
    setLoading(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div>
      {/* Top 3 podium */}
      {board.length >= 3 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 28 }}>
          {[board[1], board[0], board[2]].map((person, podiumIdx) => {
            if (!person) return <div key={podiumIdx} />
            const rank = podiumIdx === 1 ? 1 : podiumIdx === 0 ? 2 : 3
            const isMe = person.id === profile?.id
            const heights = ['140px', '180px', '120px']
            return (
              <div key={person.id} style={{
                background: isMe ? 'var(--accent-dim)' : 'var(--bg-card)',
                border: `1px solid ${isMe ? 'var(--accent)' : rank === 1 ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: '20px 16px',
                textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                minHeight: heights[podiumIdx],
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{medals[rank - 1]}</div>
                <div className="user-avatar" style={{ width: 44, height: 44, fontSize: 14, margin: '0 auto 8px', border: rank === 1 ? '2px solid var(--amber)' : undefined }}>
                  {person.avatar_url ? <img src={person.avatar_url} alt="" /> : initials(person.full_name)}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{person.full_name?.split(' ')[0]}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{formatPosition(person.position)}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: rank === 1 ? 'var(--amber)' : 'var(--text-primary)' }}>
                  {person.totalPoints.toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>pts · {person.badgeCount} badges</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Full ranking */}
      <div className="card" style={{ padding: 0 }}>
        {board.map((person, i) => {
          const isMe = person.id === profile?.id
          const recentBadges = person.badges.slice(0, 5).map(id => allBadgeDefs[id]).filter(Boolean)
          return (
            <div key={person.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
              borderBottom: i < board.length - 1 ? '1px solid var(--border)' : 'none',
              background: isMe ? 'rgba(59,130,246,0.04)' : 'transparent',
              flexWrap: 'wrap',
            }}>
              {/* Rank */}
              <div style={{ width: 28, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12,
                color: i < 3 ? ['var(--amber)','#9ca3af','#cd7f32'][i] : 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}>
                {i < 3 ? medals[i] : `#${i + 1}`}
              </div>

              {/* Avatar */}
              <div className="user-avatar" style={{ width: 36, height: 36, fontSize: 12, flexShrink: 0,
                border: isMe ? '2px solid var(--accent)' : undefined }}>
                {person.avatar_url ? <img src={person.avatar_url} alt="" /> : initials(person.full_name)}
              </div>

              {/* Name + role */}
              <div style={{ flex: 1, minWidth: 100 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {person.full_name} {isMe && <span className="badge blue" style={{ fontSize: 9, marginLeft: 4 }}>you</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatPosition(person.position)}</div>
              </div>

              {/* Recent badges */}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {recentBadges.map(b => (
                  <span key={b.id} title={b.name} style={{ fontSize: 18, lineHeight: 1 }}>{b.icon}</span>
                ))}
                {person.badges.length > 5 && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>+{person.badges.length - 5}</span>
                )}
              </div>

              {/* Points */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em',
                  color: i === 0 ? 'var(--amber)' : isMe ? 'var(--accent)' : 'var(--text-primary)' }}>
                  {person.totalPoints.toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {person.badgeCount} badge{person.badgeCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          )
        })}
        {board.length === 0 && (
          <div className="empty-state"><p>No scores yet. Log your KPIs to appear on the leaderboard.</p></div>
        )}
      </div>
    </div>
  )
}

export default function RewardsPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('badges')

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 className="page-title">Rewards</h1>
            <p className="page-subtitle">Badges, points, and team leaderboard</p>
          </div>
        </div>
      </div>
      <div className="page-body">
        <div className="tabs">
          <button className={`tab ${tab === 'badges' ? 'active' : ''}`} onClick={() => setTab('badges')}>
            🏅 My Badges
          </button>
          <button className={`tab ${tab === 'leaderboard' ? 'active' : ''}`} onClick={() => setTab('leaderboard')}>
            🏆 Leaderboard
          </button>
        </div>

        {tab === 'badges' && profile && <MyBadges profile={profile} />}
        {tab === 'leaderboard' && <Leaderboard />}
      </div>
    </>
  )
}
