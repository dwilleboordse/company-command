export const SURVEY_REPLY_MAX_LENGTH = 5000
export const SURVEY_REPLY_PAGE_SIZE = 50
export const SURVEY_REPLY_COLUMNS = 'id,submission_id,section_key,body,author_id,author_name,created_at'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/

export function surveyReplyDraftKey(userId, submissionId, sectionKey) {
  return JSON.stringify([userId, submissionId, sectionKey])
}

export function surveyReplyBodyError(value) {
  if (typeof value !== 'string' || !value.trim()) return 'Write a reply before sending.'
  if (Array.from(value.trim()).length > SURVEY_REPLY_MAX_LENGTH) return 'Keep your reply to 5,000 characters or fewer.'
  return ''
}

export function surveyReplySections(questions = [], feedback) {
  if (feedback?.status !== 'finalized') return []
  const questionLabels = new Map(questions.map(question => [question.question_key, question.prompt]))
  const sections = Object.entries(feedback.feedback || {}).flatMap(([key, value]) => (
    typeof value === 'string' && value.trim()
      ? [{ key: `question:${key}`, label: questionLabels.get(key) || `Archived survey question: ${key}` }]
      : []
  ))
  if (feedback.praises?.trim()) sections.push({ key: 'praises', label: 'Praises' })
  if (feedback.growth_notes?.trim()) sections.push({ key: 'growth_notes', label: 'Growth notes' })
  return sections
}

export function mergeSurveyReplies(existing = [], incoming = []) {
  const byId = new Map(existing.map(reply => [reply.id, reply]))
  incoming.forEach(reply => byId.set(reply.id, reply))
  return Array.from(byId.values()).sort((a, b) => (
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  ))
}

export async function loadSurveyReplyPage(client, submissionId, cursor = null) {
  if (!UUID_PATTERN.test(submissionId || '')) throw new Error('A valid review is required to load replies.')
  let query = client.from('monthly_survey_feedback_replies')
    .select(SURVEY_REPLY_COLUMNS, { count: 'exact' })
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(SURVEY_REPLY_PAGE_SIZE + 1)
  if (cursor) {
    // Only use validated, server-returned cursor values in PostgREST's raw OR syntax.
    if (!UUID_PATTERN.test(cursor.id || '') || !TIMESTAMP_PATTERN.test(cursor.created_at || '')) {
      throw new Error('Unable to load the next replies. Refresh this review and try again.')
    }
    query = query.or(`created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`)
  }
  const { data, error, count } = await query
  if (error) throw error
  const rows = (data || []).slice(0, SURVEY_REPLY_PAGE_SIZE)
  return {
    rows,
    cursor: rows.at(-1) || cursor,
    hasMore: (data || []).length > SURVEY_REPLY_PAGE_SIZE,
    total: cursor ? null : count,
  }
}

function matchesAttempt(reply, payload) {
  return reply?.id === payload.id && reply.submission_id === payload.submission_id
    && reply.section_key === payload.section_key && reply.body === payload.body
}

export async function sendSurveyFeedbackReply(client, payload, retry = false) {
  const validationError = surveyReplyBodyError(payload.body)
  if (validationError) throw new Error(validationError)
  if (!UUID_PATTERN.test(payload.id || '') || !UUID_PATTERN.test(payload.submission_id || '')) {
    throw new Error('Unable to identify this reply. Please refresh and try again.')
  }
  // Whitelist client fields: authorship and timestamp are always set by the server.
  const insert = { id: payload.id, submission_id: payload.submission_id, section_key: payload.section_key, body: payload.body.trim() }
  async function findAttempt() {
    const { data, error } = await client.from('monthly_survey_feedback_replies')
      .select(SURVEY_REPLY_COLUMNS).eq('submission_id', insert.submission_id).eq('id', insert.id).maybeSingle()
    if (error) throw error
    if (data && !matchesAttempt(data, insert)) throw new Error('This reply could not be verified. Contact Operations before sending again.')
    return data
  }
  if (retry) {
    const existing = await findAttempt()
    if (existing) return existing
  }
  try {
    const { data, error } = await client.from('monthly_survey_feedback_replies').insert(insert).select(SURVEY_REPLY_COLUMNS).single()
    if (error) throw error
    if (!matchesAttempt(data, insert)) throw new Error('The saved reply could not be confirmed.')
    return data
  } catch (insertError) {
    // A response can fail after the insert committed. Resolve that exact ID before retrying.
    const existing = await findAttempt()
    if (existing) return existing
    throw insertError
  }
}
