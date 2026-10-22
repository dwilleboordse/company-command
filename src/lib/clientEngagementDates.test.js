import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canSetEngagementEnd,
  engagementDateFormValues,
  engagementDatesChanged,
  engagementDatesPayload,
  validateEngagementDates,
} from './clientEngagementDates.js'

const NOW = new Date('2026-10-13T08:00:00.000Z')

test('only a paused roster client can take an end date, like Churn Analysis', () => {
  assert.equal(canSetEngagementEnd(null), false)
  assert.equal(canSetEngagementEnd({ is_active: true, is_archived: false }), false)
  assert.equal(canSetEngagementEnd({ is_active: true, is_archived: true }), true)
})

test('form values load stored dates and drop anything that is not a date', () => {
  assert.deepEqual(engagementDateFormValues(null), { engagement_start: '', engagement_end: '' })
  assert.deepEqual(
    engagementDateFormValues({ engagement_start: '2026-08-01', engagement_end: 'soon' }),
    { engagement_start: '2026-08-01', engagement_end: '' },
  )
})

test('an end date before the start date is refused only where an end date can be set', () => {
  const form = { engagement_start: '2026-09-10', engagement_end: '2026-09-01' }
  assert.equal(validateEngagementDates(form, { canSetEnd: true }), 'The end date cannot be before the start date.')
  assert.equal(validateEngagementDates(form, { canSetEnd: false }), '')
  assert.equal(validateEngagementDates({ engagement_start: '', engagement_end: '2026-09-01' }, { canSetEnd: true }), '')
  assert.equal(validateEngagementDates({ engagement_start: '2026-09-01', engagement_end: '2026-09-01' }, { canSetEnd: true }), '')
})

test('a new active client saves its start date and never an end date', () => {
  const payload = engagementDatesPayload({
    clientId: 'c1',
    form: { engagement_start: '2026-10-13', engagement_end: '2026-12-31' },
    canSetEnd: false,
    profileId: 'p1',
    now: NOW,
  })
  assert.deepEqual(payload, {
    client_id: 'c1',
    engagement_start: '2026-10-13',
    engagement_end: null,
    updated_by: 'p1',
    updated_at: NOW.toISOString(),
  })
})

test('the payload carries only the date columns, so churn reason, retainer and notes survive the upsert', () => {
  const payload = engagementDatesPayload({ clientId: 'c1', form: { engagement_start: '2026-10-13' }, now: NOW })
  assert.deepEqual(Object.keys(payload).sort(), ['client_id', 'engagement_end', 'engagement_start', 'updated_at', 'updated_by'])
})

test('a paused client keeps the end date typed on the form', () => {
  const payload = engagementDatesPayload({
    clientId: 'c2',
    form: { engagement_start: '2026-03-01', engagement_end: '2026-09-30' },
    canSetEnd: true,
    now: NOW,
  })
  assert.equal(payload.engagement_end, '2026-09-30')
})

test('dates count as changed only when the start, or an editable end, differs from the record', () => {
  const record = { engagement_start: '2026-03-01', engagement_end: null }
  assert.equal(engagementDatesChanged(record, { engagement_start: '2026-03-01', engagement_end: '' }, { canSetEnd: false }), false)
  assert.equal(engagementDatesChanged(record, { engagement_start: '2026-03-02', engagement_end: '' }, { canSetEnd: false }), true)
  assert.equal(engagementDatesChanged(record, { engagement_start: '2026-03-01', engagement_end: '2026-09-30' }, { canSetEnd: false }), false)
  assert.equal(engagementDatesChanged(record, { engagement_start: '2026-03-01', engagement_end: '2026-09-30' }, { canSetEnd: true }), true)
  assert.equal(engagementDatesChanged(null, { engagement_start: '', engagement_end: '' }, { canSetEnd: false }), false)
})
