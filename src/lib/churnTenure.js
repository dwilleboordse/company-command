import { dateKey, parseReportingDate } from './reportingPeriods.js'

// Month 1 is [start, first calendar anniversary); month-end anniversaries clamp.
export function partnershipMonth(startValue, endValue) {
  const start = parseReportingDate(startValue)
  const end = parseReportingDate(endValue)
  if (!start || !end || end < start) return null
  let months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()
  const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
  const anniversary = new Date(end.getFullYear(), end.getMonth(), Math.min(start.getDate(), lastDay))
  if (end < anniversary) months -= 1
  return months + 1
}

export function analyzeChurnTenure(clients, records, period, today = new Date()) {
  const todayKey = dateKey(today)
  const effectiveEnd = period.end < todayKey ? period.end : todayKey
  const past = clients.filter(client => client.is_active === false)
  const selected = past.filter(client => {
    const end = records[client.id]?.engagement_end
    return parseReportingDate(end) && end >= period.start && end <= effectiveEnd
  })
  const exits = selected.map(client => {
    const record = records[client.id]
    return { id: client.id, name: client.name, start: record.engagement_start, end: record.engagement_end,
      month: partnershipMonth(record.engagement_start, record.engagement_end) }
  }).filter(client => client.month !== null)
    .sort((a, b) => a.month - b.month || a.name.localeCompare(b.name))
  const maxMonth = Math.max(6, ...exits.map(client => client.month))
  const buckets = Array.from({ length: maxMonth }, (_, index) => {
    const month = index + 1
    const clients = exits.filter(client => client.month === month)
    return { month, label: `Month ${month}`, exits: clients.length,
      share: exits.length ? clients.length / exits.length * 100 : 0, clients }
  })
  const peakCount = Math.max(0, ...buckets.map(bucket => bucket.exits))
  return {
    exits, buckets, selectedCount: selected.length,
    missingStartCount: selected.length - exits.length,
    missingEndCount: past.filter(client => !parseReportingDate(records[client.id]?.engagement_end)).length,
    futureEndCount: past.filter(client => records[client.id]?.engagement_end > todayKey).length,
    criticalMonths: buckets.filter(bucket => peakCount > 0 && bucket.exits === peakCount),
    earlyExits: exits.filter(client => client.month <= 3).length,
  }
}
