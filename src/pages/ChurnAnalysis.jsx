import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  AlertTriangle,
  CalendarDays,
  DollarSign,
  Download,
  Edit2,
  PauseCircle,
  Search,
  ShieldCheck,
  TrendingDown,
  Users,
} from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const CHURN_REASONS = [
  { value: 'performance', label: 'Performance / results' },
  { value: 'creative_quality', label: 'Creative quality' },
  { value: 'communication', label: 'Communication' },
  { value: 'budget', label: 'Budget / cash flow' },
  { value: 'strategy_fit', label: 'Strategy fit' },
  { value: 'service_scope', label: 'Service scope' },
  { value: 'price_value', label: 'Price / perceived value' },
  { value: 'client_internal', label: 'Client internal change' },
  { value: 'agency_capacity', label: 'Agency capacity' },
  { value: 'project_completed', label: 'Project completed' },
  { value: 'other', label: 'Other' },
]

const EXIT_TYPES = [
  { value: 'client_decision', label: 'Client decision' },
  { value: 'agency_decision', label: 'Agency decision' },
  { value: 'mutual', label: 'Mutual decision' },
  { value: 'project_completed', label: 'Project completed' },
]

const PREVENTABILITY = [
  { value: 'preventable', label: 'Preventable' },
  { value: 'partially_preventable', label: 'Partially preventable' },
  { value: 'not_preventable', label: 'Not preventable' },
]

const REASON_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#16a34a', '#06b6d4', '#f97316', '#64748b', '#dc2626', '#14b8a6', '#a855f7']
const STATUS_STYLES = {
  active: { label: 'Current', color: 'var(--green)', bg: 'var(--green-dim)' },
  paused: { label: 'Paused', color: 'var(--amber)', bg: 'var(--amber-dim)' },
  past: { label: 'Past', color: 'var(--red)', bg: 'var(--red-dim)' },
}

function statusOf(client) {
  if (client.is_active === false) return 'past'
  if (client.is_archived) return 'paused'
  return 'active'
}

function parseDate(value) {
  if (!value) return null
  return new Date(`${value}T00:00:00`)
}

function isoDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1)
}

function monthsBetween(startValue, endValue) {
  const start = parseDate(startValue)
  const end = parseDate(endValue)
  if (!start || !end || end < start) return null
  return (end - start) / (1000 * 60 * 60 * 24 * 30.4375)
}

function fmtMoney(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function fmtDate(value) {
  const date = parseDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function labelFor(options, value, fallback = 'Unclassified') {
  return options.find(option => option.value === value)?.label || fallback
}

function rangeStart(range, today = new Date()) {
  if (range === 'ytd') return new Date(today.getFullYear(), 0, 1)
  const months = Number(range.replace('m', '')) || 12
  return addMonths(startOfMonth(today), -(months - 1))
}

function inDateRange(value, start, end) {
  const date = parseDate(value)
  return Boolean(date && date >= start && date <= end)
}

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 100,
      fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
      color: style.color, background: style.bg, textTransform: 'uppercase', letterSpacing: 0.5,
    }}>
      {style.label}
    </span>
  )
}

function MetricCard({ icon, label, value, detail, color = 'var(--text-primary)', warning = false }) {
  return (
    <div className="card" style={{ padding: '16px 18px', minHeight: 118 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 13, color: warning ? 'var(--amber)' : 'var(--text-muted)' }}>
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

function EmptyChart({ children }) {
  return (
    <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, maxWidth: 320 }}>{children}</p>
    </div>
  )
}

