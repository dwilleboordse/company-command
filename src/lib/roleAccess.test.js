import test from 'node:test'
import assert from 'node:assert/strict'
import { ACCESS_ROLE_LABELS, getProfileAccess, hasFullDashboardAccess, isAIEngineer, withVerifiedProfileAccess } from './roleAccess.js'
import { hasBusinessDashboardAccess } from './dashboardAccess.js'
import { canReviewCreativeLeadership, canUseCreativeLeadership, isCreativeLead } from './creativeLeadership.js'
import { canViewOkr, buildDashboardOkrs, formatOkrLabel } from './dashboardOkrs.js'
import { roleLabel } from './workforcePlanning.js'
import { scopeSpendClients, canLogSpendClient } from './spendAnalytics.js'
import { isCreativeStrategist } from './creativeStrategyRoles.js'
import { canPromptWeeklyHealth } from './healthPrompt.js'

const engineer = { id: 'engineer', role: 'ai_engineer', position: 'ai_engineer',
  department: 'support', is_active: true, has_ai_engineer_access: true }

test('authorized AI Engineer gets full application capabilities without becoming CEO or creative staff', () => {
  const access = getProfileAccess(engineer)
  assert.deepEqual(access, { isCEO: false, isAIEngineer: true, hasFullAccess: true,
    isManagement: true, isOps: false, canSeeFinancials: true })
  assert.equal(hasBusinessDashboardAccess(engineer), true)
  assert.equal(canUseCreativeLeadership(engineer), true)
  assert.equal(canReviewCreativeLeadership(engineer), true)
  assert.equal(isCreativeLead(engineer), false)
  assert.equal(isCreativeStrategist(engineer), false)
  assert.equal(canPromptWeeklyHealth(engineer), false)
  assert.equal(canViewOkr({ visibility: 'ceo' }, access), true)
  assert.equal(canViewOkr({ visibility: 'management' }, access), true)
  const clients = [{ id: 'one', cs_ids: ['other'] }, { id: 'two' }]
  assert.deepEqual(scopeSpendClients(clients, engineer, access.isManagement), clients)
  assert.equal(canLogSpendClient(clients[0], engineer, access.isManagement), true)
})

test('AI full access requires active role and server capability; position alone never grants it', () => {
  for (const profile of [null, {}, { ...engineer, role: 'athlete' },
    { ...engineer, has_ai_engineer_access: false }, { ...engineer, has_ai_engineer_access: undefined },
    { ...engineer, has_ai_engineer_access: 'true' }, { ...engineer, is_active: false },
    { ...engineer, is_active: undefined }]) {
    assert.equal(isAIEngineer(profile), false)
    assert.equal(hasFullDashboardAccess(profile), false)
    assert.equal(getProfileAccess(profile).hasFullAccess, false)
    assert.equal(hasBusinessDashboardAccess(profile), false)
    assert.equal(canUseCreativeLeadership(profile), false)
  }
})

test('existing CEO, management, operations and regular team access remains distinct', () => {
  assert.deepEqual(getProfileAccess({ role: 'ceo', is_active: true }), {
    isCEO: true, isAIEngineer: false, hasFullAccess: true, isManagement: true, isOps: false, canSeeFinancials: true,
  })
  for (const profile of [{ role: 'management' }, { role: 'athlete', position: 'ops_manager' },
    { role: 'athlete', position: 'ops_assistant', department: 'operations' },
    { role: 'athlete', position: 'head_of_creative_strategy' }, { role: 'athlete', position: 'creative_strategist' }]) {
    assert.equal(getProfileAccess(profile).hasFullAccess, false)
    assert.equal(getProfileAccess(profile).isCEO, false)
    assert.equal(canViewOkr({ visibility: 'ceo' }, getProfileAccess(profile)), false)
  }
  assert.equal(getProfileAccess({ role: 'ceo', is_active: false }).hasFullAccess, false)
})

test('capability lookup trusts only successful boolean RPC response and overwrites profile flags', async () => {
  for (const response of [{ data: true, error: null }, { data: false }, { data: 'true' },
    { data: true, error: { message: 'Denied' } }, { data: null }]) {
    const calls = []
    const profile = await withVerifiedProfileAccess(engineer, { rpc: async name => { calls.push(name); return response } })
    assert.deepEqual(calls, ['has_ai_engineer_access'])
    assert.equal(profile.has_ai_engineer_access, !response.error && response.data === true)
    assert.equal(engineer.has_ai_engineer_access, true)
  }
  const failed = await withVerifiedProfileAccess(engineer, { rpc: async () => { throw new Error('Offline') } })
  assert.equal(failed.has_ai_engineer_access, false)
})

test('non-AI and inactive profiles do not call the capability endpoint or retain injected flags', async () => {
  const client = { rpc: () => { throw new Error('Unexpected lookup') } }
  for (const profile of [{ ...engineer, role: 'athlete' }, { ...engineer, is_active: false },
    { ...engineer, role: 'ceo' }]) {
    const result = await withVerifiedProfileAccess(profile, client)
    assert.equal(result.has_ai_engineer_access, false)
  }
  assert.equal(await withVerifiedProfileAccess(null, client), null)
})

test('AI Engineer dashboard includes CEO-only key results while preserving its own identity', () => {
  const rows = buildDashboardOkrs({ profile: engineer, ...getProfileAccess(engineer), scope: 'company',
    objectives: [{ id: 'company', department: 'company' }],
    keyResults: [{ id: 'private-result', objective_id: 'company', visibility: 'ceo' }] })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].results[0].id, 'private-result')
})

test('AI Engineer labels preserve the acronym across role displays', () => {
  assert.equal(ACCESS_ROLE_LABELS.ai_engineer, 'AI Engineer')
  assert.equal(formatOkrLabel('ai_engineer'), 'AI Engineer')
  assert.equal(roleLabel('ai_engineer'), 'AI Engineer')
})
