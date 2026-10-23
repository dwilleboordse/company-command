import { monday } from './q4Cycle.js'

// PostgREST matches onConflict to a unique constraint column list.
// kr_values used to be unique on the first three columns. After the role
// segment migration the constraint is these four, in this order.
export const KR_VALUE_CONFLICT = 'key_result_id,user_id,week_start,segment'

const ROLE_LABELS = {
  designer: 'Designers',
  video_editor: 'Video editors',
}
const ROLE_ORDER = ['designer', 'video_editor']

const MEASUREMENT_PATCH_KEYS = ['current_value', 'current_value_recorded_at', 'planning_context', 'updated_at']

function titleCase(key) {
  return String(key || '').split('_').filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function positiveStandard(value) {
  if (typeof value === 'boolean' || value === '' || value == null) return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

// A KR records one value per role when planning_context.target_by_role
// lists two or more positive standards. Anything else keeps the single input.
export function roleStandards(kr) {
  const raw = kr?.planning_context?.target_by_role
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const entries = Object.entries(raw)
  if (entries.length < 2) return []
  const roles = []
  for (const [key, standard] of entries) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) return []
    const amount = positiveStandard(standard)
    if (amount == null) return []
    roles.push({ key, label: ROLE_LABELS[key] || titleCase(key), standard: amount })
  }
  return roles.sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.key)
    const bi = ROLE_ORDER.indexOf(b.key)
    return (ai === -1 ? ROLE_ORDER.length : ai) - (bi === -1 ? ROLE_ORDER.length : bi)
      || a.key.localeCompare(b.key)
  })
}

export function roleValueOwnerId(result, objective) {
  const owner = result?.planning_context?.owner_id
  if (typeof owner === 'string' && owner) return owner
  return objective?.owner_id || null
}

export function canRecordRoleValues({ userId, isManagement = false, canEditObjective = false } = {}) {
  return Boolean(userId && (isManagement || canEditObjective))
}

export function mondayWeekError(weekStart) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart || '')) return 'Choose the Monday the observation week starts.'
  if (monday(weekStart) !== weekStart) return 'Week starting must be a Monday.'
  return ''
}

// Blank is missing. Zero is a real measurement. Negative and non-numeric are invalid.
export function parseMeasuredNumber(input) {
  if (typeof input === 'boolean') return { ok: false, value: null }
  const text = String(input ?? '').trim()
  if (!text) return { ok: true, value: null }
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0) return { ok: false, value: null }
  return { ok: true, value }
}

export function roleAttainment(value, standard) {
  const parsed = typeof value === 'number' ? { ok: true, value } : parseMeasuredNumber(value)
  if (!parsed.ok || parsed.value == null || !(standard > 0)) return null
  return parsed.value / standard * 100
}

// Simple average of each role's value / standard, as a percentage rounded to 0.1.
export function combinedRoleScore(roles) {
  if (!roles?.length) return null
  const parts = roles.map(role => roleAttainment(role.value, role.standard))
  if (parts.some(part => part == null)) return null
  const average = parts.reduce((sum, part) => sum + part, 0) / parts.length
  return Math.round(average * 10) / 10
}

export function formatRolePercent(value) {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`
}

export function roleEntryError({ standards, values, weekStart, period, evidence } = {}) {
  const weekError = mondayWeekError(weekStart)
  if (weekError) return weekError
  if (!standards?.length) return 'This key result has no per-role standards.'
  for (const role of standards) {
    const parsed = parseMeasuredNumber(values?.[role.key])
    if (!parsed.ok) return `Enter a zero or positive number for ${role.label}.`
    if (parsed.value == null) return `Enter the measured tasks per day for ${role.label}.`
  }
  if (!String(period ?? '').trim() || !String(evidence ?? '').trim()) {
    return 'Add the observation period and supporting evidence.'
  }
  return ''
}

export function roleMeasurement(standards, values) {
  return standards.map(role => ({ ...role, value: parseMeasuredNumber(values?.[role.key]).value }))
}

export function roleValueRows({ keyResultId, userId, weekStart, roles }) {
  return roles.map(role => ({
    key_result_id: keyResultId,
    user_id: userId,
    week_start: weekStart,
    segment: role.key,
    value: role.value,
  }))
}

// Current value, its recorded date, the observation period and the evidence.
// Title, target, direction and every other planning note stay on the saved row.
export function measurementOnlyPatch(result, { value, period, evidence, recordedAt }) {
  if (value == null || !Number.isFinite(Number(value))) throw new Error('A combined score is required before saving.')
  const observationPeriod = String(period ?? '')
  const evidenceText = String(evidence ?? '')
  if (!observationPeriod.trim() || !evidenceText.trim()) {
    throw new Error('Add the observation period and supporting evidence.')
  }
  const planning_context = {
    ...(result?.planning_context || {}),
    observation_period: observationPeriod,
    evidence: evidenceText,
  }
  const patch = {
    current_value: Number(value),
    current_value_recorded_at: recordedAt,
    planning_context,
    updated_at: recordedAt,
  }
  const keys = Object.keys(patch)
  if (keys.length !== MEASUREMENT_PATCH_KEYS.length || keys.some(key => !MEASUREMENT_PATCH_KEYS.includes(key))) {
    throw new Error('Measured values cannot change the key result definition.')
  }
  return patch
}
