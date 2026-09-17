import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAllocationSnapshot, buildHiringSignals, buildRosterAllocations, buildWorkloads, DEFAULT_CAPACITY, nextMonthStart, parseIds, projectGrowthScenario, roleLabel, syncPlanningPeople } from './workforcePlanning.js'

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

test('promoting a strategist preserves planning identity, capacity and client workloads', () => {
  const existing = [{ ...people[0], profile_id: 'promoted-cs', daily_capacity: 4, max_clients: 5 }]
  const before = structuredClone(existing)
  const profiles = [{ id: 'promoted-cs', full_name: 'Team Lead', position: 'head_of_creative_strategy', is_active: true }]
  const synced = syncPlanningPeople(existing, profiles)
  assert.deepEqual(existing, before)
  assert.equal(synced.length, 1)
  assert.equal(synced[0].source_key, 'cs-1')
  assert.equal(synced[0].discipline, 'creative_strategist')
  assert.equal(synced[0].daily_capacity, 4)
  assert.equal(synced[0].max_clients, 5)
  assert.equal(synced[0].is_active, true)
  assert.equal(synced[0].is_virtual, undefined)
  const rosterRows = buildRosterAllocations({ people: synced, clients: [{
    id: 'client', name: 'Example', cs_ids: ['promoted-cs'],
    creatives: { video: { concepts: 16 }, static: { concepts: 4 } },
  }] })
  assert.deepEqual(rosterRows[0].strategist_keys, ['cs-1'])
  const workload = buildWorkloads({ people: synced, allocations: rosterRows })
  assert.equal(workload.strategists[0].concepts, 20)
  assert.equal(workload.strategists[0].clients, 1)
  assert.equal(roleLabel(profiles[0].position), 'Head of Creative Strategy')
})

test('a newly mapped head uses the existing strategist discipline, never a new capacity type', () => {
  const profiles = [{ id: 'new-head', full_name: 'New Lead', position: 'head_of_creative_strategy', is_active: true }]
  const [person] = syncPlanningPeople([], profiles)
  assert.equal(person.source_key, 'profile:new-head')
  assert.equal(person.discipline, 'creative_strategist')
  assert.equal(person.is_virtual, true)
  assert.equal(buildWorkloads({ people: [person] }).strategists.length, 1)
})

test('planning sync never reactivates offboarded heads or creates people for non-planning roles', () => {
  const existing = [{ ...people[0], profile_id: 'inactive-head' }]
  const profiles = [
    { id: 'inactive-head', position: 'head_of_creative_strategy', is_active: false },
    { id: 'ops', position: 'ops_manager', is_active: true },
  ]
  const synced = syncPlanningPeople(existing, profiles)
  assert.equal(synced.length, 1)
  assert.equal(synced[0].is_active, false)
})

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

test('client roster creates the live allocation and includes UGC concepts in video workload', () => {
  const rosterPeople = people.map((person, index) => ({ ...person, profile_id: `profile-${index + 1}` }))
  const result = buildRosterAllocations({
    monthStart: '2026-08-01',
    people: rosterPeople,
    clients: [{
      id: 'client-1',
      name: 'Roster Client',
      is_active: true,
      is_archived: false,
      cs_ids: ['profile-1'],
      editor_ids: ['profile-2'],
      designer_ids: ['profile-3'],
      ugc_ids: ['profile-4'],
      creatives: {
        static: { concepts: 7, variations: 3 },
        video: { concepts: 8, variations: 3 },
        ugc: { concepts: 5, variations: 3 },
      },
    }],
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].statics, 7)
  assert.equal(result[0].videos, 13)
  assert.deepEqual(result[0].strategist_keys, ['cs-1'])
  assert.deepEqual(result[0].editor_keys, ['editor-1'])
})

