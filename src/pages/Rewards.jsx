import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// Items tracked on the Accountability page (mirror of Accountability.jsx)
const ACCOUNTABILITY_BOOLS = [
  'monday_intentions','friday_reflections','mvp_votes','client_reports',
  'monthly_survey','on_time_pod_calls','on_time_client_calls',
]

// ── BADGES — derived from accountability behavior ──────────
const BADGES = [
  { id: 'top_performer', emoji: '🏆', label: 'Top Performer',
    desc: 'Overall accountability score ≥ 90',
    test: (s) => s.score >= 90 },
  { id: 'perfect_week', emoji: '🌟', label: 'Perfect Week',
    desc: 'At least one week with all 7 accountability items checked',
    test: (s) => s.perfectWeeks > 0 },
  { id: 'consistent', emoji: '📝', label: 'Consistent',
    desc: 'Logged in 4+ weeks',
    test: (s) => s.weeks >= 4 },
  { id: 'punctual', emoji: '🎯', label: 'Punctual',
    desc: 'On time for every pod & client call across all logged weeks',
    test: (s) => s.weeks > 0 && s.punctualWeeks === s.weeks },
  { id: 'slack_champ', emoji: '💬', label: 'Slack Champion',
    desc: 'Average Slack participation ≥ 8/10',
    test: (s) => s.avgSlack >= 8 },
  { id: 'monday_mover', emoji: '📅', label: 'Monday Mover',
    desc: 'Monday Intentions checked every logged week',
    test: (s) => s.weeks > 0 && s.mondayHits === s.weeks },
  { id: 'friday_finisher', emoji: '🎬', label: 'Friday Finisher',
    desc: 'Friday Reflections checked every logged week',
    test: (s) => s.weeks > 0 && s.fridayHits === s.weeks },
  { id: 'voter', emoji: '🗳️', label: 'Voter',
    desc: 'MVP Votes submitted every logged week',
    test: (s) => s.weeks > 0 && s.voteHits === s.weeks },
  { id: 'reporter', emoji: '📊', label: 'Reporter',
    desc: 'Client Reports filed every logged week',
    test: (s) => s.weeks > 0 && s.reportHits === s.weeks },
]

// ── STATS: compute per-user accountability metrics ─────────
function computeStats(userLogs) {
  let boolPoints = 0
  let slackPoints = 0
  let slackCount = 0
  let perfectWeeks = 0
  let punctualWeeks = 0
  let mondayHits = 0, fridayHits = 0, voteHits = 0, reportHits = 0

  userLogs.forEach(l => {
    ACCOUNTABILITY_BOOLS.forEach(k => { if (l[k]) boolPoints++ })
    if (typeof l.slack_participation === 'number') {
      slackPoints += l.slack_participation
      slackCount++
    }
    if (ACCOUNTABILITY_BOOLS.every(k => l[k])) perfectWeeks++
    if (l.on_time_pod_calls && l.on_time_client_calls) punctualWeeks++
    if (l.monday_intentions)   mondayHits++
    if (l.friday_reflections)  fridayHits++
    if (l.mvp_votes)           voteHits++
    if (l.client_reports)      reportHits++
  })

  const weeks = userLogs.length
  const maxBool = weeks * ACCOUNTABILITY_BOOLS.length
  const boolPct  = maxBool > 0 ? (boolPoints / maxBool) * 100 : 0
  const avgSlack = slackCount > 0 ? slackPoints / slackCount : 0
  const score    = Math.round(boolPct * 0.7 + (avgSlack * 10) * 0.3)

  return {
    weeks, boolPct: Math.round(boolPct), avgSlack: Number(avgSlack.toFixed(1)),
    score, perfectWeeks, punctualWeeks,
    mondayHits, fridayHits, voteHits, reportHits,
  }
}

function earnedBadges(stats) {
  return BADGES.filter(b => b.test(stats))
}

