import test from 'node:test'
import assert from 'node:assert/strict'
import { WEEKLY_UPDATE_OPTIONS, scoreLog, weeklyUpdateStatus, weeklyUpdatePatch } from './accountability.js'

const complete = {
  monday_intentions: true, friday_reflections: true, mvp_votes: true,
  growth_tracker_logged: true, on_time_pod_calls: true, on_time_client_calls: true,
  client_reports: 'done', monthly_survey: true,
}

test('weekly update offers all four statuses and preserves legacy fallback', () => {
  assert.deepEqual(WEEKLY_UPDATE_OPTIONS.map(option => option.value), ['sent', 'partial', 'not_sent', 'not_required'])
  assert.equal(weeklyUpdateStatus(undefined), 'not_sent')
  assert.equal(weeklyUpdateStatus({ weekly_update_sent: true }), 'sent')
  assert.equal(weeklyUpdateStatus({ weekly_update_status: 'not_required', weekly_update_sent: true }), 'not_required')
})

test('not required reduces the denominator without adding credit in any week', () => {
  for (const monthly of [false, true]) {
    for (const spend of [undefined, { total: 2, complete: true }]) {
      const missing = scoreLog(complete, monthly, spend, true)
      const exempt = scoreLog({ ...complete, weekly_update_status: 'not_required' }, monthly, spend, true)
      assert.equal(exempt.earned, missing.earned)
      assert.equal(exempt.total, missing.total - 1)
      assert.equal(exempt.earned, exempt.total)
    }
  }
  assert.deepEqual(scoreLog({ weekly_update_status: 'not_required' }, false, null, false), { earned: 0, total: 7 })
})

test('sent, partial, missing and legacy scores are unchanged', () => {
  for (const [status, credit] of [['sent', 1], ['partial', 0.5], ['not_sent', 0]]) {
    assert.deepEqual(scoreLog({ weekly_update_status: status }, false, null, false), { earned: credit, total: 8 })
  }
  assert.deepEqual(scoreLog({ weekly_update_sent: true }, true, { total: 2, complete: false }, false), { earned: 1, total: 11 })
})

test('status patches override stale legacy booleans in upsert payloads', () => {
  for (const { value } of WEEKLY_UPDATE_OPTIONS) {
    for (const previous of [true, false]) {
      const next = { weekly_update_sent: previous, ...weeklyUpdatePatch(value) }
      assert.equal(next.weekly_update_status, value)
      assert.equal(next.weekly_update_sent, value === 'sent')
    }
  }
})
