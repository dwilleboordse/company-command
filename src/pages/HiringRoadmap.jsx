import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, BriefcaseBusiness, CalendarDays, CheckCircle2, Gauge, Plus, Sparkles, Target, Users, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { loadDesignCsData } from '../lib/designCsData'
import { buildHiringSignals, buildWorkloads, formatMonth, PLANNING_ROLES, projectGrowthScenario } from '../lib/workforcePlanning'
import './WorkforcePlanning.css'

const STATUS_LABELS = {
  considering: 'Considering',
  approved: 'Approved',
  sourcing: 'Sourcing',
  interviewing: 'Interviewing',
  offer: 'Offer',
  hired: 'Hired',
  on_hold: 'On hold',
}

const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }

function urgencyLabel(signal) {
  if (signal === 'hire_now') return 'Hire now'
  if (signal === 'plan') return 'Build pipeline'
  if (signal === 'rebalance') return 'Rebalance first'
  if (signal === 'watch') return 'Watch'
  return 'Capacity available'
}

function roleUnitLabel(signal) {
  if (signal.key === 'editor') return 'video concepts'
  if (signal.key === 'designer') return 'static concepts'
  return signal.unit
}

function signedValue(value) {
  return value > 0 ? `+${value}` : `${value}`
}

function SignalCard({ signal, onPlan }) {
  const danger = signal.signal === 'hire_now'
  return (
    <article className={`hiring-signal-card ${danger ? 'danger' : ''}`}>
      <div className="hiring-signal-heading">
        <div>
          <span className={`badge ${danger ? 'red' : signal.signal === 'plan' ? 'amber' : signal.signal === 'rebalance' ? 'purple' : 'green'}`}>{urgencyLabel(signal.signal)}</span>
          <h3>{signal.label}</h3>
        </div>
        <strong>{signal.utilization}%</strong>
      </div>
      <div className="capacity-track"><div className={`capacity-fill ${danger ? 'overloaded' : signal.utilization >= 80 ? 'near_capacity' : 'healthy'}`} style={{ width: `${Math.min(signal.utilization, 100)}%` }}/></div>
      <div className="signal-stat-row">
        <span><strong>{signal.headcount}</strong> active</span>
        <span><strong>{signal.used}</strong> / {signal.capacity} {roleUnitLabel(signal)}</span>
        <span><strong>{signal.overloaded.length}</strong> overloaded</span>
      </div>
      <p>{signal.action}{signal.requiredPeople > 0 ? ` · model suggests ${signal.requiredPeople} additional ${signal.requiredPeople === 1 ? 'person' : 'people'}.` : '.'}</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPlan(signal)}><Plus size={13}/>Add to hiring plan</button>
    </article>
  )
}

