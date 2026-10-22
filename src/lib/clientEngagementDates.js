// Start and end dates on the Client Roster's Add/Edit Client form.
//
// The dates live in client_churn_profiles (engagement_start, engagement_end), the same
// record Churn Analysis edits, so both screens always show the same dates. The rules
// match Churn Analysis: only a paused or past client can have an end date, and only
// management (CEO, management, AI Engineer) can write the record.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function cleanDate(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return ISO_DATE.test(text) ? text : ''
}

// The roster only lists active clients; is_archived marks a paused one.
export function canSetEngagementEnd(client) {
  return Boolean(client && client.is_archived)
}

export function engagementDateFormValues(record) {
  return {
    engagement_start: cleanDate(record?.engagement_start),
    engagement_end: cleanDate(record?.engagement_end),
  }
}

export function validateEngagementDates(form, { canSetEnd = false } = {}) {
  const start = cleanDate(form?.engagement_start)
  const end = canSetEnd ? cleanDate(form?.engagement_end) : ''
  if (start && end && end < start) return 'The end date cannot be before the start date.'
  return ''
}

// Only the two date columns plus who changed them: an upsert with this payload leaves the
// retainer, churn reason and notes that Churn Analysis keeps on the same row untouched.
export function engagementDatesPayload({ clientId, form, canSetEnd = false, profileId = null, now = new Date() }) {
  return {
    client_id: clientId,
    engagement_start: cleanDate(form?.engagement_start) || null,
    engagement_end: canSetEnd ? cleanDate(form?.engagement_end) || null : null,
    updated_by: profileId,
    updated_at: now.toISOString(),
  }
}

export function engagementDatesChanged(record, form, { canSetEnd = false } = {}) {
  const before = engagementDateFormValues(record)
  const start = cleanDate(form?.engagement_start)
  const end = canSetEnd ? cleanDate(form?.engagement_end) : before.engagement_end
  return start !== before.engagement_start || end !== before.engagement_end
}
