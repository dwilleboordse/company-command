import { supabase } from './supabase'
import { DEFAULT_CAPACITY } from './workforcePlanning'

const PLANNING_POSITIONS = new Set(['creative_strategist', 'designer', 'editor', 'ugc_manager'])

export async function loadDesignCsData() {
  const [monthResult, allocationResult, peopleResult, clientResult, profileResult, settingsResult] = await Promise.all([
    supabase.from('design_cs_months').select('*').order('month_start'),
    supabase.from('design_cs_allocations').select('*').order('client_name_snapshot'),
    supabase.from('design_cs_people').select('*').order('display_name'),
    supabase.from('clients').select('*').order('name'),
    supabase.from('profiles').select('id,full_name,position,role,department,avatar_url,is_active').eq('is_active', true).order('full_name'),
    supabase.from('design_cs_capacity_settings').select('*').eq('id', 1).maybeSingle(),
  ])

  const firstError = [monthResult, allocationResult, peopleResult, clientResult, profileResult, settingsResult]
    .find(result => result.error)?.error
  if (firstError) throw firstError

  const profiles = profileResult.data || []
  const profilesById = new Map(profiles.map(profile => [profile.id, profile]))
  const people = (peopleResult.data || []).map(person => {
    const profile = person.profile_id ? profilesById.get(person.profile_id) : null
    if (!profile || !PLANNING_POSITIONS.has(profile.position)) return { ...person, is_active: false }
    return {
      ...person,
      display_name: profile.full_name,
      discipline: profile.position,
      is_active: true,
    }
  })
  const mappedProfileIds = new Set(people.filter(person => person.profile_id).map(person => person.profile_id))

  profiles.filter(profile => PLANNING_POSITIONS.has(profile.position) && !mappedProfileIds.has(profile.id)).forEach(profile => {
    people.push({
      source_key: `profile:${profile.id}`,
      profile_id: profile.id,
      display_name: profile.full_name,
      discipline: profile.position,
      daily_capacity: profile.position === 'editor' ? DEFAULT_CAPACITY.editor_daily_capacity
        : profile.position === 'designer' ? DEFAULT_CAPACITY.designer_daily_capacity : null,
      max_clients: profile.position === 'ugc_manager' ? DEFAULT_CAPACITY.ugc_max_clients : null,
      is_active: true,
      source: 'company_command',
      is_virtual: true,
    })
  })

  return {
    months: monthResult.data || [],
    allocations: allocationResult.data || [],
    people,
    clients: clientResult.data || [],
    profiles,
    settings: { ...DEFAULT_CAPACITY, ...(settingsResult.data || {}) },
  }
}

export async function persistVirtualPeople(people) {
  const virtualPeople = people.filter(person => person?.is_virtual)
  if (!virtualPeople.length) return

  const rows = virtualPeople.map(person => ({
    source_key: person.source_key,
    profile_id: person.profile_id,
    display_name: person.display_name,
    discipline: person.discipline,
    daily_capacity: person.daily_capacity,
    max_clients: person.max_clients,
    is_active: true,
    source: 'company_command',
  }))
  const { error } = await supabase.from('design_cs_people').upsert(rows, { onConflict: 'source_key' })
  if (error) throw error
}
