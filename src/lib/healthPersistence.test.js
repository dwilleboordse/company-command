import test from 'node:test'
import assert from 'node:assert/strict'
import { persistHealthEntry } from './healthPersistence.js'
import { HEALTH_CONFIG } from './healthWeekly.js'

function fakeClient(result) {
  const calls = []
  const query = {}
  for (const method of ['from', 'insert', 'update', 'eq', 'is', 'select']) query[method] = (...args) => { calls.push([method, ...args]); return query }
  query.maybeSingle = async () => result
  return { client: query, calls }
}
const values = kind => ({ ...Object.fromEntries(HEALTH_CONFIG[kind].fields.map(({ key }) => [key, 4])), [HEALTH_CONFIG[kind].riskKey]: 'Medium', notes: 'review', actions: 'follow up', week_start: '2099-01-01', id: 'untrusted-id' })
test('new weekly review inserts one validated entity/week row without overwriting history', async () => {
  for (const kind of ['team', 'client']) {
    const { client, calls } = fakeClient({ data: { id: 'saved' }, error: null })
    const result = await persistHealthEntry(client, kind, { entityId: 'entity', userId: 'ops', week: '2026-08-31', values: values(kind) })
    assert.equal(result.id, 'saved')
    const payload = calls.find(call => call[0] === 'insert')[1]
    assert.equal(payload.week_start, '2026-08-31')
    assert.equal(payload[HEALTH_CONFIG[kind].idKey], 'entity')
    assert.equal(payload.id, undefined)
    assert.equal(calls.some(call => call[0] === 'update'), false)
  }
})
test('historical edit preserves original Sunday, row id and related actions, with concurrency guard', async () => {
  const { client, calls } = fakeClient({ data: { id: 'existing' } })
  const existing = { id: 'existing', client_id: 'entity', week_start: '2026-08-30', updated_at: '2026-08-31T08:00:00Z' }
  await persistHealthEntry(client, 'client', { entityId: 'entity', userId: 'ops', week: existing.week_start, existing, values: values('client') })
  assert.equal(calls.find(call => call[0] === 'update')[1].week_start, undefined)
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'id' && call[2] === existing.id))
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'updated_at' && call[2] === existing.updated_at))
})
test('invalid or mismatched submissions do not reach the database', async () => {
  for (const override of [{ week: '2026-08-30' }, { week: '2099-01-05' }, { values: {} }, { userId: null }, { existing: { id: 'other', client_id: 'other', week_start: '2026-08-31' } }]) {
    const { client, calls } = fakeClient({ data: { id: 'saved' } })
    await assert.rejects(persistHealthEntry(client, 'client', { entityId: 'entity', userId: 'ops', week: '2026-08-31', values: values('client'), ...override }))
    assert.deepEqual(calls, [])
  }
})
test('database, duplicate-week and concurrent-edit failures cannot report a successful save', async () => {
  for (const result of [{ data: null, error: { code: '23505', message: 'duplicate' } }, { data: null, error: { message: 'permission denied' } }, { data: null, error: null }]) {
    const { client } = fakeClient(result)
    await assert.rejects(persistHealthEntry(client, 'client', { entityId: 'entity', userId: 'ops', week: '2026-08-31', values: values('client') }))
  }
})
