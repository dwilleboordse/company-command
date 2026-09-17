import { supabase } from './supabase'
import { fetchAllRows } from './reportingData'
import { scopeSpendClients } from './spendAnalytics'

// Team-wide read model, separate from the strategist's own-client logging scope.
// Existing authenticated RLS remains authoritative. Never fetch notes, emails,
// financial model fields or edit permissions for this read-only leaderboard.
export async function fetchSpendLeaderboardData() {
  const [clients, members, entries] = await Promise.all([
    fetchAllRows(() => supabase.from('clients')
      .select('id,name,cs_ids,assigned_cs_id,is_active,is_archived').order('id')),
    fetchAllRows(() => supabase.from('profiles')
      .select('id,full_name,position,is_active').eq('is_active', true)
      .eq('position', 'creative_strategist').order('id')),
    fetchAllRows(() => supabase.from('spend_entries')
      .select('id,client_id,week_start,ddu_spend,total_spend,created_at,updated_at')
      .order('week_start', { ascending: false }).order('id')),
  ])
  for (const [label, result] of [['Client assignments', clients], ['Creative strategists', members], ['Spend logs', entries]]) {
    if (result.error) throw new Error(`${label} could not load: ${result.error.message}`)
  }
  return { clients: clients.data, members: members.data, entries: entries.data }
}

export async function fetchSpendData(profile, canManage = false) {
  const [clientResult, memberResult] = await Promise.all([
    fetchAllRows(() => supabase.from('clients').select('*').order('name').order('id')),
    fetchAllRows(() => supabase.from('profiles').select('id,full_name,position,is_active').eq('is_active', true).order('id')),
  ])
  if (clientResult.error) throw new Error(`Clients could not load: ${clientResult.error.message}`)
  if (memberResult.error) throw new Error(`Team assignments could not load: ${memberResult.error.message}`)
  const clients = scopeSpendClients(clientResult.data, profile, canManage)
  const allowed = new Set(clients.map(client => client.id))
  // Fetch each stable page and scope the returned rows to roster clients. RLS remains authoritative.
  const entryResult = clients.length ? await fetchAllRows(() => supabase.from('spend_entries').select('*')
    .in('client_id', clients.map(client => client.id)).order('week_start', { ascending: false }).order('id')) : { data: [], error: null }
  if (entryResult.error) throw new Error(`Spend entries could not load: ${entryResult.error.message}`)
  return { clients, members: memberResult.data, entries: entryResult.data.filter(row => allowed.has(row.client_id)) }
}
