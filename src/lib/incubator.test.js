import assert from 'node:assert/strict'
import test from 'node:test'
import { tenureBand, tenureMonths } from './churnTenure.js'
import { graduationChecks, incubatorRoster, taskProgress, weeklyTimeline } from './incubator.js'

const today = new Date(2026, 9, 6)

test('month bands follow the tenure shown in the client table', () => {
  assert.equal(tenureBand('2026-04-17', '2026-05-17'), 1, '30 days shows as 1.0 mo')
  assert.equal(tenureBand('2026-04-17', '2026-05-16'), 1, '29 days is 0.95 mo, shown as 1.0')
  assert.equal(tenureBand('2026-04-17', '2026-05-15'), 0)
  assert.equal(tenureBand('2026-02-16', '2026-05-16'), 2, 'three calendar months over February shows 2.9 mo')
  assert.equal(tenureBand('2026-03-12', '2026-06-12'), 3)
  assert.equal(tenureMonths('2026-06-12', '2026-03-12'), null)
  assert.equal(tenureBand('', '2026-03-12'), null)
})

test('the roster takes months 0–3, keeps month 4 as review overdue, and lets memberships override', () => {
  const clients = [
    ['new', '2026-09-20'], ['m2', '2026-08-01'], ['m3', '2026-06-30'], ['m4', '2026-05-30'], ['old', '2025-01-01'],
    ['kept', '2025-01-01'], ['done', '2026-08-01'], ['nodate', null], ['past', '2026-09-01'], ['paused', '2026-09-01'],
  ].map(([id, start]) => ({ id, name: id, is_active: id !== 'past', is_archived: id === 'paused', start }))
  const profiles = Object.fromEntries(clients.map(client => [client.id, { engagement_start: client.start }]))
  const memberships = [{ client_id: 'kept', status: 'active' }, { client_id: 'done', status: 'graduated' }]
  const roster = incubatorRoster({ clients, profiles, memberships, today })
  assert.deepEqual(roster.members.map(row => [row.client.id, row.band, row.stage, row.reason]), [
    ['m4', 4, 'overdue', 'new'], ['m3', 3, 'review', 'new'], ['kept', 21, 'support', 'manual'],
    ['m2', 2, 'active', 'new'], ['new', 0, 'active', 'new'],
  ])
  assert.deepEqual(roster.graduated.map(row => row.client.id), ['done'])
  assert.deepEqual(roster.undated.map(row => row.client.id), ['nodate'])
})

test('the weekly timeline keeps gaps and legacy dates and compares with the previous logged week', () => {
  const health = [
    { week_start: '2026-08-30', churn_risk: 'Low', communication: 5 },
    { week_start: '2026-09-07', churn_risk: 'High', communication: 0 },
    { week_start: '2026-09-28', churn_risk: 'Medium', communication: 3 },
  ]
  const spend = [
    { week_start: '2026-09-21', ddu_spend: 100, total_spend: 400 },
    { week_start: '2026-09-28', ddu_spend: 150, total_spend: 300 },
  ]
  const rows = weeklyTimeline({ health, spend, lastWeek: '2026-09-28', weeks: 6 })
  assert.deepEqual(rows.map(row => row.week), ['2026-09-28', '2026-09-21', '2026-09-14', '2026-09-07', '2026-08-31', '2026-08-30', '2026-08-24'])
  assert.deepEqual(rows.filter(row => row.legacy).map(row => row.week), ['2026-08-30'])
  assert.equal(weeklyTimeline({ health, lastWeek: '2026-09-28', weeks: 5 }).some(row => row.week === '2026-08-30'), false,
    'a Sunday before the first Monday is outside the window')
  const [latest] = rows
  assert.equal(latest.riskChange, -1, 'Medium after High is one step better')
  assert.equal(latest.comparedTo.risk, '2026-09-07')
  assert.equal(latest.relationshipChange, -2, 'a 0 score is not scored, so 3 compares with the 5 from 30 Aug')
  assert.equal(latest.comparedTo.relationship, '2026-08-30')
  assert.equal(latest.dduChange, 50)
  assert.equal(latest.share, 50)
  assert.equal(rows[2].healthLogged, false)
  assert.equal(rows[2].spendLogged, false)
})

test('task progress counts delivered work and flags only open, unpaused, past-due tasks', () => {
  const tasks = [
    { name: 'a', status: 'sent to client', due_date: '2026-09-01' },
    { name: 'b', status: 'approved', due_date: '2026-09-01' },
    { name: 'c', status: 'needs edits', due_date: '2026-10-01' },
    { name: 'd', status: 'paused', due_date: '2026-09-01' },
    { name: 'e', status: 'in progress', due_date: '2026-10-06' },
    { name: 'f', status: 'not started', due_date: null },
  ]
  const progress = taskProgress(tasks, today)
  assert.equal(progress.done, 2)
  assert.equal(progress.open, 4)
  assert.deepEqual(progress.delayed.map(task => task.name), ['c'])
  assert.equal(progress.undated, 1)
  assert.equal(Math.round(progress.percent), 33)
})

test('graduation checks report missing data as unknown instead of failing', () => {
  const checks = graduationChecks({ timeline: [], tasks: null, goals: [], actions: [] })
  assert.deepEqual(checks.map(check => check.pass), [null, null, null, null, false, null])
})

test('action items pass only when there are some and all are done', () => {
  const pass = actions => graduationChecks({ timeline: [], tasks: null, actions }).find(check => check.key === 'actions').pass
  assert.equal(pass([]), null)
  assert.equal(pass([{ is_done: true }, { is_done: false }]), false)
  assert.equal(pass([{ is_done: true }]), true)
})

test('a day key gives the same month to every viewer, whatever their time zone', () => {
  const clients = [{ id: 'x', name: 'Edge' }]
  const profiles = { x: { engagement_start: '2026-09-16' } }
  // 29 days (15 Oct) shows as 1.0 mo, so month 1; 28 days (14 Oct) shows as 0.9 mo, still under 1 month.
  assert.equal(incubatorRoster({ clients, profiles, today: '2026-10-15' }).members[0].band, 1)
  assert.equal(incubatorRoster({ clients, profiles, today: '2026-10-14' }).members[0].band, 0)
  assert.deepEqual(incubatorRoster({ clients, profiles: { x: { engagement_start: '2026-10-17' } }, today: '2026-10-16' }).upcoming.map(e => e.client.id), ['x'])
  const tasks = [{ task_id: 't', name: 'Due 15 Oct', status: 'in progress', due_date: '2026-10-15' }]
  assert.equal(taskProgress(tasks, '2026-10-15').delayed.length, 0)
  assert.equal(taskProgress(tasks, '2026-10-16').delayed.length, 1)
})

test('a client with a start date after today is upcoming, not undated', () => {
  const clients = [{ id: 'f', name: 'Future' }, { id: 'n', name: 'No date' }, { id: 'm', name: 'Moved' }]
  const profiles = { f: { engagement_start: '2026-10-20' }, m: { engagement_start: '2026-11-02' } }
  const roster = incubatorRoster({ clients, profiles, memberships: [{ client_id: 'm', status: 'active' }], today: new Date(2026, 9, 16) })
  assert.deepEqual(roster.upcoming.map(entry => entry.client.id), ['f'])
  assert.deepEqual(roster.undated.map(entry => entry.client.id), ['n'])
  const moved = roster.members.find(entry => entry.client.id === 'm')
  assert.equal(moved.stage, 'support')
  assert.equal(moved.tenure, null)
  assert.equal(moved.notStarted, true)
})
