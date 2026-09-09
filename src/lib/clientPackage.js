export const CREATOR_TARGET_FIELDS = ['ugc_creators_per_month', 'seeding_creators_per_month']
export const CREATIVE_TYPES = ['video', 'ugc', 'static']

export function packageFormValues(client = {}) {
  const creatives = { ...(client.creatives || {}) }
  for (const type of CREATIVE_TYPES) {
    creatives[type] = { concepts: 0, variations: 0, ...(creatives[type] || {}) }
  }
  return {
    package_type: client.package_type || '',
    creatives,
    ugc_creators_per_month: client.ugc_creators_per_month ?? '',
    seeding_creators_per_month: client.seeding_creators_per_month ?? '',
  }
}

const isBlank = value => value == null || String(value).trim() === ''
const isCount = value => !isBlank(value) && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 2147483647

export function validateClientPackage(form, { requirePackage = false } = {}) {
  if (requirePackage && !form.package_type?.trim()) return 'Enter the client’s creative package.'
  for (const field of CREATOR_TARGET_FIELDS) {
    if (!isBlank(form[field]) && !isCount(form[field])) {
      return 'Monthly creator targets must be zero or a positive whole number.'
    }
  }
  for (const type of CREATIVE_TYPES) {
    for (const field of ['concepts', 'variations']) {
      const value = form.creatives?.[type]?.[field]
      if (!isBlank(value) && !isCount(value)) return 'Concepts and variations must be zero or a positive whole number.'
    }
  }
  return ''
}

export function packagePayload(form) {
  const error = validateClientPackage(form)
  if (error) throw new Error(error)
  const result = packageFormValues(form)
  result.package_type = result.package_type.trim()
  for (const field of CREATOR_TARGET_FIELDS) result[field] = isBlank(form[field]) ? null : Number(form[field])
  for (const type of CREATIVE_TYPES) {
    result.creatives[type] = {
      ...result.creatives[type],
      concepts: Number(result.creatives[type].concepts || 0),
      variations: Number(result.creatives[type].variations || 0),
    }
  }
  return result
}

export function formatCreatorTarget(value) {
  return value == null || value === '' ? 'Not set' : String(value)
}
