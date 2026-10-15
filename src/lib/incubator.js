// Client Incubator: clients in their first months with DDU, plus clients moved in for extra support.
// Weekly values come from Client Health and the Spend Tracker as stored; weeks are never moved or merged.
import { dateKey, parseReportingDate } from './reportingPeriods.js'
import { tenureBand, tenureMonths } from './churnTenure.js'
import { spendNumber, spendShare } from './spendAnalytics.js'

export const INCUBATOR_LAST_MONTH = 3
export const RISK_LEVELS = ['Low', 'Medium', 'High', 'Leaving']
// [Int] Ads Board statuses from "approved" onwards count as delivered.
export const DONE_TASK_STATUSES = ['approved', 'not launched', 'review es', 'sent to client']

export function incubatorMonthLabel(band) {
  if (band == null) return 'No start date'
  return band === 0 ? 'Under 1 month' : `Month ${band}`
}

function tenureStage(band) {
  if (band == null || band > INCUBATOR_LAST_MONTH + 1) return null
  if (band === INCUBATOR_LAST_MONTH + 1) return 'overdue'
  return band === INCUBATOR_LAST_MONTH ? 'review' : 'active'
}

// Same month rule as the Churn Analysis cards (1.0–1.9 mo = month 1). A client_incubator row overrides it:
// 'active' keeps a client in (moved in for extra support), 'graduated' takes them out. Without a row, a
// client who finished month 3 stays listed one more month as "review overdue" so nobody leaves unreviewed.
// `today` is a YYYY-MM-DD day key (the page passes the Dubai day, like the weekly checks) or a Date.
const dayKey = today => typeof today === 'string' ? today : dateKey(today)

export function incubatorRoster({ clients, profiles, memberships = [], today = new Date() }) {
  const todayKey = dayKey(today)
  const byClient = new Map(memberships.map(row => [row.client_id, row]))
  const members = [], graduated = [], undated = [], upcoming = []
  for (const client of clients) {
    if (client.is_active === false || client.is_archived) continue
    const start = profiles[client.id]?.engagement_start ?? null
    const band = tenureBand(start, todayKey)
    // A start date after today has no tenure yet: the client is signed but not started, not undated.
    const notStarted = start != null && band == null && parseReportingDate(start) > parseReportingDate(todayKey)
    const entry = { client, start, band, notStarted, tenure: tenureMonths(start, todayKey), membership: byClient.get(client.id) ?? null }
    const stage = tenureStage(band)
    if (entry.membership?.status === 'graduated') graduated.push(entry)
    else if (entry.membership?.status === 'active') members.push({ ...entry, reason: 'manual', stage: band != null && band <= INCUBATOR_LAST_MONTH ? stage : 'support' })
    else if (notStarted) upcoming.push(entry)
    else if (band == null) undated.push(entry)
    else if (stage) members.push({ ...entry, reason: 'new', stage })
  }
  const order = { overdue: 0, review: 1, support: 2, active: 3 }
  members.sort((a, b) => order[a.stage] - order[b.stage] || (b.tenure ?? 0) - (a.tenure ?? 0) || a.client.name.localeCompare(b.client.name))
  upcoming.sort((a, b) => a.start.localeCompare(b.start))
  return { members, graduated, undated, upcoming }
}

function shiftDays(key, days) {
  const date = parseReportingDate(key)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}
const shiftWeek = (key, weeks) => shiftDays(key, weeks * 7)

// Client Health scores are 1–5; 0 or empty means not scored.
function healthScore(value) {
  const number = Number(value)
  return value !== null && value !== '' && Number.isFinite(number) && number >= 1 && number <= 5 ? number : null
}