function LifecycleModal({ client, record, profileId, onClose, onSaved }) {
  const initialStatus = statusOf(client)
  const [form, setForm] = useState({
    status: initialStatus,
    engagement_start: record?.engagement_start || '',
    engagement_end: record?.engagement_end || '',
    monthly_retainer: record?.monthly_retainer ?? '',
    exit_type: record?.exit_type || '',
    churn_reason: record?.churn_reason || '',
    preventability: record?.preventability || '',
    churn_notes: record?.churn_notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (form.engagement_start && form.engagement_end && form.engagement_end < form.engagement_start) {
      setError('The end date cannot be before the start date.')
      return
    }

    setSaving(true)
    setError('')

    const statusPayload = form.status === 'active'
      ? { is_active: true, is_archived: false }
      : form.status === 'paused'
        ? { is_active: true, is_archived: true }
        : { is_active: false, is_archived: true }

    const churnPayload = {
      client_id: client.id,
      engagement_start: form.engagement_start || null,
      engagement_end: form.status === 'active' ? null : form.engagement_end || null,
      monthly_retainer: form.monthly_retainer === '' ? null : Number(form.monthly_retainer),
      exit_type: form.exit_type || null,
      churn_reason: form.churn_reason || null,
      preventability: form.preventability || null,
      churn_notes: form.churn_notes.trim() || null,
      updated_by: profileId,
      updated_at: new Date().toISOString(),
    }

    const { data: updatedClient, error: clientError } = await supabase
      .from('clients')
      .update(statusPayload)
      .eq('id', client.id)
      .select('id')

    if (clientError || !updatedClient?.length) {
      setError(clientError?.message || 'The client status update did not apply.')
      setSaving(false)
      return
    }

    const { error: churnError } = await supabase
      .from('client_churn_profiles')
      .upsert(churnPayload, { onConflict: 'client_id' })

    if (churnError) {
      setError(churnError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    await onSaved()
    onClose()
  }

  const isPast = form.status === 'past'
  const isPaused = form.status === 'paused'
  const canEditEngagementEnd = isPast || isPaused

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 650 }} onClick={event => event.stopPropagation()}>
        <div style={{ marginBottom: 18 }}>
          <h2 className="modal-title" style={{ marginBottom: 3 }}>{client.name}</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lifecycle and churn record · management only</p>
        </div>

        <div className="form-group">
          <label>Client status</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {[
              { value: 'active', label: 'Current client' },
              { value: 'paused', label: 'Paused / on hold' },
              { value: 'past', label: 'Past client' },
            ].map(option => {
              const active = form.status === option.value
              const style = STATUS_STYLES[option.value]
              return (
                <button key={option.value} type="button" onClick={() => setForm(current => ({ ...current, status: option.value }))}
                  style={{
                    padding: '9px 8px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 11, fontWeight: 650,
                    border: `1.5px solid ${active ? style.color : 'var(--border)'}`,
                    background: active ? style.bg : 'var(--bg-input)', color: active ? style.color : 'var(--text-secondary)',
                  }}>
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>Engagement start</label>
            <input type="date" value={form.engagement_start} onChange={event => setForm({ ...form, engagement_start: event.target.value })}/>
          </div>
          <div className="form-group">
            <label>{isPaused ? 'Paused on / engagement end' : isPast ? 'Engagement end' : 'Engagement end (paused or past only)'}</label>
            <input type="date" value={form.engagement_end} disabled={!canEditEngagementEnd}
              onChange={event => setForm({ ...form, engagement_end: event.target.value })}/>
            {isPaused && (
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                Tenure stops on this date. The client remains paused and is not counted as churn.
              </span>
            )}
          </div>
        </div>

        <div className="form-group">
          <label>Monthly retainer (USD)</label>
          <input type="number" min="0" step="100" value={form.monthly_retainer}
            onChange={event => setForm({ ...form, monthly_retainer: event.target.value })} placeholder="e.g. 5000"/>
        </div>

        {isPast && (
          <>
            <div className="grid-2">
              <div className="form-group">
                <label>Exit type</label>
                <select value={form.exit_type} onChange={event => setForm({ ...form, exit_type: event.target.value })}>
                  <option value="">Select exit type</option>
                  {EXIT_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Primary churn reason</label>
                <select value={form.churn_reason} onChange={event => setForm({ ...form, churn_reason: event.target.value })}>
                  <option value="">Select primary reason</option>
                  {CHURN_REASONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Preventability</label>
              <select value={form.preventability} onChange={event => setForm({ ...form, preventability: event.target.value })}>
                <option value="">Select preventability</option>
                {PREVENTABILITY.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Exit notes / lessons learned</label>
              <textarea rows={4} value={form.churn_notes} onChange={event => setForm({ ...form, churn_notes: event.target.value })}
                placeholder="What happened, leading indicators, save attempt, and what should change?" style={{ resize: 'vertical' }}/>
            </div>
          </>
        )}

        {error && (
          <div style={{ padding: '9px 12px', border: '1px solid var(--red)', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 'var(--radius)', fontSize: 11, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save lifecycle record'}</button>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

async function fetchChurnData() {
  const [clientResult, churnResult, healthResult] = await Promise.all([
    supabase.from('clients').select('*').order('name'),
    supabase.from('client_churn_profiles').select('*'),
    supabase.from('client_health_entries').select('client_id,week_start,churn_risk').order('week_start', { ascending: false }),
  ])

  const error = clientResult.error || churnResult.error || healthResult.error
  if (error) return { error }

  const recordMap = {}
  churnResult.data?.forEach(record => { recordMap[record.client_id] = record })
  const healthMap = {}
  healthResult.data?.forEach(entry => {
    if (!healthMap[entry.client_id]) healthMap[entry.client_id] = entry
  })

  return {
    clients: clientResult.data || [],
    records: recordMap,
    latestHealth: healthMap,
  }
}

export default function ChurnAnalysis() {
  const { profile, isManagement } = useAuth()
  const [clients, setClients] = useState([])
  const [records, setRecords] = useState({})
  const [latestHealth, setLatestHealth] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [range, setRange] = useState('12m')
  const [statusFilter, setStatusFilter] = useState('all')
  const [reasonFilter, setReasonFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [editingClient, setEditingClient] = useState(null)

  async function load() {
    setLoading(true)
    setLoadError('')
    const result = await fetchChurnData()
    if (result.error) {
      setLoadError(result.error.message)
      setLoading(false)
      return
    }
    setClients(result.clients)
    setRecords(result.records)
    setLatestHealth(result.latestHealth)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    fetchChurnData().then(result => {
      if (cancelled) return
      if (result.error) setLoadError(result.error.message)
      else {
        setClients(result.clients)
        setRecords(result.records)
        setLatestHealth(result.latestHealth)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const metrics = useMemo(() => {
    const today = new Date()
    const periodStart = rangeStart(range, today)
    const periodEnd = today
    const activeClients = clients.filter(client => statusOf(client) === 'active')
    const pausedClients = clients.filter(client => statusOf(client) === 'paused')
    const pastClients = clients.filter(client => statusOf(client) === 'past')
    const profileFor = client => records[client.id]
    const selectedExits = pastClients.filter(client => inDateRange(profileFor(client)?.engagement_end, periodStart, periodEnd))

    const openingClients = clients.filter(client => {
      const record = profileFor(client)
      const start = parseDate(record?.engagement_start)
      const end = parseDate(record?.engagement_end)
      return Boolean(start && start < periodStart && (!end || end >= periodStart))
    })
    const openingMRR = openingClients.reduce((total, client) => total + (Number(profileFor(client)?.monthly_retainer) || 0), 0)
    const lostMRR = selectedExits.reduce((total, client) => total + (Number(profileFor(client)?.monthly_retainer) || 0), 0)
    const knownExitMRR = selectedExits.filter(client => profileFor(client)?.monthly_retainer != null).length
    const activeMRR = activeClients.reduce((total, client) => total + (Number(profileFor(client)?.monthly_retainer) || 0), 0)
    const knownActiveMRR = activeClients.filter(client => profileFor(client)?.monthly_retainer != null).length
    const tenures = selectedExits
      .map(client => monthsBetween(profileFor(client)?.engagement_start, profileFor(client)?.engagement_end))
      .filter(value => value != null)
    const averageTenure = tenures.length ? tenures.reduce((sum, value) => sum + value, 0) / tenures.length : null
    const atRiskClients = activeClients.filter(client => ['High', 'Leaving'].includes(latestHealth[client.id]?.churn_risk))
    const atRiskMRR = atRiskClients.reduce((total, client) => total + (Number(profileFor(client)?.monthly_retainer) || 0), 0)
    const knownAtRiskMRR = atRiskClients.filter(client => profileFor(client)?.monthly_retainer != null).length

    const completeRecords = clients.filter(client => {
      const record = profileFor(client)
      const baseComplete = Boolean(record?.engagement_start && record?.monthly_retainer != null)
      if (statusOf(client) !== 'past') return baseComplete
      return baseComplete && Boolean(record?.engagement_end && record?.churn_reason && record?.preventability)
    }).length

    const churnRate = openingClients.length ? (selectedExits.length / openingClients.length) * 100 : null
    const revenueChurnRate = openingMRR ? (lostMRR / openingMRR) * 100 : null

    const monthCount = range === 'ytd' ? today.getMonth() + 1 : Number(range.replace('m', ''))
    const trend = Array.from({ length: monthCount }, (_, index) => {
      const monthStart = addMonths(startOfMonth(today), index - (monthCount - 1))
      const nextMonth = addMonths(monthStart, 1)
      const monthEnd = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 0)
      const exits = pastClients.filter(client => inDateRange(profileFor(client)?.engagement_end, monthStart, monthEnd))
      const opening = clients.filter(client => {
        const record = profileFor(client)
        const start = parseDate(record?.engagement_start)
        const end = parseDate(record?.engagement_end)
        return Boolean(start && start < monthStart && (!end || end >= monthStart))
      })
      return {
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        exits: exits.length,
        churnRate: opening.length ? Number(((exits.length / opening.length) * 100).toFixed(1)) : null,
      }
    })

    const reasonData = CHURN_REASONS.map((reason, index) => ({
      name: reason.label,
      value: selectedExits.filter(client => profileFor(client)?.churn_reason === reason.value).length,
      color: REASON_COLORS[index],
    })).filter(item => item.value > 0)

    const preventabilityData = PREVENTABILITY.map(option => ({
      ...option,
      count: selectedExits.filter(client => profileFor(client)?.preventability === option.value).length,
    }))

    const cohortsByKey = {}
    clients.forEach(client => {
      const record = profileFor(client)
      const start = parseDate(record?.engagement_start)
      if (!start) return
      const quarter = Math.floor(start.getMonth() / 3) + 1
      const key = `${start.getFullYear()} Q${quarter}`
      if (!cohortsByKey[key]) cohortsByKey[key] = { key, sort: start.getFullYear() * 10 + quarter, clients: [] }
      cohortsByKey[key].clients.push(client)
    })
    const cohorts = Object.values(cohortsByKey).sort((a, b) => b.sort - a.sort).map(cohort => {
      const past = cohort.clients.filter(client => statusOf(client) === 'past')
      const retained = cohort.clients.length - past.length
      const exitedTenures = past
        .map(client => monthsBetween(profileFor(client)?.engagement_start, profileFor(client)?.engagement_end))
        .filter(value => value != null)
      return {
        cohort: cohort.key,
        started: cohort.clients.length,
        retained,
        past: past.length,
        retention: Math.round((retained / cohort.clients.length) * 100),
        avgTenure: exitedTenures.length ? exitedTenures.reduce((sum, value) => sum + value, 0) / exitedTenures.length : null,
      }
    })

    return {
      periodStart,
      activeClients,
      pausedClients,
      pastClients,
      selectedExits,
      openingClients,
      activeMRR,
      knownActiveMRR,
      lostMRR,
      knownExitMRR,
      averageTenure,
      atRiskClients,
      atRiskMRR,
      knownAtRiskMRR,
      completeRecords,
      churnRate,
      revenueChurnRate,
      trend,
      reasonData,
      preventabilityData,
      cohorts,
    }
  }, [clients, records, latestHealth, range])

  const filteredClients = useMemo(() => clients.filter(client => {
    const status = statusOf(client)
    const record = records[client.id]
    if (statusFilter !== 'all' && status !== statusFilter) return false
    if (reasonFilter !== 'all' && record?.churn_reason !== reasonFilter) return false
    if (search && !client.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }).sort((a, b) => {
    const order = { past: 0, paused: 1, active: 2 }
    const statusOrder = order[statusOf(a)] - order[statusOf(b)]
    if (statusOrder !== 0) return statusOrder
    const aEnd = records[a.id]?.engagement_end || ''
    const bEnd = records[b.id]?.engagement_end || ''
    if (aEnd !== bEnd) return bEnd.localeCompare(aEnd)
    return a.name.localeCompare(b.name)
  }), [clients, records, search, statusFilter, reasonFilter])

  function exportCsv() {
    const columns = ['Client', 'Status', 'Start', 'End', 'Monthly Retainer USD', 'Exit Type', 'Churn Reason', 'Preventability', 'Latest Risk', 'Notes']
    const rows = clients.map(client => {
      const record = records[client.id] || {}
      return [
        client.name,
        STATUS_STYLES[statusOf(client)].label,
        record.engagement_start || '',
        record.engagement_end || '',
        record.monthly_retainer ?? '',
        labelFor(EXIT_TYPES, record.exit_type, ''),
        labelFor(CHURN_REASONS, record.churn_reason, ''),
        labelFor(PREVENTABILITY, record.preventability, ''),
        latestHealth[client.id]?.churn_risk || '',
        record.churn_notes || '',
      ]
    })
    const csv = [columns, ...rows]
      .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `client-churn-analysis-${isoDate(new Date())}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!isManagement) {
    return <div className="page-body"><div className="empty-state"><p>Churn Analysis is available to management and the CEO only.</p></div></div>
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
            <h1 className="page-title">Client Churn Analysis</h1>
            <p className="page-subtitle">Retention, revenue loss, exit drivers, cohorts, and the complete client lifecycle</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select value={range} onChange={event => setRange(event.target.value)} style={{ width: 'auto', fontSize: 12 }}>
              <option value="3m">Last 3 months</option>
              <option value="6m">Last 6 months</option>
              <option value="12m">Last 12 months</option>
              <option value="ytd">Year to date</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!clients.length}><Download size={13}/> Export CSV</button>
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
              <div><strong>Churn data could not be loaded.</strong><div style={{ fontSize: 11, marginTop: 3 }}>{loadError}</div></div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 24 }}>
              <MetricCard icon={<Users size={13}/>} label="Current clients" value={metrics.activeClients.length}
                detail={`${metrics.pausedClients.length} paused · ${metrics.pastClients.length} past`} color="var(--green)"/>
              <MetricCard icon={<DollarSign size={13}/>} label="Active MRR" value={metrics.knownActiveMRR ? fmtMoney(metrics.activeMRR) : '—'}
                detail={`${metrics.knownActiveMRR}/${metrics.activeClients.length} current retainers recorded`} color="var(--accent)"/>
              <MetricCard icon={<TrendingDown size={13}/>} label="Client churn rate"
                value={metrics.churnRate == null ? '—' : `${metrics.churnRate.toFixed(1)}%`}
                detail={`${metrics.selectedExits.length} dated exits / ${metrics.openingClients.length} opening clients`}/>
              <MetricCard icon={<DollarSign size={13}/>} label="Revenue churn"
                value={metrics.revenueChurnRate == null ? '—' : `${metrics.revenueChurnRate.toFixed(1)}%`}
                detail={metrics.selectedExits.length
                  ? `${metrics.knownExitMRR ? fmtMoney(metrics.lostMRR) : 'Unknown'} MRR lost · ${metrics.knownExitMRR}/${metrics.selectedExits.length} retainers known`
                  : 'No dated exits in selected period'} color="var(--red)"/>
              <MetricCard icon={<CalendarDays size={13}/>} label="Average lifetime"
                value={metrics.averageTenure == null ? '—' : `${metrics.averageTenure.toFixed(1)} mo`}
                detail={`${metrics.selectedExits.length} exits in period`}/>
              <MetricCard icon={<AlertTriangle size={13}/>} label="Current risk"
                value={metrics.atRiskClients.length} detail={metrics.atRiskClients.length
                  ? `${metrics.knownAtRiskMRR ? fmtMoney(metrics.atRiskMRR) : 'Unknown'} MRR at risk · ${metrics.knownAtRiskMRR}/${metrics.atRiskClients.length} retainers known`
                  : 'No current clients at High / Leaving risk'}
                color={metrics.atRiskClients.length ? 'var(--red)' : 'var(--green)'}/>
            </div>

            {metrics.completeRecords < clients.length && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 24,
                border: '1px solid var(--amber)', background: 'var(--amber-dim)', borderRadius: 'var(--radius)', color: 'var(--amber)',
              }}>
                <AlertTriangle size={15} style={{ flexShrink: 0 }}/>
                <div style={{ flex: 1, fontSize: 11 }}>
                  <strong>{metrics.completeRecords}/{clients.length} lifecycle records are analysis-ready.</strong>{' '}
                  Add start date and retainer for every client; add end date, reason, and preventability for past clients.
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800 }}>
                  {clients.length ? Math.round((metrics.completeRecords / clients.length) * 100) : 0}% complete
                </span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.65fr) minmax(280px,0.85fr)', gap: 16, marginBottom: 24 }}>
              <div className="card" style={{ padding: 18 }}>
                <SectionHeader title="Churn movement" subtitle="Monthly client exits and logo churn rate for records with complete lifecycle dates"/>
                {metrics.trend.some(month => month.exits > 0 || month.churnRate != null) ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <ComposedChart data={metrics.trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                      <YAxis yAxisId="clients" allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                      <YAxis yAxisId="rate" orientation="right" unit="%" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                      <Bar yAxisId="clients" dataKey="exits" name="Client exits" fill="var(--red)" radius={[4, 4, 0, 0]} maxBarSize={28}/>
                      <Line yAxisId="rate" type="monotone" dataKey="churnRate" name="Churn rate %" stroke="var(--accent)" strokeWidth={2.2} dot={{ r: 3, fill: 'var(--accent)' }} connectNulls={false}/>
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : <EmptyChart>Add engagement start and end dates to calculate monthly churn movement.</EmptyChart>}
              </div>

              <div className="card" style={{ padding: 18 }}>
                <SectionHeader title="Why clients leave" subtitle={`${metrics.periodStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} to today`}/>
                {metrics.reasonData.length ? (
                  <>
                    <ResponsiveContainer width="100%" height={175}>
                      <PieChart>
                        <Pie data={metrics.reasonData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={74} paddingAngle={3}>
                          {metrics.reasonData.map(item => <Cell key={item.name} fill={item.color}/>) }
                        </Pie>
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {metrics.reasonData.slice(0, 5).map(item => (
                        <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: item.color }}/>
                          <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{item.name}</span>
                          <strong style={{ fontFamily: 'var(--font-mono)' }}>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <EmptyChart>Classify past clients to reveal the main churn drivers.</EmptyChart>}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,0.8fr) minmax(0,1.2fr)', gap: 16, marginBottom: 28 }}>
              <div className="card" style={{ padding: 18 }}>
                <SectionHeader title="Preventability" subtitle="Separates delivery problems from unavoidable exits"/>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 20 }}>
                  {metrics.preventabilityData.map((item, index) => {
                    const max = Math.max(...metrics.preventabilityData.map(row => row.count), 1)
                    const colors = ['var(--red)', 'var(--amber)', 'var(--green)']
                    return (
                      <div key={item.value}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                          <strong style={{ fontFamily: 'var(--font-mono)' }}>{item.count}</strong>
                        </div>
                        <div style={{ height: 7, background: 'var(--border)', borderRadius: 100, overflow: 'hidden' }}>
                          <div style={{ width: `${(item.count / max) * 100}%`, height: '100%', background: colors[index], borderRadius: 100 }}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 18px 10px' }}>
                  <SectionHeader title="Retention by starting cohort" subtitle="Retained includes current and paused engagements; requires start dates"/>
                </div>
                {metrics.cohorts.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Cohort</th><th>Started</th><th>Retained</th><th>Past</th><th>Retention</th><th>Avg exit tenure</th></tr></thead>
                      <tbody>
                        {metrics.cohorts.slice(0, 8).map(cohort => (
                          <tr key={cohort.cohort}>
                            <td style={{ fontWeight: 650 }}>{cohort.cohort}</td>
                            <td>{cohort.started}</td>
                            <td style={{ color: 'var(--green)', fontWeight: 650 }}>{cohort.retained}</td>
                            <td style={{ color: 'var(--red)' }}>{cohort.past}</td>
                            <td><strong>{cohort.retention}%</strong></td>
                            <td>{cohort.avgTenure == null ? '—' : `${cohort.avgTenure.toFixed(1)} mo`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <EmptyChart>Add engagement start dates to build retention cohorts.</EmptyChart>}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <SectionHeader title="Current and past client records" subtitle="Manage lifecycle status and the inputs behind every churn metric"/>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}/>
                  <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search clients…" style={{ width: 190, paddingLeft: 30, fontSize: 11 }}/>
                </div>
                <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} style={{ width: 'auto', fontSize: 11 }}>
                  <option value="all">All statuses</option>
                  <option value="active">Current</option>
                  <option value="paused">Paused</option>
                  <option value="past">Past</option>
                </select>
                <select value={reasonFilter} onChange={event => setReasonFilter(event.target.value)} style={{ width: 'auto', fontSize: 11 }}>
                  <option value="all">All reasons</option>
                  {CHURN_REASONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Client</th><th>Status</th><th>Monthly retainer</th><th>Start</th><th>End</th><th>Tenure</th><th>Latest risk</th><th>Primary reason</th><th>Preventability</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map(client => {
                      const record = records[client.id] || {}
                      const status = statusOf(client)
                      const endForTenure = record.engagement_end || (status !== 'past' ? isoDate(new Date()) : '')
                      const tenure = monthsBetween(record.engagement_start, endForTenure)
                      const risk = latestHealth[client.id]?.churn_risk
                      return (
                        <tr key={client.id}>
                          <td>
                            <div style={{ fontWeight: 650, fontSize: 12 }}>{client.name}</div>
                            {client.package_type && <div style={{ fontSize: 9, color: 'var(--text-muted)', maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.package_type}</div>}
                          </td>
                          <td><StatusBadge status={status}/></td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: record.monthly_retainer != null ? 650 : 400 }}>{fmtMoney(record.monthly_retainer)}</td>
                          <td>{fmtDate(record.engagement_start)}</td>
                          <td>{fmtDate(record.engagement_end)}</td>
                          <td>{tenure == null ? '—' : `${tenure.toFixed(1)} mo`}</td>
                          <td>
                            {risk ? <span style={{ fontSize: 10, fontWeight: 650, color: ['High', 'Leaving'].includes(risk) ? 'var(--red)' : risk === 'Medium' ? 'var(--amber)' : 'var(--green)' }}>{risk}</span> : '—'}
                          </td>
                          <td>{status === 'past' ? labelFor(CHURN_REASONS, record.churn_reason) : '—'}</td>
                          <td>{status === 'past' ? labelFor(PREVENTABILITY, record.preventability) : '—'}</td>
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingClient(client)} title="Edit lifecycle record"><Edit2 size={12}/> Edit</button>
                          </td>
                        </tr>
                      )
                    })}
                    {!filteredClients.length && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No clients match these filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, color: 'var(--text-muted)', fontSize: 10 }}>
              <PauseCircle size={12}/>
              Paused clients stay out of current client and active MRR totals, but are not counted as churn until marked past with an end date.
            </div>
          </>
        )}
      </div>

      {editingClient && (
        <LifecycleModal client={editingClient} record={records[editingClient.id]} profileId={profile?.id}
          onClose={() => setEditingClient(null)} onSaved={load}/>
      )}
    </>
  )
}
