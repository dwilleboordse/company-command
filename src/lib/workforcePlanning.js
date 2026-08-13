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
  if (Array.isArray(value)) return value
  try { return JSON.parse(value) } catch { return [] }
}

export function statusMeta(status) {
  if (status === 'overloaded') return { label: 'Over capacity', tone: 'red' }
  if (status === 'near_capacity') return { label: 'Near capacity', tone: 'amber' }
  if (status === 'healthy') return { label: 'Healthy', tone: 'green' }
  return { label: 'Available', tone: 'blue' }
}

function standardStatus(utilization) {
  if (utilization > 100) return 'overloaded'
  if (utilization >= 80) return 'near_capacity'
  if (utilization >= 50) return 'healthy'
  return 'available'
}

export function buildWorkloads({ allocations = [], people = [], settings = DEFAULT_CAPACITY, workingDays = 22 }) {
  const safeSettings = { ...DEFAULT_CAPACITY, ...(settings || {}) }
  const byKey = new Map(people.map(person => [person.source_key, person]))
  const activePeople = people.filter(person => person.is_active !== false)

  const strategists = activePeople.filter(person => person.discipline === 'creative_strategist').map(person => {
    const owned = allocations.filter(item => item.strategist_key === person.source_key)
    const clients = owned.length
    const concepts = owned.reduce((sum, item) => sum + Number(item.statics || 0) + Number(item.videos || 0), 0)
    const utilization = safeSettings.cs_max_concepts ? Math.round((concepts / safeSettings.cs_max_concepts) * 100) : 0
    const overloaded = concepts > safeSettings.cs_max_concepts
    const inHealthyBand = concepts >= safeSettings.cs_min_concepts
    const nearCapacity = concepts >= safeSettings.cs_max_concepts * 0.9
    return {
      ...person,
      clients,
      concepts,
      statics: owned.reduce((sum, item) => sum + Number(item.statics || 0), 0),
      videos: owned.reduce((sum, item) => sum + Number(item.videos || 0), 0),
      utilization,
      status: overloaded ? 'overloaded' : nearCapacity ? 'near_capacity' : inHealthyBand ? 'healthy' : 'available',
      assignments: owned,
      capacityLabel: `${concepts}/${safeSettings.cs_max_concepts} concepts · ${clients} clients`,
    }
  })

  const editors = activePeople.filter(person => person.discipline === 'editor').map(person => {
    const assigned = allocations.filter(item => (item.editor_keys || []).includes(person.source_key))
    const videos = assigned.reduce((sum, item) => sum + Number(item.videos || 0), 0)
    const dailyCapacity = Number(person.daily_capacity || safeSettings.editor_daily_capacity)
    const capacity = dailyCapacity * workingDays
    const utilization = capacity ? Math.round((videos / capacity) * 100) : 0
    return {
      ...person,
      clients: assigned.length,
      concepts: videos,
      videos,
      utilization,
      status: standardStatus(utilization),
      assignments: assigned,
      capacityLabel: `${videos}/${capacity} video concepts`,
    }
  })

  const designers = activePeople.filter(person => person.discipline === 'designer').map(person => {
    const assigned = allocations.filter(item => (item.designer_keys || []).includes(person.source_key))
    const statics = assigned.reduce((sum, item) => sum + Number(item.statics || 0), 0)
    const dailyCapacity = Number(person.daily_capacity || safeSettings.designer_daily_capacity)
    const capacity = dailyCapacity * workingDays
    const utilization = capacity ? Math.round((statics / capacity) * 100) : 0
    return {
      ...person,
      clients: assigned.length,
      concepts: statics,
      statics,
      utilization,
      status: standardStatus(utilization),
      assignments: assigned,
      capacityLabel: `${statics}/${capacity} static concepts`,
    }
  })

  const ugcManagers = activePeople.filter(person => person.discipline === 'ugc_manager').map(person => {
    const assigned = allocations.filter(item => (item.ugc_manager_keys || []).includes(person.source_key))
    const clients = assigned.length
    const capacity = Number(person.max_clients || safeSettings.ugc_max_clients)
    const utilization = capacity ? Math.round((clients / capacity) * 100) : 0
    return {
      ...person,
      clients,
      utilization,
      status: standardStatus(utilization),
      assignments: assigned,
      capacityLabel: `${clients}/${capacity} clients`,
    }
  })

  const unmatchedKeys = new Set()
  allocations.forEach(item => {
    if (item.strategist_key && !byKey.get(item.strategist_key)?.profile_id) unmatchedKeys.add(item.strategist_key)
    ;[...(item.editor_keys || []), ...(item.designer_keys || []), ...(item.ugc_manager_keys || [])].forEach(key => {
      if (key && !byKey.get(key)?.profile_id) unmatchedKeys.add(key)
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
    used: workloads.reduce((sum, person) => sum + person.clients, 0),
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
      ? Math.max(0, Math.ceil(capacity.used / capacity.unitCapacity) - workloads.length)
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
      ? Math.max(0, Math.ceil(projectedUsed / signal.unitCapacity) - signal.headcount)
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
  const date = new Date(`${monthStart}T00:00:00`)
  date.setUTCMonth(date.getUTCMonth() + 1)
  return date.toISOString().slice(0, 7) + '-01'
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
