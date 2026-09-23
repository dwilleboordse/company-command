export const ACCESS_ROLE_LABELS = {
  ceo: 'CEO', management: 'Management', athlete: 'Athlete', ai_engineer: 'AI Engineer',
}

// This flag is attached only to the current signed-in profile after the server
// confirms its separately provisioned capability. A job title is not access.
export function isAIEngineer(profile) {
  return profile?.role === 'ai_engineer' && profile.is_active === true
    && profile.has_ai_engineer_access === true
}

export function hasFullDashboardAccess(profile) {
  return Boolean(profile && profile.is_active !== false
    && (profile.role === 'ceo' || isAIEngineer(profile)))
}

export function getProfileAccess(profile) {
  const isCEO = profile?.role === 'ceo' && profile.is_active !== false
  const hasFullAccess = hasFullDashboardAccess(profile)
  return {
    isCEO,
    isAIEngineer: isAIEngineer(profile),
    hasFullAccess,
    isManagement: Boolean(profile && profile.is_active !== false
      && (profile.role === 'management' || hasFullAccess)),
    isOps: Boolean(profile && profile.is_active !== false
      && (profile.department?.trim().toLowerCase() === 'operations'
        || ['ops_manager', 'ops_assistant'].includes(profile.position))),
    canSeeFinancials: hasFullAccess,
  }
}

export async function withVerifiedProfileAccess(profile, client) {
  if (!profile) return null
  // Always overwrite any similarly named value from a profile row. The
  // capability must be confirmed by the database, never user-editable data.
  const verified = { ...profile, has_ai_engineer_access: false }
  if (profile.role !== 'ai_engineer' || profile.is_active !== true) return verified
  try {
    const { data, error } = await client.rpc('has_ai_engineer_access')
    verified.has_ai_engineer_access = !error && data === true
  } catch {
    // Fail closed on an unavailable capability lookup.
  }
  return verified
}
