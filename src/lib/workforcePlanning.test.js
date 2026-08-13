import assert from 'node:assert/strict'
import test from 'node:test'
import { buildHiringSignals, buildWorkloads, DEFAULT_CAPACITY } from './workforcePlanning.js'

const people = [
  { source_key: 'cs-1', display_name: 'CS One', discipline: 'creative_strategist', is_active: true },
  { source_key: 'editor-1', display_name: 'Editor One', discipline: 'editor', daily_capacity: 5, is_active: true },
  { source_key: 'ugc-1', display_name: 'UGC One', discipline: 'ugc_manager', max_clients: 8, is_active: true },
]

function allocations(count, concepts = 20) {
  return Array.from({ length: count }, (_, index) => ({
    id: `allocation-${index}`,
    strategist_key: 'cs-1',
    client_name_snapshot: `Client ${index + 1}`,
    statics: concepts,
    videos: 0,
    editor_keys: [],
    ugc_manager_keys: [],
  }))
}

test('creative strategist capacity uses both client and concept limits', () => {
  const healthy = buildWorkloads({ allocations: allocations(4), people, settings: DEFAULT_CAPACITY, workingDays: 22 })
  assert.equal(healthy.strategists[0].status, 'healthy')
  assert.equal(healthy.strategists[0].clients, 4)
  assert.equal(healthy.strategists[0].concepts, 80)

  const overloadedByClients = buildWorkloads({ allocations: allocations(7, 10), people, settings: DEFAULT_CAPACITY, workingDays: 22 })
  assert.equal(overloadedByClients.strategists[0].status, 'overloaded')

  const overloadedByConcepts = buildWorkloads({ allocations: allocations(4, 30), people, settings: DEFAULT_CAPACITY, workingDays: 22 })
  assert.equal(overloadedByConcepts.strategists[0].status, 'overloaded')
})

test('editor and UGC utilization retain legacy capacity rules', () => {
  const rows = allocations(8).map((row, index) => ({
    ...row,
    videos: index < 6 ? 20 : 0,
    editor_keys: ['editor-1'],
    ugc_manager_keys: ['ugc-1'],
  }))
  const result = buildWorkloads({ allocations: rows, people, settings: DEFAULT_CAPACITY, workingDays: 22 })
  assert.equal(result.editors[0].videos, 120)
  assert.equal(result.editors[0].status, 'overloaded')
  assert.equal(result.ugcManagers[0].utilization, 100)
  assert.equal(result.ugcManagers[0].status, 'near_capacity')
})

test('hiring signal distinguishes team capacity from individual overload', () => {
  const rows = allocations(7).map(row => ({ ...row, videos: 20, editor_keys: ['editor-1'], ugc_manager_keys: ['ugc-1'] }))
  const workloads = buildWorkloads({ allocations: rows, people, settings: DEFAULT_CAPACITY, workingDays: 22 })
  const signals = buildHiringSignals({
    workloadsByRole: {
      creative_strategist: workloads.strategists,
      editor: workloads.editors,
      ugc_manager: workloads.ugcManagers,
    },
    settings: DEFAULT_CAPACITY,
    workingDays: 22,
  })
  assert.equal(signals.find(signal => signal.key === 'creative_strategist').signal, 'hire_now')
  assert.equal(signals.find(signal => signal.key === 'editor').signal, 'hire_now')
  assert.equal(signals.find(signal => signal.key === 'ugc_manager').signal, 'plan')
})
