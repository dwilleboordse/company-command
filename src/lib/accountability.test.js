import test from 'node:test'
import assert from 'node:assert/strict'
import { WEEKLY_UPDATE_OPTIONS, leadReviewAccountabilityStatus, leadReviewWeekForAccountability, scoreLog, weeklyUpdateStatus, weeklyUpdatePatch } from './accountability.js'

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

const creativeLead = { id: 'lead-one', position: 'head_of_creative_strategy', is_active: true }

test('Lead CS submission covers the previous completed week, including year boundaries', () => {
  assert.equal(leadReviewWeekForAccountability('2026-09-21'), '2026-09-14')
  assert.equal(leadReviewWeekForAccountability('2027-01-04'), '2026-12-28')
  const wrongWeek = [{ lead_id: creativeLead.id, week_start: '2026-09-21', status: 'finalized' }]
  assert.equal(leadReviewAccountabilityStatus(creativeLead, wrongWeek, '2026-09-21').complete, false)
})

test('only the active Head of Creative Strategy has the new accountability requirement after rollout', () => {
  for (const member of [
    { id: 'cs', position: 'creative_strategist', is_active: true },
    { id: 'ops', position: 'ops_manager', is_active: true },
    { id: 'ceo', role: 'ceo', is_active: true },
    { ...creativeLead, is_active: false },
  ]) {
    const status = leadReviewAccountabilityStatus(member, [], '2026-09-21')
    assert.equal(status.applicable, false)
    assert.deepEqual(scoreLog({}, false, null, false, status), scoreLog({}, false, null, false))
  }
  assert.equal(leadReviewAccountabilityStatus(creativeLead, [], '2026-09-14').applicable, false)
  assert.equal(leadReviewAccountabilityStatus(creativeLead, [], '2026-09-21').applicable, true)
})

test('submitted and finalized reviews count completion, but changes requested and drafts do not', () => {
  for (const [status, expected] of [['submitted', true], ['finalized', true], ['changes_requested', false], ['draft', false]]) {
    const record = { lead_id: creativeLead.id, week_start: '2026-09-14', status }
    const derived = leadReviewAccountabilityStatus(creativeLead, [record], '2026-09-21')
    assert.equal(derived.complete, expected)
    assert.deepEqual(scoreLog({}, false, null, false, derived), { earned: expected ? 1 : 0, total: 9 })
  }
  const otherLead = [{ lead_id: 'somebody-else', week_start: '2026-09-14', status: 'finalized' }]
  assert.equal(leadReviewAccountabilityStatus(creativeLead, otherLead, '2026-09-21').complete, false)
})

test('unavailable Lead CS status is flagged separately, not counted as a missing item', () => {
  const unavailable = leadReviewAccountabilityStatus(creativeLead, [], '2026-09-21', true)
  assert.equal(unavailable.unavailable, true)
  assert.equal(unavailable.label, 'Status unavailable')
  assert.deepEqual(scoreLog({}, false, null, false, unavailable), scoreLog({}, false, null, false))
})
