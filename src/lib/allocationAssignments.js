import { getClientStrategistIds, parseAssignmentIds } from './clientAssignments.js'

export const ROLE_ASSIGNMENT_FIELDS = {
  creative_strategist: 'cs_ids', editor: 'editor_ids', designer: 'designer_ids', ugc_manager: 'ugc_ids',
}

export function planAssignmentChange(client, role, targetId, sourceId, mode = 'share') {
  const field = ROLE_ASSIGNMENT_FIELDS[role]
  if (!field || !targetId || !['share', 'move'].includes(mode)) return null
  const current = [...new Set(role === 'creative_strategist' ? getClientStrategistIds(client) : parseAssignmentIds(client?.[field]))]
  // Move only this person's share. Never clear the other assigned teammates.
  const retained = mode === 'move' && sourceId && sourceId !== targetId
    ? current.filter(id => id !== sourceId) : current
  const ids = [...new Set([...retained, targetId])]
  return {
    field, ids,
    changed: JSON.stringify(current) !== JSON.stringify(ids),
    updates: { [field]: ids, ...(role === 'creative_strategist' ? { assigned_cs_id: ids[0] || null } : {}) },
  }
}

// Guard only fields being edited, so another operator's unrelated change can coexist.
export function guardClientFields(query, client, fields) {
  return fields.reduce((guarded, field) => {
    const value = client[field]
    return value == null ? guarded.is(field, null)
      : guarded.eq(field, typeof value === 'object' ? JSON.stringify(value) : value)
  }, query)
}
