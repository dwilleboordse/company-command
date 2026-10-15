import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeChurnTenure, partnershipMonth, tenureBand, tenureMonths } from './churnTenure.js'

// Stress test: thousands of random and malformed inputs must never throw, and every result must stay
// within its rules. A fixed seed keeps a failure reproducible.
function random(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
}
const rnd = random(20261016)
const pick = list => list[Math.floor(rnd() * list.length)]
const pad = n => String(n).padStart(2, '0')
const randomDay = () => `${2023 + Math.floor(rnd() * 5)}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 31))}`
const oddValue = () => pick([null, undefined, '', 'not a date', '2026-02-30', '2026-13-01', '2026-1-5', '2026-10-16T08:00:00Z', 0, 20261016, {}, [], NaN])
const anyDate = () => (rnd() < 0.75 ? randomDay() : oddValue())

test('tenure helpers never throw and stay in range on random and malformed dates', () => {
  for (let i = 0; i < 20000; i++) {
    const start = anyDate(), end = anyDate()
    const months = tenureMonths(start, end)
    const band = tenureBand(start, end)
    const calendar = partnershipMonth(start, end)
    if (months == null) {
      assert.equal(band, null)
    } else {
      assert.ok(Number.isFinite(months) && months >= 0, `months ${months} for ${start} → ${end}`)
      assert.ok(Number.isInteger(band) && band >= 0, `band ${band}`)
      assert.ok(band <= months + 0.05, `band ${band} cannot exceed the rounded tenure ${months}`)
    }
    assert.ok(calendar == null || (Number.isInteger(calendar) && calendar >= 1))
  }
})

test('analyzeChurnTenure never throws on messy client records, and its counts add up', () => {
  for (let round = 0; round < 300; round++) {
    const clients = Array.from({ length: Math.floor(rnd() * 40) }, (_, i) => ({
      id: `c${i}`, name: `Client ${pick(['A', 'b', 'Ä', '1', ' '])}${i}`, is_active: pick([true, false, false, null]),
    }))
    const records = Object.fromEntries(clients.filter(() => rnd() < 0.85).map(client => [client.id, {
      engagement_start: anyDate(), engagement_end: rnd() < 0.8 ? anyDate() : null,
    }]))
    const start = randomDay(), end = randomDay()
    const period = { start: start < end ? start : end, end: start < end ? end : start, dateLabel: 'x' }
    const result = analyzeChurnTenure(clients, records, period, new Date(2026, 9, 16))
    assert.ok(result.exits.length + result.missingStartCount === result.selectedCount)
    for (const exit of result.exits) assert.ok(tenureMonths(exit.start, exit.end) != null || exit.month != null)
    // The four early churn cards only count exits that have a valid band.
    const counted = [0, 1, 2, 3].map(band => result.exits.filter(exit => tenureBand(exit.start, exit.end) === band).length)
    assert.ok(counted.reduce((a, b) => a + b, 0) <= result.exits.length)
  }
})
