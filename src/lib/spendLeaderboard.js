import { parseAssignmentIds } from './clientAssignments.js'
import { planToday } from './planReview.js'
import { dateKey, parseReportingDate } from './reportingPeriods.js'
import { isCompleteSpendEntry, lastCompletedSpendWeek, shiftSpendWeek } from './spendAnalytics.js'

const validId = value => typeof value === 'string' && value.trim().length > 0
const uniqueIds = values => [...new Set(values.filter(validId).map(value => value.trim()))]

function strategistIds(client) {
  const ids = uniqueIds(parseAssignmentIds(client.cs_ids))
  return ids.length ? ids : uniqueIds([client.assigned_cs_id])
}

function timestamp(value) {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : -Infinity
}

function compareLatest(a, b) {
  const aUpdated = Number.isFinite(timestamp(a.updated_at)) ? timestamp(a.updated_at) : timestamp(a.created_at)
  const bUpdated = Number.isFinite(timestamp(b.updated_at)) ? timestamp(b.updated_at) : timestamp(b.created_at)
  if (aUpdated !== bUpdated) return aUpdated > bUpdated ? 1 : -1
  const aCreated = timestamp(a.created_at)
  const bCreated = timestamp(b.created_at)
  if (aCreated !== bCreated) return aCreated > bCreated ? 1 : -1
  const ids = String(a.id ?? '').localeCompare(String(b.id ?? ''))
  if (ids) return ids
  // Duplicate source rows should have distinct IDs. This final fallback also
  // makes malformed rows with identical IDs deterministic and order independent.
  return JSON.stringify([a.total_spend ?? null, a.ddu_spend ?? null])
    .localeCompare(JSON.stringify([b.total_spend ?? null, b.ddu_spend ?? null]))
}

const shareOf = (ddu, total) => total > 0 ? ddu / total * 100 : null
const laterWeek = (current, week) => !current || week > current ? week : current
const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id)

function addAmounts(target, entry, divisor = 1) {
  target.ddu = (target.ddu ?? 0) + Number(entry.ddu_spend) / divisor
  target.total = (target.total ?? 0) + Number(entry.total_spend) / divisor
  target.completeEntries += 1
  target.latestWeek = laterWeek(target.latestWeek, entry.week_start)
}

/**
 * A read-only, current-roster attribution of saved client-week spend.
 * Shared ownership divides both numerator and denominator; unknown/inactive
 * owners retain their share instead of inflating an active teammate's credit.
 */
