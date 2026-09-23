import { hasFullDashboardAccess } from './roleAccess.js'

// Operations managers get the business overview without gaining privileged
// modules. A separately authorized AI Engineer gets the complete application.
export function hasBusinessDashboardAccess(profile) {
  return Boolean(profile && profile.is_active !== false
    && (hasFullDashboardAccess(profile) || profile.position === 'ops_manager'))
}
