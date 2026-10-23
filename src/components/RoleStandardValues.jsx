import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { monday } from '../lib/q4Cycle.js'
import {
  combinedRoleScore, formatRolePercent, roleAttainment, roleEntryError, roleMeasurement,
  roleStandards, roleValueOwnerId,
} from '../lib/roleKrValues.js'

function Field({ name, value, onChange, type = 'text', area = false, children, ...rest }) {
  return <label>{name}{children || (area
    ? <textarea value={value ?? ''} onChange={event => onChange(event.target.value)} {...rest} />
    : <input type={type} value={value ?? ''} onChange={event => onChange(event.target.value)} {...rest} />)}</label>
}

export function RoleStandardForm({
  standards, weekStart, onWeek, values, onValue, period, onPeriod, evidence, onEvidence,
  savedRows = [], busy = false, error = '', onSave,
}) {
  const measured = roleMeasurement(standards, values)
  const combined = combinedRoleScore(measured)
  const weeks = [...new Set(savedRows.map(row => row.week_start))].sort((a, b) => b.localeCompare(a))
  return <fieldset disabled={busy}>
    <div className="notice">Enter one measured average for each role. The combined score is the simple average of each role&apos;s tasks per day divided by its standard. Saving stores each role for this week and records that combined percentage on the key result, with the observation period and evidence. The title, target, direction and notes stay as they are.</div>
    <Field type="date" name="Week starting (Monday)" value={weekStart} onChange={onWeek} />
    <div className="two">{standards.map(role => <Field key={role.key} type="number" min="0" step="any" name={`${role.label} — tasks per day (standard ${role.standard})`} value={values[role.key] ?? ''} onChange={value => onValue(role.key, value)} />)}</div>
    <p role="status"><strong>Combined score: {combined == null ? 'Enter both role values' : `${formatRolePercent(combined)} of role standard`}</strong>
      {measured.every(role => role.value != null) && <><br />{measured.map(role => `${role.label} ${role.value} ÷ ${role.standard} = ${formatRolePercent(roleAttainment(role.value, role.standard))}`).join('. ')}.</>}</p>
    <Field name="Observation period" value={period} onChange={onPeriod} />
    <Field area name="Evidence / source link and explanation" value={evidence} onChange={onEvidence} />
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="actions"><button className="primary" type="button" onClick={onSave}>{busy ? 'Saving…' : 'Save role values'}</button></div>
    {!!weeks.length && <details><summary>Saved role values</summary>{weeks.map(week => {
      const rows = savedRows.filter(row => row.week_start === week)
      const score = combinedRoleScore(standards.map(role => ({ ...role, value: rows.find(row => row.segment === role.key)?.value })))
      return <p key={week}><strong>Week of {week}</strong> — {standards.map(role => {
        const row = rows.find(item => item.segment === role.key)
        return `${role.label} ${row ? row.value : 'not entered'}`
      }).join('; ')}. Combined {score == null ? 'incomplete' : formatRolePercent(score)}.</p>
    })}</details>}
  </fieldset>
}

export default function RoleStandardValues({ result, objective, busy, onSave }) {
  const standards = useMemo(() => roleStandards(result), [result])
  const ownerId = roleValueOwnerId(result, objective)
  const context = result?.planning_context || {}
  const [weekStart, setWeekStart] = useState(() => monday())
  const [draftWeek, setDraftWeek] = useState('')
  const [drafts, setDrafts] = useState(null)
  const [period, setPeriod] = useState(context.observation_period || '')
  const [evidence, setEvidence] = useState(context.evidence || '')
  const [savedRows, setSavedRows] = useState([])
  const [loading, setLoading] = useState(Boolean(ownerId))
  const [error, setError] = useState(ownerId ? '' : 'This key result has no owner, so role values cannot be saved.')
  const savedForWeek = useMemo(() => Object.fromEntries(standards.map(role => {
    const saved = savedRows.find(row => row.week_start === weekStart && row.segment === role.key)
    return [role.key, saved?.value == null ? '' : String(saved.value)]
  })), [savedRows, weekStart, standards])
  const values = draftWeek === weekStart && drafts ? drafts : savedForWeek

  useEffect(() => {
    if (!ownerId) return undefined
    let cancelled = false
    async function load() {
      const response = await supabase.from('kr_values').select('id,segment,value,week_start,user_id')
        .eq('key_result_id', result.id).eq('user_id', ownerId).order('week_start', { ascending: false }).order('segment')
      if (cancelled) return
      if (response.error) {
        const message = `${response.error.message || ''} ${response.error.details || ''}`
        const missing = response.error.code === '42703' || response.error.code === 'PGRST204'
          || (/segment/i.test(message) && /does not exist|schema cache/i.test(message))
        setError(missing
          ? 'Role values need the database migration before they can be saved. Nothing was changed.'
          : (response.error.message || 'Saved role values could not be loaded.'))
        setSavedRows([])
      } else {
        setSavedRows(response.data || [])
        setError('')
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [result.id, ownerId])

  function changeWeek(next) {
    setWeekStart(next)
    setDrafts(null)
    setDraftWeek('')
  }
  function changeValue(key, value) {
    setDraftWeek(weekStart)
    setDrafts({ ...(draftWeek === weekStart && drafts ? drafts : savedForWeek), [key]: value })
  }
  async function save() {
    const message = roleEntryError({ standards, values, weekStart, period, evidence })
    if (message) { setError(message); return }
    const roles = roleMeasurement(standards, values)
    const saved = await onSave({
      weekStart, roles, combined: combinedRoleScore(roles), period: period.trim(), evidence: evidence.trim(),
    })
    if (saved) setError('')
  }

  return <div>
    {context.latest_measured_text && <p className="muted">Latest reported: {context.latest_measured_text}{context.latest_measured_as_of ? ` (as of ${context.latest_measured_as_of})` : ''}. That note stays on the definition. The evidence field below is what is saved with the measured value.</p>}
    {loading ? <p role="status">Loading saved role values…</p> : <RoleStandardForm
      standards={standards} weekStart={weekStart} onWeek={changeWeek} values={values} onValue={changeValue}
      period={period} onPeriod={setPeriod} evidence={evidence} onEvidence={setEvidence}
      savedRows={savedRows.filter(row => standards.some(role => role.key === row.segment))}
      busy={busy} error={error} onSave={save} />}
  </div>
}
