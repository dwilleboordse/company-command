import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDashboardOkrs, canViewOkr, currentOkrQuarter, getOkrMeasurement, parseOkrAssignees } from './dashboardOkrs.js'

const profile = { id: 'me', position: 'creative_strategist', department: 'delivery' }
const objectives = [
  { id: 'role', title: 'Creative quality', department: 'delivery', role_type: 'creative_strategist' },
  { id: 'other', title: 'Editing quality', department: 'delivery', role_type: 'editor' },
  { id: 'company', title: 'Agency goal', department: 'company', role_type: 'company_wide' },
  { id: 'explicit', title: 'Assigned objective', department: 'marketing', role_type: 'marketing', assignee_ids: ['me'] },
]
const keyResults = objectives.map(objective => ({ id: `${objective.id}-kr`, objective_id: objective.id,
  metric_name: 'Metric', visibility: 'team', current_value: 50, goal_value: 100 }))

test('personal OKRs use role fallback and explicit assignments but not company context', () => {
  const result = buildDashboardOkrs({ objectives, keyResults, profile })
  assert.deepEqual(result.map(row => row.id), ['role', 'explicit'])
})

test('explicit KR assignment overrides objective role and objective assignment', () => {
  const rows = [
    { ...keyResults[0], assignee_ids: ['someone-else'] },
    { ...keyResults[1], assignee_ids: ['me'] },
  ]
  assert.deepEqual(buildDashboardOkrs({ objectives, keyResults: rows, profile }).flatMap(row => row.results.map(kr => kr.id)), ['other-kr'])
})

test('explicit objective owner is respected when no assignee list is provided', () => {
  const owned = [{ ...objectives[0], owner_id: 'another-person' }, { ...objectives[1], owner_id: 'me' }]
  assert.deepEqual(buildDashboardOkrs({ objectives: owned, keyResults, profile }).map(row => row.id), ['other'])
  assert.deepEqual(buildDashboardOkrs({ objectives: owned, keyResults, profile, scope: 'department' }).map(row => row.id), ['other'])
})

test('department context stays scoped and never reports a personal weekly value', () => {
  const scoped = buildDashboardOkrs({ objectives, keyResults: keyResults.map(kr => ({ ...kr, current_value: null })), profile,
    scope: 'department', department: 'marketing', values: [{ key_result_id: 'role-kr', user_id: 'me', value: 99, week_start: '2026-09-07' }] })
  assert.deepEqual(scoped.map(row => row.id), ['role', 'other'])
  assert.equal(scoped[0].results[0].measurement.current, null)
})

test('department explicit assignees and restricted visibility are honored', () => {
  const scoped = buildDashboardOkrs({ objectives, profile, scope: 'department', keyResults: [
    { ...keyResults[0], visibility: 'ceo' }, { ...keyResults[1], assignee_ids: ['other-person'] },
  ] })
  assert.deepEqual(scoped, [])
  assert.equal(canViewOkr({ visibility: 'management' }, { isManagement: true }), true)
  assert.equal(canViewOkr({ visibility: 'ceo' }, { isManagement: true }), false)
})

test('CEO department and company views use shared values without personal ownership inference', () => {
  const ceo = { id: 'ceo', role: 'ceo' }
  assert.equal(buildDashboardOkrs({ objectives, keyResults, profile: ceo, isCEO: true }).length, 0)
  assert.equal(buildDashboardOkrs({ objectives, keyResults, profile: ceo, isCEO: true, scope: 'department' }).length, 3)
  assert.equal(buildDashboardOkrs({ objectives, keyResults, profile: ceo, isCEO: true, scope: 'company' }).length, 1)
})

test('official zero beats stale weekly values; legacy fallback is owner/date scoped', () => {
  const values = [
    { key_result_id: 'kr', user_id: 'other', value: 500, week_start: '2026-09-14' },
    { key_result_id: 'kr', user_id: 'me', value: 90, week_start: '2026-10-01' },
    { key_result_id: 'kr', user_id: 'me', value: 30, week_start: '2026-09-07' },
    { key_result_id: 'kr', user_id: 'me', value: 20, week_start: '2026-08-31' },
  ]
  const options = { values, userId: 'me', personal: true, asOf: '2026-09-14' }
  assert.equal(getOkrMeasurement({ id: 'kr', current_value: 0, goal_value: 100 }, options).current, 0)
  const fallback = getOkrMeasurement({ id: 'kr', current_value: null, goal_value: 100 }, options)
  assert.equal(fallback.current, 30)
  assert.equal(fallback.valueDate, '2026-09-07')
  assert.equal(getOkrMeasurement({ id: 'kr', goal_value: 100 }, { ...options, personal: false }).current, null)
})

test('min/zero/negative targets and missing measurements do not divide by zero', () => {
  assert.equal(getOkrMeasurement({ current_value: 0, goal_value: 0, goal_direction: 'min' }).met, true)
  assert.equal(getOkrMeasurement({ current_value: 10, goal_value: 5, goal_direction: 'min' }).attainment, 50)
  assert.equal(getOkrMeasurement({ current_value: 2, goal_value: 0, goal_direction: 'min' }).attainment, 0)
  assert.equal(getOkrMeasurement({ current_value: -5, goal_value: -10 }).attainment, null)
  assert.equal(getOkrMeasurement({ current_value: null, goal_value: 10 }).status, 'unmeasured')
})

test('initiative completion is distinct from numeric target attainment', () => {
  const [result] = buildDashboardOkrs({ objectives: [objectives[0]], keyResults: [keyResults[0]], profile,
    milestones: [{ key_result_id: 'role-kr', status: 'completed' }, { key_result_id: 'role-kr', status: 'half' },
      { key_result_id: 'role-kr', status: 'completed', is_active: false }] })
  assert.equal(result.results[0].initiativeProgress, 50)
  assert.equal(result.results[0].measurement.status, 'below')
  assert.equal(result.results[0].initiativeCount, 2)
})

test('inactive rows and all-hidden objectives do not inflate counts', () => {
  const result = buildDashboardOkrs({ objectives: [objectives[0], { ...objectives[1], is_active: false }],
    keyResults: [{ ...keyResults[0], visibility: 'ceo' }, keyResults[1]], profile, scope: 'department' })
  assert.deepEqual(result, [])
})

test('assignee parsing and quarter boundaries are deterministic', () => {
  assert.deepEqual(parseOkrAssignees('["me"]'), ['me'])
  assert.deepEqual(parseOkrAssignees('{"invalid":true}'), [])
  assert.equal(currentOkrQuarter(new Date(2026, 8, 30)), 'Q3-2026')
  assert.equal(currentOkrQuarter(new Date(2026, 9, 1)), 'Q4-2026')
})
