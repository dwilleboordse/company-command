import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSpendLeaderboard, resolveLeaderboardPeriod } from './spendLeaderboard.js'

const period = { start: '2026-08-17', end: '2026-09-13' }
const member = (id, full_name = id, extra = {}) => ({ id, full_name, position: 'creative_strategist', is_active: true, ...extra })
const entry = (client_id, ddu_spend, total_spend, extra = {}) => ({
  id: `${client_id}-entry`, client_id, week_start: '2026-09-07', ddu_spend, total_spend, ...extra,
})
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`)

test('leaderboard defaults to allocated DDU dollars and can rank weighted share instead', () => {
  const data = { period, members: [member('a'), member('b')], clients: [
    { id: 'small', cs_ids: ['a'] }, { id: 'large', cs_ids: ['a'] }, { id: 'other', cs_ids: ['b'] },
  ], entries: [entry('small', 90, 100), entry('large', 90, 900), entry('other', 150, 300)] }
  const dollars = buildSpendLeaderboard(data)
  assert.equal(dollars.rows[0].id, 'a')
  assert.equal(dollars.rows[0].share, 18)
  assert.equal(dollars.rows[0].rank, 1)
  const share = buildSpendLeaderboard({ ...data, sortBy: 'share' })
  assert.equal(share.rows[0].id, 'b')
  assert.equal(share.rows[0].share, 50)
  assert.equal(share.summary.ddu, 330)
  assert.equal(share.summary.total, 1300)
})

test('equal client ownership splits dollars and denominators without counting entered_by', () => {
  const data = { period, members: [member('a'), member('b'), member('c')], clients: [
    { id: 'two', name: 'Two', cs_ids: ['a', 'b', 'a'] }, { id: 'three', name: 'Three', cs_ids: '["a","b","c"]' },
  ], entries: [entry('two', 100, 200, { entered_by: 'c' }), entry('three', 100, 300)] }
  const before = structuredClone(data)
  const result = buildSpendLeaderboard(data)
  const a = result.rows.find(row => row.id === 'a')
  const c = result.rows.find(row => row.id === 'c')
  close(a.ddu, 50 + 100 / 3)
  assert.equal(a.total, 200)
  assert.equal(a.completeEntries, 2)
  assert.equal(a.reportedClients, 2)
  assert.equal(a.clients.find(row => row.id === 'two').assignmentCount, 2)
  close(c.ddu, 100 / 3)
  assert.equal(c.completeEntries, 1)
  close(result.summary.allocatedDdu, 200)
  close(result.summary.allocatedTotal, 500)
  close(result.summary.unattributedDdu, 0)
  assert.deepEqual(data, before)
})

test('inactive, unknown, and non-CS owners retain unattributed shares; legacy assignment works', () => {
  const result = buildSpendLeaderboard({ period, members: [member('a'), member('inactive', 'Inactive', { is_active: false }),
    member('editor', 'Editor', { position: 'editor' })], clients: [
    { id: 'shared', cs_ids: ['a', 'inactive', 'unknown', 'editor'] },
    { id: 'legacy', cs_ids: '[null, 3, {}, ""]', assigned_cs_id: 'a' },
    { id: 'unassigned', cs_ids: [] },
  ], entries: [entry('shared', 80, 400), entry('legacy', 20, 100), entry('unassigned', 10, 50)] })
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].ddu, 40)
  assert.equal(result.rows[0].total, 200)
  assert.equal(result.summary.ddu, 110)
  assert.equal(result.summary.allocatedDdu, 40)
  assert.equal(result.summary.unattributedDdu, 70)
  assert.equal(result.summary.unattributedTotal, 350)
})

test('missing, zero-total, and zero-DDU-with-spend remain distinct', () => {
  const result = buildSpendLeaderboard({ period, members: [member('none'), member('zero'), member('no-ddU')], clients: [
    { id: 'none', cs_ids: ['none'] }, { id: 'zero', cs_ids: ['zero'] }, { id: 'no-ddU', cs_ids: ['no-ddU'] },
  ], entries: [entry('zero', 0, 0), entry('no-ddU', 0, 100)] })
  const byId = Object.fromEntries(result.rows.map(row => [row.id, row]))
  assert.equal(byId.none.ddu, null)
  assert.equal(byId.none.total, null)
  assert.equal(byId.none.rank, null)
  assert.equal(byId.none.clients[0].ddu, null)
  assert.equal(byId.zero.ddu, 0)
  assert.equal(byId.zero.share, null)
  assert.equal(byId.zero.rank, null)
  assert.equal(byId['no-ddU'].rank, 1)
  assert.equal(byId['no-ddU'].share, 0)
  assert.equal(result.summary.reportingClients, 2)
})

test('invalid or partial rows never enter either leaderboard dollar total', () => {
  const entries = [entry('a', null, 100), entry('b', 101, 100), entry('c', -1, 100), entry('d', 0, false),
    entry('e', Infinity, 100), entry('f', '', 100), entry('good', '20', '100')]
  const result = buildSpendLeaderboard({ period, members: [member('cs')],
    clients: entries.map(row => ({ id: row.client_id, cs_ids: ['cs'] })), entries })
  assert.equal(result.summary.incompleteEntries, 6)
  assert.equal(result.summary.completeEntries, 1)
  assert.equal(result.summary.total, 100)
  assert.equal(result.summary.ddu, 20)
  assert.equal(result.rows[0].total, 100)
  assert.equal(result.rows[0].reportedClients, 1)
})

test('duplicates use the latest update, then creation, then ID deterministically', () => {
  const entries = [
    entry('a', 90, 100, { id: 'old', updated_at: '2026-09-08T00:00:00Z' }),
    entry('a', 30, 100, { id: 'latest', updated_at: '2026-09-09T00:00:00Z' }),
    entry('b', 80, 100, { id: 'a', created_at: '2026-09-09T00:00:00Z' }),
    entry('b', 20, 100, { id: 'b', created_at: '2026-09-09T00:00:00Z' }),
    entry('c', 100, 100, { id: 'old', updated_at: '2026-09-09T00:00:00Z', created_at: '2026-09-08T00:00:00Z' }),
    entry('c', null, 100, { id: 'new', updated_at: '2026-09-09T00:00:00Z', created_at: '2026-09-09T00:00:00Z' }),
  ]
  const data = { period, members: [member('cs')], clients: ['a', 'b', 'c'].map(id => ({ id, cs_ids: ['cs'] })), entries }
  const result = buildSpendLeaderboard(data)
  assert.equal(result.summary.ddu, 50)
  assert.equal(result.summary.total, 200)
  assert.equal(result.summary.completeEntries, 2)
  assert.equal(result.summary.incompleteEntries, 1)
  assert.equal(result.summary.duplicateEntries, 3)
  assert.deepEqual(buildSpendLeaderboard({ ...data, entries: [...entries].reverse() }), result)
})

test('ties follow the displayed metric and use competition rank with deterministic name ordering', () => {
  const data = { period, members: [member('z', 'Zebra'), member('a', 'Alpha'), member('third', 'Third'), member('empty')],
    clients: ['a', 'z', 'third', 'empty'].map(id => ({ id, cs_ids: [id] })),
    entries: [entry('a', 10.001, 100), entry('z', 10.004, 100), entry('third', 9, 100)] }
  const result = buildSpendLeaderboard(data)
  assert.deepEqual(result.rows.map(row => [row.id, row.rank]), [['a', 1], ['z', 1], ['third', 3], ['empty', null]])
  const share = buildSpendLeaderboard({ ...data, entries: [entry('a', 10.01, 100), entry('z', 10.04, 100), entry('third', 9, 100)], sortBy: 'share' })
  assert.deepEqual(share.rows.map(row => row.rank), [1, 1, 3, null])
})

test('fractional arithmetic at half-cent boundaries does not create false ranking differences', () => {
  const result = buildSpendLeaderboard({ period, members: [member('a'), member('b')],
    clients: ['a', 'b'].map(id => ({ id, cs_ids: [id] })),
    entries: [entry('a', 1.005, 100), entry('b', 1.006, 100)] })
  assert.deepEqual(result.rows.map(row => row.rank), [1, 1])
})

test('period boundaries include past clients and legacy Sundays but ignore unknown clients and invalid dates', () => {
  const result = buildSpendLeaderboard({ period, members: [member('a')], clients: [{ id: 'past', cs_ids: ['a'], is_archived: true }], entries: [
    entry('past', 10, 100, { week_start: period.start }),
    entry('past', 20, 100, { week_start: period.end }),
    entry('past', 90, 100, { week_start: '2026-09-14' }),
    entry('past', 90, 100, { week_start: '2026-08-16' }),
    entry('past', 90, 100, { week_start: '2026-09-99' }),
    entry('unknown', 90, 100),
  ] })
  assert.equal(result.summary.ddu, 30)
  assert.equal(result.summary.completeEntries, 2)
  assert.equal(result.summary.latestWeek, period.end)
  assert.equal(result.rows[0].latestWeek, period.end)
})

test('empty data and explicitly empty or invalid periods never manufacture zero scores', () => {
  const data = { clients: [{ id: 'a', cs_ids: ['a'] }], members: [member('a')], entries: [entry('a', 50, 100)] }
  for (const selection of [undefined, { ...period, isEmpty: true }, { start: 'bad', end: period.end }, { start: period.end, end: period.start }]) {
    const result = buildSpendLeaderboard({ ...data, period: selection })
    assert.equal(result.rows[0].ddu, null)
    assert.equal(result.rows[0].rank, null)
    assert.equal(result.summary.ddu, null)
    assert.equal(result.summary.unattributedDdu, null)
  }
  assert.deepEqual(buildSpendLeaderboard().rows, [])
})

test('completed period defaults and week options exclude the entire in-progress Dubai week', () => {
  const today = new Date('2026-09-17T08:00:00Z')
  const four = resolveLeaderboardPeriod(undefined, { today })
  assert.equal(four.start, '2026-08-17')
  assert.equal(four.end, '2026-09-13')
  assert.equal(four.isEmpty, false)
  assert.equal(resolveLeaderboardPeriod('week', { today }).start, '2026-09-07')
  assert.equal(resolveLeaderboardPeriod('12w', { today }).start, '2026-06-22')
  assert.equal(resolveLeaderboardPeriod('4w', { today: new Date('2026-09-13T19:59:59Z') }).end, '2026-09-06')
  assert.equal(resolveLeaderboardPeriod('4w', { today: new Date('2026-09-13T20:00:00Z') }).end, '2026-09-13')
})

test('calendar periods cap at the completed Sunday without filling an unfinished month or year', () => {
  const today = new Date('2026-09-17T08:00:00Z')
  assert.deepEqual(Object.fromEntries(['start', 'end'].map(key => [key, resolveLeaderboardPeriod('month', { today })[key]])),
    { start: '2026-09-01', end: '2026-09-13' })
  assert.equal(resolveLeaderboardPeriod('last_month', { today }).start, '2026-08-01')
  assert.equal(resolveLeaderboardPeriod('last_month', { today }).end, '2026-08-31')
  assert.equal(resolveLeaderboardPeriod('year:2025', { today }).end, '2025-12-31')
  assert.equal(resolveLeaderboardPeriod('year:2027', { today }).isEmpty, true)
  assert.equal(resolveLeaderboardPeriod('month', { today: new Date('2026-09-01T08:00:00Z') }).isEmpty, true)
  assert.equal(resolveLeaderboardPeriod('ytd', { today: new Date('2026-01-01T08:00:00Z') }).isEmpty, true)
  assert.equal(resolveLeaderboardPeriod('all', { today, earliestDate: '2025-04-06' }).start, '2025-04-06')
  assert.equal(resolveLeaderboardPeriod('all', { today, earliestDate: '2026-09-14' }).isEmpty, true)
})
