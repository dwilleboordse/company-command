import assert from 'node:assert/strict'
import test from 'node:test'
import { EMPTY_ENTRY, entryDay, entryForm, entryPayload, filterEntries, optionList, validateEntry, yearsOf } from './hrLog.js'

// Made-up people and events only: this repository is public.
const filled = { ...EMPTY_ENTRY, subject: 'Missed weekly call', team_member: 'Test Person', what_happened: 'Did not join the call.' }

test('the form asks for subject, team member and what happened before anything else', () => {
  assert.equal(validateEntry(EMPTY_ENTRY), 'Add a subject.')
  assert.equal(validateEntry({ ...filled, team_member: '  ' }), 'Say which team member this is about.')
  assert.equal(validateEntry({ ...filled, what_happened: '' }), 'Tell what happened.')
  assert.equal(validateEntry(filled), '')
})

test('dates, status, link and lengths are checked the way the database checks them', () => {
  assert.equal(validateEntry({ ...filled, incident_date: '2027-02-30' }), 'The incident date is not a valid date.')
  assert.equal(validateEntry({ ...filled, incident_date: '2027-01-05' }), '', 'a real date passes in any time zone')
  assert.equal(validateEntry({ ...filled, status: 'Closed' }), 'Pick a status: Open, Escalated or No Action.')
  assert.equal(validateEntry({ ...filled, category: ' ' }), 'Pick a category.')
  assert.equal(validateEntry({ ...filled, severity: '' }), 'Pick a severity level.')
  assert.match(validateEntry({ ...filled, slack_link: 'slack.com/archives/x' }), /https:\/\//)
  assert.equal(validateEntry({ ...filled, slack_link: 'https://example.slack.com/archives/C1/p1' }), '')
  assert.match(validateEntry({ ...filled, subject: 'x'.repeat(201) }), /200/)
  assert.match(validateEntry({ ...filled, what_happened: 'x'.repeat(5001) }), /5,000/)
  assert.equal(validateEntry({ ...filled, follow_up: true, follow_up_date: '2027-13-01' }), 'The follow-up date is not a valid date.')
})

test('the saved row is trimmed, empty optional fields are null, and unticked details are dropped', () => {
  const payload = entryPayload({
    ...filled, subject: '  Missed weekly call ', topic_category: '  ', slack_link: '',
    follow_up: false, follow_up_date: '2027-01-10', consequences: false, what_consequences: 'warning', agreements: ' ',
  })
  assert.equal(payload.subject, 'Missed weekly call')
  assert.equal(payload.topic_category, null)
  assert.equal(payload.slack_link, null)
  assert.equal(payload.follow_up_date, null, 'no follow-up date without a follow-up')
  assert.equal(payload.what_consequences, null, 'no consequence text without consequences')
  assert.equal(payload.agreements, null)
  assert.equal(payload.incident_date, null)
  const ticked = entryPayload({ ...filled, follow_up: true, follow_up_date: '2027-01-10', consequences: true, what_consequences: ' Written warning ' })
  assert.deepEqual([ticked.follow_up, ticked.follow_up_date, ticked.consequences, ticked.what_consequences], [true, '2027-01-10', true, 'Written warning'])
  assert.deepEqual(Object.keys(payload).sort(), Object.keys(EMPTY_ENTRY).sort(), 'every form field is saved, nothing else')
})

test('editing starts from the saved row, with nulls as empty fields', () => {
  const form = entryForm({ ...filled, incident_date: null, follow_up: null, slack_link: null, id: 'x', created_at: 'y' })
  assert.equal(form.incident_date, '')
  assert.equal(form.follow_up, false)
  assert.equal(form.slack_link, '')
  assert.equal('id' in form, false)
  assert.deepEqual(entryForm(null), EMPTY_ENTRY)
})

const rows = [
  { id: 1, subject: 'Late to meeting', team_member: 'Test Person', what_happened: 'Late twice', status: 'No Action', category: 'Complaint', incident_date: '2027-01-12', created_at: '2027-01-12T09:00:00Z' },
  { id: 2, subject: 'Great client feedback', team_member: 'Other Person', what_happened: 'Client praised the edit', status: 'No Action', category: 'Compliment', incident_date: null, created_at: '2027-02-01T09:00:00Z' },
  { id: 3, subject: 'Missed deadline', team_member: 'test person ', what_happened: 'Brief late', status: 'Escalated', category: 'complaint', incident_date: '2026-12-30', created_at: '2027-01-02T09:00:00Z' },
]

test('filters by person, status, category, year and text, newest first', () => {
  assert.deepEqual(filterEntries(rows).map(row => row.id), [2, 1, 3], 'no incident date uses the day it was logged')
  assert.deepEqual(filterEntries(rows, { member: 'Test Person' }).map(row => row.id), [1, 3], 'name match ignores case and spaces')
  assert.deepEqual(filterEntries(rows, { status: 'Escalated' }).map(row => row.id), [3])
  assert.deepEqual(filterEntries(rows, { category: 'Complaint' }).map(row => row.id), [1, 3])
  assert.deepEqual(filterEntries(rows, { year: '2027' }).map(row => row.id), [2, 1])
  assert.deepEqual(filterEntries(rows, { search: 'CLIENT' }).map(row => row.id), [2])
  assert.equal(entryDay({ created_at: null, incident_date: null }), '')
  assert.deepEqual(yearsOf(rows), ['2027', '2026'])
})

test('option lists keep the form defaults first and add what was typed before, once', () => {
  assert.deepEqual(optionList(['Complaint', 'Compliment', 'Leave of Absence'], rows, 'category'), ['Complaint', 'Compliment', 'Leave of Absence'])
  assert.deepEqual(optionList(['Minor'], [{ severity: 'Major' }, { severity: 'minor' }, { severity: ' Major ' }, {}], 'severity'), ['Minor', 'Major'])
})
