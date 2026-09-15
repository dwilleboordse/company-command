import test from 'node:test'
import assert from 'node:assert/strict'
import { canPromptWeeklyHealth, healthPromptSessionKey, healthPromptSummary } from './healthPrompt.js'
import { HEALTH_CONFIG } from './healthWeekly.js'

test('only an explicitly active Operations Manager gets the weekly health popup', () => {
  const manager = { id: 'ops', role: 'athlete', position: 'ops_manager', is_active: true }
  assert.equal(canPromptWeeklyHealth(manager), true)
  assert.equal(canPromptWeeklyHealth({ ...manager, role: 'management' }), true)
  assert.equal(canPromptWeeklyHealth({ ...manager, role: 'ceo' }), false)
  assert.equal(canPromptWeeklyHealth({ ...manager, position: 'ops_assistant' }), false)
  assert.equal(canPromptWeeklyHealth({ ...manager, position: 'creative_strategist' }), false)
  assert.equal(canPromptWeeklyHealth({ ...manager, is_active: false }), false)
  assert.equal(canPromptWeeklyHealth({ ...manager, is_active: undefined }), false)
  assert.equal(canPromptWeeklyHealth({ ...manager, id: null }), false)
  assert.equal(canPromptWeeklyHealth(null), false)
})

test('the dashboard excludes inactive team history without discarding active missing and partial reviews', () => {
  const week = '2026-09-07'
  const entities = [
    { id: 'complete', role: 'athlete', is_active: true },
    { id: 'partial', role: 'athlete', is_active: true },
    { id: 'missing', role: 'athlete', is_active: true },
    { id: 'offboarded', role: 'athlete', is_active: false },
    { id: 'ceo', role: 'ceo', is_active: true },
  ]
  const scores = Object.fromEntries(HEALTH_CONFIG.team.fields.map(({ key }) => [key, 4]))
  const entries = [
    { reviewee_id: 'complete', week_start: week, ...scores, performance_risk: 'Low' },
    { reviewee_id: 'partial', week_start: week, output_quality: 3 },
    { reviewee_id: 'offboarded', week_start: week, output_quality: 0 },
    { reviewee_id: 'ceo', week_start: week, output_quality: 0 },
  ]
  const summary = healthPromptSummary('team', entities, entries, week)
  assert.deepEqual([summary.eligible, summary.complete, summary.missing, summary.partial], [3, 1, 1, 1])
  assert.equal(summary.average, 4)
  assert.equal(entries.length, 4, 'Historical source rows are not deleted or mutated')
})

test('the client health prompt ignores paused/inactive and archived clients even with incomplete saved rows', () => {
  const week = '2026-09-07'
  const entities = [
    { id: 'active', is_active: true, is_archived: false },
    { id: 'paused', is_active: false, is_archived: false },
    { id: 'archived', is_active: true, is_archived: true },
  ]
  const entries = [{ client_id: 'paused', week_start: week }, { client_id: 'archived', week_start: week }]
  const summary = healthPromptSummary('client', entities, entries, week)
  assert.deepEqual([summary.eligible, summary.complete, summary.missing, summary.partial], [1, 0, 1, 0])
  assert.equal(summary.average, null, 'An unreviewed week is not a zero health score')
})

test('dismissing health reminders is isolated by person and reporting week', () => {
  const key = healthPromptSessionKey('ops-a', '2026-09-07')
  assert.equal(key, 'weekly-health-review:ops-a:2026-09-07')
  assert.notEqual(key, healthPromptSessionKey('ops-b', '2026-09-07'))
  assert.notEqual(key, healthPromptSessionKey('ops-a', '2026-09-14'))
})
