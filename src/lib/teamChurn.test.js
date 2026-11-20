import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeTeamChurn,
  churnRate,
  daysInPeriod,
  leaversByMonth,
  leftInPeriod,
  monthsStayed,
  tenurePayload,
  validateTenure,
} from './teamChurn.js'

const YEAR_2025 = { start: '2025-01-01', end: '2025-12-31' }

const person = (full_name, department, start_date, end_date = null, exit_type = null) =>
  ({ full_name, department, start_date, end_date, exit_type })

test('days on the team are clipped to the period and include both ends', () => {
  assert.equal(daysInPeriod(person('A', 'designers', '2024-06-01'), YEAR_2025), 365)
  assert.equal(daysInPeriod(person('B', 'designers', '2025-12-31'), YEAR_2025), 1)
  assert.equal(daysInPeriod(person('C', 'designers', '2025-03-01', '2025-03-31'), YEAR_2025), 31)
  assert.equal(daysInPeriod(person('D', 'designers', '2026-01-05'), YEAR_2025), 0)
  assert.equal(daysInPeriod(person('E', 'designers', '2023-01-01', '2024-12-31'), YEAR_2025), 0)
})

test('someone without a start date counts as a leaver but not in the headcount', () => {
  const noStart = person('No Start Date', 'unknown', null, '2025-12-10', 'fired')
  assert.equal(daysInPeriod(noStart, YEAR_2025), 0)
  assert.equal(leftInPeriod(noStart, YEAR_2025), true)
  assert.equal(monthsStayed(noStart), null)
})

test('months stayed use 30.4375-day months like client tenure', () => {
  assert.equal(monthsStayed(person('A', 'designers', '2025-01-01', '2025-01-01')), 0)
  assert.equal(monthsStayed(person('A', 'designers', '2025-01-01', '2026-01-01')).toFixed(2), (365 / 30.4375).toFixed(2))
  assert.equal(monthsStayed(person('A', 'designers', '2025-01-01')), null)
})

test('a full year: churn = leavers ÷ average headcount, fired/quit/unknown split, stays of leavers only', () => {
  const members = [
    person('Stayer', 'media_buyers', '2024-01-01'),
    person('Left in March', 'media_buyers', '2024-07-01', '2025-03-31', 'quit'),
    person('Left in June', 'media_buyers', '2025-02-01', '2025-06-30'),
    person('Left in 2026', 'media_buyers', '2024-05-01', '2026-02-01', 'fired'),
    person('Video', 'video_editors', '2025-01-01'),
    person('VA', 'other', '2024-01-01', '2025-05-01', 'quit'),
  ]
  const result = analyzeTeamChurn(members, YEAR_2025)
  const mb = result.teams.find(team => team.value === 'media_buyers')
  const personDays = 365 + 90 + 150 + 365
  assert.equal(result.periodDays, 365)
  assert.equal(mb.people, 4)
  assert.equal(mb.left, 2)
  assert.equal(mb.avgHeadcount.toFixed(4), (personDays / 365).toFixed(4))
  assert.equal(mb.churnRate.toFixed(4), (2 / (personDays / 365) * 100).toFixed(4))
  assert.deepEqual([mb.fired, mb.quit, mb.unknown], [0, 1, 1])
  assert.deepEqual(mb.leavers.map(member => member.full_name), ['Left in March', 'Left in June'])
  assert.equal(mb.knownStays, 2)

  const video = result.teams.find(team => team.value === 'video_editors')
  assert.equal(video.churnRate, 0)
  assert.equal(video.avgMonths, null)
  assert.equal(result.teams.find(team => team.value === 'designers').churnRate, null)

  // Other roles stay out of the four-team total and the ranking.
  assert.equal(result.total.left, 2)
  assert.equal(result.total.people, 5)
  assert.equal(result.others.find(group => group.value === 'other').left, 1)
  assert.deepEqual(result.ranked.map(team => team.value), ['media_buyers', 'video_editors'])
})

test('short periods show the plain rate for the period, not a rate scaled up to a year', () => {
  assert.equal(churnRate(1, 8), 12.5)
  assert.equal(churnRate(0, 8), 0)
  assert.equal(churnRate(2, 0), null)
  // 8 people on the team for all 28 days, one of them leaving on the last day: 1 ÷ 8 = 12.5%, not ~163% a year.
  const fourWeeks = { start: '2026-10-25', end: '2026-11-21' }
  const members = Array.from({ length: 8 }, (_, index) =>
    person(`P${index}`, 'designers', '2026-01-01', index === 0 ? '2026-11-21' : null, index === 0 ? 'quit' : null))
  const designers = analyzeTeamChurn(members, fourWeeks).teams.find(team => team.value === 'designers')
  assert.equal(designers.avgHeadcount, 8)
  assert.equal(designers.churnRate, 12.5)
})

test('someone rehired in the period is one person but two exits', () => {
  const stints = [
    person('Rehired Editor', 'video_editors', '2025-09-14', '2026-02-12', 'fired'),
    person('Rehired Editor', 'video_editors', '2026-03-16', '2026-05-08', 'quit'),
    person('Other Editor', 'video_editors', '2026-01-01'),
  ]
  const editors = analyzeTeamChurn(stints, { start: '2026-01-01', end: '2026-06-30' }).teams.find(team => team.value === 'video_editors')
  assert.equal(editors.people, 2)
  assert.equal(editors.left, 2)
  assert.deepEqual([editors.fired, editors.quit], [1, 1])
})

test('an empty or broken period gives nothing instead of dividing by zero', () => {
  const result = analyzeTeamChurn([person('A', 'designers', '2025-01-01')], { start: '2025-02-01', end: '2025-01-01' })
  assert.equal(result.periodDays, 0)
  assert.deepEqual(result.teams, [])
})

test('leavers per month land in the month of their last working day', () => {
  const rows = leaversByMonth([
    person('A', 'designers', '2024-01-01', '2025-01-31', 'quit'),
    person('B', 'designers', '2024-01-01', '2025-02-01'),
    person('C', 'creative_strategists', '2024-01-01', '2025-02-15', 'fired'),
  ], { start: '2025-01-01', end: '2025-03-31' })
  assert.equal(rows.length, 3)
  assert.equal(rows[0].designers, 1)
  assert.equal(rows[1].designers, 1)
  assert.equal(rows[1].creative_strategists, 1)
  assert.equal(rows[2].designers + rows[2].creative_strategists, 0)
})

test('the edit form refuses impossible records and saves clean values', () => {
  const ok = { full_name: ' Test Person ', department: 'video_editors', start_date: '2025-01-01', end_date: '', exit_type: 'fired', notes: '  ' }
  assert.equal(validateTenure({ ...ok, full_name: ' ' }), 'Add a name.')
  assert.equal(validateTenure({ ...ok, department: 'sales' }), 'Pick a team.')
  assert.equal(validateTenure({ ...ok, end_date: '2024-12-31' }), 'The last working day cannot be before the start date.')
  assert.equal(validateTenure(ok), 'Add the last working day before marking fired or quit.')
  assert.equal(validateTenure({ ...ok, exit_type: '' }), '')
  assert.deepEqual(tenurePayload(ok), {
    full_name: 'Test Person', department: 'video_editors', start_date: '2025-01-01', end_date: null, exit_type: null, notes: null,
  })
  assert.equal(tenurePayload({ ...ok, end_date: '2025-11-18' }).exit_type, 'fired')
})
