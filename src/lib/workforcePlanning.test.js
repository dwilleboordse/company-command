import assert from 'node:assert/strict'
import test from 'node:test'
import { buildHiringSignals, buildWorkloads, DEFAULT_CAPACITY, projectGrowthScenario } from './workforcePlanning.js'

const people = [
  { source_key: 'cs-1', display_name: 'CS One', discipline: 'creative_strategist', is_active: true },
  { source_key: 'editor-1', display_name: 'Editor One', discipline: 'editor', daily_capacity: 5, is_active: true },
  { source_key: 'designer-1', display_name: 'Designer One', discipline: 'designer', daily_capacity: 7, is_active: true },
  { source_key: 'ugc-1', display_name: 'UGC One', discipline: 'ugc_manager', max_clients: 8, is_active: true },
]

function allocations(count, concepts = 20) {
  return Array.from({ length: count }, (_, index) => ({
    id: `allocation-${index}`,
    strategist_key: 'cs-1',
    client_name_snapshot: `Client ${index + 1}`,
    statics: concepts,
    videos: 0,
    designer_keys: [],
    editor_keys: [],
    ugc_manager_keys: [],
  }))
}

test('creative strategist capacity uses concepts as the common capacity unit', () => {
  const healthy = buildWorkloads({ allocations: allocations(4), people, settings: DEFAULT_CAPACITY, workingDays: 22 })
  assert.equal(healthy.strategists[0].status, 'healthy')
  assert.equal(healthy.strategists[0].clients, 4)
  assert.equal(healthy.strategists[0].concepts, 80)

  const manyLowConceptClients = buildWorkloads({ allocations: allocations(7, 10), people, settings: DEFAULT_CAPACITY, workingDays: 22 })
  assert.equal(manyLowConceptClients.strategists[0].status, 'available')
  assert.equal(manyLowConceptClients.strategists[0].concepts, 70)

  const overloadedByConcepts = buildWorkloads({ allocations: allocations(4, 30), people, settings: DEFAULT_CAPACITY, workingDays: 22 })
  assert.equal(overloadedByConcepts.strategists[0].status, 'overloaded')
})

test('editors and designers use video and static concepts with designer capacity two higher per day', () => {
  const rows = allocations(8).map((row, index) => ({
    ...row,
    videos: index < 6 ? 20 : 0,
    designer_keys: ['designer-1'],
    editor_keys: ['editor-1'],
    ugc_manager_keys: ['ugc-1'],
  }))
  const result = buildWorkloads({ allocations: rows, people, settings: DEFAULT_CAPACITY, workingDays: 22 })
  assert.equal(result.editors[0].videos, 120)
  assert.equal(result.editors[0].status, 'overloaded')
  assert.equal(result.designers[0].statics, 160)
  assert.equal(result.designers[0].capacityLabel, '160/154 static concepts')
  assert.equal(result.designers[0].status, 'overloaded')
  assert.equal(result.ugcManagers[0].utilization, 100)
  assert.equal(result.ugcManagers[0].status, 'near_capacity')
})

test('hiring signals cover CS, editors, designers, and UGC', () => {
  const rows = allocations(7).map(row => ({ ...row, videos: 20, designer_keys: ['designer-1'], editor_keys: ['editor-1'], ugc_manager_keys: ['ugc-1'] }))
  const workloads = buildWorkloads({ allocations: rows, people, settings: DEFAULT_CAPACITY, workingDays: 22 })
  const signals = buildHiringSignals({
    workloadsByRole: {
      creative_strategist: workloads.strategists,
      editor: workloads.editors,
      designer: workloads.designers,
      ugc_manager: workloads.ugcManagers,
    },
    settings: DEFAULT_CAPACITY,
    workingDays: 22,
  })
  assert.equal(signals.find(signal => signal.key === 'creative_strategist').signal, 'hire_now')
  assert.equal(signals.find(signal => signal.key === 'editor').signal, 'hire_now')
  assert.equal(signals.find(signal => signal.key === 'designer').signal, 'plan')
  assert.equal(signals.find(signal => signal.key === 'ugc_manager').signal, 'plan')
})

test('growth scenario subtracts churn before projecting role capacity', () => {
  const signals = [
    { key: 'creative_strategist', used: 100, capacity: 200, unitCapacity: 100, headcount: 2, unit: 'concepts' },
    { key: 'editor', used: 100, capacity: 220, unitCapacity: 110, headcount: 2, unit: 'concepts' },
    { key: 'designer', used: 100, capacity: 308, unitCapacity: 154, headcount: 2, unit: 'concepts' },
    { key: 'ugc_manager', used: 5, capacity: 16, unitCapacity: 8, headcount: 2, unit: 'clients' },
  ]
  const scenario = projectGrowthScenario({
    signals,
    newClients: 4,
    churnedClients: 1,
    conceptsPerClient: 20,
    videoConceptsPerClient: 15,
    ugcClientRate: 50,
  })

  assert.equal(scenario.netClients, 3)
  assert.equal(scenario.staticConceptsPerClient, 5)
  assert.equal(scenario.projected.find(signal => signal.key === 'creative_strategist').loadChange, 60)
  assert.equal(scenario.projected.find(signal => signal.key === 'editor').loadChange, 45)
  assert.equal(scenario.projected.find(signal => signal.key === 'designer').loadChange, 15)
  assert.equal(scenario.projected.find(signal => signal.key === 'ugc_manager').loadChange, 2)
})
