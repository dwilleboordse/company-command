import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getPeriodOptions, resolvePeriod } from '../lib/reportingPeriods'
import { fetchAllRows } from '../lib/reportingData'
import {
  ALL_DEPARTMENTS,
  EXIT_OPTIONS,
  TEAM_DEPARTMENTS,
  analyzeTeamChurn,
  daysInPeriod,
  departmentLabel,
  leaversByMonth,
  leftInPeriod,
  monthsStayed,
  tenurePayload,
  validateTenure,
} from '../lib/teamChurn'
import SectionBoundary from '../components/SectionBoundary'
import { AlertTriangle, CalendarDays, Download, Edit2, Plus, Search, ShieldCheck, TrendingDown, UserMinus, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const TABLE = 'team_member_tenures'
// Leavers are only recorded from this day on (HR list from mid-2025, Slack searched for 2025), so earlier
// periods would show churn far too low. Years before it are not offered and "All time" starts here.
const RECORDED_FROM = '2025-01-01'
const EMPTY_FORM = { full_name: '', department: 'video_editors', start_date: '', end_date: '', exit_type: '', notes: '' }

function fmtDate(value) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
const fmtMonths = value => value == null ? '—' : `${value.toFixed(1)} mo`
const fmtRate = value => value == null ? '—' : `${Math.round(value)}%`

function MetricCard({ icon, label, value, detail, color = 'var(--text-primary)' }) {
  return (
    <div className="card" style={{ padding: '16px 18px', minHeight: 118 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 13, color: 'var(--text-muted)' }}>
        {icon}
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 27, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.04em', color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 8 }}>{detail}</div>
    </div>
  )
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2 style={{ fontSize: 14, fontWeight: 750, color: 'var(--text-primary)' }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</p>}
    </div>
  )
}

function ExitBadge({ value }) {
  const style = value === 'fired' ? { color: 'var(--red)', bg: 'var(--red-dim)', label: 'Fired' }
    : value === 'quit' ? { color: 'var(--accent)', bg: 'var(--bg-input)', label: 'Quit' }
      : { color: 'var(--amber)', bg: 'var(--amber-dim)', label: 'Unknown' }
  return (
    <span style={{
      display: 'inline-flex', padding: '3px 9px', borderRadius: 100, fontSize: 10, fontFamily: 'var(--font-mono)',
      fontWeight: 700, color: style.color, background: style.bg, textTransform: 'uppercase', letterSpacing: 0.5,
    }}>{style.label}</span>
  )
}

