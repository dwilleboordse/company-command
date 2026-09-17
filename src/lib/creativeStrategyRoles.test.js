import test from 'node:test'
import assert from 'node:assert/strict'
import { CREATIVE_STRATEGY_POSITIONS, getRoleDiscipline, isCreativeStrategist, isHeadOfCreativeStrategy } from './creativeStrategyRoles.js'
import { hasBusinessDashboardAccess } from './dashboardAccess.js'
import { canLogSpendClient, scopeSpendClients } from './spendAnalytics.js'

const head = { id: 'head', position: 'head_of_creative_strategy', role: 'athlete', department: 'delivery', is_active: true }
const clients = [
  { id: 'own', cs_ids: ['head'] },
  { id: 'shared', cs_ids: ['head', 'other'] },
  { id: 'other', cs_ids: ['other'] },
  { id: 'unassigned', cs_ids: [] },
  { id: 'past', cs_ids: ['other'], is_active: false, is_archived: true },
]

test('head title remains a creative strategist discipline, not a management role', () => {
  assert.deepEqual(CREATIVE_STRATEGY_POSITIONS, ['creative_strategist', 'head_of_creative_strategy'])
  assert.equal(isHeadOfCreativeStrategy(head), true)
  assert.equal(isHeadOfCreativeStrategy('creative_strategist'), false)
  assert.equal(isCreativeStrategist(head), true)
  assert.equal(isCreativeStrategist('creative_strategist'), true)
  assert.equal(isCreativeStrategist(undefined), false)
  assert.equal(getRoleDiscipline(head.position), 'creative_strategist')
  assert.equal(getRoleDiscipline('editor'), 'editor')
  assert.equal(hasBusinessDashboardAccess(head), false)
})

test('CS head sees all current, past and unassigned spend clients without changing assignments', () => {
  const before = structuredClone(clients)
  assert.deepEqual(scopeSpendClients(clients, head), clients)
  assert.deepEqual(scopeSpendClients(clients, { ...head, position: 'creative_strategist' }).map(client => client.id), ['own', 'shared'])
  assert.deepEqual(scopeSpendClients(clients, { ...head, is_active: false }), [])
  assert.deepEqual(scopeSpendClients(clients, null, true), [])
  assert.deepEqual(clients, before)
})

test('head can still log assigned clients, but all-client viewing adds no peer editing controls', () => {
  assert.equal(canLogSpendClient(clients[0], head), true)
  assert.equal(canLogSpendClient(clients[1], head), true)
  assert.equal(canLogSpendClient({ assigned_cs_id: head.id }, head), true)
  assert.equal(canLogSpendClient(clients[2], head), false)
  assert.equal(canLogSpendClient(clients[3], head), false)
  assert.equal(canLogSpendClient(clients[2], head, true), true)
  assert.equal(canLogSpendClient(clients[0], { ...head, is_active: false }, true), false)
})
