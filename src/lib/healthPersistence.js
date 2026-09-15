import { HEALTH_CONFIG, healthCurrentWeek, isHealthComplete, isHealthDate, isHealthMonday } from './healthWeekly.js'

// Client is injected so the exact database write contract is independently testable.
export async function persistHealthEntry(client, kind, { entityId, week, values, existing, userId }) {
  const config = HEALTH_CONFIG[kind]
  if (!userId || !entityId) throw new Error('Sign in again before saving this review.')
  if (!isHealthDate(week) || week > healthCurrentWeek()) throw new Error('Choose a current or past reporting week.')
  if (existing && (existing[config.idKey] !== entityId || existing.week_start !== week)) throw new Error('The selected review changed. Close this form and reopen the correct week.')
  if (!existing && !isHealthMonday(week)) throw new Error('New reviews must use a Monday reporting date. Legacy dates can only be edited on their existing record.')
  if (!isHealthComplete(kind, values)) throw new Error('Choose a score from 1 to 5 for every category and select a risk level.')
  const payload = Object.fromEntries(config.fields.map(({ key }) => [key, Number(values[key])]))
  Object.assign(payload, { [config.riskKey]: values[config.riskKey], notes: values.notes || '', [config.authorKey]: userId, updated_at: new Date().toISOString() })
  if (kind === 'team') payload.actions = values.actions || ''
  let query
  if (existing?.id) {
    query = client.from(config.table).update(payload).eq('id', existing.id).eq(config.idKey, entityId).eq('week_start', week)
    if (existing.updated_at) query = query.eq('updated_at', existing.updated_at)
    else query = query.is('updated_at', null)
  } else {
    query = client.from(config.table).insert({ ...payload, [config.idKey]: entityId, week_start: week })
  }
  const { data, error } = await query.select('*').maybeSingle()
  if (error?.code === '23505') throw new Error('Someone has already logged this week. Close this form and refresh to review their saved entry.')
  if (error) throw new Error(`Review not saved: ${error.message}`)
  if (!data) throw new Error('This review changed or could not be saved with your permissions. Refresh and try again; your edits have not been applied.')
  return data
}
