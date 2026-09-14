// This dashboard capability is narrower than all Operations staff and does not
// grant CEO access to financial models, hiring, admin, or CEO-only key results.
export function hasBusinessDashboardAccess(profile) {
  return Boolean(profile && profile.is_active !== false
    && (profile.role === 'ceo' || profile.position === 'ops_manager'))
}
