import assert from 'node:assert/strict'
import test from 'node:test'
import {
  graduationChecks, incubatorMonthLabel, incubatorRoster, latestLogged, taskProgress, weeklyTimeline,
} from './incubator.js'

// Stress test: random and messy data shaped like the real tables (nulls, odd statuses, legacy dates,
// numbers stored as text, rows for clients that no longer exist) must never throw, and the page's
// numbers must stay consistent. A fixed seed keeps a failure reproducible.
function random(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
}
const rnd = random(16102026)
const pick = list => list[Math.floor(rnd() * list.length)]
const maybe = (value, chance = 0.2) => (rnd() < chance ? pick([null, undefined, '']) : value)
const pad = n => String(n).padStart(2, '0')
const day = (from = 2025) => `${from + Math.floor(rnd() * 3)}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 28))}`
const oddDay = () => (rnd() < 0.85 ? day() : pick([null, '', 'n/a', '2026-02-30', '2026-13-01']))
const STATUSES = ['to do', 'in progress', 'needs edits', 'approved', 'sent to client', 'paused', 'ready for review', 'not launched', 'review es', '']

function randomData() {
  const clients = Array.from({ length: Math.floor(rnd() * 30) }, (_, i) => ({
    id: `c${i}`, name: `Client ${i}`, is_active: pick([true, true, false, null]), is_archived: pick([false, false, true, null]),
  }))
  const ids = [...clients.map(c => c.id), 'gone-1', 'gone-2']
  const profiles = Object.fromEntries(clients.filter(() => rnd() < 0.85).map(c => [c.id, { engagement_start: oddDay() }]))
  const memberships = ids.filter(() => rnd() < 0.25).map(id => ({
    client_id: id, status: pick(['active', 'graduated', 'active']), note: maybe('reason'), graduated_at: maybe('2026-10-06T22:30:00Z', 0.5),
  }))
  const health = Array.from({ length: Math.floor(rnd() * 60) }, () => ({
    client_id: pick(ids), week_start: day(2026), churn_risk: maybe(pick(['Low', 'Medium', 'High', 'Leaving', 'low', 'Unknown'])),
    communication: maybe(pick([0, 1, 2, 3, 4, 5, 6, -1, '3', '4.5', 'x'])), notes: maybe('note'),
  }))
  const spend = Array.from({ length: Math.floor(rnd() * 60) }, () => ({
    client_id: pick(ids), week_start: day(2026), ddu_spend: maybe(pick([0, 120.5, 3000, '250.5', -10, 'abc'])), total_spend: maybe(pick([0, 5000, '1000', -5])),
  }))
  const tasks = Array.from({ length: Math.floor(rnd() * 80) }, (_, i) => ({
    task_id: `t${i}`, client_id: pick(ids), name: `Task ${i}`, status: pick(STATUSES), due_date: maybe(day(2026), 0.3),
    closed_at: maybe('2026-10-09T10:00:00Z', 0.6), url: maybe('https://app.clickup.com/t/x'), assignees: pick([[], ['A'], null]),
  }))
  const goals = ids.filter(() => rnd() < 0.3).map((id, i) => ({ id: `g${i}`, client_id: id, metric: 'ROAS', target: maybe('2.5') }))
  const actions = Array.from({ length: Math.floor(rnd() * 20) }, (_, i) => ({ id: `a${i}`, client_id: maybe(pick(ids), 0.1), action_text: 'x', is_done: pick([true, false, null]) }))
  return { clients, profiles, memberships, health, spend, tasks, goals, actions }
}

const group = rows => rows.reduce((all, row) => { (all[row.client_id] ||= []).push(row); return all }, {})

test('everything the Incubator page calculates survives 500 random data sets', () => {
  for (let round = 0; round < 500; round++) {
    const data = randomData()
    const today = pick(['2026-10-16', '2026-10-15', '2026-01-01', '2026-12-31', day(2026)])
    const lastWeek = pick(['2026-10-05', '2026-09-28', '2026-01-05'])
    const roster = incubatorRoster({ clients: data.clients, profiles: data.profiles, memberships: data.memberships, today })
    const placed = roster.members.length + roster.graduated.length + roster.undated.length + roster.upcoming.length
    assert.ok(placed <= data.clients.length, 'no client is listed twice')
    const health = group(data.health), spend = group(data.spend), tasks = group(data.tasks)
    const goals = group(data.goals), actions = group(data.actions)
    for (const member of roster.members) {
      const id = member.client.id
      assert.ok(['overdue', 'review', 'support', 'active'].includes(member.stage), `stage ${member.stage}`)
      assert.equal(typeof incubatorMonthLabel(member.band), 'string')
      // The row text the page builds: start date, tenure and month.
      if (member.start && member.tenure != null) assert.ok(Number.isFinite(member.tenure))
      const timeline = weeklyTimeline({ health: health[id] || [], spend: spend[id] || [], lastWeek, weeks: 8 })
      assert.ok(timeline.length >= 8)
      for (const row of timeline) if (row.share != null) assert.ok(Number.isFinite(row.share))
      const progress = tasks[id] ? taskProgress(tasks[id], today) : null
      if (progress) {
        assert.ok(progress.done + progress.open === progress.total)
        assert.ok(progress.delayed.length <= progress.open)
        assert.ok(progress.percent == null || (progress.percent >= 0 && progress.percent <= 100))
      }
      const checks = graduationChecks({ timeline, tasks: progress, goals: goals[id] || [], actions: actions[id] || [] })
      assert.equal(checks.length, 6)
      for (const check of checks) assert.ok([true, false, null].includes(check.pass))
      latestLogged(timeline, 'risk'); latestLogged(timeline, 'relationship'); latestLogged(timeline, 'ddu')
    }
    for (const entry of roster.upcoming) assert.ok(entry.start > today)
  }
})
