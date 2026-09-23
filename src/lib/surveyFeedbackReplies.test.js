import assert from 'node:assert/strict'
import test from 'node:test'
import {
  loadSurveyReplyPage,
  mergeSurveyReplies,
  sendSurveyFeedbackReply,
  SURVEY_REPLY_COLUMNS,
  surveyReplyBodyError,
  surveyReplyDraftKey,
  surveyReplySections,
} from './surveyFeedbackReplies.js'

const submissionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const replyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const payload = { id: replyId, submission_id: submissionId, section_key: 'question:confidence', body: 'My follow-up' }
const saved = { ...payload, author_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', author_name: 'Team Member', created_at: '2026-09-23T10:00:00.123456+00:00' }

function scriptedClient(responses) {
  const calls = []
  return {
    calls,
    from(table) {
      const call = { table, chain: [] }
      calls.push(call)
      const builder = {}
      for (const method of ['select', 'eq', 'order', 'limit', 'or', 'insert']) {
        builder[method] = (...args) => { call.chain.push([method, ...args]); return builder }
      }
      const execute = () => {
        assert.ok(responses.length, 'Unexpected extra API request')
        const result = responses.shift()
        return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
      }
      builder.single = () => { call.chain.push(['single']); return execute() }
      builder.maybeSingle = () => { call.chain.push(['maybeSingle']); return execute() }
      builder.then = (resolve, reject) => execute().then(resolve, reject)
      return builder
    },
  }
}

test('only non-empty finalized notes expose reply sections, including archived questions', () => {
  const feedback = { status: 'draft', feedback: { confidence: 'Please explain?', archived: 'Old question?', empty: '   ' }, praises: 'Well done', growth_notes: 'Next steps?' }
  assert.deepEqual(surveyReplySections([], feedback), [])
  assert.deepEqual(surveyReplySections([{ question_key: 'confidence', prompt: 'How confident are you?' }], { ...feedback, status: 'finalized' }), [
    { key: 'question:confidence', label: 'How confident are you?' },
    { key: 'question:archived', label: 'Archived survey question: archived' },
    { key: 'praises', label: 'Praises' },
    { key: 'growth_notes', label: 'Growth notes' },
  ])
})

test('draft keys isolate account, review month, and feedback section', () => {
  const key = surveyReplyDraftKey('user-1', 'review-1', 'question:one')
  assert.notEqual(key, surveyReplyDraftKey('user-2', 'review-1', 'question:one'))
  assert.notEqual(key, surveyReplyDraftKey('user-1', 'review-2', 'question:one'))
  assert.notEqual(key, surveyReplyDraftKey('user-1', 'review-1', 'praises'))
  assert.deepEqual(JSON.parse(key), ['user-1', 'review-1', 'question:one'])
})

test('reply validation rejects whitespace and oversized bodies with a 5,000-character boundary', () => {
  assert.match(surveyReplyBodyError(' \n\t '), /Write a reply/)
  assert.match(surveyReplyBodyError(null), /Write a reply/)
  assert.equal(surveyReplyBodyError(' ' + 'a'.repeat(5000) + ' '), '')
  assert.match(surveyReplyBodyError('a'.repeat(5001)), /5,000/)
  assert.equal(surveyReplyBodyError('😀'.repeat(5000)), '')
})

test('reply merge deduplicates retry results and deterministically orders timestamp ties by ID', () => {
  const first = { ...saved, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
  const newer = { ...saved, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', created_at: '2026-09-23T10:00:01.000000+00:00' }
  const existing = [newer, saved]
  assert.deepEqual(mergeSurveyReplies(existing, [saved, first]).map(reply => reply.id), [first.id, saved.id, newer.id])
  assert.deepEqual(existing, [newer, saved], 'Original rows must not be mutated')
})

test('reply page is scoped to one submission with bounded deterministic pagination', async () => {
  const data = Array.from({ length: 51 }, (_, i) => ({ ...saved, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }))
  const client = scriptedClient([{ data, error: null, count: 82 }])
  const result = await loadSurveyReplyPage(client, submissionId)
  assert.equal(result.rows.length, 50)
  assert.equal(result.cursor.id, data[49].id)
  assert.equal(result.hasMore, true)
  assert.equal(result.total, 82)
  assert.equal(client.calls[0].table, 'monthly_survey_feedback_replies')
  assert.deepEqual(client.calls[0].chain, [
    ['select', SURVEY_REPLY_COLUMNS, { count: 'exact' }],
    ['eq', 'submission_id', submissionId],
    ['order', 'created_at', { ascending: true }],
    ['order', 'id', { ascending: true }],
    ['limit', 51],
  ])
})

test('next page uses a strict timestamp + UUID cursor, including equal-timestamp ties', async () => {
  const client = scriptedClient([{ data: [], error: null, count: 0 }])
  const result = await loadSurveyReplyPage(client, submissionId, saved)
  assert.deepEqual(client.calls[0].chain.at(-1), ['or', `created_at.gt.${saved.created_at},and(created_at.eq.${saved.created_at},id.gt.${saved.id})`])
  assert.equal(result.hasMore, false)
  assert.equal(result.total, null, 'Remaining row count must not replace the full review count')
})

test('malformed review and cursor values never reach a raw filter', async () => {
  const client = scriptedClient([])
  await assert.rejects(() => loadSurveyReplyPage(client, 'wrong'), /valid review/)
  assert.equal(client.calls.length, 0)
  await assert.rejects(() => loadSurveyReplyPage(client, submissionId, { ...saved, id: `${replyId}),id.neq.null` }), /Refresh/)
  await assert.rejects(() => loadSurveyReplyPage(client, submissionId, { ...saved, created_at: 'today),id.neq.null' }), /Refresh/)
  assert.equal(client.calls.flatMap(call => call.chain).some(item => item[0] === 'or'), false)
})

test('reply page errors are not presented as empty successful history', async () => {
  const client = scriptedClient([{ data: null, error: new Error('Network error') }])
  await assert.rejects(() => loadSurveyReplyPage(client, submissionId), /Network/)
})

test('send whitelists fields, trims text, and relies on server author and timestamp', async () => {
  const client = scriptedClient([{ data: saved, error: null }])
  const result = await sendSurveyFeedbackReply(client, { ...payload, body: '  My follow-up  ', author_id: 'spoofed', author_name: 'Wrong', created_at: 'wrong' })
  assert.deepEqual(client.calls[0].chain[0], ['insert', payload])
  assert.deepEqual(client.calls[0].chain.slice(1), [['select', SURVEY_REPLY_COLUMNS], ['single']])
  assert.equal(result.author_name, 'Team Member')
})

test('uncertain committed send resolves its exact ID instead of inserting another reply', async () => {
  const client = scriptedClient([new Error('Response lost after commit'), { data: saved, error: null }])
  const result = await sendSurveyFeedbackReply(client, payload)
  assert.deepEqual(result, saved)
  assert.deepEqual(client.calls[1].chain, [
    ['select', SURVEY_REPLY_COLUMNS], ['eq', 'submission_id', submissionId], ['eq', 'id', replyId], ['maybeSingle'],
  ])
  assert.equal(client.calls.filter(call => call.chain[0][0] === 'insert').length, 1)
})

test('retry checks for an existing matching reply before attempting any insert', async () => {
  const client = scriptedClient([{ data: saved, error: null }])
  assert.deepEqual(await sendSurveyFeedbackReply(client, payload, true), saved)
  assert.equal(client.calls.some(call => call.chain[0][0] === 'insert'), false)
})

test('retry after confirmed absence inserts the original ID and body, not a new message', async () => {
  const client = scriptedClient([{ data: null, error: null }, { data: saved, error: null }])
  assert.deepEqual(await sendSurveyFeedbackReply(client, payload, true), saved)
  assert.deepEqual(client.calls[1].chain[0], ['insert', payload])
})

test('duplicate insert conflict can only resolve to exactly the same review, section and text', async () => {
  const client = scriptedClient([{ data: null, error: { code: '23505', message: 'Duplicate ID' } }, { data: saved, error: null }])
  assert.deepEqual(await sendSurveyFeedbackReply(client, payload), saved)
  const conflict = scriptedClient([{ data: { ...saved, body: 'Different message' }, error: null }])
  await assert.rejects(() => sendSurveyFeedbackReply(conflict, payload, true), /Contact Operations/)
})

test('failed send and absent ID report failure rather than silently consuming a draft', async () => {
  const client = scriptedClient([{ data: null, error: new Error('Permission denied') }, { data: null, error: null }])
  await assert.rejects(() => sendSurveyFeedbackReply(client, payload), /Permission denied/)
  assert.equal(payload.body, 'My follow-up')
})

test('retry lookup errors prevent another uncertain insert', async () => {
  const client = scriptedClient([{ data: null, error: new Error('Offline') }])
  await assert.rejects(() => sendSurveyFeedbackReply(client, payload, true), /Offline/)
  assert.equal(client.calls.length, 1)
  assert.equal(client.calls.some(call => call.chain[0][0] === 'insert'), false)
})

test('empty or invalid-ID replies are rejected before accessing the API', async () => {
  const client = scriptedClient([])
  await assert.rejects(() => sendSurveyFeedbackReply(client, { ...payload, body: '  ' }), /Write a reply/)
  await assert.rejects(() => sendSurveyFeedbackReply(client, { ...payload, id: 'wrong' }), /identify/)
  assert.equal(client.calls.length, 0)
})
