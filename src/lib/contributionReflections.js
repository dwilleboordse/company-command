// Stable contribution IDs, not titles/positions, identify a weekly reflection.
export const REFLECTION_STATUSES = ['on_track', 'at_risk', 'off_track']
export const reflectionStatusLabel = value => ({on_track:'On track', at_risk:'At risk', off_track:'Off track'}[value] || 'Select status')
export function reflectionRows(plan) {
  return (plan?.contributions || []).map(c => ({
    contribution_id: c.id, reflection: '', metric_now: '', track_status: '', blocker: '', next_commitment: '',
  }))
}
export function validateReflections(rows, plan) {
  const contributions = plan?.contributions || []
  if (!contributions.length || contributions.length > 2) return 'Save one or two contributions in My contributions first.'
  if (!Array.isArray(rows) || rows.length !== contributions.length) return 'Add a reflection for each saved contribution.'
  const ids = contributions.map(c => c.id)
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) return 'Your plan needs unique contribution IDs. Please reopen and save it before submitting.'
  if (new Set(rows.map(r => r.contribution_id)).size !== rows.length || rows.some(r => !ids.includes(r.contribution_id))) return 'The contributions changed. Refresh the plan before submitting.'
  for (const c of contributions) {
    const row = rows.find(r => r.contribution_id === c.id)
    const name = c.title?.trim() || 'this contribution'
    if (!REFLECTION_STATUSES.includes(row.track_status)) return `Select the status for ${name}.`
    for (const [key, message] of [['reflection','a reflection'], ['metric_now','the current result/evidence or “Not measured”'], ['next_commitment','the next commitment']]) {
      if (typeof row[key] !== 'string' || !row[key].trim()) return `Add ${message} for ${name}.`
    }
    for (const key of ['reflection','metric_now','blocker','next_commitment']) {
      if (typeof row[key] !== 'string' || row[key].length > 20000) return 'Keep each response under 20,000 characters.'
    }
  }
  return ''
}
export function reflectionPayload(rows, plan) {
  const error = validateReflections(rows, plan)
  if (error) throw new Error(error)
  return {
    reflection_plan_revision: plan.revision,
    contribution_updates: plan.contributions.map(c => {
      const row = rows.find(r => r.contribution_id === c.id)
      return {contribution_id:c.id, reflection:row.reflection.trim(), metric_now:row.metric_now.trim(), track_status:row.track_status, blocker:row.blocker.trim(), next_commitment:row.next_commitment.trim()}
    }),
  }
}
export function overallReflectionStatus(rows) {
  if (rows.some(r => r.track_status === 'off_track')) return 'off_track'
  if (rows.some(r => r.track_status === 'at_risk')) return 'at_risk'
  return 'on_track'
}
export function savedReflections(pulse) {
  return Array.isArray(pulse?.contribution_updates) ? pulse.contribution_updates : []
}
