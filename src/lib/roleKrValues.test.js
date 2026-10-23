import test from 'node:test'
import assert from 'node:assert/strict'
import {
  KR_VALUE_CONFLICT, canRecordRoleValues, combinedRoleScore, formatRolePercent, measurementOnlyPatch,
  mondayWeekError, roleEntryError, roleMeasurement, roleStandards, roleValueOwnerId, roleValueRows,
} from './roleKrValues.js'

const ddes = {
  id: '55f6a513-897e-47b6-8ea7-ef3129ea6793',
  planning_context: {
    code: 'DDES.2',
    owner_id: 'owner-vanessa',
    target_by_role: { video_editor: 5, designer: 7 },
    target_text: '100% of role standard',
    review_required: 'Approved by Dennis',
    observation_period: 'week to 2026-10-21',
    evidence: 'Earlier note',
    source_snapshot: { target: 'Not supplied' },
  },
}

test('role standards come from target_by_role and keep designer before video editor', () => {
  const roles = roleStandards(ddes)
  assert.deepEqual(roles, [
    { key: 'designer', label: 'Designers', standard: 7 },
    { key: 'video_editor', label: 'Video editors', standard: 5 },
  ])
  assert.deepEqual(roleStandards({ planning_context: {} }), [])
  assert.deepEqual(roleStandards({ planning_context: { target_by_role: { designer: 7 } } }), [])
  assert.deepEqual(roleStandards({ planning_context: { target_by_role: { designer: 7, video_editor: 0 } } }), [])
  assert.deepEqual(roleStandards({ planning_context: { target_by_role: ['designer', 'video_editor'] } }), [])
  assert.equal(roleStandards(null).length, 0)
})

test('designer 4.5 and video editor 5 average to 82.1 percent of standard', () => {
  const roles = roleMeasurement(roleStandards(ddes), { designer: '4.5', video_editor: '5' })
  const score = combinedRoleScore(roles)
  assert.equal(score, 82.1)
  assert.equal(JSON.stringify(score), '82.1')
  assert.equal(formatRolePercent(4.5 / 7 * 100), '64.3%')
  assert.equal(formatRolePercent(100), '100.0%')
  assert.equal(combinedRoleScore(roleMeasurement(roleStandards(ddes), { designer: 0, video_editor: 5 })), 50)
  assert.equal(combinedRoleScore(roleMeasurement(roleStandards(ddes), { designer: '4.5', video_editor: '' })), null)
})

test('both role values, a Monday, a period and evidence are required', () => {
  const standards = roleStandards(ddes)
  const valid = { standards, values: { designer: '4.5', video_editor: '5' }, weekStart: '2026-10-19', period: 'week to 2026-10-21', evidence: 'ClickUp' }
  assert.equal(roleEntryError(valid), '')
  assert.match(roleEntryError({ ...valid, weekStart: '2026-10-21' }), /Monday/)
  assert.equal(mondayWeekError('2026-10-19'), '')
  assert.match(roleEntryError({ ...valid, values: { designer: '4.5', video_editor: '-1' } }), /Video editors/)
  assert.match(roleEntryError({ ...valid, evidence: '  ' }), /evidence/)
})

test('saved role rows use the widened conflict key and do not rewrite the definition', () => {
  assert.equal(KR_VALUE_CONFLICT, 'key_result_id,user_id,week_start,segment')
  assert.equal(KR_VALUE_CONFLICT.split(',').length, 4)
  const roles = roleMeasurement(roleStandards(ddes), { designer: '4.5', video_editor: '5' })
  assert.deepEqual(roleValueRows({ keyResultId: ddes.id, userId: 'owner-vanessa', weekStart: '2026-10-19', roles }), [
    { key_result_id: ddes.id, user_id: 'owner-vanessa', week_start: '2026-10-19', segment: 'designer', value: 4.5 },
    { key_result_id: ddes.id, user_id: 'owner-vanessa', week_start: '2026-10-19', segment: 'video_editor', value: 5 },
  ])
  const recordedAt = '2026-10-23T01:00:00.000Z'
  const patch = measurementOnlyPatch(ddes, {
    value: combinedRoleScore(roles), period: 'week to 2026-10-21', evidence: 'Vanessa: designers 4.5, editors 5', recordedAt,
  })
  assert.deepEqual(Object.keys(patch).sort(), ['current_value', 'current_value_recorded_at', 'planning_context', 'updated_at'])
  assert.equal(patch.current_value, 82.1)
  assert.equal(patch.current_value_recorded_at, recordedAt)
  assert.equal(patch.planning_context.evidence, 'Vanessa: designers 4.5, editors 5')
  assert.equal(patch.planning_context.observation_period, 'week to 2026-10-21')
  assert.equal(patch.planning_context.review_required, 'Approved by Dennis')
  assert.equal(patch.planning_context.target_text, '100% of role standard')
  assert.deepEqual(patch.planning_context.target_by_role, ddes.planning_context.target_by_role)
  assert.deepEqual(patch.planning_context.source_snapshot, { target: 'Not supplied' })
  assert.equal(ddes.planning_context.evidence, 'Earlier note')
  for (const key of ['title', 'goal_value', 'goal_direction', 'metric_name', 'unit', 'notes']) {
    assert.equal(Object.hasOwn(patch, key), false)
  }
  assert.throws(() => measurementOnlyPatch(ddes, { value: 82.1, period: '', evidence: 'x', recordedAt }), /evidence/)
})

test('the owner, CEO and management can record; another member cannot', () => {
  assert.equal(roleValueOwnerId(ddes, { owner_id: 'department-lead' }), 'owner-vanessa')
  assert.equal(roleValueOwnerId({}, { owner_id: 'department-lead' }), 'department-lead')
  assert.equal(canRecordRoleValues({ userId: 'owner-vanessa', canEditObjective: true }), true)
  assert.equal(canRecordRoleValues({ userId: 'dennis', isManagement: true }), true)
  assert.equal(canRecordRoleValues({ userId: 'teammate' }), false)
  assert.equal(canRecordRoleValues({}), false)
})
