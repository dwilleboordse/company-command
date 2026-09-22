import test from 'node:test'
import assert from 'node:assert/strict'
import { CREATIVE_RESULT_COUNTS, creativeResultsBreakdown, creativeResultsPeriod, newCreativeResults,
  summarizeCreativeResults, validateCreativeResults, winnerBenchmark } from './creativeLeadershipResults.js'
import { newClientReview, validateCreativeReview } from './creativeLeadership.js'

const logged = (eligible = 100, winners = 8, supers = 3) => ({ ...newCreativeResults(), status: 'logged', eligible_ads: eligible,
  winners, super_winners: supers, blocked_ads: 0, inconclusive_ads: 0, evidence_url: 'https://docs.google.com/spreadsheets/d/example' })
const noTests = () => ({ ...logged(0, 0, 0), status: 'no_tests' })
const client = (id = 'a', strategist = 'cs-a') => ({ id, name: `Client ${id}`, cs_ids: [strategist], assigned_cs_id: strategist,
  strategist_names: [{ id: strategist, name: strategist.toUpperCase() }] })
const review = (week = '2026-09-14', rows = [{ client: client(), results: logged() }], patch = {}) => ({ id: `review-${week}`, week_start: week,
  status: 'finalized', finalized_at: '2026-09-22T10:00:00Z', results_version: 1,
  client_snapshot: rows.map(row => row.client), client_reviews: rows.map(row => ({ client_id: row.client.id, results: row.results })), ...patch })
const submission = { required: true, submission: true }

test('new results are explicitly missing and do not silently record zero', () => {
  const value = newCreativeResults()
  for (const key of CREATIVE_RESULT_COUNTS) assert.equal(value[key], null)
  assert.equal(value.status, 'not_entered')
  assert.equal(validateCreativeResults(value), '')
  assert.match(validateCreativeResults(value, submission), /Choose a results status/)
  assert.equal(validateCreativeResults(undefined), '')
  assert.match(validateCreativeResults(undefined, submission), /Choose a results status/)
  assert.match(validateCreativeResults(value, { submission: true }), /Choose a results status/)
  assert.equal(validateCreativeResults(undefined, { submission: true }), '')
  assert.equal(validateCreativeResults({}), '')
  assert.match(validateCreativeResults({}, { submission: true }), /Choose a results status/)
  assert.match(validateCreativeResults(null), /structured record/)
})

test('draft results can be incomplete but nonempty invalid values are never accepted', () => {
  const incomplete = { ...newCreativeResults(), status: 'logged', eligible_ads: 20 }
  assert.equal(validateCreativeResults(incomplete), '')
  assert.match(validateCreativeResults(incomplete, submission), /all five result counts/)
  for (const value of [-1, 1.2, NaN, Infinity, '12', '', {}, [], true, 1000001, Number.MAX_SAFE_INTEGER + 1]) {
    assert.match(validateCreativeResults({ ...incomplete, winners: value }), /whole number/)
  }
  for (const value of [null, undefined]) assert.equal(validateCreativeResults({ ...incomplete, winners: value }), '')
  assert.equal(validateCreativeResults(logged(1000000, 1000000, 1000000), submission), '')
})

test('submitted logged results require five exact counts, subset checks and source evidence', () => {
  assert.equal(validateCreativeResults(logged(), submission), '')
  for (const key of CREATIVE_RESULT_COUNTS) {
    assert.match(validateCreativeResults({ ...logged(), [key]: null }, submission), /all five result counts/)
  }
  assert.match(validateCreativeResults(logged(100, 101, 2), submission), /Winners cannot exceed/)
  assert.match(validateCreativeResults(logged(100, 5, 6), submission), /subset/)
  assert.match(validateCreativeResults(logged(0, 0, 0), submission), /at least one eligible/)
  assert.match(validateCreativeResults({ ...logged(), evidence_url: '' }, submission), /source sheet/)
})