test('shared roster assignments split capacity instead of double-counting concepts', () => {
  const sharedPeople = [
    ...people,
    { source_key: 'cs-2', display_name: 'CS Two', discipline: 'creative_strategist', is_active: true },
    { source_key: 'editor-2', display_name: 'Editor Two', discipline: 'editor', daily_capacity: 5, is_active: true },
  ]
  const result = buildWorkloads({
    people: sharedPeople,
    settings: DEFAULT_CAPACITY,
    workingDays: 22,
    allocations: [{
      id: 'shared-client',
      client_name_snapshot: 'Shared Client',
      strategist_keys: ['cs-1', 'cs-2'],
      statics: 10,
      videos: 30,
      designer_keys: [],
      editor_keys: ['editor-1', 'editor-2'],
      ugc_manager_keys: [],
    }],
  })

  assert.equal(result.strategists[0].concepts, 20)
  assert.equal(result.strategists[1].concepts, 20)
  assert.equal(result.editors[0].videos, 15)
  assert.equal(result.editors[1].videos, 15)
})

test('month close snapshot preserves the live roster allocation without carrying a new month', () => {
  const snapshot = buildAllocationSnapshot([{
    source_key: 'roster:client-1',
    client_id: 'client-1',
    client_name_snapshot: 'Snapshot Client',
    strategist_key: 'cs-1',
    strategist_keys: ['cs-1', 'cs-2'],
    statics: 12,
    videos: 18,
    designer_keys: ['designer-1'],
    editor_keys: ['editor-1'],
    ugc_manager_keys: ['ugc-1'],
    ugc_enabled: true,
    notes: 'Frozen at month close',
    month_start: '2026-08-01',
    is_live_roster: true,
  }])

  assert.deepEqual(snapshot, [{
    source_key: 'roster:client-1',
    client_id: 'client-1',
    client_name_snapshot: 'Snapshot Client',
    package_type: null,
    ugc_creators_per_month: null,
    seeding_creators_per_month: null,
    strategist_key: 'cs-1',
    strategist_keys: ['cs-1', 'cs-2'],
    statics: 12,
    videos: 18,
    designer_keys: ['designer-1'],
    editor_keys: ['editor-1'],
    ugc_manager_keys: ['ugc-1'],
    ugc_enabled: true,
    notes: 'Frozen at month close',
  }])
})

test('next month is timezone-safe and rolls December into the new year', () => {
  assert.equal(nextMonthStart('2026-08-01'), '2026-09-01')
  assert.equal(nextMonthStart('2026-12-01'), '2027-01-01')
})

const roleFields = {
  creative_strategist: 'strategist_keys',
  editor: 'editor_keys',
  designer: 'designer_keys',
  ugc_manager: 'ugc_manager_keys',
}

function sharedFixture(count) {
  const team = people.flatMap(person => Array.from({ length: count }, (_, index) => ({
    ...person,
    source_key: `${person.source_key}-${index}`,
    profile_id: `${person.discipline}-profile-${index}`,
  })))
  const allocation = {
    id: 'shared-allocation',
    client_id: 'shared-client',
    source_key: 'roster:shared-client',
    client_name_snapshot: 'Shared Client',
    statics: 10,
    videos: 13,
    video_concepts: 8,
    ugc_concepts: 5,
    ugc_creators_per_month: 5,
    seeding_creators_per_month: 7,
  }
  for (const [role, field] of Object.entries(roleFields)) {
    allocation[field] = team.filter(person => person.discipline === role).map(person => person.source_key)
  }
  return { people: team, allocations: [allocation] }
}

function closeTo(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `Expected ${actual} to equal ${expected} without display rounding`)
}

