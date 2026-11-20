import { buildTimeBuckets, parseReportingDate } from './reportingPeriods.js'
import { tenureMonths } from './churnTenure.js'

// Vanessa's four teams (19 Nov 2026), in her order. Rows outside them stay out of the four-team totals.
export const TEAM_DEPARTMENTS = [
  { value: 'media_buyers', label: 'Media Buyers', short: 'MB', color: '#3b82f6' },
  { value: 'creative_strategists', label: 'Creative Strategists', short: 'CS', color: '#8b5cf6' },
  { value: 'designers', label: 'Designers', short: 'Designers', color: '#ec4899' },
  { value: 'video_editors', label: 'Video Editors', short: 'Video Editors', color: '#f59e0b' },
]
export const OTHER_DEPARTMENTS = [
  { value: 'other', label: 'Other roles', short: 'Other' },
  { value: 'unknown', label: 'Team not known', short: 'Not known' },
]
export const ALL_DEPARTMENTS = [...TEAM_DEPARTMENTS, ...OTHER_DEPARTMENTS]
// '' = a leaver whose reason nobody has recorded yet.
export const EXIT_OPTIONS = [
  { value: 'fired', label: 'Fired' },
  { value: 'quit', label: 'Quit' },
  { value: '', label: 'Unknown' },
]

const TEAM_KEYS = new Set(TEAM_DEPARTMENTS.map(team => team.value))
const DAY_MS = 24 * 60 * 60 * 1000

export function departmentLabel(value) {
  return ALL_DEPARTMENTS.find(department => department.value === value)?.label || 'Team not known'
}

// Whole calendar days, counted in UTC so a daylight-saving change never adds or drops a day.
function dayIndex(value) {
  const date = parseReportingDate(value)
  return date ? Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS) : null
}

// Start to last working day in 30.4375-day months, the same rule as client tenure on Churn Analysis.
export function monthsStayed(member) {
  return tenureMonths(member.start_date, member.end_date)
}

// Days the person was on the team inside the period, both ends included. No start date = not counted.
export function daysInPeriod(member, period) {
  const start = dayIndex(member.start_date)
  const periodStart = dayIndex(period.start)
  const periodEnd = dayIndex(period.end)
  if (start == null || periodStart == null || periodEnd == null) return 0
  const end = dayIndex(member.end_date)
  const first = Math.max(start, periodStart)
  const last = Math.min(end ?? periodEnd, periodEnd)
  return Math.max(0, last - first + 1)
}

export function leftInPeriod(member, period) {
  return Boolean(member.end_date && member.end_date >= period.start && member.end_date <= period.end)
}

/**
 * Churn rate in percent, or null when the team had nobody in the period.
 * left: people whose last working day falls in the period.
 * avgHeadcount: all the days each person was on the team in the period, added up, ÷ the days in the period.
 */
// Plain rate for the selected period, not scaled to a year: it matches the 2025 xlsx and the definition on the
// page, and a short period never inflates (one leaver in 4 weeks would read as several hundred percent a year).
export function churnRate(left, avgHeadcount) {
  if (!avgHeadcount) return null
  return (left / avgHeadcount) * 100
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function summarize(members, period, periodDays) {
  const leavers = members.filter(member => leftInPeriod(member, period))
    .sort((a, b) => a.end_date.localeCompare(b.end_date) || a.full_name.localeCompare(b.full_name))
  const personDays = members.reduce((sum, member) => sum + daysInPeriod(member, period), 0)
  const avgHeadcount = personDays / periodDays
  const stays = leavers.map(monthsStayed).filter(value => value != null)
  const fired = leavers.filter(member => member.exit_type === 'fired').length
  const quit = leavers.filter(member => member.exit_type === 'quit').length
  return {
    // A rehire has one row per stint: count the person once here, while each exit still counts in `left`.
    people: new Set(members.filter(member => daysInPeriod(member, period) > 0)
      .map(member => member.full_name.trim().toLowerCase())).size,
    avgHeadcount,
    left: leavers.length,
    churnRate: churnRate(leavers.length, avgHeadcount),
    fired,
    quit,
    unknown: leavers.length - fired - quit,
    avgMonths: stays.length ? stays.reduce((sum, value) => sum + value, 0) / stays.length : null,
    medianMonths: median(stays),
    minMonths: stays.length ? Math.min(...stays) : null,
    maxMonths: stays.length ? Math.max(...stays) : null,
    knownStays: stays.length,
    leavers,
  }
}

export function analyzeTeamChurn(members, period) {
  const periodStart = dayIndex(period.start)
  const periodEnd = dayIndex(period.end)
  const periodDays = periodStart == null || periodEnd == null ? 0 : Math.max(0, periodEnd - periodStart + 1)
  if (!periodDays) return { periodDays: 0, teams: [], total: null, others: [], ranked: [] }

  const teams = TEAM_DEPARTMENTS.map(team => ({
    ...team, ...summarize(members.filter(member => member.department === team.value), period, periodDays),
  }))
  const total = {
    value: 'all', label: 'All 4 teams', short: 'All 4 teams',
    ...summarize(members.filter(member => TEAM_KEYS.has(member.department)), period, periodDays),
  }
  const others = OTHER_DEPARTMENTS.map(group => ({
    ...group, ...summarize(members.filter(member => member.department === group.value), period, periodDays),
  }))
  const ranked = teams.filter(team => team.churnRate != null)
    .sort((a, b) => b.churnRate - a.churnRate || b.left - a.left)
  return { periodDays, teams, total, others, ranked }
}

// Leavers per month, one key per team, for the stacked bar chart.
export function leaversByMonth(members, period) {
  return buildTimeBuckets(period, 'month').map(bucket => {
    const row = { month: bucket.label, fullLabel: bucket.fullLabel }
    TEAM_DEPARTMENTS.forEach(team => {
      row[team.value] = members.filter(member => member.department === team.value
        && member.end_date && member.end_date >= bucket.start && member.end_date <= bucket.end).length
    })
    return row
  })
}

// Checks the edit form; returns an error sentence or ''.
export function validateTenure(form) {
  if (!form.full_name?.trim()) return 'Add a name.'
  if (!ALL_DEPARTMENTS.some(department => department.value === form.department)) return 'Pick a team.'
  if (form.start_date && !parseReportingDate(form.start_date)) return 'The start date is not a valid date.'
  if (form.end_date && !parseReportingDate(form.end_date)) return 'The last working day is not a valid date.'
  if (form.start_date && form.end_date && form.end_date < form.start_date) return 'The last working day cannot be before the start date.'
  if (form.exit_type && !form.end_date) return 'Add the last working day before marking fired or quit.'
  return ''
}

// What the page saves: blanks become null and fired/quit is cleared for someone still on the team.
export function tenurePayload(form) {
  const endDate = form.end_date || null
  return {
    full_name: form.full_name.trim(),
    department: form.department,
    start_date: form.start_date || null,
    end_date: endDate,
    exit_type: endDate && ['fired', 'quit'].includes(form.exit_type) ? form.exit_type : null,
    notes: form.notes?.trim() ? form.notes.trim().slice(0, 1000) : null,
  }
}
