import {useEffect, useState} from 'react'
import {reflectionRows, reflectionPayload, reflectionStatusLabel, savedReflections} from '../lib/contributionReflections'

function Response({title,children}) {
  return <div className="q4-reflection-response"><strong>{title}</strong><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{children || 'Not supplied'}</p></div>
}
export function WeeklyReflectionSummary({pulse}) {
  const rows = savedReflections(pulse)
  if (!rows.length) return <div className="q4-reflection-summary"><p className="muted">Earlier check-in: one overall reflection. Preserved as submitted.</p>
    {pulse.milestone && <Response title="Contribution / milestone in focus">{pulse.milestone}</Response>}
    <Response title="Current result / evidence">{pulse.metric_now}</Response>
    <Response title="Reflection / progress">{pulse.progress_note}</Response>
    <Response title="Blocker / support">{pulse.blocker || 'None noted'}</Response>
    <Response title="Next commitment">{pulse.next_commitment}</Response>
  </div>
  return <div className="q4-reflection-summary">{rows.map((row,i) => <section className="metric" key={row.contribution_id} aria-label={`Saved reflection for contribution ${i+1}`}>
    <div className="row"><span className="eyebrow">Contribution {i+1}</span><span className={`pill ${row.track_status}`}>{reflectionStatusLabel(row.track_status)}</span></div>
    <h3 className="spaced">{row.contribution_title || pulse.plan_snapshot?.contributions?.find(c=>c.id===row.contribution_id)?.title || `Contribution ${i+1}`}</h3>
    {row.key_result_title && <p className="muted">Linked KR: {row.key_result_title}</p>}
    <Response title="Reflection / progress">{row.reflection}</Response>
    <Response title="Current result / evidence">{row.metric_now}</Response>
    <Response title="Blocker / support">{row.blocker || 'None noted'}</Response>
    <Response title="Next commitment">{row.next_commitment}</Response>
  </section>)}</div>
}
export function WeeklyContributionForm({plan,results,busy,onSubmit,onDirtyChange}) {
  const [rows,setRows] = useState(()=>reflectionRows(plan))
  const [error,setError] = useState('')
  const [submitting,setSubmitting] = useState(false)
  const [revision] = useState(plan?.revision)
  useEffect(()=>()=>onDirtyChange(false),[onDirtyChange])
  function change(id,key,value) {
    setRows(current=>current.map(r=>r.contribution_id===id?{...r,[key]:value}:r))
    onDirtyChange(true);setError('')
  }
  async function submit(event) {
    event.preventDefault()
    if (submitting || busy) return
    setError('')
    try {
      if (plan.revision !== revision) throw new Error('Your contribution plan changed while you were writing. Copy your notes, then reopen this week before submitting.')
      const payload = reflectionPayload(rows, plan)
      if (!window.confirm('Submit all contribution reflections as one read-only weekly snapshot? Check both contributions before confirming.')) return
      setSubmitting(true)
      if (await onSubmit(payload)) onDirtyChange(false)
    } catch (e) { setError(e.message || 'Unable to submit reflections.') }
    finally { setSubmitting(false) }
  }
  if (!plan?.contributions?.length) return null
  return <form onSubmit={submit} aria-label="Weekly contribution reflections">
    <p className="muted">Reflect on each contribution separately. Keep it brief. No progress this week? Say so, explain why, and set the next step. Unknown results stay “Not measured”.</p>
    <fieldset disabled={busy||submitting}>
      {plan.contributions.map((c,i)=>{
        const row=rows.find(r=>r.contribution_id===c.id)
        if (!row) return <p key={c.id} role="alert">Your plan changed. Copy your notes, then reopen this week before submitting.</p>
        const kr=results.find(k=>k.id===c.key_result_id)
        return <section className="metric" key={c.id} aria-labelledby={`reflection-title-${c.id}`}>
          <span className="eyebrow">Contribution {i+1} of {plan.contributions.length}</span>
          <h3 className="spaced" id={`reflection-title-${c.id}`}>{c.title || `Contribution ${i+1}`}</h3>
          <p className="muted">Linked KR: {kr?.title || 'Not linked yet'}</p>
          {c.done_when && <details><summary>What completion looks like</summary><p style={{whiteSpace:'pre-wrap'}}>{c.done_when}</p></details>}
          <label>Reflection / progress — what changed, shipped or was learned?<textarea required maxLength={20000} rows={3} value={row.reflection} onChange={e=>change(c.id,'reflection',e.target.value)}/></label>
          <label>Current result + evidence / period (or Not measured)<textarea required maxLength={20000} rows={2} value={row.metric_now} onChange={e=>change(c.id,'metric_now',e.target.value)}/></label>
          <label>Execution status<select required value={row.track_status} onChange={e=>change(c.id,'track_status',e.target.value)}><option value="">Select status</option><option value="on_track">On track</option><option value="at_risk">At risk</option><option value="off_track">Off track</option></select></label>
          <label>Blocker or support needed — optional<textarea maxLength={20000} rows={2} value={row.blocker} onChange={e=>change(c.id,'blocker',e.target.value)}/></label>
          <label>Next commitment — what, by whom, by when<textarea required maxLength={20000} rows={2} value={row.next_commitment} onChange={e=>change(c.id,'next_commitment',e.target.value)}/></label>
        </section>
      })}
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="actions"><button className="primary" type="submit">{submitting?'Submitting…':'Submit weekly snapshot'}</button></div>
      <p className="muted">One submission covers all contributions. This form is not saved until submitted. No duplicate weekly report is required.</p>
    </fieldset>
  </form>
}
