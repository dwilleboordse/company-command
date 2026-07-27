export function parseAssignmentIds(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

export function getClientStrategistIds(client) {
  const rosterIds = parseAssignmentIds(client?.cs_ids)
  if (rosterIds.length) return [...new Set(rosterIds)]
  return client?.assigned_cs_id ? [client.assigned_cs_id] : []
}

export function getClientStrategistNames(client, members) {
  const memberById = new Map((members || []).map(member => [member.id, member]))
  return getClientStrategistIds(client)
    .map(id => memberById.get(id)?.full_name)
    .filter(Boolean)
}