for (const count of [2, 3]) {
  test(`${count}-person teams split each role independently with no early rounding or lost workload`, () => {
    const fixture = sharedFixture(count)
    const result = buildWorkloads(fixture)
    for (const [group, expectedConcepts] of [['strategists', 23], ['editors', 13], ['designers', 10]]) {
      assert.equal(result[group].length, count)
      closeTo(result[group].reduce((sum, person) => sum + person.concepts, 0), expectedConcepts)
      for (const person of result[group]) {
        closeTo(person.concepts, expectedConcepts / count)
        assert.equal(person.clients, 1)
        assert.equal(person.clientEquivalents, 1 / count)
        assert.equal(person.assignments[0].assignment_count, count)
        assert.equal(person.assignments[0].workload_share, 1 / count)
      }
    }
    for (const person of result.strategists) {
      assert.equal(person.assignments[0].statics, 10 / count)
      assert.equal(person.assignments[0].videos, 13 / count)
      assert.equal(person.assignments[0].ugc_concepts, 5 / count)
      assert.equal(person.assignments[0].video_concepts, 8 / count)
    }
    for (const person of result.editors) {
      assert.equal(person.assignments[0].statics, 0)
      assert.equal(person.assignments[0].videos, 13 / count)
      assert.equal(person.assignments[0].ugc_concepts, 5 / count)
    }
    for (const person of result.designers) {
      assert.equal(person.assignments[0].statics, 10 / count)
      assert.equal(person.assignments[0].videos, 0)
      assert.equal(person.assignments[0].ugc_concepts, 0)
      assert.equal(person.assignments[0].video_concepts, 0)
    }
    closeTo(result.ugcManagers.reduce((sum, person) => sum + person.clientEquivalents, 0), 1)
    for (const person of result.ugcManagers) {
      assert.equal(person.clients, 1)
      assert.equal(person.clientEquivalents, 1 / count)
      assert.equal(person.utilization, Math.round(100 / (8 * count)))
      assert.equal(person.assignments[0].ugc_creators_per_month, 5 / count)
      assert.equal(person.assignments[0].seeding_creators_per_month, 7 / count)
    }
    closeTo(result.ugcManagers.reduce((sum, person) => sum + person.assignments[0].ugc_creators_per_month, 0), 5)
    closeTo(result.ugcManagers.reduce((sum, person) => sum + person.assignments[0].seeding_creators_per_month, 0), 7)
  })
}

test('each role uses only its own unique assignees as its workload denominator', () => {
  const fixture = sharedFixture(3)
  fixture.allocations[0].editor_keys.pop()
  fixture.allocations[0].designer_keys.splice(1)
  const result = buildWorkloads(fixture)
  assert.equal(result.strategists[0].concepts, 10 / 3 + 13 / 3)
  assert.equal(result.editors[0].videos, 6.5)
  assert.equal(result.editors[2].videos, 0)
  assert.equal(result.designers[0].statics, 10)
  assert.equal(result.designers[1].statics, 0)
  assert.equal(result.ugcManagers[0].clientEquivalents, 1 / 3)
})

test('duplicate and malformed saved assignment keys do not dilute shared workload', () => {
  const fixture = sharedFixture(2)
  for (const field of Object.values(roleFields)) {
    fixture.allocations[0][field].push(fixture.allocations[0][field][0], null, '', ' ', 3, {})
  }
  const before = structuredClone(fixture)
  const result = buildWorkloads(fixture)
  assert.equal(result.strategists[0].concepts, 11.5)
  assert.equal(result.editors[0].concepts, 6.5)
  assert.equal(result.designers[0].concepts, 5)
  assert.equal(result.ugcManagers[0].clientEquivalents, 0.5)
  for (const group of ['strategists', 'editors', 'designers', 'ugcManagers']) {
    assert.equal(result[group][0].assignments[0].assignment_count, 2)
  }
  assert.deepEqual(fixture, before)
})

test('live roster profile IDs are deduplicated and unresolved assignees retain their own shares', () => {
  const rosterPeople = people.map((person, index) => ({ ...person, profile_id: `profile-${index + 1}` }))
  const client = {
    id: 'client', name: 'Client',
    cs_ids: ['profile-1', 'profile-1', 'unmatched-cs', null, '', 5],
    editor_ids: JSON.stringify(['profile-2', 'profile-2', 'unmatched-editor']),
    designer_ids: ['profile-3', 'profile-3'],
    ugc_ids: ['profile-4', 'profile-4', 'unmatched-ugc'],
    creatives: { static: { concepts: 10 }, video: { concepts: 8 }, ugc: { concepts: 5 } },
  }
  const originalClient = structuredClone(client)
  const rows = buildRosterAllocations({ clients: [client], people: rosterPeople, monthStart: '2026-09-01' })
  assert.deepEqual(rows[0].strategist_profile_ids, ['profile-1', 'unmatched-cs'])
  assert.deepEqual(rows[0].strategist_keys, ['cs-1', 'unmapped:unmatched-cs:creative_strategist'])
  assert.deepEqual(rows[0].editor_keys, ['editor-1', 'unmapped:unmatched-editor:editor'])
  const result = buildWorkloads({ people: rosterPeople, allocations: rows })
  assert.equal(result.strategists[0].concepts, 11.5)
  assert.equal(result.editors[0].concepts, 6.5)
  assert.equal(result.designers[0].concepts, 10)
  assert.equal(result.ugcManagers[0].clientEquivalents, 0.5)
  assert.deepEqual(new Set(result.unmatchedKeys), new Set([
    'unmapped:unmatched-cs:creative_strategist', 'unmapped:unmatched-editor:editor', 'unmapped:unmatched-ugc:ugc_manager',
  ]))
  assert.deepEqual(client, originalClient)
})

