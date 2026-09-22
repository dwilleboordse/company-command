import { healthDueWeek, isHealthDate, isHealthMonday } from './healthWeekly.js'

export const CREATIVE_RESULT_STATUSES = ['not_entered', 'logged', 'no_tests', 'unavailable']
export const CREATIVE_RESULT_COUNTS = ['eligible_ads', 'winners', 'super_winners', 'blocked_ads', 'inconclusive_ads']
const COUNT_LABELS = { eligible_ads: 'Eligible tested ads', winners: 'Winners', super_winners: 'Super-winners', blocked_ads: 'Blocked ads', inconclusive_ads: 'Inconclusive ads' }
const text = value => typeof value === 'string' ? value.trim() : ''
const empty = value => value === null || value === undefined
const validCount = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000
const RESULT_FIELDS = new Set([...CREATIVE_RESULT_COUNTS, 'status', 'evidence_url', 'notes'])

export function newCreativeResults() {
  return { status: 'not_entered', eligible_ads: null, winners: null, super_winners: null,
    blocked_ads: null, inconclusive_ads: null, evidence_url: '', notes: '' }
}

function validEvidence(value) {
  if (typeof value !== 'string' || value.length > 2000) return false
  if (!/^https?:\/\/[^\s/?#@]+([/?#][^\s]*)?$/i.test(value) || value.includes('\\')
    || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}

// Drafts may be incomplete, but never accept invalid values that could later be
// mistaken for a zero. Submission requires an explicit result or missing-data reason.
export function validateCreativeResults(results, { required = false, submission = false } = {}) {
  if (results === undefined) return required && submission ? 'Choose a results status for this client.' : ''
  if (results === null || typeof results !== 'object' || Array.isArray(results)) return 'Creative results must be a structured record.'
  if (Object.keys(results).some(key => !RESULT_FIELDS.has(key))) return 'Creative results contain an unsupported field.'
  if (results.status !== undefined && !CREATIVE_RESULT_STATUSES.includes(results.status)) return 'Choose a valid results status.'
  for (const key of CREATIVE_RESULT_COUNTS) {
    if (!empty(results[key]) && !validCount(results[key])) return `${COUNT_LABELS[key]} must be a whole number from 0 to 1,000,000.`
  }
  if (results.notes !== undefined && (typeof results.notes !== 'string' || results.notes.length > 6000)) return 'Results notes must be text up to 6,000 characters.'
  if (results.evidence_url !== undefined && (typeof results.evidence_url !== 'string' || (results.evidence_url !== '' && !validEvidence(results.evidence_url)))) return 'Add a valid http(s) results evidence link without embedded credentials, whitespace or backslashes.'
  if (validCount(results.winners) && validCount(results.eligible_ads) && results.winners > results.eligible_ads) return 'Winners cannot exceed eligible tested ads.'
  if (validCount(results.super_winners) && validCount(results.winners) && results.super_winners > results.winners) return 'Super-winners are a subset of winners and cannot exceed winners.'
  if (results.status === 'not_entered' || results.status === undefined) {
    if (submission) return 'Choose a results status for this client.'
    return ''
  }
  if (results.status === 'unavailable') {
    if (CREATIVE_RESULT_COUNTS.some(key => results[key] !== null && (submission || results[key] !== undefined))) return 'Unavailable results must leave every count blank, not zero.'
    if (submission && !text(results.notes)) return 'Explain why results are unavailable.'
    return ''
  }
  if (results.status === 'no_tests' && ['eligible_ads', 'winners', 'super_winners'].some(key => !empty(results[key]) && results[key] !== 0)) return 'No eligible tests requires eligible ads, winners and super-winners to be zero.'
  if (results.status === 'logged' && !empty(results.eligible_ads) && results.eligible_ads === 0) return 'Logged results require at least one eligible tested ad; choose No eligible tests for zero.'
  if (submission) {
    if (CREATIVE_RESULT_COUNTS.some(key => !validCount(results[key]))) return 'Complete all five result counts, including explicit zeros.'
    if (!validEvidence(results.evidence_url)) return 'Link the source sheet or results evidence before submitting.'
  }
  return ''
}

const dubaiDate = value => {
  if (isHealthDate(value)) return value
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

// Monthly buckets belong to the review's Monday, not to the date the form was
// finalized. Rolling 90 days contains whole weekly snapshots whose Monday falls
// in the 90-date window, ending at the latest completed Dubai week.
export function creativeResultsPeriod(reviews = [], { mode = 'month', month, asOf = new Date() } = {}) {
  const date = dubaiDate(asOf)
  if (!date || !['month', 'rolling90'].includes(mode)) return []
  const completedWeek = healthDueWeek(new Date(`${date}T12:00:00+04:00`))
  let start, end
  if (mode === 'month') {
    const selectedMonth = month || date.slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(selectedMonth) || !isHealthDate(`${selectedMonth}-01`)) return []
    start = `${selectedMonth}-01`
    end = `${selectedMonth}-31`
  } else {
    const beginning = new Date(`${date}T00:00:00Z`)
    beginning.setUTCDate(beginning.getUTCDate() - 89)
    start = beginning.toISOString().slice(0, 10)
    end = completedWeek
  }
  return reviews.filter(review => review?.status === 'finalized' && isHealthMonday(review.week_start)
    && review.week_start >= start && review.week_start <= end && review.week_start <= completedWeek)
}

// A shared client contributes once per week to the portfolio, even if two lead
// records cover it. The latest finalized snapshot wins deterministically.
function finalizedClientRows(reviews) {
  const rows = new Map()
  const finalized = reviews.filter(review => review?.status === 'finalized' && isHealthMonday(review.week_start))
    .slice().sort((a, b) => String(b.finalized_at || b.updated_at || b.created_at || '').localeCompare(String(a.finalized_at || a.updated_at || a.created_at || ''))
      || String(b.id || '').localeCompare(String(a.id || '')))
  for (const review of finalized) {
    for (const client of Array.isArray(review.client_snapshot) ? review.client_snapshot : []) {
      if (!client?.id) continue
      const key = `${review.week_start}:${client.id}`
      if (rows.has(key)) continue
      const matches = (Array.isArray(review.client_reviews) ? review.client_reviews : []).filter(row => row?.client_id === client.id)
      const results = matches[0]?.results
      let status = results?.status || 'not_entered'
      if (matches.length > 1 || (results != null && validateCreativeResults(results, { required: true, submission: true }))) {
        const blank = results?.status === 'not_entered' && !validateCreativeResults(results)
          && CREATIVE_RESULT_COUNTS.every(key => empty(results[key])) && !text(results.notes) && !text(results.evidence_url)
        status = blank && matches.length < 2 ? 'not_entered' : 'invalid'
      }
      rows.set(key, { key, review, client, results, status })
    }
  }
  return [...rows.values()]
}

function summarizeRows(rows) {
  const sum = { ...Object.fromEntries(CREATIVE_RESULT_COUNTS.map(key => [key, null])),
    winner_rate: null, super_winner_rate: null, total_clients: rows.length, unique_clients: new Set(rows.map(row => row.client.id)).size,
    reviewed_clients: 0, recorded_clients: 0, logged_clients: 0, no_tests_clients: 0, unavailable_clients: 0,
    missing_clients: 0, invalid_clients: 0, coverage: rows.length ? 0 : null,
    review_count: new Set(rows.map(row => row.review.id || `${row.review.lead_id || ''}:${row.review.week_start}`)).size }
  for (const row of rows) {
    if (['logged', 'no_tests'].includes(row.status)) {
      sum[`${row.status}_clients`] += 1
      sum.recorded_clients += 1
      sum.reviewed_clients += 1
      for (const key of CREATIVE_RESULT_COUNTS) sum[key] = (sum[key] ?? 0) + row.results[key]
    } else if (row.status === 'unavailable') {
      sum.unavailable_clients += 1
      sum.reviewed_clients += 1
    } else if (row.status === 'invalid') sum.invalid_clients += 1
    else sum.missing_clients += 1
  }
  if (sum.eligible_ads > 0) {
    sum.winner_rate = 100 * sum.winners / sum.eligible_ads
    sum.super_winner_rate = 100 * sum.super_winners / sum.eligible_ads
  }
  if (rows.length) sum.coverage = 100 * sum.recorded_clients / rows.length
  return sum
}

export function summarizeCreativeResults(reviews = []) {
  return summarizeRows(finalizedClientRows(reviews))
}

function capturedStrategists(client) {
  const names = new Map((Array.isArray(client.strategist_names) ? client.strategist_names : []).filter(member => member?.id).map(member => [member.id, member.name]))
  const ids = [...new Set([...(Array.isArray(client.cs_ids) ? client.cs_ids : []), client.assigned_cs_id, ...names.keys()].filter(id => typeof id === 'string' && id))]
  return ids.length ? ids.map(id => ({ id, name: names.get(id) || 'Previous strategist' })) : [{ id: 'unassigned', name: 'Unassigned strategist' }]
}

export function creativeResultsBreakdown(reviews = [], { groupBy = 'client' } = {}) {
  if (!['client', 'strategist'].includes(groupBy)) return []
  const groups = new Map()
  for (const row of finalizedClientRows(reviews)) {
    const strategists = capturedStrategists(row.client)
    const owners = groupBy === 'client' ? [{ id: row.client.id, name: row.client.name || 'Previous client' }] : strategists
    for (const owner of owners) {
      if (!groups.has(owner.id)) groups.set(owner.id, { ...owner, rows: [], shared_attribution: false, client_ids: new Set() })
      const group = groups.get(owner.id)
      group.rows.push(row)
      group.client_ids.add(row.client.id)
      group.shared_attribution ||= strategists.length > 1
    }
  }
  return [...groups.values()].map(({ rows, client_ids, ...group }) => ({ ...group, ...summarizeRows(rows), client_ids: [...client_ids],
    attribution: groupBy === 'strategist' ? 'Full captured client results; shared-client strategist rows are non-additive.' : 'Each client-week counted once.' }))
    .sort((a, b) => a.name.localeCompare(b.name) || String(a.id).localeCompare(String(b.id)))
}

export function winnerBenchmark(rate, type = 'winner') {
  const [minimum, maximum] = type === 'super_winner' || type === 'super' ? [2, 4] : [5, 10]
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100) return { status: 'unavailable', label: 'No eligible results', minimum, maximum }
  if (rate < minimum) return { status: 'below', label: 'Below benchmark', minimum, maximum }
  if (rate > maximum) return { status: 'above', label: 'Above benchmark', minimum, maximum }
  return { status: 'within', label: 'Within benchmark', minimum, maximum }
}