function ScenarioModel({ signals, settings, workingDays }) {
  const [newClients, setNewClients] = useState(3)
  const [churnedClients, setChurnedClients] = useState(1)
  const [conceptsPerClient, setConceptsPerClient] = useState(20)
  const [videoConceptsPerClient, setVideoConceptsPerClient] = useState(15)
  const [ugcClientRate, setUgcClientRate] = useState(67)

  const scenario = useMemo(() => projectGrowthScenario({
    signals,
    newClients,
    churnedClients,
    conceptsPerClient,
    videoConceptsPerClient,
    ugcClientRate,
  }), [signals, newClients, churnedClients, conceptsPerClient, videoConceptsPerClient, ugcClientRate])

  return (
    <section className="planning-section scenario-section">
      <div className="planning-section-heading">
        <div><h2>Growth and churn scenario</h2><p>Model the net delivery impact of clients won and clients leaving.</p></div>
        <span>{signedValue(scenario.netClients)} net clients</span>
      </div>
      <div className="scenario-layout">
        <div className="scenario-inputs card">
          <label><span>New clients</span><input type="number" min="0" value={newClients} onChange={event => setNewClients(Number(event.target.value || 0))}/></label>
          <label><span>Clients leaving</span><input type="number" min="0" value={churnedClients} onChange={event => setChurnedClients(Number(event.target.value || 0))}/></label>
          <label><span>Concepts per client</span><input type="number" min="0" value={conceptsPerClient} onChange={event => setConceptsPerClient(Number(event.target.value || 0))}/></label>
          <label><span>Video concepts per client</span><input type="number" min="0" max={conceptsPerClient} value={videoConceptsPerClient} onChange={event => setVideoConceptsPerClient(Number(event.target.value || 0))}/></label>
          <label><span>UGC client coverage</span><div className="scenario-percent-input"><input type="number" min="0" max="100" value={ugcClientRate} onChange={event => setUgcClientRate(Number(event.target.value || 0))}/><span>%</span></div></label>
          <div className="scenario-net-summary"><strong>{scenario.netClients}</strong><span>net clients</span><strong>{scenario.videoConceptsPerClient}</strong><span>video concepts/client</span><strong>{scenario.staticConceptsPerClient}</strong><span>static concepts/client</span></div>
          <small>Churn removes the same average workload that a new client adds. CS capacity is {settings.cs_max_concepts} concepts/month. Editors produce {settings.editor_daily_capacity} video concepts/day; designers produce {settings.designer_daily_capacity} static concepts/day across {workingDays} working days. UGC remains client-based.</small>
        </div>
        <div className="scenario-results">
          {scenario.projected.map(item => (
            <div className="scenario-result" key={item.key}>
              <div><strong>{item.label}</strong><span>{signedValue(item.loadChange)} {roleUnitLabel(item)}</span></div>
              <ArrowRight size={14}/>
              <div><strong className={item.projectedUtilization > 100 ? 'text-red' : item.projectedUtilization >= 80 ? 'text-amber' : 'text-green'}>{item.projectedUtilization}%</strong><span>{item.peopleNeeded ? `${item.peopleNeeded} hire${item.peopleNeeded === 1 ? '' : 's'} needed` : 'Covered by current team'}</span></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HiringItemModal({ seed, userId, onClose, onSaved }) {
  const [form, setForm] = useState({
    role_key: seed?.key || 'creative_strategist',
    role_label: seed?.singular || 'Creative Strategist',
    department: 'Delivery',
    planned_headcount: Math.max(seed?.requiredPeople || 1, 1),
    status: 'considering',
    priority: seed?.priority || 'medium',
    target_date: '',
    rationale: seed ? `${seed.action}. Current modeled utilization is ${seed.utilization}%.` : '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function chooseRole(roleKey) {
    const role = PLANNING_ROLES.find(item => item.key === roleKey)
    setForm(current => ({ ...current, role_key: roleKey, role_label: role?.singular || current.role_label }))
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      ...form,
      planned_headcount: Number(form.planned_headcount || 1),
      target_date: form.target_date || null,
      created_by: userId,
      updated_by: userId,
    }
    const { error: saveError } = await supabase.from('hiring_roadmap_items').insert(payload)
    if (saveError) {
      setError(saveError.message)
      setSaving(false)
      return
    }
    await onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form className="modal planning-modal" role="dialog" aria-modal="true" aria-labelledby="hire-title" onSubmit={save}>
        <div className="planning-modal-header"><div><h2 id="hire-title" className="modal-title">Add planned hire</h2><p>Capture the decision and why it is needed.</p></div><button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={16}/></button></div>
        <div className="planning-form-grid">
          <label><span>Role</span><select value={form.role_key} onChange={event => chooseRole(event.target.value)}>{PLANNING_ROLES.map(role => <option key={role.key} value={role.key}>{role.singular}</option>)}</select></label>
          <label><span>Headcount</span><input type="number" min="1" value={form.planned_headcount} onChange={event => setForm(current => ({ ...current, planned_headcount: event.target.value }))}/></label>
          <label><span>Priority</span><select value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value }))}>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Target date</span><input type="date" value={form.target_date} onChange={event => setForm(current => ({ ...current, target_date: event.target.value }))}/></label>
        </div>
        <label className="field-label">Rationale</label><textarea rows="3" value={form.rationale} onChange={event => setForm(current => ({ ...current, rationale: event.target.value }))}/>
        <label className="field-label">Notes</label><textarea rows="2" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))}/>
        {error && <div className="planning-error">{error}</div>}
        <div className="planning-modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add to roadmap'}</button></div>
      </form>
    </div>
  )
}

