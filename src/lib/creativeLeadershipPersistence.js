// Injected client keeps concurrency/error behavior independently testable.
export async function persistCreativeRecord(client, table, values, existing = null) {
  if (!['creative_lead_reviews', 'creative_lead_actions', 'creative_lead_coaching'].includes(table)) throw new Error('Unsupported creative leadership record.')
  if (existing && (!existing.id || !Number.isInteger(existing.version) || existing.version < 1)) throw new Error('Reload this record before saving.')
  const query = existing
    ? client.from(table).update(values).eq('id', existing.id).eq('version', existing.version)
    : client.from(table).insert(values)
  const { data, error } = await query.select().single()
  if (error) {
    if (error.code === 'PGRST116') throw new Error('This record changed in another session or is no longer editable. Reload before saving again.')
    throw error
  }
  if (!data) throw new Error('The change could not be saved. Reload and check your access.')
  return data
}
