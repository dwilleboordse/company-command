import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSpendPayload, compareSpendClients, formatSpendMoney, isCompleteSpendEntry, lastCompletedSpendWeek, scopeSpendClients, spendClientOptionLabels, spendFormValues, spendShare, spendStatus, spendTrend, summarizeSpend } from './spendAnalytics.js'

const context = { clientId: 'client-a', enteredBy: 'user-a', weekStart: '2026-09-07' }

test('leadership and dashboard spend health share the exact unrounded 20 and 50 percent boundaries', () => {
  for (const [share, label] of [[null, 'No share available'], [undefined, 'No share available'],
    [0, 'Low share'], [19.999, 'Low share'], [20, 'Healthy'], [49.999, 'Healthy'],
    [50, 'Excellent'], [100, 'Excellent']]) assert.equal(spendStatus(share).label, label)
  assert.equal(spendStatus(spendShare({ ddu_spend: null, total_spend: 100 })).label, 'No share available')
  assert.equal(spendStatus(spendShare({ ddu_spend: 0, total_spend: 100 })).label, 'Low share')
  assert.equal(spendStatus(spendShare({ ddu_spend: 0, total_spend: 0 })).label, 'No share available')
})

test('analytics client options disambiguate duplicate records without changing identities', () => {
  const clients = [
    { id: 'unique', name: 'Unique client' },
    { id: 'bambora-live', name: 'Bambora' },
    { id: 'bambora-past', name: 'Bambora', is_archived: true },
    { id: 'record-123456', name: 'Abriga', is_active: false },
    { id: 'record-654321', name: 'Abriga', is_archived: true },
  ]
  const before = structuredClone(clients)
  const labels = spendClientOptionLabels(clients)
  assert.equal(labels.get('unique'), 'Unique client')
  assert.equal(labels.get('bambora-live'), 'Bambora · Active')
  assert.equal(labels.get('bambora-past'), 'Bambora · Paused / past')
  assert.equal(labels.get('record-123456'), 'Abriga · Paused / past · 123456')
  assert.equal(labels.get('record-654321'), 'Abriga · Paused / past · 654321')
  assert.deepEqual([...labels.keys()], clients.map(client => client.id))
  assert.deepEqual(clients, before)
})

test('duplicate client labels normalize name casing and extend colliding short IDs', () => {
  const labels = spendClientOptionLabels([
    { id: 'record-a123456', name: 'Same' },
    { id: 'record-b123456', name: 'same' },
  ])
  assert.equal(labels.get('record-a123456'), 'Same · Active · a123456')
  assert.equal(labels.get('record-b123456'), 'same · Active · b123456')
})

test('spend completion accepts explicit zero but never counts missing, partial or invalid amounts', () => {
  assert.equal(isCompleteSpendEntry({ total_spend: 0, ddu_spend: 0 }), true)
  assert.equal(isCompleteSpendEntry({ total_spend: '100', ddu_spend: '0' }), true)
  assert.equal(isCompleteSpendEntry({ total_spend: 100, ddu_spend: 100 }), true)
  for (const entry of [undefined, {}, { total_spend: 100 }, { ddu_spend: 0 },
    { total_spend: 100, ddu_spend: null }, { total_spend: '', ddu_spend: 0 },
    { total_spend: ' ', ddu_spend: 0 }, { total_spend: false, ddu_spend: 0 },
    { total_spend: 100, ddu_spend: -1 }, { total_spend: -1, ddu_spend: 0 },
    { total_spend: Infinity, ddu_spend: 0 }, { total_spend: 100, ddu_spend: NaN },
    { total_spend: 100, ddu_spend: 101 }]) assert.equal(isCompleteSpendEntry(entry), false)
})

test('logged client counts deduplicate complete entries and preserve partial amounts for inspection', () => {
  const result = summarizeSpend([
    { client_id: 'zero', total_spend: 0, ddu_spend: 0 },
    { client_id: 'partial', total_spend: 100, ddu_spend: null },
    { client_id: 'invalid', total_spend: 20, ddu_spend: 30 },
    { client_id: 'complete', total_spend: 100, ddu_spend: 50 },
    { client_id: 'complete', total_spend: 100, ddu_spend: 50 },
  ])
  assert.equal(result.clients, 4)
  assert.equal(result.loggedClients, 2)
  assert.equal(result.completeEntries, 3)
  assert.equal(result.incomplete, 2)
  assert.equal(result.total, 320)
  assert.equal(result.ddu, 130)
  assert.equal(result.share, 50)
  assert.equal(spendShare({ total_spend: 20, ddu_spend: 30 }), null)
})

test('spend share is weighted across clients rather than averaging their percentages', () => {
  const result = summarizeSpend([{ client_id: 'a', total_spend: 100, ddu_spend: 90 }, { client_id: 'b', total_spend: 900, ddu_spend: 90 }])
  assert.equal(result.total, 1000)
  assert.equal(result.ddu, 180)
  assert.equal(result.share, 18)
  assert.equal(result.clients, 2)
})