function RoadmapTable({ items, userId, onUpdated }) {
  async function updateStatus(item, status) {
    const { error } = await supabase.from('hiring_roadmap_items').update({ status, updated_by: userId, updated_at: new Date().toISOString() }).eq('id', item.id)
    if (error) return alert(`Unable to update hiring status: ${error.message}`)
    onUpdated()
  }

  return (
    <div className="card planning-table-card">
      <div className="table-wrap"><table className="planning-table"><thead><tr><th>Planned role</th><th>Priority</th><th>Target</th><th>Rationale</th><th>Status</th></tr></thead><tbody>
        {items.map(item => (
          <tr key={item.id}>
            <td><strong>{item.planned_headcount}× {item.role_label}</strong><span className="table-subline">{item.department}</span></td>
            <td><span className={`badge ${item.priority === 'critical' ? 'red' : item.priority === 'high' ? 'amber' : item.priority === 'medium' ? 'blue' : 'gray'}`}>{PRIORITY_LABELS[item.priority]}</span></td>
            <td>{item.target_date ? new Date(`${item.target_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}</td>
            <td className="roadmap-rationale">{item.rationale || '—'}</td>
            <td><select className="status-select" value={item.status} onChange={event => updateStatus(item, event.target.value)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
          </tr>
        ))}
        {!items.length && <tr><td colSpan="5"><div className="empty-state"><BriefcaseBusiness size={20}/><p>No roles are on the hiring roadmap yet.</p></div></td></tr>}
      </tbody></table></div>
    </div>
  )
}

export default function HiringRoadmap() {
  const { user, isCEO } = useAuth()
  const [data, setData] = useState(null)
  const [items, setItems] = useState([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [planningSignal, setPlanningSignal] = useState(undefined)

  async function load(keepMonth = true) {
    setError('')
    try {
      const [nextData, itemResult] = await Promise.all([
        loadDesignCsData(),
        supabase.from('hiring_roadmap_items').select('*').order('created_at', { ascending: false }),
      ])
      if (itemResult.error) throw itemResult.error
      setData(nextData)
      setItems(itemResult.data || [])
      const latest = nextData.months.at(-1)?.month_start || ''
      setSelectedMonth(current => keepMonth && nextData.months.some(month => month.month_start === current) ? current : latest)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load the hiring roadmap.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(false) }, [])

  const monthRecord = data?.months.find(month => month.month_start === selectedMonth)
  const monthAllocations = useMemo(() => (data?.allocations || []).filter(item => item.month_start === selectedMonth), [data?.allocations, selectedMonth])
  const workloadSet = useMemo(() => buildWorkloads({ allocations: monthAllocations, people: data?.people || [], settings: data?.settings, workingDays: monthRecord?.working_days || 22 }), [monthAllocations, data?.people, data?.settings, monthRecord?.working_days])
  const signals = useMemo(() => buildHiringSignals({
    workloadsByRole: {
      creative_strategist: workloadSet.strategists,
      editor: workloadSet.editors,
      designer: workloadSet.designers,
      ugc_manager: workloadSet.ugcManagers,
    },
    settings: data?.settings,
    workingDays: monthRecord?.working_days || 22,
  }), [workloadSet, data?.settings, monthRecord?.working_days])

  if (!isCEO) return <div className="page-body"><div className="empty-state"><p>CEO access required.</p></div></div>
  if (loading) return <div className="loading-screen"><div className="spinner"/></div>

  const nextHire = signals.find(signal => ['hire_now', 'plan'].includes(signal.signal)) || signals[0]
  const activeHiring = items.filter(item => !['hired', 'on_hold'].includes(item.status))
  const overloaded = signals.reduce((sum, signal) => sum + signal.overloaded.length, 0)

  return (
    <>
      <div className="page-header planning-page-header">
        <div><div className="planning-eyebrow">CEO decision system</div><h1 className="page-title">Hiring Roadmap</h1><p className="page-subtitle">Turn client workload into evidence-backed hiring decisions.</p></div>
        <div className="planning-header-actions"><select aria-label="Workload month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)}>{data?.months.map(month => <option key={month.month_start} value={month.month_start}>{month.label}</option>)}</select><button type="button" className="btn btn-primary" onClick={() => setPlanningSignal(null)}><Plus size={14}/>Plan a hire</button></div>
      </div>

      <div className="page-body planning-page">
        {error && <div className="planning-error"><AlertTriangle size={15}/>{error}</div>}
        <section className="next-hire-hero">
          <div className="next-hire-icon"><Sparkles size={22}/></div>
          <div className="next-hire-copy">
            <span>Recommended next move · {formatMonth(selectedMonth)}</span>
            <h2>{nextHire?.action || 'No immediate hiring signal'}</h2>
            <p>{nextHire ? `${nextHire.label} are at ${nextHire.utilization}% modeled utilization, with ${nextHire.overloaded.length} individual${nextHire.overloaded.length === 1 ? '' : 's'} over capacity.` : 'Add Design & CS workload to generate a recommendation.'}</p>
          </div>
          {nextHire && <button type="button" className="btn btn-primary" onClick={() => setPlanningSignal(nextHire)}>Add recommendation</button>}
        </section>

        <div className="planning-metrics">
          <div className="planning-metric"><span><Gauge size={14}/>Highest utilization</span><strong>{nextHire?.utilization || 0}%</strong><small>{nextHire?.label || 'No workload'}</small></div>
          <div className={`planning-metric ${overloaded ? 'danger' : ''}`}><span><AlertTriangle size={14}/>Overloaded people</span><strong>{overloaded}</strong><small>Across CS, editors, designers, and UGC</small></div>
          <div className="planning-metric"><span><BriefcaseBusiness size={14}/>Open hiring plans</span><strong>{activeHiring.length}</strong><small>{items.filter(item => item.status === 'hired').length} completed</small></div>
          <div className="planning-metric"><span><CalendarDays size={14}/>Capacity month</span><strong>{monthAllocations.length}</strong><small>Client workloads modeled</small></div>
        </div>

        <section className="planning-section">
          <div className="planning-section-heading"><div><h2>Role-level hire signals</h2><p>Aggregate capacity plus individual overload signals. Rebalance first when team capacity still exists.</p></div><span>Live from Design &amp; CS</span></div>
          <div className="hiring-signal-grid">{signals.map(signal => <SignalCard key={signal.key} signal={signal} onPlan={setPlanningSignal}/>)}</div>
        </section>

        <ScenarioModel signals={signals} settings={data.settings} workingDays={monthRecord?.working_days || 22}/>

        <section className="planning-section">
          <div className="planning-section-heading"><div><h2>Hiring plan</h2><p>Keep the decision, timing, rationale, and status in one CEO-only record.</p></div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setPlanningSignal(null)}><Plus size={13}/>Add role</button></div>
          <RoadmapTable items={items} userId={user.id} onUpdated={() => load(true)}/>
        </section>

        <div className="planning-method-note"><Target size={15}/><span><strong>Decision rule:</strong> concepts are the common capacity unit for CS, editors, and designers. A hire is urgent when team demand exceeds modeled capacity; individual overload with available team capacity triggers rebalancing first.</span><CheckCircle2 size={16}/></div>
      </div>

      {planningSignal !== undefined && <HiringItemModal seed={planningSignal} userId={user.id} onClose={() => setPlanningSignal(undefined)} onSaved={() => load(true)}/>}
    </>
  )
}
