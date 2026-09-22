import { supabase } from './supabase'
import { fetchAllRows } from './reportingData'
import { persistCreativeRecord } from './creativeLeadershipPersistence.js'
import { CREATIVE_LEAD_EVENT, creativeActionPayload, validateCreativeAction, validateCreativeCoaching, validateCreativeReviewWeek } from './creativeLeadership'

const notify = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(CREATIVE_LEAD_EVENT)) }
const pick = (values, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(values, key)).map(key => [key, values[key]]))
const coachingFields = ['strategist_id', 'client_id', 'observation', 'expected_standard', 'agreed_action', 'due_date', 'follow_up', 'outcome']

export async function loadCreativeLeadership() {
  const access = await supabase.rpc('can_access_creative_lead')
  if (access.error) throw new Error(`Could not verify leadership access: ${access.error.message}`)
  if (access.data !== true) throw new Error('Your account has not been provisioned for the private leadership workspace. Ask the CEO or Operations Manager to arrange access.')
  // Intentionally do not load fees, management health notes or survey answers.
  const queries = [
    ['reviews', () => supabase.from('creative_lead_reviews').select('*').order('week_start', { ascending: false }).order('id')],
    ['clients', () => supabase.from('clients').select('id,name,cs_ids,assigned_cs_id,is_active,is_archived,created_at').order('name').order('id')],
    ['members', () => supabase.from('profiles').select('id,full_name,position,role,is_active').order('full_name').order('id')],
    ['entries', () => supabase.from('spend_entries').select('id,client_id,week_start,ddu_spend,total_spend,updated_at').order('week_start', { ascending: false }).order('id')],
    ['actions', () => supabase.from('creative_lead_actions').select('*').order('due_date').order('id')],
    ['coaching', () => supabase.from('creative_lead_coaching').select('*').order('created_at', { ascending: false }).order('id')],
    ['feedback', () => supabase.from('creative_lead_feedback').select('*').order('published_at', { ascending: false }).order('id')],
  ]
  const results = await Promise.all(queries.map(async ([key, query]) => {
    const result = await fetchAllRows(query)
    if (result.error) throw new Error(`Could not load ${key}: ${result.error.message}`)
    return [key, result.data]
  }))
  return Object.fromEntries(results)
}

async function saveRow(table, values, existing) {
  const data = await persistCreativeRecord(supabase, table, values, existing)
  notify()
  return data
}

export async function createCreativeReview(weekStart) {
  if (!validateCreativeReviewWeek(weekStart)) throw new Error('Choose a completed Monday-start week from the launch week onward.')
  return saveRow('creative_lead_reviews', { week_start: weekStart }, null)
}

export async function saveCreativeReview(review, patch) {
  return saveRow('creative_lead_reviews', pick(patch, ['summary', 'client_reviews', 'status', 'reviewer_feedback']), review)
}

export async function saveCreativeAction(values, existing = null) {
  const error = validateCreativeAction({ ...existing, ...values })
  if (error) throw new Error(error)
  return saveRow('creative_lead_actions', creativeActionPayload(values, existing), existing)
}

export async function saveCreativeCoaching(values, existing = null) {
  const error = validateCreativeCoaching({ ...existing, ...values })
  if (error) throw new Error(error)
  const payload = pick(values, coachingFields)
  if (!existing || Object.hasOwn(payload, 'client_id')) payload.client_id ||= null
  return saveRow('creative_lead_coaching', payload, existing)
}

export async function publishCreativeFeedback(coachingId, recipientId, message) {
  if (!message?.trim() || message.length > 10000) throw new Error('Write the feedback you want to release (up to 10,000 characters).')
  const { data, error } = await supabase.from('creative_lead_feedback')
    .upsert({ coaching_id: coachingId, recipient_id: recipientId, message: message.trim() }, { onConflict: 'coaching_id' }).select().single()
  if (error) throw error
  notify()
  return data
}
