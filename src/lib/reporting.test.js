import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateSpend, buildTimeBuckets, dateKey, getPeriodOptions, parseReportingDate, resolvePeriod } from './reportingPeriods.js'
import { fetchAllRows } from './reportingData.js'
import { analyzeChurnTenure, partnershipMonth } from './churnTenure.js'

const today = new Date(2026, 8, 5)

test('calendar year choices include the previous year and every year with historical data', () => {
  const options = getPeriodOptions(['2023-10-01', '2025-01-01', 'invalid', '2027-01-01'], today)
  assert.deepEqual(options.filter(option => option.value.startsWith('year:')).map(option => option.label), ['2026', '2025', '2024', '2023'])
  assert.ok(getPeriodOptions([], today).some(option => option.value === 'year:2025'))
  assert.ok(options.some(option => option.value === 'previous_year'))
})

test('historical years use their complete calendar boundaries and the current year stops today', () => {
  const historical = resolvePeriod('year:2025', { today })
  assert.equal(historical.start, '2025-01-01')
  assert.equal(historical.end, '2025-12-31')
  const previous = resolvePeriod('previous_year', { today })
  assert.equal(previous.start, historical.start)
  assert.equal(previous.end, historical.end)
  const current = resolvePeriod('year:2026', { today })
  assert.equal(current.start, '2026-01-01')
  assert.equal(current.end, '2026-09-05')
})

test('all time starts at the earliest valid record and date-only parsing rejects impossible days', () => {
  assert.equal(resolvePeriod('all', { today, earliestDate: '2022-04-14' }).start, '2022-04-14')
  assert.equal(resolvePeriod('all', { today, earliestDate: '2027-04-14' }).start, '2026-01-01')
  assert.equal(dateKey(parseReportingDate('2024-02-29')), '2024-02-29')
  assert.equal(parseReportingDate('2025-02-29'), null)
  assert.equal(parseReportingDate('2025-04-31'), null)
  assert.equal(parseReportingDate('2025-01-01T00:00:00Z'), null)
})

test('monthly reporting keeps matching month names in different years separate', () => {
  const entries = [
    { week_start: '2024-01-08', total_spend: 900, ddu_spend: 300 },
    { week_start: '2025-01-06', total_spend: 100, ddu_spend: 30 },
    { week_start: '2025-12-29', total_spend: 200, ddu_spend: 60 },
    { week_start: '2026-01-05', total_spend: 800, ddu_spend: 200 },
  ]
  const buckets = aggregateSpend(entries, resolvePeriod('year:2025', { today }), 'month')
  assert.equal(buckets.length, 12)
  assert.equal(buckets[0].key, '2025-01-01')
  assert.equal(buckets[0].total, 100)
  assert.equal(buckets[11].total, 200)
  assert.equal(buckets.reduce((sum, bucket) => sum + (bucket.total ?? 0), 0), 300)
})

test('week, month and year spend views reconcile and clip the first and last buckets', () => {
  const period = { start: '2024-12-28', end: '2026-01-06' }
  const entries = [
    { week_start: '2024-12-23', total_spend: 999, ddu_spend: 999 },
    { week_start: '2024-12-30', total_spend: '100', ddu_spend: '10' },
    { week_start: '2025-01-06', total_spend: 200, ddu_spend: 20 },
    { week_start: '2025-02-03', total_spend: 300, ddu_spend: 30 },
    { week_start: '2025-12-29', total_spend: 400, ddu_spend: 40 },
    { week_start: '2026-01-05', total_spend: 500, ddu_spend: 50 },
    { week_start: '2026-01-12', total_spend: 999, ddu_spend: 999 },
  ]
  for (const grain of ['week', 'month', 'year']) {
    const buckets = aggregateSpend(entries, period, grain)
    assert.equal(buckets[0].start, period.start)
    assert.equal(buckets.at(-1).end, period.end)
    assert.equal(buckets.reduce((sum, bucket) => sum + bucket.entryCount, 0), 5)
    assert.equal(buckets.reduce((sum, bucket) => sum + (bucket.total ?? 0), 0), 1500)
    assert.equal(buckets.reduce((sum, bucket) => sum + (bucket.ddu ?? 0), 0), 150)
  }
})

test('unreported buckets remain missing while a submitted zero spend remains zero', () => {
  const buckets = aggregateSpend([
    { week_start: '2025-02-03', total_spend: 0, ddu_spend: 0 },
  ], { start: '2025-01-01', end: '2025-03-31' }, 'month')
  assert.deepEqual(buckets.map(({ total, ddu, entryCount }) => ({ total, ddu, entryCount })), [
    { total: null, ddu: null, entryCount: 0 },
    { total: 0, ddu: 0, entryCount: 1 },
    { total: null, ddu: null, entryCount: 0 },
  ])
})

test('week buckets cover calendar year edges exactly once and invalid periods are empty', () => {
  const buckets = buildTimeBuckets({ start: '2025-01-01', end: '2025-01-08' }, 'week')
  assert.deepEqual(buckets.map(({ key, start, end }) => ({ key, start, end })), [
    { key: '2024-12-30', start: '2025-01-01', end: '2025-01-05' },
    { key: '2025-01-06', start: '2025-01-06', end: '2025-01-08' },
  ])
  assert.deepEqual(buildTimeBuckets({ start: '2025-02-01', end: '2025-01-01' }), [])
  assert.deepEqual(buildTimeBuckets({ start: 'bad', end: '2025-01-01' }), [])
})

