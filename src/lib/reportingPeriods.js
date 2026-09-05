// Date-only reporting boundaries; no UTC conversion of a user's local calendar day.
export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseReportingDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return dateKey(date) === value ? date : null
}

export function getPeriodOptions(dates = [], today = new Date()) {
  const currentYear = today.getFullYear()
  const years = dates.map(parseReportingDate).filter(Boolean).map(date => date.getFullYear())
  const firstYear = Math.min(currentYear - 1, ...years)
  return [
    { value: '4w', label: 'Last 4 weeks' },
    { value: '12w', label: 'Last 12 weeks' },
    { value: '3m', label: 'Last 3 months' },
    { value: '6m', label: 'Last 6 months' },
    { value: '12m', label: 'Last 12 months' },
    { value: '24m', label: 'Last 24 months' },
    { value: 'q', label: 'This quarter' },
    { value: 'ytd', label: 'Year to date' },
    { value: 'previous_year', label: `Previous year (${currentYear - 1})` },
    ...Array.from({ length: currentYear - firstYear + 1 }, (_, index) => ({
      value: `year:${currentYear - index}`, label: String(currentYear - index),
    })),
    { value: 'all', label: 'All time' },
  ]
}

export function resolvePeriod(value, { today = new Date(), earliestDate } = {}) {
  let start = new Date(today.getFullYear(), 0, 1)
  let end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (/^\d+m$/.test(value)) {
    start = new Date(today.getFullYear(), today.getMonth() - (Number(value.slice(0, -1)) - 1), 1)
  } else if (/^\d+w$/.test(value)) {
    start = new Date(end)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (Number(value.slice(0, -1)) - 1) * 7)
  } else if (value === 'q') {
    start = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)
  } else if (value === 'previous_year' || /^year:\d{4}$/.test(value)) {
    const year = value === 'previous_year' ? today.getFullYear() - 1 : Math.min(Number(value.slice(5)), today.getFullYear())
    start = new Date(year, 0, 1)
    if (year < today.getFullYear()) end = new Date(year, 11, 31)
  } else if (value === 'all') {
    const earliest = parseReportingDate(earliestDate)
    if (earliest && earliest <= end) start = earliest
  }
  const format = date => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return {
    start: dateKey(start), end: dateKey(end),
    label: getPeriodOptions([dateKey(start)], today).find(option => option.value === value)?.label || 'Year to date',
    dateLabel: `${format(start)} – ${format(end)}`,
  }
}

export function buildTimeBuckets(period, grain = 'month') {
  const start = parseReportingDate(period.start)
  const end = parseReportingDate(period.end)
  if (!start || !end || start > end) return []
  let cursor = new Date(start)
  if (grain === 'year') cursor = new Date(start.getFullYear(), 0, 1)
  else if (grain === 'week') cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7))
  else cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const buckets = []
  while (cursor <= end) {
    const next = new Date(cursor)
    if (grain === 'year') next.setFullYear(next.getFullYear() + 1)
    else if (grain === 'week') next.setDate(next.getDate() + 7)
    else next.setMonth(next.getMonth() + 1)
    const last = new Date(next)
    last.setDate(last.getDate() - 1)
    const label = grain === 'year' ? String(cursor.getFullYear()) : cursor.toLocaleDateString('en-US', {
      month: 'short', ...(grain === 'week' ? { day: 'numeric' } : {}), year: '2-digit',
    })
    buckets.push({
      key: dateKey(cursor), start: dateKey(cursor < start ? start : cursor), end: dateKey(last > end ? end : last), label,
      fullLabel: grain === 'week' ? `Week of ${cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : cursor.toLocaleDateString('en-US', grain === 'year' ? { year: 'numeric' } : { month: 'long', year: 'numeric' }),
    })
    cursor = next
  }
  return buckets
}

export function aggregateSpend(entries, period, grain = 'month') {
  return buildTimeBuckets(period, grain).map(bucket => {
    const rows = entries.filter(entry => entry.week_start >= bucket.start && entry.week_start <= bucket.end)
    return {
      ...bucket, entryCount: rows.length,
      total: rows.length ? rows.reduce((sum, row) => sum + (Number(row.total_spend) || 0), 0) : null,
      ddu: rows.length ? rows.reduce((sum, row) => sum + (Number(row.ddu_spend) || 0), 0) : null,
    }
  })
}
