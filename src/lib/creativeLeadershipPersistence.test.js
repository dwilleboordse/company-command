import test from 'node:test'
import assert from 'node:assert/strict'
import { persistCreativeRecord } from './creativeLeadershipPersistence.js'

function fakeClient(result) {
  const calls = []
  const query = {}
  for (const method of ['from', 'insert', 'update', 'eq', 'select']) query[method] = (...args) => { calls.push([method, ...args]); return query }
  query.single = async () => result
  return { client: query, calls }
}

test('new creative records insert while edits target the exact id and version', async () => {
  for (const table of ['creative_lead_reviews', 'creative_lead_actions', 'creative_lead_coaching']) {
    const { client, calls } = fakeClient({ data: { id: 'saved', version: 3 }, error: null })
    await persistCreativeRecord(client, table, { status: 'open' }, { id: 'saved', version: 2 })
    assert.deepEqual(calls.filter(call => call[0] === 'eq'), [['eq', 'id', 'saved'], ['eq', 'version', 2]])
    assert.equal(calls.some(call => call[0] === 'insert'), false)
    const created = fakeClient({ data: { id: 'new' }, error: null })
    await persistCreativeRecord(created.client, table, { title: 'New' })
    assert.equal(created.calls.some(call => call[0] === 'insert'), true)
    assert.equal(created.calls.some(call => call[0] === 'update'), false)
  }
})

test('creative persistence rejects stale, denied, duplicate and empty write responses', async () => {
  for (const error of [{ code: 'PGRST116' }, { code: '42501', message: 'denied' }, { code: '23505', message: 'duplicate' }, null]) {
    const { client } = fakeClient({ data: null, error })
    await assert.rejects(persistCreativeRecord(client, 'creative_lead_reviews', {}, { id: 'saved', version: 2 }))
  }
})

test('invalid record identity or table is rejected before a query', async () => {
  const { client, calls } = fakeClient({ data: { id: 'saved' } })
  for (const existing of [{ id: 'saved' }, { id: 'saved', version: 0 }, { version: 1 }]) {
    await assert.rejects(persistCreativeRecord(client, 'creative_lead_actions', {}, existing))
  }
  await assert.rejects(persistCreativeRecord(client, 'profiles', {}))
  assert.deepEqual(calls, [])
})
