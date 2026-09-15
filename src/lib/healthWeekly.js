// Existing health tables are authoritative. A missing week is never a zero score.
export const HEALTH_REVIEW_EVENT = 'health-review-saved'
export const HEALTH_CONFIG = {
  team: {
    table: 'team_reviews', idKey: 'reviewee_id', authorKey: 'reviewed_by', riskKey: 'performance_risk',
    label: 'Team Health', entityLabel: 'Team member', risks: ['Low', 'Medium', 'High', 'Critical'],
    fields: [
      { key: 'output_quality', label: 'Output Quality & Speed', short: 'Output', desc: 'Consistent results and delivery speed' },
      { key: 'client_relationship', label: 'Client Relationship', short: 'Client', desc: 'Client experience and working relationships' },
      { key: 'responsiveness', label: 'Responsiveness & Communication', short: 'Response', desc: 'Timely responses and clear communication' },
      { key: 'cooperation', label: 'Team Cooperation', short: 'Team', desc: 'Collaboration with the team' },
      { key: 'initiative', label: 'Initiative & Problem Solving', short: 'Initiative', desc: 'Ownership and proactive problem solving' },
      { key: 'consistency', label: 'Consistency & Reliability', short: 'Reliability', desc: 'Reliable execution throughout the week' },
    ],
  },
  client: {
    table: 'client_health_entries', idKey: 'client_id', authorKey: 'entered_by', riskKey: 'churn_risk',
    label: 'Client Health', entityLabel: 'Client', risks: ['Low', 'Medium', 'High', 'Leaving'],
    fields: [
      { key: 'performance_health', label: 'Performance & Results', short: 'Performance' },
      { key: 'creative_strategy', label: 'Creative Strategy Impact', short: 'Creative' },
      { key: 'execution_delivery', label: 'Execution & Delivery', short: 'Delivery' },
      { key: 'strategic_alignment', label: 'Strategic Alignment', short: 'Strategy' },
      { key: 'communication', label: 'Communication & Relationship', short: 'Communication' },
    ],
  },
}

export function isHealthDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}
export function healthShiftWeek(week, amount) {
  const date = new Date(`${week}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount * 7)
  return date.toISOString().slice(0, 10)
}
export function healthCurrentWeek(now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7)
  return day.toISOString().slice(0, 10)
}
export function healthDueWeek(now = new Date()) { return healthShiftWeek(healthCurrentWeek(now), -1) }
export function isHealthMonday(week) { return isHealthDate(week) && new Date(`${week}T00:00:00Z`).getUTCDay() === 1 }
export function healthWeekOptions(entries = [], now = new Date()) {
  return [...new Set([...Array.from({ length: 53 }, (_, i) => healthShiftWeek(healthCurrentWeek(now), -i)), ...entries.map(row => row.week_start).filter(isHealthDate)])].sort().reverse()
}
export function isHealthEntityActive(kind, entity) {
  return kind === 'team' ? entity.is_active === true && entity.role === 'athlete'
    : entity.is_active === true && entity.is_archived !== true
}
export function isHealthComplete(kind, entry) {
  const config = HEALTH_CONFIG[kind]
  return Boolean(entry && config.risks.includes(entry[config.riskKey]) && config.fields.every(({ key }) => {
    const value = entry[key]
    return value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 5
  }))
}
export function healthScore(kind, entry) {
  return isHealthComplete(kind, entry) ? HEALTH_CONFIG[kind].fields.reduce((sum, { key }) => sum + Number(entry[key]), 0) / HEALTH_CONFIG[kind].fields.length : null
}
export function healthEligibleEntities(kind, entities, entries, week) {
  const ids = new Set(entries.filter(row => row.week_start === week).map(row => row[HEALTH_CONFIG[kind].idKey]))
  const nextWeek = healthShiftWeek(week, 1)
  const cutoff = Date.parse(`${nextWeek}T00:00:00+04:00`)
  // Historical eligibility was not snapshotted in the existing schema. Use the current
  // roster by week end, plus actual saved rows; never claim this is a historic headcount.
  return entities.filter(entity => ids.has(entity.id) || (isHealthEntityActive(kind, entity)
    && (!entity.created_at || Date.parse(entity.created_at) < cutoff)))
}
export function healthWeekSummary(kind, entities, entries, week) {
  const eligible = healthEligibleEntities(kind, entities, entries, week)
  const ids = new Set(eligible.map(entity => entity.id))
  const rows = entries.filter(row => row.week_start === week && ids.has(row[HEALTH_CONFIG[kind].idKey]))
  const complete = rows.filter(row => isHealthComplete(kind, row))
  const saved = new Set(rows.map(row => row[HEALTH_CONFIG[kind].idKey])).size
  return { eligible: eligible.length, complete: complete.length, partial: saved - complete.length,
    missing: eligible.length - saved, average: complete.length ? complete.reduce((sum, row) => sum + healthScore(kind, row), 0) / complete.length : null,
    highRisk: complete.filter(row => HEALTH_CONFIG[kind].risks.slice(2).includes(row[HEALTH_CONFIG[kind].riskKey])).length }
}

// Monday gaps remain null. Legacy non-Monday keys appear on their exact stored
// date, never silently moved or combined with a neighbouring Monday's report.
export function healthTrend(kind, entries, start, end) {
  if (!isHealthDate(start) || !isHealthDate(end) || start > end) return []
  const dates = new Set()
  const first = new Date(`${start}T00:00:00Z`)
  first.setUTCDate(first.getUTCDate() + (8 - first.getUTCDay()) % 7)
  for (let week = first.toISOString().slice(0, 10); week <= end; week = healthShiftWeek(week, 1)) dates.add(week)
  const grouped = new Map()
  entries.filter(row => isHealthDate(row.week_start) && row.week_start >= start && row.week_start <= end).forEach(row => {
    dates.add(row.week_start)
    if (!grouped.has(row.week_start)) grouped.set(row.week_start, [])
    grouped.get(row.week_start).push(row)
  })
  return [...dates].sort().map(week => {
    const rows = grouped.get(week) || []
    const complete = rows.filter(row => isHealthComplete(kind, row))
    return { week, timestamp: Date.parse(`${week}T00:00:00Z`), legacy: !isHealthMonday(week), logged: complete.length,
      partial: rows.length - complete.length, average: complete.length ? complete.reduce((sum, row) => sum + healthScore(kind, row), 0) / complete.length : null,
      highRisk: complete.filter(row => HEALTH_CONFIG[kind].risks.slice(2).includes(row[HEALTH_CONFIG[kind].riskKey])).length }
  })
}