function TenureModal({ member, onClose, onSaved }) {
  const isNew = !member?.id
  const [form, setForm] = useState(() => isNew ? EMPTY_FORM : {
    full_name: member.full_name || '',
    department: member.department || 'unknown',
    start_date: member.start_date || '',
    end_date: member.end_date || '',
    exit_type: member.exit_type || '',
    notes: member.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  async function handleSave() {
    const problem = validateTenure(form)
    if (problem) { setError(problem); return }
    setSaving(true)
    setError('')
    const payload = tenurePayload(form)
    const query = isNew
      ? supabase.from(TABLE).insert(payload).select('id')
      : supabase.from(TABLE).update(payload).eq('id', member.id).select('id')
    const { data, error: saveError } = await query
    if (saveError || !data?.length) {
      setError(saveError?.message || 'The change did not save. Check that you are signed in as management.')
      setSaving(false)
      return
    }
    await onSaved()
    onClose()
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${member.full_name}'s record? Use this only for a row added by mistake.`)) return
    setSaving(true)
    const { error: deleteError } = await supabase.from(TABLE).delete().eq('id', member.id)
    if (deleteError) { setError(deleteError.message); setSaving(false); return }
    await onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={event => event.stopPropagation()}>
        <div style={{ marginBottom: 18 }}>
          <h2 className="modal-title" style={{ marginBottom: 3 }}>{isNew ? 'Add a team member' : member.full_name}</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {isNew ? 'A new joiner, or someone who left and is missing here.' : `${member.source || 'Added in the CCC'} · management only`}
          </p>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>Name</label>
            <input value={form.full_name} onChange={event => set('full_name', event.target.value)} maxLength={120}/>
          </div>
          <div className="form-group">
            <label>Team</label>
            <select value={form.department} onChange={event => set('department', event.target.value)}>
              {ALL_DEPARTMENTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>Start date</label>
            <input type="date" value={form.start_date} onChange={event => set('start_date', event.target.value)}/>
          </div>
          <div className="form-group">
            <label>Last working day (empty = still on the team)</label>
            <input type="date" value={form.end_date} onChange={event => {
              const value = event.target.value
              // Someone still on the team has no fired/quit; clearing the day clears it so Save never gets stuck.
              setForm(current => ({ ...current, end_date: value, exit_type: value ? current.exit_type : '' }))
            }}/>
          </div>
        </div>

        <div className="form-group">
          <label>Fired or quit</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {EXIT_OPTIONS.map(option => {
              const active = form.exit_type === option.value
              return (
                <button key={option.label} type="button" disabled={!form.end_date} onClick={() => set('exit_type', option.value)}
                  style={{
                    padding: '9px 8px', borderRadius: 'var(--radius)', cursor: form.end_date ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 650,
                    border: `1.5px solid ${active && form.end_date ? 'var(--accent)' : 'var(--border)'}`,
                    background: active && form.end_date ? 'var(--accent-dim)' : 'var(--bg-input)',
                    color: active && form.end_date ? 'var(--accent)' : 'var(--text-secondary)', opacity: form.end_date ? 1 : 0.5,
                  }}>
                  {option.label}
                </button>
              )
            })}
          </div>
          {!form.end_date && <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>Add the last working day first.</span>}
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea rows={3} maxLength={1000} value={form.notes} onChange={event => set('notes', event.target.value)}
            placeholder="Where the dates or the reason come from" style={{ resize: 'vertical' }}/>
        </div>

        {error && (
          <div style={{ padding: '9px 12px', border: '1px solid var(--red)', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 'var(--radius)', fontSize: 11, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div className="flex gap-2" style={{ alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : isNew ? 'Add' : 'Save'}</button>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          {!isNew && (
            <button className="btn btn-ghost btn-sm" onClick={handleDelete} disabled={saving} style={{ marginLeft: 'auto', color: 'var(--red)' }}>Delete</button>
          )}
        </div>
      </div>
    </div>
  )
}

async function fetchMembers() {
  return fetchAllRows(() => supabase.from(TABLE).select('*').order('full_name').order('id'))
}

export default function TeamChurn() {
  const { isManagement } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [range, setRange] = useState('previous_year')
  const [teamFilter, setTeamFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [showEveryone, setShowEveryone] = useState(false)
  const [rowSaving, setRowSaving] = useState('')
  const [rowError, setRowError] = useState('')

  const periodOptions = useMemo(() => getPeriodOptions([RECORDED_FROM]), [])
  const period = useMemo(() => resolvePeriod(range, { earliestDate: RECORDED_FROM }), [range])
  const analysis = useMemo(() => analyzeTeamChurn(members, period), [members, period])
  const monthly = useMemo(() => leaversByMonth(members, period), [members, period])

  async function load() {
    const { data, error } = await fetchMembers()
    if (error) setLoadError(error.message)
    else { setMembers(data || []); setLoadError('') }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    fetchMembers().then(({ data, error }) => {
      if (cancelled) return
      if (error) setLoadError(error.message)
      else setMembers(data || [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const matches = member => (teamFilter === 'all' || member.department === teamFilter)
    && (!search || member.full_name.toLowerCase().includes(search.toLowerCase()))
  const leavers = members.filter(member => leftInPeriod(member, period) && matches(member))
    .sort((a, b) => b.end_date.localeCompare(a.end_date) || a.full_name.localeCompare(b.full_name))
  const everyone = members.filter(member => (daysInPeriod(member, period) > 0 || leftInPeriod(member, period)) && matches(member))
    .sort((a, b) => departmentLabel(a.department).localeCompare(departmentLabel(b.department)) || a.full_name.localeCompare(b.full_name))
  const allUnknown = members.filter(member => leftInPeriod(member, period) && !member.exit_type).length
  const outsideUnknown = allUnknown - (analysis.total?.unknown || 0)
  const teamRows = [...analysis.ranked, ...analysis.teams.filter(team => team.churnRate == null)]
  const maxRate = Math.max(...analysis.ranked.map(team => team.churnRate), 1)
  // Only teams that lost someone can be the "biggest churn".
  const [first, second] = analysis.ranked.filter(team => team.left > 0)

  async function setExitType(member, value) {
    setRowSaving(member.id)
    setRowError('')
    const { data, error } = await supabase.from(TABLE).update({ exit_type: value || null }).eq('id', member.id).select('id')
    if (error || !data?.length) setRowError(`${member.full_name}: ${error?.message || 'the change did not save'}`)
    else setMembers(current => current.map(row => row.id === member.id ? { ...row, exit_type: value || null } : row))
    setRowSaving('')
  }

  // Everyone on the team at some point in the selected period (the file name says which period), all teams.
  function exportCsv() {
    const columns = ['Name', 'Team', 'Start', 'Last working day', 'Left in this period', 'Fired or quit', 'Months stayed', 'Source', 'Notes']
    const rows = members.filter(member => daysInPeriod(member, period) > 0 || leftInPeriod(member, period)).map(member => [
      member.full_name, departmentLabel(member.department), member.start_date || '', member.end_date || '',
      leftInPeriod(member, period) ? 'Yes' : 'No',
      member.end_date ? (EXIT_OPTIONS.find(option => option.value === (member.exit_type || ''))?.label || '') : '',
      member.end_date && monthsStayed(member) != null ? monthsStayed(member).toFixed(1) : '', member.source || '', member.notes || '',
    ])
    const csv = [columns, ...rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `team-churn-${period.start}-to-${period.end}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!isManagement) {
    return <div className="page-body"><div className="empty-state"><p>Team Churn is available to management and the CEO only.</p></div></div>
  }

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, color: 'var(--accent)' }}>
              <ShieldCheck size={13}/>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Management + CEO</span>
            </div>
            <h1 className="page-title">Team Churn</h1>
            <p className="page-subtitle">Who left MB, CS, Design and Video Editing, fired or quit, and how long people stayed</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select aria-label="Team churn period" value={range} onChange={event => setRange(event.target.value)} style={{ width: 'auto', fontSize: 12 }}>
              {periodOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!members.length}><Download size={13}/> Export CSV</button>
            <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Plus size={13}/> Add person</button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-screen" style={{ minHeight: 320, background: 'transparent' }}><div className="spinner"/></div>
        ) : loadError ? (
          <div className="card" style={{ borderColor: 'var(--red)', background: 'var(--red-dim)' }}>
            <div style={{ display: 'flex', gap: 9, color: 'var(--red)', alignItems: 'flex-start' }}>
              <AlertTriangle size={16}/>
              <div><strong>Team churn data could not be loaded.</strong><div style={{ fontSize: 11, marginTop: 3 }}>{loadError}</div></div>
            </div>
          </div>
        ) : !analysis.total ? (
          <div className="empty-state"><p>Pick another period.</p></div>
        ) : (
          <>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
              <strong style={{ color: 'var(--text-secondary)' }}>{period.label}</strong> · {period.dateLabel}. Every number on this page uses this period.
              {period.start < RECORDED_FROM && (
                <span style={{ color: 'var(--amber)' }}> This period starts before 2025. Nobody who left before 1 Jan 2025 is recorded here, so churn for those months reads too low.</span>
              )}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 20 }}>
              <MetricCard icon={<TrendingDown size={13}/>} label="Biggest churn" value={first ? first.short : '—'} color="var(--red)"
                detail={first ? `${fmtRate(first.churnRate)} churn${second ? ` · then ${second.short} ${fmtRate(second.churnRate)}` : ''}` : 'Nobody left the four teams in this period'}/>
              <MetricCard icon={<UserMinus size={13}/>} label="Left the 4 teams" value={analysis.total.left}
                detail={`${analysis.total.people} people on the teams · avg headcount ${analysis.total.avgHeadcount.toFixed(1)}`}/>
              <MetricCard icon={<TrendingDown size={13}/>} label="Churn rate, 4 teams" value={fmtRate(analysis.total.churnRate)}
                detail="Left ÷ average headcount"/>
              <MetricCard icon={<CalendarDays size={13}/>} label="Average stay" value={fmtMonths(analysis.total.avgMonths)}
                detail={`People who left · median ${fmtMonths(analysis.total.medianMonths)}`}/>
              <MetricCard icon={<Users size={13}/>} label="Fired / quit" value={`${analysis.total.fired} / ${analysis.total.quit}`}
                color={analysis.total.unknown ? 'var(--amber)' : 'var(--text-primary)'}
                detail={`${analysis.total.unknown} with the reason unknown`}/>
            </div>

            {allUnknown > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 20,
                border: '1px solid var(--amber)', background: 'var(--amber-dim)', borderRadius: 'var(--radius)', color: 'var(--amber)', fontSize: 11,
              }}>
                <AlertTriangle size={15} style={{ flexShrink: 0 }}/>
                <span><strong>{allUnknown} {allUnknown === 1 ? 'leaver has' : 'leavers have'} no fired or quit yet</strong>{outsideUnknown > 0 && ` (${analysis.total.unknown} on the four teams, ${outsideUnknown} outside them)`}. Pick one in the Fired or quit column below and every number here updates.</span>
              </div>
            )}

            <SectionBoundary name="Churn by team">
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ padding: '16px 18px 6px' }}>
                  <SectionHeader title="Churn by team" subtitle={`Highest churn first · ${period.dateLabel}`}/>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Team</th><th style={{ minWidth: 150 }}>Churn rate</th><th>Left</th><th>People</th><th>Avg headcount</th><th>Fired</th><th>Quit</th><th>Unknown</th><th>Avg stay</th><th>Median stay</th><th>Shortest</th><th>Longest</th></tr>
                    </thead>
                    <tbody>
                      {[...teamRows, analysis.total].map(team => {
                        const isTotal = team.value === 'all'
                        return (
                          <tr key={team.value} style={isTotal ? { background: 'var(--bg-input)', fontWeight: 700 } : undefined}>
                            <td style={{ fontWeight: 700 }} title={team.label}>{team.short}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <strong style={{ fontFamily: 'var(--font-mono)', minWidth: 44 }}>{fmtRate(team.churnRate)}</strong>
                                {!isTotal && team.churnRate != null && (
                                  <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 100, overflow: 'hidden' }}>
                                    <div style={{ width: `${team.churnRate / maxRate * 100}%`, height: '100%', background: team.color, borderRadius: 100 }}/>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td>{team.left}</td>
                            <td>{team.people}</td>
                            <td>{team.avgHeadcount.toFixed(1)}</td>
                            <td style={{ color: team.fired ? 'var(--red)' : undefined }}>{team.fired}</td>
                            <td>{team.quit}</td>
                            <td style={{ color: team.unknown ? 'var(--amber)' : undefined }}>{team.unknown}</td>
                            <td>{fmtMonths(team.avgMonths)}</td>
                            <td>{fmtMonths(team.medianMonths)}</td>
                            <td>{fmtMonths(team.minMonths)}</td>
                            <td>{fmtMonths(team.maxMonths)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {analysis.others.some(group => group.left > 0) && (
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', padding: '10px 18px 0' }}>
                    Also left, outside the four teams: {analysis.others.filter(group => group.left > 0)
                      .map(group => `${group.label} ${group.left} (${group.fired} fired, ${group.quit} quit, ${group.unknown} unknown)`).join(' · ')}.
                  </p>
                )}
                <p style={{ fontSize: 10, color: 'var(--text-muted)', padding: '6px 18px 16px', lineHeight: 1.5 }}>
                  Churn rate = people who left ÷ average headcount. Average headcount = all the days each person was on the team, added up, ÷ the days in the period. Over 100% means the team lost more people than it usually had at one time. Stays run from start to last working day in 30.4375-day months, for people who left in the period. Someone who was rehired and left again counts once under People and once per exit under Left.
                </p>
              </div>
            </SectionBoundary>

            <SectionBoundary name="Leavers per month">
              <div className="card" style={{ padding: 18, marginBottom: 24 }}>
                <SectionHeader title="Leavers per month" subtitle={`By last working day · ${period.dateLabel}`}/>
                {analysis.total.left ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={monthly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                      <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                      <Tooltip labelFormatter={(label, payload) => payload?.[0]?.payload?.fullLabel || label}
                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}/>
                      <Legend wrapperStyle={{ fontSize: 10, paddingTop: 12 }}/>
                      {TEAM_DEPARTMENTS.map(team => (
                        <Bar key={team.value} dataKey={team.value} name={team.short} stackId="left" fill={team.color} maxBarSize={32}/>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p style={{ color: 'var(--text-muted)', fontSize: 12, padding: '30px 0', textAlign: 'center' }}>Nobody on the four teams left in this period.</p>}
              </div>
            </SectionBoundary>

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <SectionHeader title={`Leavers (${leavers.length})`} subtitle="Pick fired or quit right in the table; it saves straight away"/>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}/>
                  <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search names…" style={{ width: 180, paddingLeft: 30, fontSize: 11 }}/>
                </div>
                <select aria-label="Team filter" value={teamFilter} onChange={event => setTeamFilter(event.target.value)} style={{ width: 'auto', fontSize: 11 }}>
                  <option value="all">All teams</option>
                  {ALL_DEPARTMENTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
            {rowError && <p style={{ color: 'var(--red)', fontSize: 11, marginBottom: 8 }}>{rowError}</p>}

            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Team</th><th>Start</th><th>Last day</th><th>Stayed</th><th>Fired or quit</th><th>Notes</th><th></th></tr></thead>
                  <tbody>
                    {leavers.map(member => (
                      <tr key={member.id} style={!member.exit_type ? { background: 'var(--amber-dim)' } : undefined}>
                        <td style={{ fontWeight: 650 }}>{member.full_name}</td>
                        <td>{departmentLabel(member.department)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(member.start_date)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(member.end_date)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtMonths(monthsStayed(member))}</td>
                        <td>
                          <select aria-label={`Fired or quit for ${member.full_name}`} value={member.exit_type || ''} disabled={rowSaving === member.id}
                            onChange={event => setExitType(member, event.target.value)} style={{ width: 'auto', fontSize: 11, padding: '4px 8px' }}>
                            {EXIT_OPTIONS.map(option => <option key={option.label} value={option.value}>{option.label}</option>)}
                          </select>
                        </td>
                        <td title={member.notes || ''} style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.notes || '—'}</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => setEditing(member)}><Edit2 size={12}/> Edit</button></td>
                      </tr>
                    ))}
                    {!leavers.length && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Nobody left in this period with these filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <button className="btn btn-ghost btn-sm" onClick={() => setShowEveryone(open => !open)} style={{ marginBottom: 12 }}>
              <Users size={13}/> {showEveryone ? 'Hide' : 'Show'} everyone on the team in this period ({everyone.length})
            </button>
            {showEveryone && (
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Team</th><th>Start</th><th>Last day</th><th>Status</th><th>Source</th><th></th></tr></thead>
                    <tbody>
                      {everyone.map(member => (
                        <tr key={member.id}>
                          <td style={{ fontWeight: 650 }}>{member.full_name}</td>
                          <td>{departmentLabel(member.department)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(member.start_date)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{member.end_date ? fmtDate(member.end_date) : 'Still on the team'}</td>
                          <td>{member.end_date ? <ExitBadge value={member.exit_type}/> : '—'}</td>
                          <td style={{ fontSize: 10, color: 'var(--text-muted)' }}>{member.source || '—'}</td>
                          <td><button className="btn btn-ghost btn-sm" onClick={() => setEditing(member)}><Edit2 size={12}/> Edit</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Data comes from the ClickUp HR list (Member Contact Information), which only started in July 2025, plus 19 people who left in 2025 and were never put on that list; those were found in Slack. Loaded 20 Nov 2026. New joiners and leavers after that need adding here with Add person, or a fix with Edit.
            </p>
          </>
        )}
      </div>

      {editing && <TenureModal member={editing} onClose={() => setEditing(null)} onSaved={load}/>}
    </>
  )
}
