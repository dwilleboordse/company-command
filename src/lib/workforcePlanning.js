import { getClientStrategistIds } from './clientAssignments.js'

export const PLANNING_ROLES = [
  { key: 'creative_strategist', label: 'Creative Strategists', singular: 'Creative Strategist', color: 'var(--green)' },
  { key: 'editor', label: 'Editors', singular: 'Editor', color: 'var(--purple)' },
  { key: 'designer', label: 'Designers', singular: 'Designer', color: 'var(--red)' },
  { key: 'ugc_manager', label: 'UGC Managers', singular: 'UGC Manager', color: 'var(--amber)' },
]

export const DEFAULT_CAPACITY = {
  cs_min_clients: 4,
  cs_max_clients: 6,
  cs_min_concepts: 80,
  cs_max_concepts: 100,
  editor_daily_capacity: 5,
  designer_daily_capacity: 7,
  ugc_max_clients: 8,
}

export function formatMonth(monthStart) {
  if (!monthStart) return ''
  return new Date(`${monthStart.slice(0, 7)}-02T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').toUpperCase().slice(0, 2) || '?'
}

export function parseIds(value) {
  if (!value) return []
  let ids = value
  if (!Array.isArray(ids)) {
    try { ids = JSON.parse(value) } catch { return [] }
  }
  return Array.isArray(ids)
    ? [...new Set(ids.filter(id => typeof id === 'string' && id.trim().length > 0))]
    : []
}

function conceptCount(client, type) {
  return Math.max(0, Number(client?.creatives?.[type]?.concepts || 0))
}

export function buildRosterAllocations({ clients = [], people = [], monthStart = '' }) {
  const peopleByProfileAndRole = new Map(
    people
      .filter(person => person.profile_id)
      .map(person => [`${person.profile_id}:${person.discipline}`, person]),
  )
  const keysFor = (value, role) => parseIds(parseIds(value)
    .map(id => peopleByProfileAndRole.get(`${id}:${role}`)?.source_key || `unmapped:${id}:${role}`))

  return clients
    .filter(client => client.is_active !== false && !client.is_archived)
    .map(client => {
      const strategistProfileIds = parseIds(getClientStrategistIds(client))
      const designerProfileIds = parseIds(client.designer_ids)
      const editorProfileIds = parseIds(client.editor_ids)
      const ugcManagerProfileIds = parseIds(client.ugc_ids)
      const strategistKeys = keysFor(strategistProfileIds, 'creative_strategist')
      // The legacy primary column has a foreign key; unresolved shares belong
      // only in the unconstrained array so month-close can preserve them safely.
      const primaryStrategistKey = strategistProfileIds
        .map(id => peopleByProfileAndRole.get(`${id}:creative_strategist`)?.source_key)
        .find(Boolean) || null
      const videoConcepts = conceptCount(client, 'video')
      const ugcConcepts = conceptCount(client, 'ugc')
      return {
        id: `roster:${client.id}`,
        month_start: monthStart,
        source_key: `roster:${client.id}`,
        client_id: client.id,
        client_name_snapshot: client.name,
        package_type: client.package_type || '',
        ugc_creators_per_month: client.ugc_creators_per_month ?? null,
        seeding_creators_per_month: client.seeding_creators_per_month ?? null,
        strategist_key: primaryStrategistKey,
        strategist_keys: strategistKeys,
        strategist_profile_ids: strategistProfileIds,
        statics: conceptCount(client, 'static'),
        videos: videoConcepts + ugcConcepts,
        video_concepts: videoConcepts,
        ugc_concepts: ugcConcepts,
        designer_keys: keysFor(designerProfileIds, 'designer'),
        designer_profile_ids: designerProfileIds,
        editor_keys: keysFor(editorProfileIds, 'editor'),
        editor_profile_ids: editorProfileIds,
        ugc_manager_keys: keysFor(ugcManagerProfileIds, 'ugc_manager'),
        ugc_manager_profile_ids: ugcManagerProfileIds,
        ugc_enabled: ugcManagerProfileIds.length > 0,
        notes: '',
        is_live_roster: true,
      }
    })
    .sort((a, b) => a.client_name_snapshot.localeCompare(b.client_name_snapshot))
}

export function buildAllocationSnapshot(allocations = []) {
  return allocations.map(item => ({
    source_key: item.source_key,
    client_id: item.client_id || null,
    client_name_snapshot: item.client_name_snapshot,
    package_type: item.package_type ?? null,
    ugc_creators_per_month: item.ugc_creators_per_month ?? null,
    seeding_creators_per_month: item.seeding_creators_per_month ?? null,
    strategist_key: item.strategist_key || null,
    strategist_keys: item.strategist_keys?.length
      ? [...item.strategist_keys]
      : item.strategist_key ? [item.strategist_key] : [],
    statics: Number(item.statics || 0),
    videos: Number(item.videos || 0),
    designer_keys: [...(item.designer_keys || [])],
    editor_keys: [...(item.editor_keys || [])],
    ugc_manager_keys: [...(item.ugc_manager_keys || [])],
    ugc_enabled: Boolean(item.ugc_enabled),
    notes: item.notes || '',
  }))
}

export function statusMeta(status) {
  if (status === 'overloaded') return { label: 'Over capacity', tone: 'red' }
  if (status === 'near_capacity') return { label: 'Near capacity', tone: 'amber' }
  if (status === 'healthy') return { label: 'Healthy', tone: 'green' }
  return { label: 'Available', tone: 'blue' }
}

function exceeds(value, limit) {
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(limit)) * 16
  return value - limit > tolerance
}

function requiredHeadcount(used, unitCapacity) {
  const ratio = used / unitCapacity
  const nearestInteger = Math.round(ratio)
  // Equal fractional shares can sum a few machine epsilons above a whole
  // capacity. Do not turn floating-point noise into an additional planned hire.
  return Math.ceil(exceeds(Math.abs(ratio - nearestInteger), 0) ? ratio : nearestInteger)
}

function standardStatus(utilization) {
  if (exceeds(utilization, 100)) return 'overloaded'
  if (!exceeds(80, utilization)) return 'near_capacity'
  if (!exceeds(50, utilization)) return 'healthy'
  return 'available'
}

function assignmentKeys(item, field, fallbackField) {
  const keys = parseIds(item[field])
  if (keys.length) return keys
  return parseIds([item[fallbackField]])
}

function workloadNumber(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}

function sharedCreatorTarget(value, divisor) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number / divisor : null
}

function formatWorkload(value) {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })
}

function clientCount(assignments) {
  return new Set(assignments.map(item => item.client_id || item.source_key || item.id || item)).size
}

function sharedAssignments(allocations, personKey, field, role) {
  return allocations.flatMap(item => {
    const keys = assignmentKeys(item, field, field === 'strategist_keys' ? 'strategist_key' : '')
    if (!keys.includes(personKey)) return []
    const divisor = keys.length
    const assignment = { ...item, assignment_count: divisor, workload_share: 1 / divisor }
    if (role === 'ugc_manager') {
      assignment.ugc_creators_per_month = sharedCreatorTarget(item.ugc_creators_per_month, divisor)
      assignment.seeding_creators_per_month = sharedCreatorTarget(item.seeding_creators_per_month, divisor)
    } else {
      assignment.statics = role === 'editor' ? 0 : workloadNumber(item.statics) / divisor
      assignment.videos = role === 'designer' ? 0 : workloadNumber(item.videos) / divisor
      for (const field of ['video_concepts', 'ugc_concepts']) {
        if (Object.hasOwn(item, field)) assignment[field] = role === 'designer' ? 0 : workloadNumber(item[field]) / divisor
      }
    }
    return [assignment]
  })
}

export function buildWorkloads({ allocations = [], people = [], settings = DEFAULT_CAPACITY, workingDays = 22 }) {
  const safeSettings = { ...DEFAULT_CAPACITY, ...(settings || {}) }
  const byKey = new Map(people.map(person => [person.source_key, person]))
  const activePeople = people.filter(person => person.is_active !== false)

  const strategists = activePeople.filter(person => person.discipline === 'creative_strategist').map(person => {
    const owned = sharedAssignments(allocations, person.source_key, 'strategist_keys', 'creative_strategist')
    const clients = clientCount(owned)
    const concepts = owned.reduce((sum, item) => sum + Number(item.statics || 0) + Number(item.videos || 0), 0)
    const utilization = safeSettings.cs_max_concepts ? (concepts / safeSettings.cs_max_concepts) * 100 : 0
    const overloaded = exceeds(concepts, safeSettings.cs_max_concepts)
    const inHealthyBand = !exceeds(safeSettings.cs_min_concepts, concepts)
    const nearCapacity = !exceeds(safeSettings.cs_max_concepts * 0.9, concepts)
    return {
      ...person,
      clients,
      clientEquivalents: owned.reduce((sum, item) => sum + item.workload_share, 0),
      concepts,
      statics: owned.reduce((sum, item) => sum + Number(item.statics || 0), 0),
      videos: owned.reduce((sum, item) => sum + Number(item.videos || 0), 0),
      utilization: Math.round(utilization),
      status: overloaded ? 'overloaded' : nearCapacity ? 'near_capacity' : inHealthyBand ? 'healthy' : 'available',
      assignments: owned,
      capacityLabel: `${formatWorkload(concepts)}/${formatWorkload(safeSettings.cs_max_concepts)} concepts · ${clients} clients`,
    }
  })

  const editors = activePeople.filter(person => person.discipline === 'editor').map(person => {
    const assigned = sharedAssignments(allocations, person.source_key, 'editor_keys', 'editor')
    const videos = assigned.reduce((sum, item) => sum + Number(item.videos || 0), 0)
    const dailyCapacity = Number(person.daily_capacity || safeSettings.editor_daily_capacity)
    const capacity = dailyCapacity * workingDays
    const utilization = capacity ? (videos / capacity) * 100 : 0
    return {
      ...person,
      clients: clientCount(assigned),
      clientEquivalents: assigned.reduce((sum, item) => sum + item.workload_share, 0),
      concepts: videos,
      videos,
      utilization: Math.round(utilization),
      status: standardStatus(utilization),
      assignments: assigned,
      capacityLabel: `${formatWorkload(videos)}/${formatWorkload(capacity)} video concepts`,
    }
  })

  const designers = activePeople.filter(person => person.discipline === 'designer').map(person => {
    const assigned = sharedAssignments(allocations, person.source_key, 'designer_keys', 'designer')
    const statics = assigned.reduce((sum, item) => sum + Number(item.statics || 0), 0)
    const dailyCapacity = Number(person.daily_capacity || safeSettings.designer_daily_capacity)
    const capacity = dailyCapacity * workingDays
    const utilization = capacity ? (statics / capacity) * 100 : 0
    return {
      ...person,
      clients: clientCount(assigned),
      clientEquivalents: assigned.reduce((sum, item) => sum + item.workload_share, 0),
      concepts: statics,
      statics,
      utilization: Math.round(utilization),
      status: standardStatus(utilization),
      assignments: assigned,
      capacityLabel: `${formatWorkload(statics)}/${formatWorkload(capacity)} static concepts`,
    }
  })

  const ugcManagers = activePeople.filter(person => person.discipline === 'ugc_manager').map(person => {
    const assigned = sharedAssignments(allocations, person.source_key, 'ugc_manager_keys', 'ugc_manager')
    const clients = clientCount(assigned)
    const clientEquivalents = assigned.reduce((sum, item) => sum + item.workload_share, 0)
    const capacity = Number(person.max_clients || safeSettings.ugc_max_clients)
    const utilization = capacity ? (clientEquivalents / capacity) * 100 : 0
    return {
      ...person,
      clients,
      clientEquivalents,
      utilization: Math.round(utilization),
      status: standardStatus(utilization),
      assignments: assigned,
      capacityLabel: `${formatWorkload(clientEquivalents)}/${formatWorkload(capacity)} client equivalents · ${clients} clients`,
    }
  })

  const unmatchedKeys = new Set()
  allocations.forEach(item => {
    assignmentKeys(item, 'strategist_keys', 'strategist_key').forEach(key => {
      if (key && (!byKey.get(key)?.profile_id || byKey.get(key)?.is_active === false)) unmatchedKeys.add(key)
    })
    ;[...parseIds(item.editor_keys), ...parseIds(item.designer_keys), ...parseIds(item.ugc_manager_keys)].forEach(key => {
      if (key && (!byKey.get(key)?.profile_id || byKey.get(key)?.is_active === false)) unmatchedKeys.add(key)
    })
  })

  return { strategists, editors, designers, ugcManagers, unmatchedKeys: [...unmatchedKeys] }
}

function roleCapacity(roleKey, workloads, settings, workingDays) {
  if (roleKey === 'creative_strategist') {
    return {
      used: workloads.reduce((sum, person) => sum + person.concepts, 0),
      capacity: workloads.length * settings.cs_max_concepts,
      unitCapacity: settings.cs_max_concepts,
      unit: 'concepts',
    }
  }
  if (roleKey === 'editor' || roleKey === 'designer') {
    const dailyCapacitySetting = roleKey === 'editor' ? settings.editor_daily_capacity : settings.designer_daily_capacity
    return {
      used: workloads.reduce((sum, person) => sum + person.concepts, 0),
      capacity: workloads.reduce((sum, person) => sum + Number(person.daily_capacity || dailyCapacitySetting) * workingDays, 0),
      unitCapacity: Number(dailyCapacitySetting) * workingDays,
      unit: 'concepts',
    }
  }
  return {
    used: workloads.reduce((sum, person) => sum + (person.clientEquivalents ?? person.clients), 0),
    capacity: workloads.reduce((sum, person) => sum + Number(person.max_clients || settings.ugc_max_clients), 0),
    unitCapacity: settings.ugc_max_clients,
    unit: 'clients',
  }
}

export function buildHiringSignals({ workloadsByRole, settings = DEFAULT_CAPACITY, workingDays = 22 }) {
  return PLANNING_ROLES.map(role => {
    const workloads = workloadsByRole[role.key] || []
    const capacity = roleCapacity(role.key, workloads, settings, workingDays)
    const utilization = capacity.capacity ? Math.round((capacity.used / capacity.capacity) * 100) : 0
    const effectiveUtilization = utilization
    const overloaded = workloads.filter(person => person.status === 'overloaded')
    const near = workloads.filter(person => person.status === 'near_capacity')
    const requiredPeople = capacity.unitCapacity
      ? Math.max(0, requiredHeadcount(capacity.used, capacity.unitCapacity) - workloads.length)
      : 0

    let signal = 'hold'
    let priority = 'low'
    let action = 'Capacity available'
    if (effectiveUtilization > 100 || requiredPeople > 0) {
      signal = 'hire_now'
      priority = 'critical'
      action = `Open ${role.singular} role`
    } else if (overloaded.length && effectiveUtilization < 80) {
      signal = 'rebalance'
      priority = 'medium'
      action = 'Rebalance assignments first'
    } else if (effectiveUtilization >= 80 || overloaded.length) {
      signal = 'plan'
      priority = 'high'
      action = `Prepare ${role.singular} pipeline`
    } else if (near.length) {
      signal = 'watch'
      priority = 'medium'
      action = 'Watch next client intake'
    }

    return {
      ...role,
      ...capacity,
      utilization: effectiveUtilization,
      overloaded,
      near,
      requiredPeople,
      signal,
      priority,
      action,
      headcount: workloads.length,
    }
  }).sort((a, b) => b.utilization - a.utilization)
}

export function projectGrowthScenario({
  signals = [],
  newClients = 0,
  churnedClients = 0,
  conceptsPerClient = 0,
  videoConceptsPerClient = 0,
  ugcClientRate = 0,
}) {
  const safeNewClients = Math.max(0, Number(newClients || 0))
  const safeChurnedClients = Math.max(0, Number(churnedClients || 0))
  const safeConceptsPerClient = Math.max(0, Number(conceptsPerClient || 0))
  const safeVideoConcepts = Math.min(Math.max(0, Number(videoConceptsPerClient || 0)), safeConceptsPerClient)
  const safeUgcRate = Math.min(Math.max(0, Number(ugcClientRate || 0)), 100)
  const netClients = safeNewClients - safeChurnedClients
  const staticConceptsPerClient = safeConceptsPerClient - safeVideoConcepts
  const ugcClientChange = Math.round(netClients * (safeUgcRate / 100))

  const projected = signals.map(signal => {
    let loadChange = 0
    if (signal.key === 'creative_strategist') loadChange = netClients * safeConceptsPerClient
    if (signal.key === 'editor') loadChange = netClients * safeVideoConcepts
    if (signal.key === 'designer') loadChange = netClients * staticConceptsPerClient
    if (signal.key === 'ugc_manager') loadChange = ugcClientChange

    const projectedUsed = Math.max(0, signal.used + loadChange)
    const projectedUtilization = signal.capacity ? Math.round((projectedUsed / signal.capacity) * 100) : 0
    const peopleNeeded = signal.unitCapacity
      ? Math.max(0, requiredHeadcount(projectedUsed, signal.unitCapacity) - signal.headcount)
      : 0

    return { ...signal, loadChange, projectedUsed, projectedUtilization, peopleNeeded }
  })

  return {
    projected,
    netClients,
    videoConceptsPerClient: safeVideoConcepts,
    staticConceptsPerClient,
    ugcClientChange,
  }
}

export function nextMonthStart(monthStart) {
  const [year, month] = monthStart.slice(0, 7).split('-').map(Number)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
}

export function roleLabel(position = '') {
  const labels = {
    ceo: 'CEO',
    management: 'Management',
    ops_manager: 'Operations Manager',
    ops_assistant: 'Operations Assistant',
    creative_strategist: 'Creative Strategist',
    media_buyer: 'Media Buyer',
    editor: 'Video Editor',
    designer: 'Designer',
    ugc_manager: 'UGC Manager',
    email_marketer: 'Email Marketer',
  }
  return labels[position] || position.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}