test('no-tests reporting has explicit zeros but can track blocked and inconclusive exclusions', () => {
  const value = { ...noTests(), blocked_ads: 5, inconclusive_ads: 3 }
  assert.equal(validateCreativeResults(value, submission), '')
  for (const key of ['eligible_ads', 'winners', 'super_winners']) assert.notEqual(validateCreativeResults({ ...value, [key]: 1 }), '')
  assert.match(validateCreativeResults({ ...value, blocked_ads: null }, submission), /all five/)
  const sum = summarizeCreativeResults([review('2026-09-14', [{ client: client(), results: value }])])
  assert.equal(sum.eligible_ads, 0)
  assert.equal(sum.blocked_ads, 5)
  assert.equal(sum.inconclusive_ads, 3)
  assert.equal(sum.winner_rate, null)
  assert.equal(sum.super_winner_rate, null)
  assert.equal(sum.no_tests_clients, 1)
  assert.equal(sum.coverage, 100)
})

test('unavailable means no counts, a reason, and no inferred poor performance', () => {
  const unavailable = { ...newCreativeResults(), status: 'unavailable', notes: 'Awaiting the account report' }
  assert.equal(validateCreativeResults(unavailable, submission), '')
  assert.match(validateCreativeResults({ ...unavailable, notes: '' }, submission), /Explain why/)
  for (const key of CREATIVE_RESULT_COUNTS) {
    assert.match(validateCreativeResults({ ...unavailable, [key]: 0 }, submission), /blank, not zero/)
    assert.match(validateCreativeResults({ ...unavailable, [key]: undefined }, submission), /blank, not zero/)
  }
  const sum = summarizeCreativeResults([review('2026-09-14', [{ client: client(), results: unavailable }])])
  assert.equal(sum.unavailable_clients, 1)
  assert.equal(sum.reviewed_clients, 1)
  assert.equal(sum.recorded_clients, 0)
  assert.equal(sum.eligible_ads, null)
  assert.equal(sum.winner_rate, null)
  assert.equal(sum.coverage, 0)
})

test('result evidence rejects unsafe protocols, credentials and malformed text', () => {
  for (const evidence_url of ['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/a', 'https://user:pass@example.com', 'http://user@example.com', 12, null,
    ' https://example.com', 'https://example.com ', 'https://example.com/a b', 'https://example.com/\\path', 'https://exam\nple.com', ' ', 'https://example.com/' + 'a'.repeat(2000)]) {
    assert.match(validateCreativeResults({ ...logged(), evidence_url }), /http\(s\)/)
  }
  assert.equal(validateCreativeResults({ ...logged(), evidence_url: 'http://example.com/sheet' }, submission), '')
  assert.match(validateCreativeResults({ ...logged(), notes: 'a'.repeat(6001) }), /6,000/)
  assert.match(validateCreativeResults({ ...logged(), notes: {} }), /text/)
  assert.match(validateCreativeResults({ ...logged(), notes: null }), /text/)
  assert.match(validateCreativeResults({ ...logged(), status: null }), /status/)
  assert.match(validateCreativeResults({ ...logged(), unknown: 'field' }), /unsupported field/)
  for (const value of [[], 'bad', 1, false]) assert.match(validateCreativeResults(value), /structured record/)
  assert.match(validateCreativeResults({ ...logged(), status: 'good' }), /valid results status/)
})

test('subset checks also apply to incomplete or not-entered drafts', () => {
  assert.match(validateCreativeResults({ ...newCreativeResults(), eligible_ads: 3, winners: 4 }), /cannot exceed/)
  assert.match(validateCreativeResults({ eligible_ads: 5, winners: 1, super_winners: 2 }), /subset/)
  assert.equal(validateCreativeResults({ eligible_ads: 5, winners: null }), '')
})