test('partnership months advance on calendar anniversaries rather than a fixed number of days', () => {
  assert.equal(partnershipMonth('2025-01-15', '2025-01-15'), 1)
  assert.equal(partnershipMonth('2025-01-15', '2025-02-14'), 1)
  assert.equal(partnershipMonth('2025-01-15', '2025-02-15'), 2)
  assert.equal(partnershipMonth('2025-01-15', '2025-03-14'), 2)
  assert.equal(partnershipMonth('2025-01-15', '2026-01-15'), 13)
  assert.equal(partnershipMonth('2025-01-15', '2025-01-14'), null)
  assert.equal(partnershipMonth(null, '2025-01-14'), null)
})

test('partnership anniversaries clamp month ends and account for leap years', () => {
  assert.equal(partnershipMonth('2025-01-31', '2025-02-27'), 1)
  assert.equal(partnershipMonth('2025-01-31', '2025-02-28'), 2)
  assert.equal(partnershipMonth('2025-01-31', '2025-03-30'), 2)
  assert.equal(partnershipMonth('2025-01-31', '2025-03-31'), 3)
  assert.equal(partnershipMonth('2024-01-31', '2024-02-28'), 1)
  assert.equal(partnershipMonth('2024-01-31', '2024-02-29'), 2)
  assert.equal(partnershipMonth('2024-02-29', '2025-02-28'), 13)
})

test('churn tenure includes dated past exits in the selected period and excludes paused and future exits', () => {
  const clients = [
    { id: 'first', name: 'First', is_active: false },
    { id: 'last', name: 'Last', is_active: false },
    { id: 'paused', name: 'Paused', is_active: true, is_archived: true },
    { id: 'active', name: 'Active', is_active: true },
    { id: 'old', name: 'Old', is_active: false },
    { id: 'future', name: 'Future', is_active: false },
    { id: 'undated', name: 'Undated', is_active: false },
    { id: 'no-start', name: 'No start', is_active: false },
    { id: 'reversed', name: 'Reversed', is_active: false },
  ]
  const records = Object.fromEntries(clients.map(client => [client.id, { engagement_start: '2025-01-01', engagement_end: '2025-03-01' }]))
  records.first.engagement_end = '2025-01-01'
  records.last.engagement_end = '2025-12-31'
  records.old = { engagement_start: '2024-01-01', engagement_end: '2024-12-31' }
  records.future.engagement_end = '2026-10-01'
  records.undated.engagement_end = null
  records['no-start'].engagement_start = null
  records.reversed.engagement_start = '2025-04-01'
  const result = analyzeChurnTenure(clients, records, resolvePeriod('year:2025', { today }), today)
  assert.deepEqual(result.exits.map(client => client.id), ['first', 'last'])
  assert.equal(result.selectedCount, 4)
  assert.equal(result.missingStartCount, 2)
  assert.equal(result.missingEndCount, 1)
  assert.equal(result.futureEndCount, 1)
  assert.equal(result.buckets.reduce((sum, bucket) => sum + bucket.exits, 0), 2)
  assert.equal(result.buckets.reduce((sum, bucket) => sum + bucket.share, 0), 100)
  assert.equal(result.earlyExits, 1)
  assert.deepEqual(result.criticalMonths.map(bucket => bucket.month), [1, 12])
})

test('a period extending beyond today still excludes scheduled churn dates', () => {
  const result = analyzeChurnTenure([
    { id: 'ended', name: 'Ended', is_active: false },
    { id: 'scheduled', name: 'Scheduled', is_active: false },
  ], {
    ended: { engagement_start: '2026-01-01', engagement_end: '2026-09-05' },
    scheduled: { engagement_start: '2026-01-01', engagement_end: '2026-09-06' },
  }, { start: '2026-01-01', end: '2026-12-31' }, today)
  assert.deepEqual(result.exits.map(client => client.id), ['ended'])
  assert.equal(result.futureEndCount, 1)
})

test('empty churn analysis does not claim a critical month', () => {
  const result = analyzeChurnTenure([], {}, resolvePeriod('year:2025', { today }), today)
  assert.equal(result.selectedCount, 0)
  assert.equal(result.buckets.length, 6)
  assert.deepEqual(result.criticalMonths, [])
  assert.ok(result.buckets.every(bucket => bucket.exits === 0 && bucket.share === 0))
})

test('paginated reporting fetches every row beyond 500 with fresh nonoverlapping queries', async () => {
  const rows = Array.from({ length: 1203 }, (_, id) => ({ id }))
  const ranges = []
  let factories = 0
  const result = await fetchAllRows(() => {
    factories += 1
    return { range: async (start, end) => {
      ranges.push([start, end])
      return { data: rows.slice(start, end + 1), error: null }
    } }
  })
  assert.equal(result.error, null)
  assert.deepEqual(result.data, rows)
  assert.equal(factories, 3)
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]])
})

test('pagination verifies the empty page after a full final page', async () => {
  const rows = Array.from({ length: 500 }, (_, id) => ({ id }))
  let pages = 0
  const result = await fetchAllRows(() => ({ range: async (start, end) => {
    pages += 1
    return { data: rows.slice(start, end + 1), error: null }
  } }))
  assert.equal(pages, 2)
  assert.equal(result.data.length, 500)
})

test('pagination errors discard partial totals instead of reporting incomplete success', async () => {
  const error = { message: 'Reporting access denied' }
  const result = await fetchAllRows(() => ({ range: async start => start === 0
    ? { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }
    : { data: null, error } }))
  assert.equal(result.data, null)
  assert.equal(result.error, error)

  const thrown = new Error('Network unavailable')
  const rejected = await fetchAllRows(() => ({ range: async () => { throw thrown } }))
  assert.equal(rejected.data, null)
  assert.equal(rejected.error, thrown)
})
