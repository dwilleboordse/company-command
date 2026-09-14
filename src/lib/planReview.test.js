import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planToday, planWeekStart, planReviewState, validateWeeklyReview, buildPlanOverview, countsAsCompletedPlanReview, planBlockerText } from './planReview.js'

const monday = new Date('2026-09-14T09:00:00Z')
const plan = { id: 'plan-1', user_id: 'one', status: 'committed', start_date: '2026-08-01', end_date: '2026-11-08' }
const pulse = { plan_id: 'plan-1', week_start: '2026-09-14', track_status: 'on_track', progress_note: 'Delivered work', next_commitment: 'Finish milestone' }

test('accountability preserves historical submissions but new drafts require a lock', () => {
  assert.equal(countsAsCompletedPlanReview({ week_start: '2026-09-07' }), true)
  assert.equal(countsAsCompletedPlanReview(pulse), false)
  assert.equal(countsAsCompletedPlanReview({ ...pulse, locked_at: '2026-09-14T10:00:00Z' }), true)
  assert.equal(countsAsCompletedPlanReview({ ...pulse, week_start: '2026-09-21' }), false)
  assert.equal(countsAsCompletedPlanReview(null), false)
})

test('plan reviews roll over at Dubai Monday, not the browser or UTC midnight', () => {
  assert.equal(planToday(new Date('2026-09-13T20:00:00Z')), '2026-09-14')
  assert.equal(planWeekStart(new Date('2026-09-13T19:59:59Z')), '2026-09-07')
  assert.equal(planWeekStart(new Date('2026-09-13T20:00:00Z')), '2026-09-14')
  assert.equal(planWeekStart(new Date('2027-01-01T10:00:00Z')), '2026-12-28')
})

test('only a locked update on the matching plan and current week completes the reminder', () => {
  assert.equal(planReviewState(plan, null, monday).status, 'due')
  assert.equal(planReviewState(plan, pulse, monday).status, 'update_draft')
  assert.equal(planReviewState(plan, { ...pulse, locked_at: '2026-09-14T10:00:00Z' }, monday).locked, true)
  assert.equal(planReviewState(plan, { ...pulse, locked_at: '2026-09-07', week_start: '2026-09-07' }, monday).due, true)
  assert.equal(planReviewState(plan, { ...pulse, locked_at: '2026-09-14', plan_id: 'another' }, monday).due, true)
})

test('missing, draft, ended and future plans have distinct next actions', () => {
  assert.equal(planReviewState(null, null, monday).status, 'missing')
  assert.equal(planReviewState({ ...plan, status: 'draft' }, pulse, monday).status, 'draft')
  assert.equal(planReviewState({ ...plan, start_date: null }, pulse, monday).status, 'needs_dates')
  assert.equal(planReviewState({ ...plan, end_date: '2026-09-13' }, pulse, monday).status, 'ended')
  assert.equal(planReviewState({ ...plan, start_date: '2026-09-15' }, pulse, monday).due, false)
})

test('lock requires both progress and next commitment but does not require an invented blocker', () => {
  assert.match(validateWeeklyReview({ ...pulse, progress_note: ' ' }), /progress/)
  assert.match(validateWeeklyReview({ ...pulse, next_commitment: '' }), /commitment/)
  assert.match(validateWeeklyReview({ ...pulse, track_status: 'unknown' }), /status/)
  assert.equal(validateWeeklyReview(pulse), '')
})

test('CEO overview excludes inactive people and treats drafts as due, not healthy', () => {
  const profiles = [
    { id: 'one', full_name: 'One', is_active: true },
    { id: 'two', full_name: 'Two', is_active: true },
    { id: 'gone', full_name: 'Offboarded', is_active: false },
  ]
  const result = buildPlanOverview(profiles, [plan], [pulse], monday)
  assert.equal(result.total, 2)
  assert.equal(result.missing, 1)
  assert.equal(result.committed, 1)
  assert.equal(result.due, 1)
  assert.equal(result.locked, 0)
  assert.equal(result.onTrack, 0)
})

test('only current locked reviews contribute to risk and blockers', () => {
  const profiles = [{ id: 'one', is_active: true }]
  const locked = { ...pulse, locked_at: '2026-09-14T10:00:00Z' }
  assert.equal(buildPlanOverview(profiles, [plan], [locked], monday).onTrack, 1)
  assert.equal(buildPlanOverview(profiles, [plan], [{ ...locked, track_status: 'at_risk' }], monday).atRisk, 1)
  assert.equal(buildPlanOverview(profiles, [plan], [{ ...locked, blocker: 'Need approval' }], monday).blocked, 1)
  assert.equal(buildPlanOverview(profiles, [plan], [{ ...locked, track_status: 'off_track' }], monday).blocked, 1)
  assert.equal(buildPlanOverview(profiles, [plan], [{ ...locked, week_start: '2026-09-07', blocker: 'Old blocker' }], monday).blocked, 0)
})

test('explicit no-blocker answers tolerate case, spacing and punctuation without masking real blockers', () => {
  const locked = { ...pulse, locked_at: '2026-09-14T10:00:00Z' }
  for (const blocker of [null, '', '  ', 'None', '  NONE!  ', 'No blockers', ' no   BLOCKERS. ', 'No—blockers!', 'N/A', ' n / a. ', 'N.A.', 'Not applicable']) {
    assert.equal(planBlockerText(blocker), '', String(blocker))
    assert.equal(planReviewState(plan, { ...locked, blocker }, monday).status, 'on_track', String(blocker))
    assert.equal(planReviewState(plan, { ...locked, blocker, track_status: 'at_risk' }, monday).status, 'at_risk', String(blocker))
    assert.equal(planReviewState(plan, { ...locked, blocker, track_status: 'off_track' }, monday).status, 'blocked', String(blocker))
  }
  for (const blocker of ['Waiting for approval', 'None of the client materials arrived', 'No blockers except awaiting signoff']) {
    assert.equal(planBlockerText(`  ${blocker}  `), blocker)
    assert.equal(planReviewState(plan, { ...locked, blocker }, monday).status, 'blocked')
  }
})

test('future committed plans are upcoming, not current or due', () => {
  const profiles = [{ id: 'one', is_active: true }]
  const future = buildPlanOverview(profiles, [{ ...plan, start_date: '2026-09-15' }], [], monday)
  assert.equal(future.committed, 0)
  assert.equal(future.upcoming, 1)
  assert.equal(future.due, 0)
  const startsToday = buildPlanOverview(profiles, [{ ...plan, start_date: '2026-09-14' }], [], monday)
  assert.equal(startsToday.committed, 1)
  assert.equal(startsToday.upcoming, 0)
  assert.equal(startsToday.due, 1)
})