test('new reviews require explicit result statuses while legacy reviews remain submittable', () => {
  const cleanRow = { ...newClientReview(client()), quality_status: 'on_track', research_check: 'pass', brief_check: 'pass',
    signoff_check: 'pass', learning_check: 'pass', growth_guide_status: 'updated', next_tests: 'Try another premise', evidence_url: 'https://example.com/guide' }
  const legacyRow = { ...cleanRow }
  delete legacyRow.results
  const value = { summary: 'Team review', client_snapshot: [client()], client_reviews: [legacyRow] }
  assert.equal(validateCreativeReview(value), '')
  assert.equal(validateCreativeReview({ ...value, results_version: 0 }), '')
  assert.match(validateCreativeReview({ ...value, results_version: 0, client_reviews: [cleanRow] }), /Choose a results status/)
  assert.match(validateCreativeReview({ ...value, results_version: 1 }), /Choose a results status/)
  assert.equal(validateCreativeReview({ ...value, results_version: 1, client_reviews: [{ ...cleanRow, results: logged() }] }), '')
  assert.match(validateCreativeReview({ ...value, results_version: 0, client_reviews: [{ ...cleanRow, results: logged(100, 2, 3) }] }), /subset/)
})

test('portfolio rates use eligible-ad weighting and finalized client-week coverage', () => {
  const first = review('2026-09-07', [{ client: client('a'), results: logged(10, 2, 1) }, { client: client('b'), results: logged(90, 3, 1) }])
  const second = review('2026-09-14', [{ client: client('a'), results: noTests() }, { client: client('b'), results: null }])
  const sum = summarizeCreativeResults([first, second, review('2026-08-31', undefined, { status: 'submitted' }), review('2026-08-24', undefined, { status: 'draft' })])
  assert.equal(sum.eligible_ads, 100)
  assert.equal(sum.winners, 5)
  assert.equal(sum.super_winners, 2)
  assert.equal(sum.winner_rate, 5)
  assert.equal(sum.super_winner_rate, 2)
  assert.equal(sum.total_clients, 4)
  assert.equal(sum.unique_clients, 2)
  assert.equal(sum.recorded_clients, 3)
  assert.equal(sum.missing_clients, 1)
  assert.equal(sum.coverage, 75)
  assert.equal(sum.review_count, 2)
})

test('incomplete and invalid finalized results do not affect counts or denominators', () => {
  const rows = [
    { client: client('a'), results: newCreativeResults() },
    { client: client('b'), results: { ...logged(), eligible_ads: null } },
    { client: client('c'), results: { ...newCreativeResults(), eligible_ads: -1 } },
    { client: client('d'), results: { ...newCreativeResults(), status: 'unavailable', notes: 'Pending source' } },
  ]
  const sum = summarizeCreativeResults([review('2026-09-14', rows)])
  assert.equal(sum.missing_clients, 1)
  assert.equal(sum.invalid_clients, 2)
  assert.equal(sum.unavailable_clients, 1)
  assert.equal(sum.eligible_ads, null)
  assert.equal(sum.winners, null)
  assert.equal(sum.winner_rate, null)
  const empty = summarizeCreativeResults([])
  assert.equal(empty.coverage, null)
  assert.equal(empty.eligible_ads, null)
  assert.equal(empty.total_clients, 0)
})

test('shared clients count once in portfolio and fully for each captured strategist with attribution labels', () => {
  const shared = { ...client(), cs_ids: ['cs-a', 'cs-b', 'cs-a'], assigned_cs_id: 'cs-a', strategist_names: [{ id: 'cs-a', name: 'A' }, { id: 'cs-b', name: 'B' }] }
  const data = [review('2026-09-14', [{ client: shared, results: logged() }])]
  assert.equal(summarizeCreativeResults(data).eligible_ads, 100)
  const people = creativeResultsBreakdown(data, { groupBy: 'strategist' })
  assert.equal(people.length, 2)
  for (const person of people) {
    assert.equal(person.eligible_ads, 100)
    assert.equal(person.shared_attribution, true)
    assert.match(person.attribution, /non-additive/)
    assert.deepEqual(person.client_ids, ['a'])
  }
  assert.equal(creativeResultsBreakdown(data, { groupBy: 'client' }).length, 1)
})