export function buildSpendLeaderboard({ clients = [], entries = [], members = [], period, sortBy = 'ddu' } = {}) {
  const clientById = new Map(clients.filter(client => validId(client?.id)).map(client => [client.id, client]))
  const ownersByClient = new Map([...clientById.values()].map(client => [client.id, strategistIds(client)]))
  const rowById = new Map(members.filter(member => validId(member?.id)
    && member.position === 'creative_strategist' && member.is_active !== false).map(member => [member.id, {
    id: member.id, name: member.full_name || 'Unnamed strategist', ddu: null, total: null, share: null,
    completeEntries: 0, reportedClients: 0, latestWeek: null, rank: null, clients: [],
  }]))
  const detailsByMember = new Map([...rowById.keys()].map(id => [id, new Map()]))
  for (const client of clientById.values()) {
    const owners = ownersByClient.get(client.id)
    for (const id of owners) {
      if (!rowById.has(id)) continue
      detailsByMember.get(id).set(client.id, {
        id: client.id, name: client.name || 'Unnamed client', ddu: null, total: null, share: null,
        completeEntries: 0, assignmentCount: owners.length, latestWeek: null,
      })
    }
  }

  const summary = {
    ddu: null, total: null, share: null, allocatedDdu: null, allocatedTotal: null,
    unattributedDdu: null, unattributedTotal: null, completeEntries: 0, incompleteEntries: 0,
    duplicateEntries: 0, reportingClients: 0, latestWeek: null,
  }
  const validPeriod = period && !period.isEmpty && parseReportingDate(period.start)
    && parseReportingDate(period.end) && period.start <= period.end
  const deduplicated = new Map()
  if (validPeriod) {
    for (const entry of entries) {
      if (!clientById.has(entry?.client_id) || !parseReportingDate(entry.week_start)
        || entry.week_start < period.start || entry.week_start > period.end) continue
      const key = `${entry.client_id}\u0000${entry.week_start}`
      const previous = deduplicated.get(key)
      if (previous) summary.duplicateEntries += 1
      if (!previous || compareLatest(entry, previous) > 0) deduplicated.set(key, entry)
    }
  }

  const reportingClients = new Set()
  // Stable accumulation order makes fractional shares independent of fetch order.
  const selected = [...deduplicated.values()].sort((a, b) => a.week_start.localeCompare(b.week_start)
    || a.client_id.localeCompare(b.client_id))
  for (const entry of selected) {
    if (!isCompleteSpendEntry(entry)) {
      summary.incompleteEntries += 1
      continue
    }
    addAmounts(summary, entry)
    reportingClients.add(entry.client_id)
    const owners = ownersByClient.get(entry.client_id)
    for (const id of owners) {
      const row = rowById.get(id)
      if (!row) continue
      addAmounts(row, entry, owners.length)
      addAmounts(detailsByMember.get(id).get(entry.client_id), entry, owners.length)
    }
  }

  const rows = [...rowById.values()]
  for (const row of rows) {
    row.share = shareOf(row.ddu, row.total)
    row.clients = [...detailsByMember.get(row.id).values()].map(client => ({
      ...client, share: shareOf(client.ddu, client.total),
    })).sort(byName)
    row.reportedClients = row.clients.filter(client => client.completeEntries > 0).length
  }
  summary.share = shareOf(summary.ddu, summary.total)
  summary.reportingClients = reportingClients.size
  if (summary.completeEntries > 0) {
    summary.allocatedDdu = rows.reduce((sum, row) => sum + (row.ddu ?? 0), 0)
    summary.allocatedTotal = rows.reduce((sum, row) => sum + (row.total ?? 0), 0)
    // Calculate the remainder against raw totals, not a rounded per-person sum.
    summary.unattributedDdu = Math.max(0, summary.ddu - summary.allocatedDdu)
    summary.unattributedTotal = Math.max(0, summary.total - summary.allocatedTotal)
  }

  const score = row => {
    if (!(row.total > 0)) return null
    const scaled = sortBy === 'share' ? row.share * 10 : row.ddu * 100
    // Fractional assignment arithmetic must not break ties at a display-rounding boundary.
    return Math.round(scaled + Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4)
  }
  rows.sort((a, b) => {
    const aScore = score(a)
    const bScore = score(b)
    if (aScore === null || bScore === null) return aScore === bScore ? byName(a, b) : aScore === null ? 1 : -1
    return bScore - aScore || byName(a, b)
  })
  let previousScore = null
  let previousRank = null
  rows.forEach((row, index) => {
    const value = score(row)
    if (value === null) return
    row.rank = value === previousScore ? previousRank : index + 1
    previousScore = value
    previousRank = row.rank
  })
  return { rows, summary }
}

function addDays(key, days) {
  const date = parseReportingDate(key)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

/** Calendar filters always stop at the last completed Sunday in Dubai. */
export function resolveLeaderboardPeriod(value = '4w', { today = new Date(), earliestDate } = {}) {
  const todayKey = planToday(today)
  const year = Number(todayKey.slice(0, 4))
  const month = Number(todayKey.slice(5, 7))
  const week = lastCompletedSpendWeek(today)
  const completedEnd = addDays(week, 6)
  let start = shiftSpendWeek(week, -3)
  let end = completedEnd
  let label = 'Last 4 completed weeks'
  if (value === 'week') {
    start = week
    label = 'Last completed week'
  } else if (value === '12w') {
    start = shiftSpendWeek(week, -11)
    label = 'Last 12 completed weeks'
  } else if (value === 'month') {
    start = `${todayKey.slice(0, 7)}-01`
    label = 'This month · completed weeks'
  } else if (value === 'last_month') {
    start = dateKey(new Date(year, month - 2, 1))
    end = [dateKey(new Date(year, month - 1, 0)), completedEnd].sort()[0]
    label = 'Last month'
  } else if (value === 'ytd' || /^year:\d{4}$/.test(value)) {
    const selectedYear = value === 'ytd' ? year : Number(value.slice(5))
    start = `${selectedYear}-01-01`
    end = [`${selectedYear}-12-31`, completedEnd].sort()[0]
    label = value === 'ytd' ? 'Year to date · completed weeks' : String(selectedYear)
  } else if (value === 'all') {
    start = parseReportingDate(earliestDate) ? earliestDate : `${year}-01-01`
    label = 'All time · completed weeks'
  }
  const isEmpty = start > end
  const format = key => parseReportingDate(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return {
    start, end, label, isEmpty,
    dateLabel: isEmpty ? 'No completed weeks in this period' : `${format(start)} – ${format(end)}`,
  }
}
