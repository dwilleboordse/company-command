const normalize = value => String(value || '').trim().toLowerCase()

export function parseOkrAssignees(value) {
  if (Array.isArray(value)) return value.filter(id => typeof id === 'string' && id)
  if (typeof value !== 'string') return []
  try { return parseOkrAssignees(JSON.parse(value)) } catch { return [] }
}

export function currentOkrQuarter(date = new Date()) {
  return `Q${Math.floor(date.getMonth() / 3) + 1}-${date.getFullYear()}`
}

export function formatOkrLabel(value) {
  if (!value) return 'Not assigned'
  if (value === 'company_wide' || value === 'company') return 'Company'
  if (value === 'ugc_manager') return 'UGC Manager'
  if (value === 'ceo') return 'CEO'
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

export function canViewOkr(kr, { isCEO = false, isManagement = false } = {}) {
  if (kr.visibility === 'ceo') return isCEO
  if (kr.visibility === 'management') return isCEO || isManagement
  return !kr.visibility || kr.visibility === 'team'
}

function companyObjective(objective) {
  return normalize(objective.role_type) === 'company_wide' || normalize(objective.department) === 'company'
}

function matchesRole(objective, profile) {
  return Boolean(profile.position) && normalize(objective.role_type) === normalize(profile.position)
}

function assignedToMe(objective, kr, profile) {
  const resultAssignees = parseOkrAssignees(kr?.assignee_ids)
  if (resultAssignees.length) return resultAssignees.includes(profile.id)
  if (kr?.owner_id) return kr.owner_id === profile.id
  const objectiveAssignees = parseOkrAssignees(objective.assignee_ids)
  if (objectiveAssignees.length) return objectiveAssignees.includes(profile.id)
  if (objective.owner_id) return objective.owner_id === profile.id
  return !companyObjective(objective) && matchesRole(objective, profile)
}

function contextVisible(objective, kr, profile, isManagement) {
  if (isManagement) return true
  // Explicit assignments take precedence over broad role/department context.
  const ids = parseOkrAssignees(kr?.assignee_ids)
  if (ids.length) return ids.includes(profile.id)
  if (kr?.owner_id) return kr.owner_id === profile.id
  const objectiveIds = parseOkrAssignees(objective.assignee_ids)
  if (objectiveIds.length) return objectiveIds.includes(profile.id)
  return !objective.owner_id || objective.owner_id === profile.id
}

function numeric(value) {
  if (value == null || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

export function okrCurrentValueInput(kr) {
  const value = numeric(kr?.current_value)
  return value === null || (value === 0 && !kr?.current_value_recorded_at) ? '' : value
}

export function buildOkrCurrentValuePatch(input, existing, { touched = false, now = new Date().toISOString() } = {}) {
  if (input == null || String(input).trim() === '') {
    // Blank on an existing record means keep its value; opening a legacy zero
    // must not turn an unrelated title edit into a confirmed measurement.
    return existing ? {} : { current_value: null, current_value_recorded_at: null }
  }
  const value = numeric(input)
  if (value === null) throw new Error('Current value must be a valid number.')
  const changed = numeric(existing?.current_value) !== value
  if (!existing || changed || (touched && !existing.current_value_recorded_at)) {
    return { current_value: value, current_value_recorded_at: now }
  }
  return {}
}

export function getOkrMeasurement(kr, { values = [], userId, personal = false, asOf } = {}) {
  // Zero was historically a database default, so an undated zero is not proof
  // of a measurement. Explicitly confirmed zero and nonzero legacy values are
  // authoritative; weekly fallback stays owner-only and dated.
  const official = numeric(kr.current_value)
  const officialUsable = official !== null && (official !== 0 || Boolean(kr.current_value_recorded_at))
  const legacy = personal ? values
    .filter(row => row.key_result_id === kr.id && row.user_id === userId
      && (!asOf || row.week_start <= asOf) && numeric(row.value) !== null)
    .sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)))[0] : null
  const legacyValue = numeric(legacy?.value)
  const current = officialUsable ? official : legacyValue ?? official
  const needsConfirmation = official === 0 && !officialUsable && legacyValue === null
  const goal = numeric(kr.goal_value)
  const measured = current !== null && goal !== null && !needsConfirmation
  const lowerIsBetter = kr.goal_direction === 'min'
  const met = measured && (lowerIsBetter ? current <= goal : current >= goal)
  let attainment = null
  if (measured && current >= 0 && goal >= 0) {
    if (met) attainment = 100
    else if (lowerIsBetter) attainment = current > 0 ? goal / current * 100 : 0
    else attainment = goal > 0 ? current / goal * 100 : 0
    attainment = Math.max(0, Math.min(100, attainment))
  }
  return {
    current, goal, attainment, met, measured,
    status: needsConfirmation ? 'needs_confirmation' : !measured ? 'unmeasured' : met ? 'met' : 'below',
    source: officialUsable ? 'Official OKR value' : legacy ? 'Your latest weekly value' : needsConfirmation ? 'Saved zero · not confirmed' : null,
    valueDate: !officialUsable ? legacy?.week_start || null : null,
  }
}

export function buildDashboardOkrs({ objectives = [], keyResults = [], milestones = [], values = [],
  profile = {}, isCEO = false, isManagement = false, scope = 'personal', department = 'all', asOf }) {
  const viewer = { isCEO, isManagement: isManagement || isCEO }
  return objectives.filter(objective => objective.is_active !== false).flatMap(objective => {
    if (scope === 'department') {
      const selected = viewer.isManagement ? department : normalize(profile.department)
      if (companyObjective(objective) || !selected || (selected !== 'all' && normalize(objective.department) !== normalize(selected))) return []
    }
    if (scope === 'company' && !companyObjective(objective)) return []
    const results = keyResults.filter(kr => kr.objective_id === objective.id && kr.is_active !== false
      && canViewOkr(kr, viewer)).filter(kr => scope === 'personal'
      ? assignedToMe(objective, kr, profile)
      : contextVisible(objective, kr, profile, viewer.isManagement))
      .map(kr => {
        const initiatives = milestones.filter(item => item.key_result_id === kr.id && item.is_active !== false)
        const completed = initiatives.filter(item => item.status === 'completed').length
        return { ...kr, measurement: getOkrMeasurement(kr, { values, userId: profile.id, personal: scope === 'personal', asOf }),
          initiativeCount: initiatives.length, completedInitiatives: completed,
          initiativeProgress: initiatives.length ? Math.round(completed / initiatives.length * 100) : null }
      })
    const allChildren = keyResults.filter(kr => kr.objective_id === objective.id && kr.is_active !== false)
    // An objective whose KRs are all private/out of scope is omitted, rather than
    // announcing hidden work as missing. Genuinely empty objectives remain useful.
    if (!results.length && (allChildren.length || (scope === 'personal' && !assignedToMe(objective, null, profile))
      || (scope !== 'personal' && !contextVisible(objective, null, profile, viewer.isManagement)))) return []
    return [{ ...objective, results,
      measuredCount: results.filter(kr => kr.measurement.measured).length,
      metCount: results.filter(kr => kr.measurement.met).length }]
  }).sort((a, b) => String(a.department || '').localeCompare(String(b.department || ''))
    || String(a.title || '').localeCompare(String(b.title || '')))
}