test('captured strategist assignment changes remain attached to their respective weeks', () => {
  const data = [review('2026-09-07', [{ client: client('a', 'cs-a'), results: logged(10, 1, 0) }]),
    review('2026-09-14', [{ client: client('a', 'cs-b'), results: logged(100, 8, 3) }])]
  const people = creativeResultsBreakdown(data, { groupBy: 'strategist' })
  assert.equal(people.find(person => person.id === 'cs-a').eligible_ads, 10)
  assert.equal(people.find(person => person.id === 'cs-b').eligible_ads, 100)
  assert.equal(creativeResultsBreakdown(data, { groupBy: 'client' })[0].eligible_ads, 110)
  const unassigned = review('2026-09-14', [{ client: { id: 'z', name: 'Z' }, results: logged() }])
  assert.equal(creativeResultsBreakdown([unassigned], { groupBy: 'strategist' })[0].id, 'unassigned')
})

test('duplicate client-week lead records count once using latest finalized snapshot', () => {
  const older = review('2026-09-14', [{ client: client(), results: logged(200, 20, 8) }], { id: 'older', finalized_at: '2026-09-21T08:00:00Z' })
  const newer = review('2026-09-14', [{ client: client(), results: logged(100, 8, 3) }], { id: 'newer' })
  for (const data of [[older, newer], [newer, older], [newer, newer]]) {
    assert.equal(summarizeCreativeResults(data).eligible_ads, 100)
    assert.equal(summarizeCreativeResults(data).total_clients, 1)
  }
  const duplicateRows = { ...newer, client_reviews: [...newer.client_reviews, ...newer.client_reviews] }
  assert.equal(summarizeCreativeResults([duplicateRows]).invalid_clients, 1)
})

test('monthly reporting buckets by Monday, ignores submitted records and excludes incomplete weeks', () => {
  const data = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].map(week => review(week))
  data.push(review('2026-09-07', undefined, { id: 'submitted', status: 'submitted' }))
  data.push(review('2026-09-15'))
  assert.deepEqual(creativeResultsPeriod(data, { mode: 'month', month: '2026-09', asOf: '2026-09-22' }).map(row => row.week_start), ['2026-09-07', '2026-09-14'])
  assert.deepEqual(creativeResultsPeriod(data, { mode: 'month', month: '2026-08', asOf: '2026-09-22' }).map(row => row.week_start), ['2026-08-31'])
  assert.deepEqual(creativeResultsPeriod(data, { month: '2026-13', asOf: '2026-09-22' }), [])
  assert.deepEqual(creativeResultsPeriod(data, { month: '2026-09', asOf: 'invalid' }), [])
})

test('rolling ninety-day reporting uses Monday snapshots and the completed Dubai-week cutoff', () => {
  const data = ['2026-06-22', '2026-06-29', '2026-07-06', '2026-09-07', '2026-09-14', '2026-09-21'].map(week => review(week))
  assert.deepEqual(creativeResultsPeriod(data, { mode: 'rolling90', asOf: '2026-09-22' }).map(row => row.week_start), ['2026-06-29', '2026-07-06', '2026-09-07', '2026-09-14'])
  assert.equal(creativeResultsPeriod(data, { mode: 'rolling90', asOf: new Date('2026-09-20T19:59:59Z') }).at(-1).week_start, '2026-09-07')
  assert.equal(creativeResultsPeriod(data, { mode: 'rolling90', asOf: new Date('2026-09-20T20:00:00Z') }).at(-1).week_start, '2026-09-14')
})

test('winner benchmarks retain agreed ranges and treat performance above the range favorably', () => {
  assert.equal(winnerBenchmark(null).status, 'unavailable')
  assert.equal(winnerBenchmark(0).status, 'below')
  assert.equal(winnerBenchmark(4.99).status, 'below')
  assert.equal(winnerBenchmark(5).status, 'within')
  assert.equal(winnerBenchmark(10).status, 'within')
  assert.equal(winnerBenchmark(10.01).status, 'above')
  assert.equal(winnerBenchmark(1.99, 'super_winner').status, 'below')
  assert.equal(winnerBenchmark(2, 'super_winner').status, 'within')
  assert.equal(winnerBenchmark(4, 'super_winner').status, 'within')
  assert.equal(winnerBenchmark(4.01, 'super_winner').status, 'above')
})