test('missing amounts, zero spend, and missing entries remain distinct', () => {
  assert.equal(formatSpendMoney(0), '$0')
  assert.equal(formatSpendMoney(null), '—')
  assert.equal(summarizeSpend([]).total, null)
  assert.equal(summarizeSpend([{ total_spend: 0, ddu_spend: 0 }]).total, 0)
  assert.equal(spendShare({ total_spend: 0, ddu_spend: 0 }), null)
  assert.equal(spendShare({ total_spend: 100, ddu_spend: 0 }), 0)
  const incomplete = summarizeSpend([{ total_spend: 200, ddu_spend: null }, { total_spend: 100, ddu_spend: 20 }])
  assert.equal(incomplete.share, 20)
  assert.equal(incomplete.incomplete, 1)
})

test('last completed week always returns the preceding Monday across calendar boundaries', () => {
  assert.equal(lastCompletedSpendWeek(new Date('2026-09-14T09:00:00Z')), '2026-09-07')
  assert.equal(lastCompletedSpendWeek(new Date('2026-09-20T09:00:00Z')), '2026-09-07')
  assert.equal(lastCompletedSpendWeek(new Date('2026-01-01T09:00:00Z')), '2025-12-22')
  assert.equal(lastCompletedSpendWeek(new Date('2026-09-13T19:59:59Z')), '2026-08-31')
  assert.equal(lastCompletedSpendWeek(new Date('2026-09-13T20:00:00Z')), '2026-09-07')
})

test('CS scope follows roster assignment with legacy fallback, not creator ownership', () => {
  const clients = [{ id: 'a', cs_ids: ['one'], assigned_cs_id: 'two' }, { id: 'b', assigned_cs_id: 'one' }, { id: 'c', cs_ids: '["two"]' }]
  assert.deepEqual(scopeSpendClients(clients, { id: 'one', position: 'creative_strategist' }).map(row => row.id), ['a', 'b'])
  assert.equal(scopeSpendClients(clients, { id: 'one', position: 'editor' }).length, 0)
  assert.equal(scopeSpendClients(clients, { id: 'one' }, true).length, 3)
})

test('analytics includes selected historical clients and leaves missing time buckets empty', () => {
  const entries = [{ client_id: 'paused', week_start: '2026-04-05', total_spend: 100, ddu_spend: 50 }, { client_id: 'active', week_start: '2026-06-01', total_spend: 300, ddu_spend: 100 }]
  const period = { start: '2026-04-01', end: '2026-06-30' }
  const trend = spendTrend(entries, period)
  assert.deepEqual(trend.map(row => row.total), [100, null, 300])
  assert.equal(trend[1].share, null)
  const rows = compareSpendClients([{ id: 'paused', name: 'Past client', is_archived: true }, { id: 'active', name: 'Active client' }], entries, period)
  assert.equal(rows.length, 2)
  assert.equal(rows.reduce((sum, row) => sum + row.total, 0), 400)
})

test('totals-only entry accepts explicit zero and rejects missing, negative or inconsistent spend', () => {
  const form = { ...spendFormValues(), mode: 'totals', total_spend: '0', ddu_spend: '0' }
  assert.equal(buildSpendPayload(form, context).total_spend, 0)
  assert.throws(() => buildSpendPayload({ ...form, total_spend: '' }, context), /Enter both/)
  assert.throws(() => buildSpendPayload({ ...form, ddu_spend: '-1' }, context), /Enter both/)
  assert.throws(() => buildSpendPayload({ ...form, ddu_spend: '1' }, context), /cannot exceed/)
  assert.throws(() => buildSpendPayload({ ...form, total_spend: 'Infinity' }, context), /Enter both/)
})

test('notes-only changes retain legacy totals and platform values, including Sunday dates', () => {
  const existing = { id: 'old', week_start: '2026-04-05', total_spend: 800, ddu_spend: 350, meta_spend: 100, notes: 'Old note' }
  const form = { ...spendFormValues(existing), notes: 'New note' }
  assert.equal(form.mode, 'totals')
  const payload = buildSpendPayload(form, { ...context, existing, weekStart: existing.week_start })
  assert.equal(payload.total_spend, 800)
  assert.equal(payload.ddu_spend, 350)
  assert.equal(payload.meta_spend, 100)
  assert.equal(payload.notes, 'New note')
  assert.equal(payload.week_start, '2026-04-05')
  const changed = buildSpendPayload({ ...form, ddu_spend: 400 }, { ...context, existing })
  assert.equal(changed.meta_spend, null)
})

test('platform entry validates each pair and sums Other exactly once per total', () => {
  const form = { ...spendFormValues(), mode: 'platforms', meta_spend: '20', meta_total_spend: '100', other_spend: '10' }
  const payload = buildSpendPayload(form, context)
  assert.equal(payload.ddu_spend, 30)
  assert.equal(payload.total_spend, 110)
  assert.throws(() => buildSpendPayload({ ...form, meta_spend: 101 }, context), /Meta DDU/)
  assert.throws(() => buildSpendPayload({ ...spendFormValues(), mode: 'platforms' }, context), /Enter spend amounts/)
  assert.throws(() => buildSpendPayload(form, { ...context, weekStart: '2026-09-08' }), /Monday/)
})
