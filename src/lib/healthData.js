import { supabase } from './supabase'
import { fetchAllRows } from './reportingData'
import { HEALTH_CONFIG, HEALTH_REVIEW_EVENT } from './healthWeekly'
import { persistHealthEntry } from './healthPersistence'

export async function fetchHealthData(kind) {
  const config = HEALTH_CONFIG[kind]
  const [entityResult, entryResult] = await Promise.all([
    fetchAllRows(() => kind === 'team'
      ? supabase.from('profiles').select('id,full_name,position,department,role,is_active,avatar_url,created_at').order('full_name').order('id')
      : supabase.from('clients').select('*').order('name').order('id')),
    fetchAllRows(() => supabase.from(config.table).select('*').order('week_start', { ascending: false }).order('id')),
  ])
  if (entityResult.error) throw new Error(`Roster unavailable: ${entityResult.error.message}`)
  if (entryResult.error) throw new Error(`Health logs unavailable: ${entryResult.error.message}`)
  const ids = new Set(entityResult.data.map(entity => entity.id))
  return { entities: entityResult.data, entries: entryResult.data.filter(row => ids.has(row[config.idKey])) }
}

export async function saveHealthEntry(kind, options) {
  const data = await persistHealthEntry(supabase, kind, options)
  window.dispatchEvent(new Event(HEALTH_REVIEW_EVENT))
  return data
}
