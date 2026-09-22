import test from 'node:test'
import assert from 'node:assert/strict'
import { addBusinessDays, canReviewCreativeLeadership, canUseCreativeLeadership, creativeActionPayload, creativeLeadDueWeek, isCreativeLead,
  newClientReview, safeCreativeEvidenceUrl, validateCreativeAction, validateCreativeCoaching, validateCreativeReview, validateCreativeReviewWeek } from './creativeLeadership.js'

const lead = { id: 'lead', is_active: true, role: 'athlete', position: 'head_of_creative_strategy' }
const row = id => {
  const value = { ...newClientReview({ id }), quality_status: 'on_track', research_check: 'pass', brief_check: 'pass',
    signoff_check: 'pass', learning_check: 'pass', growth_guide_status: 'updated', next_tests: 'Test a distinct premise', evidence_url: 'https://example.com/brief' }
  delete value.results // Legacy reviews predate the manually entered results field.
  return value
}
const review = () => ({ summary: 'Reviewed client strategy and next tests.', client_snapshot: [{ id: 'a', name: 'Client A' }, { id: 'b', name: 'Client B' }], client_reviews: [row('a'), row('b')] })

test('partial action edits preserve omitted milestones and reject server-managed metadata', () => {
  const existing = { id: 'action', identified_at: '2026-09-18T09:00:00Z', escalated_at: '2026-09-18T12:00:00Z', version: 2 }
  assert.deepEqual(creativeActionPayload({ title: 'Updated', id: 'forged', version: 100, created_by: 'other', identified_at: '2020-01-01' }, existing), { title: 'Updated' })
  assert.deepEqual(creativeActionPayload({ strategist_id: '', recovery_plan_at: '' }, existing), { strategist_id: null, recovery_plan_at: null })
  assert.deepEqual(creativeActionPayload({ title: 'New' }), { title: 'New', client_id: null, strategist_id: null, escalated_at: null, recovery_plan_at: null })
  assert.equal(existing.escalated_at, '2026-09-18T12:00:00Z')
})

test('creative leadership access is explicit and requires an active profile', () => {
  assert.equal(canUseCreativeLeadership(lead), true)
  assert.equal(canReviewCreativeLeadership(lead), false)
  assert.equal(canUseCreativeLeadership({ ...lead, role: 'ceo', position: 'management' }), true)
  assert.equal(canReviewCreativeLeadership({ ...lead, position: 'ops_manager' }), true)
  for (const profile of [null, {}, { ...lead, is_active: false }, { ...lead, position: 'creative_strategist' },
    { ...lead, position: 'ops_assistant', department: 'operations' }, { ...lead, position: 'management', role: 'management' }]) {
    assert.equal(canUseCreativeLeadership(profile), false)
  }
  assert.equal(isCreativeLead({ ...lead, is_active: false }), false)
})

test('review weeks use completed Dubai weeks and do not retroactively require pre-launch work', () => {
  assert.equal(creativeLeadDueWeek(new Date('2026-09-20T19:59:59Z')), '2026-09-07')
  assert.equal(creativeLeadDueWeek(new Date('2026-09-20T20:00:00Z')), '2026-09-14')
  const now = new Date('2026-09-22T12:00:00Z')
  assert.equal(validateCreativeReviewWeek('2026-09-14', now), true)
  for (const week of ['2026-09-07', '2026-09-21', '2026-09-15', 'not-a-date']) assert.equal(validateCreativeReviewWeek(week, now), false)
})

test('client reviews start blank instead of silently passing quality checks', () => {
  assert.equal(newClientReview({ id: 'a' }).quality_status, '')
  const value = review()
  assert.equal(validateCreativeReview(value), '')
  assert.match(validateCreativeReview({ ...value, client_reviews: [row('a')] }), /every client/)
  assert.match(validateCreativeReview({ ...value, client_reviews: [row('a'), row('a')] }), /every client/)
  assert.match(validateCreativeReview({ ...value, client_reviews: [row('a'), row('other')] }), /every client/)
  assert.match(validateCreativeReview({ ...value, summary: ' ' }), /summary/)
  assert.match(validateCreativeReview({ ...value, client_reviews: [null, row('b')] }), /every client/)
})

test('flagged clients require diagnosis and an unresolved linked action, not a generic checkbox', () => {
  const value = review()
  value.client_reviews[0].quality_status = 'needs_attention'
  assert.match(validateCreativeReview(value), /explain/)
  value.client_reviews[0].diagnosis = 'Repeated weak customer evidence'
  assert.match(validateCreativeReview(value), /linked open action/)
  assert.match(validateCreativeReview(value, [{ client_id: 'a', status: 'resolved' }]), /linked open action/)
  assert.equal(validateCreativeReview(value, [{ client_id: 'a', status: 'in_progress' }]), '')
  value.client_reviews[0].quality_status = 'insufficient_evidence'
  assert.match(validateCreativeReview(value, [{ client_id: 'a', status: 'open' }]), /blocker/)
  value.client_reviews[0].blocker = 'Awaiting qualifying test spend'
  assert.equal(validateCreativeReview(value, [{ client_id: 'a', status: 'open' }]), '')
})

test('failed checks and stale Growth Guides cannot hide behind an on-track label', () => {
  for (const patch of [{ brief_check: 'needs_work' }, { signoff_check: 'blocked' }, { growth_guide_status: 'needs_update' }]) {
    const value = review()
    Object.assign(value.client_reviews[0], patch)
    assert.match(validateCreativeReview(value), /explain/)
  }
})

test('evidence links reject executable schemes and embedded credentials', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd', 'https://user:password@example.com', '']) assert.equal(safeCreativeEvidenceUrl(url), null)
  assert.equal(safeCreativeEvidenceUrl('https://example.com/task?view=brief'), 'https://example.com/task?view=brief')
})

test('retention due dates skip weekends and use Dubai dates for timestamp inputs', () => {
  assert.equal(addBusinessDays('2026-09-25', 1), '2026-09-28')
  assert.equal(addBusinessDays('2026-09-25', 2), '2026-09-29')
  assert.equal(addBusinessDays('2026-09-24T21:00:00Z', 1), '2026-09-28')
  assert.equal(addBusinessDays('invalid', 1), null)
})

test('action resolution and coaching completion require evidence of follow-through', () => {
  const action = { title: 'Issue', diagnosis: 'Cause', action_plan: 'Next step', owner_id: 'owner', due_date: '2026-09-25', kind: 'quality', status: 'open' }
  assert.equal(validateCreativeAction(action), '')
  assert.match(validateCreativeAction({ ...action, status: 'resolved' }), /evidence/)
  assert.match(validateCreativeAction({ ...action, kind: 'retention' }), /linked/)
  assert.equal(validateCreativeAction({ ...action, status: 'resolved', resolution_evidence: 'Checked the corrected brief' }), '')
  const coaching = { strategist_id: 'cs', observation: 'Gap', expected_standard: 'Standard', agreed_action: 'Practice', due_date: '2026-09-25', outcome: 'open' }
  assert.equal(validateCreativeCoaching(coaching), '')
  assert.match(validateCreativeCoaching({ ...coaching, outcome: 'resolved' }), /follow-up/)
})
