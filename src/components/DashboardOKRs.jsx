import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, RefreshCw, Target } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/reportingData'
import { hasBusinessDashboardAccess } from '../lib/dashboardAccess'
import { today, parseLocal } from '../lib/dates'
import { buildDashboardOkrs, currentOkrQuarter, formatOkrLabel } from '../lib/dashboardOkrs'

const STATUS = {
  met: { label: 'Target met', className: 'okr-status-met' },
  below: { label: 'Not at target', className: 'okr-status-below' },
  unmeasured: { label: 'Not measured', className: 'okr-status-unmeasured' },
  needs_confirmation: { label: 'Needs confirmation', className: 'okr-status-unmeasured' },
}

function metricValue(value, unit) {
  if (value === null) return '—'
  const number = value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (unit === '$') return `$${number}`
  if (unit === '%') return `${number}%`
  return `${number}${unit && unit !== '#' ? ` ${unit}` : ''}`
}

function ObjectiveOverview({ objective }) {
  return (
    <article className="card home-okr-card">
      <div className="home-okr-context">
        <span>{formatOkrLabel(objective.department)}</span>
        {objective.role_type && <span>{formatOkrLabel(objective.role_type)}</span>}
      </div>
      <h3>{objective.title}</h3>
      {objective.description && <p className="home-okr-description">{objective.description}</p>}
      {objective.results.length ? <div className="home-okr-results">
        {objective.results.map(kr => {
          const measure = kr.measurement
          const status = STATUS[measure.status]
          return (
            <div className="home-okr-result" key={kr.id}>
              <div className="home-okr-result-heading">
                <h4>{kr.metric_name || kr.title}</h4>
                <span className={`home-okr-status ${status.className}`}>{status.label}</span>
              </div>
              <div className="home-okr-measurement">
                <strong>{metricValue(measure.current, kr.unit)}</strong>
                <span>Target {kr.goal_direction === 'min' ? '≤' : '≥'} {metricValue(measure.goal, kr.unit)}</span>
              </div>
              {measure.attainment !== null && <div className="home-okr-progress"
                role="progressbar" aria-label={`${kr.metric_name}: target attainment`}
                aria-valuenow={Math.round(measure.attainment)} aria-valuemin={0} aria-valuemax={100}>
                <span className={status.className} style={{ width: `${measure.attainment}%` }}/>
              </div>}
              <div className="home-okr-detail">
                <span>{measure.source || 'No current value recorded'}{measure.valueDate && ` · week of ${parseLocal(measure.valueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</span>
                {kr.initiativeCount > 0 && <span>{kr.completedInitiatives}/{kr.initiativeCount} initiatives complete</span>}
              </div>
            </div>
          )
        })}
      </div> : <p className="home-okr-empty">No key results available in this view.</p>}
    </article>
  )
}

export default function DashboardOKRs() {
  const { profile, isCEO, isManagement } = useAuth()
  const [scope, setScope] = useState(hasBusinessDashboardAccess(profile) ? 'company' : 'personal')
  const [department, setDepartment] = useState('all')
  const [data, setData] = useState({ objectives: [], keyResults: [], milestones: [], values: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const quarter = currentOkrQuarter()
  const asOf = today()

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const objectives = await fetchAllRows(() => supabase.from('objectives')
          .select('id,title,description,department,role_type,quarter,owner_id,assignee_ids,is_active')
          .eq('is_active', true).eq('quarter', quarter).order('id'))
        if (objectives.error) throw objectives.error
        let keyResults = { data: [] }, milestones = { data: [] }, values = { data: [] }
        if (objectives.data.length) {
          const visibility = ['team', ...(isManagement ? ['management'] : []), ...(isCEO ? ['ceo'] : [])]
          keyResults = await fetchAllRows(() => supabase.from('key_results')
            .select('id,objective_id,title,metric_name,goal_value,goal_direction,unit,current_value,current_value_recorded_at,visibility,assignee_ids,is_active')
            .in('objective_id', objectives.data.map(row => row.id)).in('visibility', visibility)
            .eq('is_active', true).order('id'))
          if (keyResults.error) throw keyResults.error
          if (keyResults.data.length) {
            const ids = keyResults.data.map(row => row.id)
            ;[milestones, values] = await Promise.all([
              fetchAllRows(() => supabase.from('milestones').select('id,key_result_id,status,is_active')
                .in('key_result_id', ids).eq('is_active', true).order('id')),
              fetchAllRows(() => supabase.from('kr_values').select('id,key_result_id,user_id,value,week_start')
                .in('key_result_id', ids).eq('user_id', profile.id).lte('week_start', asOf)
                .order('week_start', { ascending: false }).order('id')),
            ])
            if (milestones.error) throw milestones.error
            if (values.error) throw values.error
          }
        }
        if (!cancelled) setData({ objectives: objectives.data, keyResults: keyResults.data,
          milestones: milestones.data, values: values.data })
      } catch {
        if (!cancelled) setError('Your OKR overview could not be loaded. Your saved OKRs have not changed.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [profile?.id, isCEO, isManagement, quarter, asOf, retryKey])

  const objectiveRows = buildDashboardOkrs({ ...data, profile: profile || {}, isCEO, isManagement,
    scope, department, asOf })
  const results = objectiveRows.flatMap(objective => objective.results)
  const measured = results.filter(kr => kr.measurement.measured).length
  const needsConfirmation = results.filter(kr => kr.measurement.status === 'needs_confirmation').length
  const met = results.filter(kr => kr.measurement.met).length
  const departments = [...new Set(data.objectives.map(objective => objective.department)
    .filter(value => value && value.toLowerCase() !== 'company'))].sort()
  const scopeLabel = scope === 'personal' ? 'Assigned to you or your role'
    : scope === 'company' ? 'Company-level objectives'
      : isManagement ? department === 'all' ? 'All departments' : formatOkrLabel(department)
        : profile?.department ? formatOkrLabel(profile.department) : 'No department assigned'

  return (
    <section className="home-section" aria-labelledby="home-okr-heading">
      <div className="home-section-heading">
        <div><h2 id="home-okr-heading">OKRs <span className="home-period">{quarter.replace('-', ' ')}</span></h2></div>
        <Link to="/okrs" className="btn btn-ghost btn-sm">Open OKRs <ArrowRight size={14}/></Link>
      </div>
      <div className="home-okr-toolbar">
        <div className="home-scope-options" role="group" aria-label="OKR overview scope">
          {[
            { id: 'personal', label: 'My OKRs' },
            { id: 'department', label: isManagement ? 'Departments' : 'My department' },
            { id: 'company', label: 'Company' },
          ].map(option => <button key={option.id} type="button" aria-pressed={scope === option.id}
            className={scope === option.id ? 'active' : ''} onClick={() => setScope(option.id)}>{option.label}</button>)}
        </div>
        {scope === 'department' && isManagement && <label className="home-okr-select">
          <select aria-label="OKR department" value={department} onChange={event => setDepartment(event.target.value)}>
            <option value="all">All departments</option>
            {departments.map(value => <option key={value} value={value}>{formatOkrLabel(value)}</option>)}
          </select>
        </label>}
      </div>
      {loading ? <div className="card home-okr-empty" role="status">Loading your OKRs…</div>
        : error ? <div className="card home-okr-error" role="alert"><p>{error}</p><button type="button"
          className="btn btn-ghost btn-sm" onClick={() => setRetryKey(value => value + 1)}><RefreshCw size={13}/> Retry</button></div>
          : <>
            <div className="home-okr-summary">
              <span>{scopeLabel}</span>
              <span>{objectiveRows.length} objective{objectiveRows.length === 1 ? '' : 's'}{measured > 0 ? ` · ${met}/${measured} measured key results at target` : ''}{needsConfirmation > 0 ? ` · ${needsConfirmation} need confirmation` : ''}{results.length > measured + needsConfirmation ? ` · ${results.length - measured - needsConfirmation} not measured` : ''}</span>
            </div>
            {objectiveRows.length ? <div className="home-okr-grid">{objectiveRows.map(objective => <ObjectiveOverview key={objective.id} objective={objective}/>)}</div>
              : <div className="card home-okr-empty"><Target size={22}/><p>No {scope === 'personal' ? 'personal' : scope === 'company' ? 'company-level' : 'department'} OKRs available for {quarter.replace('-', ' ')}.</p>
                <Link to="/okrs" className="btn btn-ghost btn-sm">View OKRs <ArrowRight size={13}/></Link></div>}
            {results.length > 0 && <p className="home-okr-footnote">Target attainment reflects current results, not whether the quarter is on schedule. Initiative completion is tracked separately.</p>}
            {needsConfirmation > 0 && <p className="home-okr-footnote">Some saved zeros may be automatic defaults, not measured results. They are excluded from target attainment until confirmed. A manager can open OKRs → Edit key result and enter the current value, including 0.</p>}
          </>}
    </section>
  )
}