// ── MY BADGES TAB ──────────────────────────────────────────
function MyBadges({ profile }) {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState([])

  useEffect(() => {
    if (!profile?.id) return
    setLoading(true)
    supabase.from('accountability_logs').select('*')
      .eq('user_id', profile.id)
      .order('week_start', { ascending: false })
      .then(({ data }) => { setLogs(data || []); setLoading(false) })
  }, [profile?.id])

  const stats = useMemo(() => computeStats(logs), [logs])
  const earned = useMemo(() => new Set(earnedBadges(stats).map(b => b.id)), [stats])

  if (loading) return <div className="empty-state"><div className="spinner" style={{ display: 'inline-block' }} /></div>

  return (
    <>
      {/* Headline score */}
      <div className="stat-row">
        <div className="stat-box">
          <div className="stat-box-label">Score</div>
          <div className="stat-box-value text-accent">{stats.score}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Weeks Logged</div>
          <div className="stat-box-value">{stats.weeks}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Item Completion</div>
          <div className="stat-box-value text-green">{stats.boolPct}%</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Slack Avg</div>
          <div className="stat-box-value">{stats.avgSlack ? `${stats.avgSlack}/10` : '—'}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Badges Earned</div>
          <div className="stat-box-value text-amber">{earned.size} / {BADGES.length}</div>
        </div>
      </div>

      {/* Badge grid */}
      <div className="section-header">
        <span className="section-title">Your accountability badges</span>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 12,
      }}>
        {BADGES.map(b => {
          const got = earned.has(b.id)
          return (
            <div key={b.id} className="card" style={{
              padding: 16,
              opacity: got ? 1 : 0.55,
              borderColor: got ? 'var(--accent)' : 'var(--border)',
              boxShadow: got ? 'var(--shadow-glow)' : 'var(--shadow-xs)',
              transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: got ? 'var(--accent-grad)' : 'var(--bg-input)',
                  display: 'grid', placeItems: 'center',
                  fontSize: 20, flexShrink: 0,
                  boxShadow: got ? '0 4px 12px rgba(124,92,255,0.28)' : 'none',
                  filter: got ? 'none' : 'grayscale(0.6)',
                }}>{b.emoji}</div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{b.label}</div>
                  <div style={{ fontSize: 11, color: got ? 'var(--green)' : 'var(--text-muted)', fontWeight: got ? 600 : 500 }}>
                    {got ? '✓ Earned' : 'Locked'}
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>{b.desc}</p>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── ACCOUNTABILITY LEADERBOARD ─────────────────────────────
function AccountabilityLeaderboard() {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState([])
  const [members, setMembers] = useState([])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: logData }, { data: memberData }] = await Promise.all([
      supabase.from('accountability_logs').select('*').order('week_start', { ascending: false }).limit(2000),
      supabase.from('profiles').select('id,full_name,position,role,avatar_url').order('full_name'),
    ])
    setLogs(logData || [])
    setMembers((memberData || []).filter(m => m.full_name))
    setLoading(false)
  }

  const ranked = useMemo(() => {
    const byUser = {}
    logs.forEach(l => {
      if (!byUser[l.user_id]) byUser[l.user_id] = []
      byUser[l.user_id].push(l)
    })
    return members.map(m => {
      const stats = computeStats(byUser[m.id] || [])
      return {
        id: m.id,
        full_name: m.full_name,
        position: m.position || m.role,
        avatar_url: m.avatar_url,
        stats,
        badges: earnedBadges(stats),
      }
    })
      .filter(r => r.stats.weeks > 0)
      .sort((a, b) => b.stats.score - a.stats.score)
  }, [logs, members])

  if (loading) return <div className="empty-state"><div className="spinner" style={{ display: 'inline-block' }} /></div>

  if (ranked.length === 0) return (
    <div className="empty-state">
      <p>No accountability data yet. Once ops/management logs the first week, the leaderboard goes live.</p>
    </div>
  )

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: 60 }}>Rank</th>
            <th>Team member</th>
            <th>Badges</th>
            <th style={{ textAlign: 'right' }}>Weeks</th>
            <th style={{ textAlign: 'right' }}>Items</th>
            <th style={{ textAlign: 'right' }}>Slack</th>
            <th style={{ textAlign: 'right' }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
            const initials = (r.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
            const score = r.stats.score
            const scoreTone = score >= 85 ? 'var(--green)' : score >= 60 ? 'var(--amber)' : 'var(--red)'
            return (
              <tr key={r.id}>
                <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                  {medal ? <span style={{ fontSize: 16 }}>{medal}</span> : `#${i + 1}`}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: 'var(--accent-grad)', color: '#fff',
                      display: 'grid', placeItems: 'center',
                      fontSize: 11, fontWeight: 700, overflow: 'hidden', flexShrink: 0,
                    }}>
                      {r.avatar_url
                        ? <img src={r.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : initials}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.full_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {(r.position || '').replace(/_/g, ' ')}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {r.badges.length === 0
                      ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                      : r.badges.map(b => (
                          <span key={b.id} title={`${b.label}: ${b.desc}`} style={{
                            display: 'inline-grid', placeItems: 'center',
                            width: 26, height: 26, borderRadius: 8,
                            background: 'var(--accent-dim)',
                            border: '1px solid var(--accent-mid)',
                            fontSize: 14, cursor: 'help',
                          }}>{b.emoji}</span>
                        ))}
                  </div>
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.stats.weeks}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`chip ${r.stats.boolPct >= 85 ? 'green' : r.stats.boolPct >= 60 ? 'amber' : 'red'}`}>
                    {r.stats.boolPct}%
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {r.stats.avgSlack ? `${r.stats.avgSlack}/10` : '—'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
                    letterSpacing: '-0.02em', color: scoreTone,
                  }}>{score}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── MAIN PAGE ──────────────────────────────────────────────
export default function RewardsPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('badges')

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 className="page-title">Rewards</h1>
            <p className="page-subtitle">Accountability badges and the live team leaderboard</p>
          </div>
        </div>
      </div>
      <div className="page-body">
        <div className="tabs">
          <button className={`tab ${tab === 'badges' ? 'active' : ''}`} onClick={() => setTab('badges')}>
            🏅 My Badges
          </button>
          <button className={`tab ${tab === 'leaderboard' ? 'active' : ''}`} onClick={() => setTab('leaderboard')}>
            🛡️ Accountability Leaderboard
          </button>
        </div>

        {tab === 'badges' && profile && <MyBadges profile={profile} />}
        {tab === 'leaderboard' && <AccountabilityLeaderboard />}
      </div>
    </>
  )
}
