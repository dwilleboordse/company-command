import { healthWeekSummary, isHealthEntityActive } from './healthWeekly.js'

export function canPromptWeeklyHealth(profile) {
  return Boolean(profile?.id && profile.is_active === true
    && profile.position === 'ops_manager' && profile.role !== 'ceo')
}

export function healthPromptSummary(kind, entities, entries, week) {
  // Historical pages keep offboarded people's and archived clients' saved rows.
  // The dashboard task list is only for people/clients who are still active.
  return healthWeekSummary(kind, entities.filter(entity => isHealthEntityActive(kind, entity)), entries, week)
}

export function healthPromptSessionKey(userId, week) {
  return `weekly-health-review:${userId}:${week}`
}
