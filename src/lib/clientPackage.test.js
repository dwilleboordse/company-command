import assert from 'node:assert/strict'
import test from 'node:test'
import { formatCreatorTarget, packageFormValues, packagePayload, validateClientPackage } from './clientPackage.js'
import { buildAllocationSnapshot, buildRosterAllocations } from './workforcePlanning.js'

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

test('editing creator targets preserves existing concepts, variations, and unknown creative fields', () => {
  const original = freeze({
    package_type: 'Statics + Video Remix',
    creatives: {
      video: { concepts: 15, variations: 4, notes: 'Keep existing variations' },
      static: { concepts: 10, variations: 3 },
      ugc: { concepts: 6, variations: 2 },
      custom: { concepts: 2, variations: 5, format: 'Carousel' },
    },
    ugc_creators_per_month: 4,
    seeding_creators_per_month: null,
  })
  const before = structuredClone(original)
  const form = packageFormValues(original)
  form.ugc_creators_per_month = '8'
  form.seeding_creators_per_month = '12'
  const saved = packagePayload(form)

  assert.deepEqual(saved.creatives, original.creatives)
  assert.equal(saved.package_type, original.package_type)
  assert.equal(saved.ugc_creators_per_month, 8)
  assert.equal(saved.seeding_creators_per_month, 12)
  assert.deepEqual(original, before)
})

test('form edits and payload normalization leave the source creative values untouched', () => {
  const original = freeze({
    package_type: '  Custom package  ',
    creatives: { video: { concepts: 12, variations: 3, brief: 'Preserve' } },
  })
  const form = packageFormValues(original)
  form.creatives.video.concepts = '18'
  const saved = packagePayload(form)

  assert.equal(saved.package_type, 'Custom package')
  assert.deepEqual(saved.creatives.video, { concepts: 18, variations: 3, brief: 'Preserve' })
  assert.deepEqual(saved.creatives.static, { concepts: 0, variations: 0 })
  assert.deepEqual(saved.creatives.ugc, { concepts: 0, variations: 0 })
  assert.deepEqual(original.creatives, { video: { concepts: 12, variations: 3, brief: 'Preserve' } })
  assert.equal(original.package_type, '  Custom package  ')
  assert.equal(form.creatives.video.concepts, '18')
})

test('creative package is required when adding a client but permits existing unrecorded packages', () => {
  for (const package_type of [undefined, '', '   ']) {
    const form = { ...packageFormValues(), package_type }
    assert.equal(validateClientPackage(form), '')
    assert.equal(validateClientPackage(form, { requirePackage: false }), '')
    assert.match(validateClientPackage(form, { requirePackage: true }), /creative package/)
  }
  assert.equal(validateClientPackage({ package_type: '  Video + UGC  ' }, { requirePackage: true }), '')
})

test('blank creator targets remain unknown while explicit zero remains zero', () => {
  const legacyForm = packageFormValues({ creatives: { static: { concepts: 10, variations: 3 } } })
  assert.equal(legacyForm.ugc_creators_per_month, '')
  assert.equal(legacyForm.seeding_creators_per_month, '')

  for (const blank of [undefined, null, '', '   ']) {
    const saved = packagePayload({ ...legacyForm, ugc_creators_per_month: blank, seeding_creators_per_month: blank })
    assert.equal(saved.ugc_creators_per_month, null)
    assert.equal(saved.seeding_creators_per_month, null)
  }
  const zeros = packagePayload({ ...legacyForm, ugc_creators_per_month: '0', seeding_creators_per_month: 0 })
  assert.equal(zeros.ugc_creators_per_month, 0)
  assert.equal(zeros.seeding_creators_per_month, 0)
  assert.equal(packageFormValues(zeros).ugc_creators_per_month, 0)
  assert.equal(formatCreatorTarget(null), 'Not set')
  assert.equal(formatCreatorTarget(undefined), 'Not set')
  assert.equal(formatCreatorTarget(''), 'Not set')
  assert.equal(formatCreatorTarget(0), '0')
  assert.equal(formatCreatorTarget(12), '12')
})

test('both monthly sourcing targets accept nonnegative whole numbers within database range', () => {
  for (const field of ['ugc_creators_per_month', 'seeding_creators_per_month']) {
    for (const input of [0, '0', 1, '12', ' 25 ', 2147483647]) {
      const form = { ...packageFormValues(), [field]: input }
      assert.equal(validateClientPackage(form), '', `${field}: ${input}`)
      assert.equal(packagePayload(form)[field], Number(input))
    }
  }
})