test('UGC unknown creator targets remain unknown and explicit zeros remain zero when shared', () => {
  const fixture = sharedFixture(3)
  fixture.allocations[0].ugc_creators_per_month = null
  fixture.allocations[0].seeding_creators_per_month = 0
  const result = buildWorkloads(fixture)
  for (const person of result.ugcManagers) {
    assert.equal(person.assignments[0].ugc_creators_per_month, null)
    assert.equal(person.assignments[0].seeding_creators_per_month, 0)
  }
  delete fixture.allocations[0].ugc_creators_per_month
  assert.equal(buildWorkloads(fixture).ugcManagers[0].assignments[0].ugc_creators_per_month, null)
})

test('UGC hiring totals and growth scenarios use shared client equivalents, not duplicated client counts', () => {
  const fixture = sharedFixture(3)
  fixture.allocations = Array.from({ length: 6 }, (_, index) => ({
    ...fixture.allocations[0], id: `allocation-${index}`, client_id: `client-${index}`,
  }))
  const result = buildWorkloads(fixture)
  const signals = buildHiringSignals({ workloadsByRole: { ugc_manager: result.ugcManagers } })
  const ugcSignal = signals.find(signal => signal.key === 'ugc_manager')
  for (const person of result.ugcManagers) {
    assert.equal(person.clients, 6)
    closeTo(person.clientEquivalents, 2)
    assert.equal(person.utilization, 25)
  }
  closeTo(ugcSignal.used, 6)
  assert.equal(ugcSignal.capacity, 24)
  assert.equal(ugcSignal.utilization, 25)
  const scenario = projectGrowthScenario({ signals, newClients: 4, churnedClients: 1, ugcClientRate: 100 })
  closeTo(scenario.projected.find(signal => signal.key === 'ugc_manager').projectedUsed, 9)
})

test('legacy single-strategist fallback and unknown source keys remain intact', () => {
  const rows = [{
    id: 'legacy', strategist_key: 'cs-1', strategist_keys: [], statics: 7, videos: 2,
    editor_keys: ['editor-1', 'legacy:second-editor', 'legacy:second-editor'],
    designer_keys: [], ugc_manager_keys: [],
  }]
  const before = structuredClone(rows)
  const result = buildWorkloads({ people, allocations: rows })
  assert.equal(result.strategists[0].concepts, 9)
  assert.equal(result.strategists[0].assignments[0].workload_share, 1)
  assert.equal(result.editors[0].videos, 1)
  assert.ok(result.unmatchedKeys.includes('legacy:second-editor'))
  assert.deepEqual(rows, before)
})

test('workload calculations do not mutate frozen source allocations or snapshots', () => {
  const fixture = sharedFixture(3)
  const snapshot = buildAllocationSnapshot(fixture.allocations)
  const before = structuredClone(snapshot)
  for (const field of Object.values(roleFields)) Object.freeze(snapshot[0][field])
  Object.freeze(snapshot[0])
  Object.freeze(snapshot)
  buildWorkloads({ people: fixture.people, allocations: snapshot })
  assert.deepEqual(snapshot, before)
  for (const field of Object.values(roleFields)) fixture.allocations[0][field].push('added-after-snapshot')
  assert.deepEqual(snapshot, before)
})

test('capacity status compares unrounded utilization even when display rounds to 100 percent', () => {
  const result = buildWorkloads({
    people, workingDays: 1,
    allocations: [{ id: 'fractional', videos: 5.01, editor_keys: ['editor-1'] }],
  })
  assert.equal(result.editors[0].utilization, 100)
  assert.equal(result.editors[0].status, 'overloaded')
})

