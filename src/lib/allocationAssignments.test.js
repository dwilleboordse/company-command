import test from 'node:test'
import assert from 'node:assert/strict'
import { planAssignmentChange, guardClientFields, ROLE_ASSIGNMENT_FIELDS } from './allocationAssignments.js'

test('sharing adds a teammate without dropping existing assignments in every role', () => {
  for (const [role, field] of Object.entries(ROLE_ASSIGNMENT_FIELDS)) {
    const client = { [field]: ['a', 'b'] }
    const shared = planAssignmentChange(client, role, 'c', 'a')
    assert.deepEqual(shared.ids, ['a', 'b', 'c'])
    assert.deepEqual(client[field], ['a', 'b'])
    assert.equal(planAssignmentChange(client, role, 'b', 'a').changed, false)
  }
})

test('moving replaces just the dragged share, including moves onto existing teammates', () => {
  const client = { editor_ids: ['a', 'b'] }
  assert.deepEqual(planAssignmentChange(client, 'editor', 'c', 'a', 'move').ids, ['b', 'c'])
  assert.deepEqual(planAssignmentChange(client, 'editor', 'b', 'a', 'move').ids, ['b'])
  assert.deepEqual(planAssignmentChange(client, 'editor', 'a', 'a', 'move').ids, ['a', 'b'])
})

test('unassigned and legacy strategist clients retain their primary strategist consistently', () => {
  assert.deepEqual(planAssignmentChange({}, 'designer', 'a', null).ids, ['a'])
  const shared = planAssignmentChange({ assigned_cs_id: 'a' }, 'creative_strategist', 'b')
  assert.deepEqual(shared.updates, { cs_ids: ['a', 'b'], assigned_cs_id: 'a' })
  assert.equal(planAssignmentChange({}, 'unknown', 'a'), null)
  assert.equal(planAssignmentChange({}, 'editor', null), null)
})

test('assignment guards preserve exact original JSON and null values', () => {
  const calls = []
  const query = { eq(field, value) { calls.push(['eq', field, value]); return this }, is(field, value) { calls.push(['is', field, value]); return this } }
  assert.equal(guardClientFields(query, { cs_ids: ['a', 'b'], editor_ids: null }, ['cs_ids', 'editor_ids']), query)
  assert.deepEqual(calls, [['eq', 'cs_ids', '["a","b"]'], ['is', 'editor_ids', null]])
})
