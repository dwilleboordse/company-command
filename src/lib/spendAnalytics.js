import { buildTimeBuckets, dateKey, parseReportingDate } from './reportingPeriods.js'
import { getClientStrategistIds } from './clientAssignments.js'

export const SPEND_PLATFORMS = [
  { key: 'meta_spend', totalKey: 'meta_total_spend', label: 'Meta', color: '#1877f2' },
  { key: 'tiktok_spend', totalKey: 'tiktok_total_spend', label: 'TikTok', color: '#f43f5e' },
  { key: 'applovin_spend', totalKey: 'applovin_total_spend', label: 'AppLovin', color: '#8b5cf6' },
  { key: 'google_spend', totalKey: 'google_total_spend', label: 'Google', color: '#34a853' },
  { key: 'other_spend', totalKey: 'other_spend', label: 'Other', color: '#6b7280' },
]
export const SPEND_FIELDS = [...new Set(SPEND_PLATFORMS.flatMap(p => [p.key, p.totalKey]))]

export function spendNumber(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim()) || typeof value === 'boolean') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

export function formatSpendMoney(value) {
  const number = spendNumber(value)
  if (number === null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0,
    ...(number >= 10000 ? { notation: 'compact', maximumFractionDigits: 1 } : {}) }).format(number)
}

export function isCompleteSpendEntry(entry) {
  const total = spendNumber(entry?.total_spend)
  const ddu = spendNumber(entry?.ddu_spend)
  return total !== null && ddu !== null && ddu <= total
}

export function spendShare(entry) {
  const total = spendNumber(entry?.total_spend)
  const ddu = spendNumber(entry?.ddu_spend)
  return total > 0 && isCompleteSpendEntry(entry) ? ddu / total * 100 : null
}

export function spendStatus(share) {
  if (share === null || share === undefined) return { label: 'No share available', color: 'var(--text-muted)', bg: 'var(--bg)' }
  if (share >= 50) return { label: 'Excellent', color: 'var(--green)', bg: 'var(--green-dim)' }
  if (share >= 20) return { label: 'Healthy', color: 'var(--amber)', bg: 'var(--amber-dim)' }
  return { label: 'Low share', color: 'var(--red)', bg: 'var(--red-dim)' }
}

export const isActiveSpendClient = client => client.is_active !== false && !client.is_archived
export function scopeSpendClients(clients, profile, canManage = false) {
  if (canManage) return clients
  return profile?.position === 'creative_strategist'
    ? clients.filter(client => getClientStrategistIds(client).includes(profile.id)) : []
}

export function lastCompletedSpendWeek(today = new Date()) {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7 - 7)
  return dateKey(monday)
}
export function shiftSpendWeek(week, amount) {
  const date = parseReportingDate(week)
  if (!date) return null
  date.setDate(date.getDate() + 7 * amount)
  return dateKey(date)
}

export function summarizeSpend(entries) {
  const totals = entries.map(row => spendNumber(row.total_spend)).filter(value => value !== null)
  const ddu = entries.map(row => spendNumber(row.ddu_spend)).filter(value => value !== null)
  const pairs = entries.filter(isCompleteSpendEntry)
  const pairTotal = pairs.reduce((sum, row) => sum + Number(row.total_spend), 0)
  const pairDDU = pairs.reduce((sum, row) => sum + Number(row.ddu_spend), 0)
  return {
    total: totals.length ? totals.reduce((sum, value) => sum + value, 0) : null,
    ddu: ddu.length ? ddu.reduce((sum, value) => sum + value, 0) : null,
    share: pairTotal > 0 ? pairDDU / pairTotal * 100 : null,
    entries: entries.length, clients: new Set(entries.map(row => row.client_id)).size,
    completeEntries: pairs.length, loggedClients: new Set(pairs.map(row => row.client_id)).size,
    incomplete: entries.length - pairs.length,
  }
}

export function spendInPeriod(entries, period) {
  return entries.filter(row => row.week_start >= period.start && row.week_start <= period.end)
}

export function spendTrend(entries, period, grain = 'month') {
  return buildTimeBuckets(period, grain).map(bucket => ({ ...bucket, ...summarizeSpend(spendInPeriod(entries, bucket)) }))
}

export function compareSpendClients(clients, entries, period) {
  return clients.map(client => {
    const rows = entries.filter(row => row.client_id === client.id)
    const summary = summarizeSpend(spendInPeriod(rows, period))
    const latest = rows.filter(row => row.week_start <= period.end).sort((a, b) => b.week_start.localeCompare(a.week_start))[0] || null
    return { client, ...summary, latest }
  }).sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || a.client.name.localeCompare(b.client.name))
}

export function spendFormValues(existing = {}) {
  const form = Object.fromEntries([...SPEND_FIELDS, 'ddu_spend', 'total_spend'].map(key => [key, existing[key] ?? '']))
  form.notes = existing.notes ?? ''
  const platformDdu = SPEND_PLATFORMS.reduce((sum, p) => sum + (spendNumber(form[p.key]) ?? 0), 0)
  const platformTotal = SPEND_PLATFORMS.reduce((sum, p) => sum + (spendNumber(form[p.totalKey]) ?? 0), 0)
  form.mode = existing.id && Math.abs(platformDdu - Number(existing.ddu_spend)) < 0.01
    && Math.abs(platformTotal - Number(existing.total_spend)) < 0.01 && platformTotal > 0 ? 'platforms' : 'totals'
  return form
}

export function buildSpendPayload(form, { clientId, weekStart, enteredBy, existing = null }) {
  const date = parseReportingDate(weekStart)
  if (!clientId || !enteredBy) throw new Error('Your session or client is missing. Refresh and try again.')
  if (!date || (date.getDay() !== 1 && existing?.week_start !== weekStart)) throw new Error('Choose a valid Monday for the logging week.')
  const payload = { client_id: clientId, week_start: weekStart, entered_by: enteredBy, notes: form.notes?.trim() || '' }
  if (form.mode === 'platforms') {
    for (const key of SPEND_FIELDS) {
      if (form[key] !== '' && form[key] !== null && spendNumber(form[key]) === null) throw new Error('Spend amounts must be valid, non-negative numbers.')
      payload[key] = spendNumber(form[key]) ?? 0
    }
    for (const platform of SPEND_PLATFORMS) {
      if (payload[platform.key] > payload[platform.totalKey]) throw new Error(`${platform.label} DDU spend cannot exceed its total spend.`)
    }
    payload.ddu_spend = SPEND_PLATFORMS.reduce((sum, p) => sum + payload[p.key], 0)
    payload.total_spend = SPEND_PLATFORMS.reduce((sum, p) => sum + payload[p.totalKey], 0)
    if (!SPEND_FIELDS.some(key => form[key] !== '' && form[key] != null)) throw new Error('Enter spend amounts, including 0 if no spend occurred.')
  } else {
    payload.total_spend = spendNumber(form.total_spend)
    payload.ddu_spend = spendNumber(form.ddu_spend)
    if (payload.total_spend === null || payload.ddu_spend === null) throw new Error('Enter both total and DDU spend; use 0 if no spend occurred.')
    // Keep historical breakdown when only notes change; clear stale breakdown if totals are replaced.
    const totalsChanged = !existing || Number(existing.total_spend) !== payload.total_spend || Number(existing.ddu_spend) !== payload.ddu_spend
    for (const key of SPEND_FIELDS) payload[key] = totalsChanged ? null : existing[key] ?? null
  }
  if (payload.ddu_spend > payload.total_spend) throw new Error('DDU spend cannot exceed total client spend.')
  return payload
}
