import test from 'node:test'
import assert from 'node:assert/strict'
import { HEALTH_CONFIG, ROLE_FIELDS_FROM_WEEK, healthCurrentWeek, healthDimensions, healthDueWeek, healthEligibleEntities, healthFieldsFor, healthScore, healthTrend, healthWeekOptions, healthWeekSummary, isHealthComplete, isHealthDate, isHealthMonday, usesRoleFields } from './healthWeekly.js'

const review = (kind, values = {}) => ({ ...Object.fromEntries(HEALTH_CONFIG[kind].fields.map(field => [field.key, 4])), [HEALTH_CONFIG[kind].riskKey]: 'Low', ...values })
test('health due week rolls over at Monday midnight Dubai across years and UTC dates', () => {
  assert.equal(healthCurrentWeek(new Date('2026-09-13T19:59:59Z')), '2026-09-07')
  assert.equal(healthDueWeek(new Date('2026-09-13T19:59:59Z')), '2026-08-31')
  assert.equal(healthCurrentWeek(new Date('2026-09-13T20:00:00Z')), '2026-09-14')
  assert.equal(healthDueWeek(new Date('2026-09-13T20:00:00Z')), '2026-09-07')
  assert.equal(healthDueWeek(new Date('2026-01-04T20:00:00Z')), '2025-12-29')
})
test('only all valid category scores and explicit risk complete a health review', () => {
  for (const kind of ['team', 'client']) {
    assert.equal(healthScore(kind, review(kind)), 4)
    assert.equal(isHealthComplete(kind, undefined), false)
    for (const value of [null, undefined, '', 0, 6, 'bad']) {
      const row = review(kind, { [HEALTH_CONFIG[kind].fields[0].key]: value })
      assert.equal(isHealthComplete(kind, row), false)
      assert.equal(healthScore(kind, row), null)
    }
    assert.equal(isHealthComplete(kind, review(kind, { [HEALTH_CONFIG[kind].riskKey]: '' })), false)
  }
})
test('selected-week coverage never substitutes last week or treats missing as Low risk', () => {
  const entities = ['a', 'b', 'c'].map(id => ({ id, is_active: true, role: 'athlete' }))
  const rows = [review('team', { reviewee_id: 'a', week_start: '2026-09-07', performance_risk: 'High' }), review('team', { reviewee_id: 'b', week_start: '2026-09-07', output_quality: 0 }), review('team', { reviewee_id: 'c', week_start: '2026-08-31' })]
  assert.deepEqual(healthWeekSummary('team', entities, rows, '2026-09-07'), { eligible: 3, complete: 1, partial: 1, missing: 1, average: 4, highRisk: 1 })
  assert.deepEqual(healthWeekSummary('team', [], rows, '2026-09-07'), { eligible: 0, complete: 0, partial: 0, missing: 0, average: null, highRisk: 0 })
})
test('roster eligibility excludes future joins, paused clients and offboarded people but preserves historical rows', () => {
  const entities = [{ id: 'old', is_active: false }, { id: 'paused', is_active: true, is_archived: true }, { id: 'active', is_active: true }, { id: 'new', is_active: true, created_at: '2026-09-14T00:00:00Z' }]
  assert.deepEqual(healthEligibleEntities('client', entities, [], '2026-09-07').map(e => e.id), ['active'])
  assert.deepEqual(healthEligibleEntities('client', entities, [{ client_id: 'old', week_start: '2026-09-07' }], '2026-09-07').map(e => e.id), ['old', 'active'])
  assert.deepEqual(healthEligibleEntities('client', [{ id: 'dubai-monday', is_active: true, created_at: '2026-09-13T21:00:00Z' }], [], '2026-09-07'), [])
})
test('weekly trend retains gaps and exact legacy dates without merging Sunday and Monday', () => {
  const rows = [review('client', { week_start: '2026-08-30' }), review('client', { week_start: '2026-08-31', performance_health: 1 }), review('client', { week_start: '2026-09-14', performance_health: 0 })]
  const trend = healthTrend('client', rows, '2026-08-24', '2026-09-14')
  assert.deepEqual(trend.map(row => row.week), ['2026-08-24', '2026-08-30', '2026-08-31', '2026-09-07', '2026-09-14'])
  assert.deepEqual(trend.map(row => row.average), [null, 4, 3.4, null, null])
  assert.equal(trend[1].legacy, true)
  assert.equal(trend[4].partial, 1)
})
test('week choices keep stored dates, reject invalid dates, and include new unlogged weeks', () => {
  const dates = healthWeekOptions([{ week_start: '2026-04-05' }, { week_start: null }], new Date('2026-09-15T00:00:00Z'))
  assert.ok(dates.includes('2026-04-05'))
  assert.ok(dates.includes('2026-09-14'))
  assert.equal(new Set(dates).size, dates.length)
  assert.equal(isHealthMonday('2026-04-05'), false)
  assert.equal(isHealthDate('2026-02-31'), false)
  assert.equal(isHealthDate('not-a-date'), false)
})
test('designers and editors score quality and speed from the switch week; other roles and older reviews keep the original categories', () => {
  const designer = { id: 'd', position: 'designer' }
  const editor = { id: 'e', position: 'editor' }
  const strategist = { id: 's', position: 'creative_strategist' }
  const defaults = HEALTH_CONFIG.team.fields
  assert.equal(isHealthMonday(ROLE_FIELDS_FROM_WEEK), true)
  assert.deepEqual(healthFieldsFor('team', designer, ROLE_FIELDS_FROM_WEEK).map(field => field.label), ['Output Quality', 'Output Speed', ...defaults.slice(2).map(field => field.label)])
  assert.deepEqual(healthFieldsFor('team', editor, '2026-11-02').map(field => field.key), defaults.map(field => field.key))
  assert.equal(healthFieldsFor('team', designer, '2026-10-12'), defaults)
  assert.equal(healthFieldsFor('team', designer, '2026-10-18'), defaults)
  assert.equal(healthFieldsFor('team', strategist, '2026-11-02'), defaults)
  assert.equal(healthFieldsFor('team', undefined, '2026-11-02'), defaults)
  assert.equal(healthFieldsFor('team', designer, undefined), defaults)
  assert.equal(healthFieldsFor('client', { position: 'designer' }, '2026-11-02'), HEALTH_CONFIG.client.fields)
  assert.equal(usesRoleFields('team', editor, '2026-10-19'), true)
  assert.equal(usesRoleFields('team', editor, '2026-10-18'), false)
  assert.equal(usesRoleFields('team', editor, 'not-a-date'), false)
})
test('category averages keep a speed score apart from client relationship', () => {
  const entities = [{ id: 'd', position: 'designer' }, { id: 's', position: 'creative_strategist' }]
  const rows = [
    review('team', { reviewee_id: 'd', week_start: '2026-10-19', client_relationship: 2, output_quality: 3 }),
    review('team', { reviewee_id: 'd', week_start: '2026-10-12', client_relationship: 5 }),
    review('team', { reviewee_id: 's', week_start: '2026-10-19', client_relationship: 3 }),
    review('team', { reviewee_id: 's', week_start: '2026-10-26', client_relationship: 0 }),
  ]
  const dims = healthDimensions('team', entities, rows)
  assert.deepEqual(dims.map(dim => dim.name), ['Output', 'Quality', 'Client', 'Speed', 'Response', 'Team', 'Initiative', 'Reliability'])
  const value = Object.fromEntries(dims.map(dim => [dim.name, dim.value]))
  assert.equal(value.Output, 4)
  assert.equal(value.Quality, 3)
  assert.equal(value.Client, 4)
  assert.equal(value.Speed, 2)
  assert.deepEqual(healthDimensions('team', entities, []).map(dim => dim.value), [null, null, null, null, null, null])
  assert.deepEqual(healthDimensions('client', [{ id: 'c' }], [review('client', { client_id: 'c', week_start: '2026-10-19' })]).map(dim => dim.name), HEALTH_CONFIG.client.fields.map(field => field.short))
})
