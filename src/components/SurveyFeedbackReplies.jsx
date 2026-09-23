import { useEffect, useRef, useState } from 'react'
import { AlertCircle, MessageSquareText, RefreshCw, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  loadSurveyReplyPage,
  mergeSurveyReplies,
  sendSurveyFeedbackReply,
  SURVEY_REPLY_MAX_LENGTH,
  surveyReplyBodyError,
  surveyReplyDraftKey,
  surveyReplySections,
} from '../lib/surveyFeedbackReplies'
import './SurveyFeedbackReplies.css'

function replyTimestamp(value) {
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' · Dubai'
}

// One loader for the selected review; individual answer threads do not issue queries.
export default function SurveyFeedbackReplies({ submission, feedback, questions, canReply = false, replyState, children }) {
  const enabled = feedback?.status === 'finalized' && Boolean(submission?.id)
  const submissionId = submission?.id
  const replyVersion = replyState.version
  const [page, setPage] = useState({ rows: [], cursor: null, total: null, hasMore: false, loading: true, error: '' })
  const loadVersion = useRef(0)
  const alive = useRef(false)
  const loadBusy = useRef(false)
  const sections = surveyReplySections(questions, feedback)
  const sectionByKey = new Map(sections.map(section => [section.key, section]))

  useEffect(() => {
    alive.current = true
    if (!enabled) return () => { alive.current = false }
    const version = ++loadVersion.current
    loadBusy.current = true
    async function loadInitial() {
      try {
        const result = await loadSurveyReplyPage(supabase, submissionId)
        if (alive.current && version === loadVersion.current) setPage({ ...result, loading: false, error: '' })
      } catch {
        if (alive.current && version === loadVersion.current) {
          setPage(current => ({ ...current, loading: false, error: 'Unable to load replies. Your saved feedback is unchanged. Please try again.' }))
        }
      } finally {
        if (version === loadVersion.current) loadBusy.current = false
      }
    }
    loadInitial()
    return () => { alive.current = false; loadVersion.current += 1 }
  }, [enabled, submissionId, replyVersion])

  async function loadReplies(append = false) {
    if (loadBusy.current || !enabled) return
    loadBusy.current = true
    const version = ++loadVersion.current
    setPage(current => ({ ...current, loading: true, error: '' }))
    try {
      const result = await loadSurveyReplyPage(supabase, submissionId, append ? page.cursor : null)
      if (!alive.current || version !== loadVersion.current) return
      setPage(current => ({
        ...result,
        rows: append ? mergeSurveyReplies(current.rows, result.rows) : result.rows,
        total: append ? current.total : result.total,
        loading: false,
        error: '',
      }))
    } catch {
      if (alive.current && version === loadVersion.current) {
        setPage(current => ({ ...current, loading: false, error: 'Unable to load replies. Please try again; your reply text has been kept.' }))
      }
    } finally {
      if (version === loadVersion.current) loadBusy.current = false
    }
  }

  function updateDraft(key, patch) {
    replyState.setDrafts(current => ({ ...current, [key]: { ...current[key], ...patch } }))
  }

  async function sendReply(sectionKey) {
    if (!canReply || !enabled || !sectionByKey.has(sectionKey)) return
    const key = surveyReplyDraftKey(replyState.viewerId, submissionId, sectionKey)
    if (replyState.sendLocks.current.has(key)) return
    const draft = replyState.drafts[key] || {}
    const validationError = surveyReplyBodyError(draft.text)
    if (validationError) { updateDraft(key, { error: validationError }); return }
    replyState.sendLocks.current.add(key)
    let attempt = draft.attempt
    try {
      attempt ||= { id: globalThis.crypto.randomUUID(), body: draft.text.trim() }
      updateDraft(key, { attempt, sending: true, error: '', notice: '' })
      const saved = await sendSurveyFeedbackReply(supabase, {
        id: attempt.id, submission_id: submissionId, section_key: sectionKey, body: attempt.body,
      }, Boolean(draft.attempt))
      updateDraft(key, { text: '', attempt: null, sending: false, error: '', notice: 'Reply sent. Management can now read it.' })
      if (alive.current) {
        // Preserve loaded pages and show this reply immediately, even beyond page one.
        setPage(current => ({
          ...current,
          rows: mergeSurveyReplies(current.rows, [saved]),
          total: current.total == null ? null : current.total + (current.rows.some(row => row.id === saved.id) ? 0 : 1),
        }))
      } else {
        // Only a background send needs to refresh the review opened since it began.
        replyState.onSent()
      }
    } catch {
      updateDraft(key, {
        sending: false,
        error: 'We could not confirm this reply was sent. Your text is kept. Retry checks the same reply before sending, so it will not be duplicated.',
      })
    } finally {
      replyState.sendLocks.current.delete(key)
    }
  }

  function renderThread(sectionKey) {
    const section = sectionByKey.get(sectionKey)
    if (!enabled || !section) return null
    const rows = page.rows.filter(reply => reply.section_key === sectionKey)
    const key = surveyReplyDraftKey(replyState.viewerId, submissionId, sectionKey)
    const draft = replyState.drafts[key] || {}
    const fieldId = `reply-${submissionId}-${sectionKey.replaceAll(':', '-')}`
    return (
      <div className="survey-reply-thread" key={sectionKey}>
        <h4><MessageSquareText size={13}/>{canReply ? 'Your replies' : 'Team member replies'}</h4>
        {rows.map(reply => (
          <div className="survey-reply-message" key={reply.id}>
            <div><strong>{reply.author_name || 'Team member'}</strong><time dateTime={reply.created_at}>{replyTimestamp(reply.created_at)}</time></div>
            <p>{reply.body}</p>
          </div>
        ))}
        {!rows.length && !page.loading && !page.error && (
          <p className="survey-reply-empty">{page.hasMore ? 'No replies in the loaded history. Load more above to see the remaining follow-ups.' : 'No replies yet.'}</p>
        )}
        {canReply && (
          <div className="survey-reply-composer">
            <label htmlFor={fieldId}>Reply to management feedback: {section.label}</label>
            <textarea
              id={fieldId}
              rows={3}
              maxLength={SURVEY_REPLY_MAX_LENGTH}
              value={draft.text || ''}
              disabled={Boolean(draft.sending || draft.attempt)}
              onChange={event => updateDraft(key, { text: event.target.value, error: '', notice: '' })}
              placeholder="Answer a question or add a follow-up for management…"
            />
            {draft.error && <p className="survey-reply-error" role="alert"><AlertCircle size={13}/>{draft.error}</p>}
            {draft.notice && <p className="survey-reply-success" role="status">{draft.notice}</p>}
            <div className="survey-reply-send-row">
              <span>Sent replies are permanent. You can add another follow-up.</span>
              <button
                type="button"
                className="btn btn-primary"
                disabled={Boolean(draft.sending) || page.loading || !draft.text?.trim()}
                onClick={() => sendReply(sectionKey)}
                aria-label={`${draft.attempt ? 'Retry' : 'Send'} reply: ${section.label}`}
              >
                <Send size={13}/>{draft.sending ? 'Sending…' : draft.attempt ? 'Retry reply' : 'Send reply'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const replySummary = enabled ? (
    <div className="survey-reply-summary">
      <div>
        <strong><MessageSquareText size={14}/>Team replies{page.total == null ? '' : ` · ${page.total}`}</strong>
        <p>{canReply
          ? 'You can answer management’s questions below without changing your original answers or the finalized feedback. Replies are visible to you and authorized management reviewers.'
          : 'Read the team member’s follow-ups below each finalized note. The original survey and management feedback stay locked.'}</p>
        {canReply && <p>Unsent text stays when you switch month or view on this page. Send it before leaving or refreshing.</p>}
        {page.hasMore && <p>{page.rows.length} of {page.total ?? 'more'} replies loaded, oldest first. Load more to see the remaining follow-ups.</p>}
        {page.loading && <p role="status">Loading replies…</p>}
        {page.error && <p className="survey-reply-error" role="alert">{page.error}</p>}
      </div>
      <div className="survey-reply-load-actions">
        {page.hasMore && <button type="button" className="btn btn-ghost" onClick={() => loadReplies(true)} disabled={page.loading}>Load more replies</button>}
        <button type="button" className="btn btn-ghost" onClick={() => loadReplies()} disabled={page.loading}><RefreshCw size={13}/>{page.error ? 'Retry loading replies' : 'Refresh replies'}</button>
      </div>
    </div>
  ) : null

  return children({ renderThread, replySummary })
}