// The last `weeks` Mondays up to lastWeek, plus legacy non-Monday dates stored in that window, newest first.
// Each value is compared with the previous logged week (comparedTo), so a skipped Monday never reads as zero.
export function weeklyTimeline({ health = [], spend = [], lastWeek, weeks = 8 }) {
  const firstWeek = shiftWeek(lastWeek, -(weeks - 1))
  const windowEnd = shiftDays(lastWeek, 6)
  const inWindow = key => parseReportingDate(key) && key >= firstWeek && key <= windowEnd
  const keys = new Set(Array.from({ length: weeks }, (_, index) => shiftWeek(firstWeek, index)))
  const healthByWeek = new Map(health.filter(row => inWindow(row.week_start)).map(row => [row.week_start, row]))
  const spendByWeek = new Map(spend.filter(row => inWindow(row.week_start)).map(row => [row.week_start, row]))
  ;[...healthByWeek.keys(), ...spendByWeek.keys()].forEach(key => keys.add(key))
  const rows = [...keys].sort().map(week => {
    const check = healthByWeek.get(week)
    const money = spendByWeek.get(week)
    return {
      week, legacy: parseReportingDate(week).getDay() !== 1,
      healthLogged: Boolean(check), risk: RISK_LEVELS.includes(check?.churn_risk) ? check.churn_risk : null,
      relationship: healthScore(check?.communication), notes: check?.notes || '',
      spendLogged: Boolean(money), ddu: spendNumber(money?.ddu_spend), total: spendNumber(money?.total_spend), share: money ? spendShare(money) : null,
    }
  })
  const previous = {}
  for (const row of rows) {
    row.comparedTo = {}
    for (const metric of ['risk', 'relationship', 'ddu', 'share']) {
      const before = previous[metric]
      if (row[metric] != null && before) {
        row.comparedTo[metric] = before.week
        row[`${metric}Change`] = metric === 'risk'
          ? RISK_LEVELS.indexOf(row.risk) - RISK_LEVELS.indexOf(before.risk)
          : row[metric] - before[metric]
      }
      if (row[metric] != null) previous[metric] = row
    }
  }
  return rows.reverse()
}

export function latestLogged(timeline, metric) {
  return timeline.find(row => row[metric] != null) ?? null
}

export function isTaskDone(task) {
  return DONE_TASK_STATUSES.includes(task.status)
}

// Delayed: not delivered, not paused, and the due date has passed.
export function isTaskDelayed(task, todayKey) {
  return !isTaskDone(task) && task.status !== 'paused' && Boolean(task.due_date) && task.due_date < todayKey
}

export function taskProgress(tasks, today = new Date()) {
  const todayKey = dayKey(today)
  const done = tasks.filter(isTaskDone).length
  const open = tasks.filter(task => !isTaskDone(task))
  const delayed = open.filter(task => isTaskDelayed(task, todayKey)).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.name.localeCompare(b.name))
  const byStatus = {}
  tasks.forEach(task => { byStatus[task.status] = (byStatus[task.status] || 0) + 1 })
  return { total: tasks.length, done, open: open.length, percent: tasks.length ? done / tasks.length * 100 : null,
    delayed, undated: open.filter(task => !task.due_date).length, byStatus }
}

// Evidence for the graduation call. A person decides; null means there is no data to judge.
export function graduationChecks({ timeline, tasks, goals = [], actions = [] }) {
  const risk = latestLogged(timeline, 'risk')
  const relationship = latestLogged(timeline, 'relationship')
  const spend = latestLogged(timeline, 'ddu')
  return [
    { key: 'risk', label: 'Risk is Low in the latest weekly check', pass: risk ? risk.risk === 'Low' : null },
    { key: 'relationship', label: 'Relationship score is 4 or higher', pass: relationship ? relationship.relationship >= 4 : null },
    { key: 'spend', label: 'DDU spend did not drop vs the week before', pass: spend?.dduChange == null ? null : spend.dduChange >= 0 },
    { key: 'tasks', label: 'No delayed ClickUp tasks', pass: tasks ? tasks.delayed.length === 0 : null },
    { key: 'goals', label: 'Client goals are written down', pass: goals.length > 0 },
    // No action items means nothing was checked, so this stays unknown rather than passing.
    { key: 'actions', label: 'All action items are done', pass: actions.length ? actions.every(action => action.is_done) : null },
  ]
}
