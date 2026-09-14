import test from 'node:test'
import assert from 'node:assert/strict'
import { hasBusinessDashboardAccess } from './dashboardAccess.js'
import { canViewOkr } from './dashboardOkrs.js'

test('CEO and Operations Manager share the business dashboard capability', () => {
  assert.equal(hasBusinessDashboardAccess({ role: 'ceo', position: 'management' }), true)
  assert.equal(hasBusinessDashboardAccess({ role: 'management', position: 'ops_manager', department: 'operations' }), true)
  assert.equal(hasBusinessDashboardAccess({ role: 'athlete', position: 'ops_manager' }), true)
})

test('business dashboard access does not expand to assistants, other management, or inactive profiles', () => {
  for (const profile of [null, {}, { role: 'management' },
    { role: 'athlete', position: 'ops_assistant', department: 'operations' },
    { role: 'athlete', position: 'creative_strategist' },
    { role: 'ceo', is_active: false }, { position: 'ops_manager', is_active: false }]) {
    assert.equal(hasBusinessDashboardAccess(profile), false)
  }
})

test('sharing the business dashboard does not grant CEO-only OKR visibility', () => {
  const manager = { role: 'management', position: 'ops_manager' }
  assert.equal(hasBusinessDashboardAccess(manager), true)
  assert.equal(canViewOkr({ visibility: 'ceo' }, { isCEO: manager.role === 'ceo', isManagement: true }), false)
  assert.equal(canViewOkr({ visibility: 'management' }, { isCEO: false, isManagement: true }), true)
})