test('parseIds safely normalizes ID arrays and rejects non-array JSON without rewriting valid IDs', () => {
  assert.deepEqual(parseIds(['legacy:First Name', 'legacy:First Name', '', ' ', null, 42]), ['legacy:First Name'])
  assert.deepEqual(parseIds('["one", "one", "two"]'), ['one', 'two'])
  for (const invalid of ['null', 'false', '"one"', '{"id":"one"}', 'broken', 42, null]) {
    assert.deepEqual(parseIds(invalid), [])
  }
})

test('live allocations retain legacy assigned_cs_id when the roster CS list is empty', () => {
  const rosterPeople = [{ ...people[0], profile_id: 'legacy-cs-profile' }]
  for (const cs_ids of [undefined, null, [], '[]']) {
    const result = buildRosterAllocations({
      people: rosterPeople,
      clients: [{ id: 'legacy-client', name: 'Legacy Client', cs_ids, assigned_cs_id: 'legacy-cs-profile' }],
    })
    assert.equal(result[0].strategist_key, 'cs-1')
    assert.deepEqual(result[0].strategist_keys, ['cs-1'])
    assert.deepEqual(result[0].strategist_profile_ids, ['legacy-cs-profile'])
  }
})

test('unmapped CS shares never become foreign-key primary keys at month close', () => {
  const rosterPeople = [{ ...people[0], profile_id: 'mapped-profile' }]
  const rows = buildRosterAllocations({
    people: rosterPeople,
    clients: [
      { id: 'all-unmapped', name: 'All Unmapped', cs_ids: ['missing-profile'] },
      { id: 'partly-mapped', name: 'Partly Mapped', cs_ids: ['missing-profile', 'mapped-profile'] },
    ],
  })
  const snapshot = buildAllocationSnapshot(rows)
  assert.equal(rows[0].strategist_key, null)
  assert.equal(rows[1].strategist_key, 'cs-1')
  assert.equal(snapshot[0].strategist_key, null)
  assert.equal(snapshot[1].strategist_key, 'cs-1')
  assert.deepEqual(snapshot[0].strategist_keys, ['unmapped:missing-profile:creative_strategist'])
  assert.deepEqual(snapshot[1].strategist_keys, ['unmapped:missing-profile:creative_strategist', 'cs-1'])
  assert.deepEqual(rows[1].strategist_profile_ids, ['missing-profile', 'mapped-profile'])
})

test('inactive mapped assignees preserve their share and appear in assignment warnings', () => {
  const fixture = sharedFixture(2)
  const inactiveKeys = []
  for (const role of Object.keys(roleFields)) {
    const person = fixture.people.find(person => person.discipline === role)
    person.is_active = false
    inactiveKeys.push(person.source_key)
  }
  const result = buildWorkloads(fixture)
  assert.deepEqual(new Set(result.unmatchedKeys), new Set(inactiveKeys))
  assert.equal(result.strategists.length, 1)
  assert.equal(result.strategists[0].concepts, 11.5)
  assert.equal(result.editors[0].concepts, 6.5)
  assert.equal(result.designers[0].concepts, 5)
  assert.equal(result.ugcManagers[0].clientEquivalents, 0.5)
})

test('machine epsilon from equal thirds does not create phantom overload or hires at exact capacity', () => {
  const fixture = sharedFixture(3)
  fixture.allocations = Array.from({ length: 6 }, (_, index) => ({
    ...fixture.allocations[0], id: `allocation-${index}`, client_id: `client-${index}`, statics: 50, videos: 0,
  }))
  const result = buildWorkloads(fixture)
  for (const person of result.strategists) {
    closeTo(person.concepts, 100)
    assert.equal(person.status, 'near_capacity')
  }
  const signals = buildHiringSignals({ workloadsByRole: { creative_strategist: result.strategists } })
  const csSignal = signals.find(signal => signal.key === 'creative_strategist')
  closeTo(csSignal.used, 300)
  assert.equal(csSignal.requiredPeople, 0)
  assert.equal(csSignal.signal, 'plan')
  const projected = projectGrowthScenario({ signals }).projected.find(signal => signal.key === 'creative_strategist')
  assert.equal(projected.peopleNeeded, 0)
})