test('invalid monthly sourcing targets cannot reach a save payload', () => {
  for (const field of ['ugc_creators_per_month', 'seeding_creators_per_month']) {
    for (const input of [-1, '-1', 0.5, '1.5', Infinity, -Infinity, 'Infinity', NaN, 'two', 2147483648]) {
      const form = { ...packageFormValues(), [field]: input }
      assert.match(validateClientPackage(form), /Monthly creator targets/, `${field}: ${input}`)
      assert.throws(() => packagePayload(form), /Monthly creator targets/)
    }
  }
})

test('concept and variation inputs remain whole-number deliverables', () => {
  for (const type of ['video', 'ugc', 'static']) {
    for (const field of ['concepts', 'variations']) {
      for (const input of [-1, '1.5', Infinity]) {
        const form = packageFormValues()
        form.creatives[type][field] = input
        assert.match(validateClientPackage(form), /Concepts and variations/)
        assert.throws(() => packagePayload(form), /Concepts and variations/)
      }
    }
  }
})

test('current roster package and sourcing targets flow into a stable monthly snapshot', () => {
  const client = {
    id: 'client-1',
    name: 'Monthly Client',
    is_active: true,
    is_archived: false,
    package_type: 'Video Remix + UGC',
    ugc_creators_per_month: 5,
    seeding_creators_per_month: 0,
    creatives: { video: { concepts: 15, variations: 3 }, ugc: { concepts: 5, variations: 2 } },
  }
  const allocations = buildRosterAllocations({ clients: [client], monthStart: '2026-09-01' })
  const snapshot = buildAllocationSnapshot(allocations)

  assert.equal(allocations[0].package_type, 'Video Remix + UGC')
  assert.equal(allocations[0].ugc_creators_per_month, 5)
  assert.equal(allocations[0].seeding_creators_per_month, 0)
  assert.equal(snapshot[0].package_type, 'Video Remix + UGC')
  assert.equal(snapshot[0].ugc_creators_per_month, 5)
  assert.equal(snapshot[0].seeding_creators_per_month, 0)
  assert.equal(snapshot[0].videos, 20)

  client.package_type = 'New package'
  client.ugc_creators_per_month = 10
  client.seeding_creators_per_month = 12
  client.creatives.video.concepts = 30
  const nextMonth = buildRosterAllocations({ clients: [client], monthStart: '2026-10-01' })
  assert.equal(nextMonth[0].package_type, 'New package')
  assert.equal(nextMonth[0].ugc_creators_per_month, 10)
  assert.equal(nextMonth[0].seeding_creators_per_month, 12)
  assert.equal(nextMonth[0].videos, 35)
  assert.equal(snapshot[0].package_type, 'Video Remix + UGC')
  assert.equal(snapshot[0].ugc_creators_per_month, 5)
  assert.equal(snapshot[0].seeding_creators_per_month, 0)
  assert.equal(snapshot[0].videos, 20)

  allocations[0].package_type = 'Edited live allocation'
  allocations[0].ugc_creators_per_month = 99
  allocations[0].seeding_creators_per_month = 99
  assert.equal(snapshot[0].package_type, 'Video Remix + UGC')
  assert.equal(snapshot[0].ugc_creators_per_month, 5)
  assert.equal(snapshot[0].seeding_creators_per_month, 0)
})

test('old allocation snapshots retain unknown package and creator targets', () => {
  const oldAllocation = freeze({
    source_key: 'legacy-client',
    client_name_snapshot: 'Historical Client',
    statics: 12,
    videos: 18,
  })
  const snapshot = buildAllocationSnapshot([oldAllocation])[0]
  assert.equal(snapshot.package_type, null)
  assert.equal(snapshot.ugc_creators_per_month, null)
  assert.equal(snapshot.seeding_creators_per_month, null)
  assert.equal(snapshot.statics, 12)
  assert.equal(snapshot.videos, 18)
  assert.equal(Object.hasOwn(oldAllocation, 'ugc_creators_per_month'), false)

  const live = buildRosterAllocations({ clients: [{ id: 'legacy-client', name: 'Historical Client' }] })[0]
  assert.equal(live.ugc_creators_per_month, null)
  assert.equal(live.seeding_creators_per_month, null)
})
