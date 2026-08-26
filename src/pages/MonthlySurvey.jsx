import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  LockKeyhole,
  MessageSquareText,
  Minus,
  Save,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import {
  cleanSurveyFeedback,
  formatSurveyMonth,
  previousMonthStart,
  previousSurveyMonth,
  requiredSurveyProgress,
  surveyAverage,
  surveyFeedbackCount,
  surveyMonthOptions,
  surveyStatusLabel,
} from '../lib/monthlySurvey'
import { supabase } from '../lib/supabase'
import './MonthlySurvey.css'

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function roleLabel(member) {
  return (member?.position || member?.role || 'Unassigned')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function formatSubmittedAt(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function scoreColor(score) {
  if (score == null) return 'var(--text-muted)'
  if (score >= 8) return 'var(--green)'
  if (score >= 6) return 'var(--amber)'
  return 'var(--red)'
}

function deltaMeta(current, previous) {
  if (current == null || previous == null) return { value: null, color: 'var(--text-muted)', icon: <Minus size={12}/> }
  const value = Math.round((current - previous) * 10) / 10
  if (value > 0) return { value, color: 'var(--green)', icon: <TrendingUp size={12}/> }
  if (value < 0) return { value, color: 'var(--red)', icon: <TrendingDown size={12}/> }
  return { value, color: 'var(--text-muted)', icon: <Minus size={12}/> }
}

function Delta({ current, previous }) {
  const meta = deltaMeta(current, previous)
  if (meta.value == null) return <span className="survey-muted">—</span>
  return (
    <span className="survey-delta" style={{ color: meta.color }}>
      {meta.icon}{meta.value > 0 ? '+' : ''}{meta.value.toFixed(1)}
    </span>
  )
}

function StatusPill({ submission }) {
  const status = submission?.status || 'missing'
  return <span className={`survey-status ${status}`}>{surveyStatusLabel(submission)}</span>
}

function FeedbackStatusPill({ feedback }) {
  const status = feedback?.status || 'missing'
  const label = status === 'finalized' ? 'Finalized' : status === 'draft' ? 'Feedback draft' : 'No feedback'
  return <span className={`survey-feedback-status ${status}`}>{label}</span>
}

function MyFeedbackPanel({ questions, submissions, feedbackRows }) {
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('')
  const submissionsById = useMemo(
    () => new Map(submissions.map(submission => [submission.id, submission])),
    [submissions],
  )
  const finalizedItems = useMemo(() => feedbackRows
    .filter(feedback => feedback.status === 'finalized' && submissionsById.has(feedback.submission_id))
    .map(feedback => ({ feedback, submission: submissionsById.get(feedback.submission_id) }))
    .sort((a, b) => b.submission.survey_month.localeCompare(a.submission.survey_month)), [feedbackRows, submissionsById])

  if (!finalizedItems.length) return null

  const activeItem = finalizedItems.find(item => item.submission.id === selectedSubmissionId) || finalizedItems[0]
  const answeredFeedback = questions.filter(question => activeItem.feedback.feedback?.[question.question_key])
  const publishedPraises = activeItem.feedback.praises?.trim() || ''
  const publishedGrowthNotes = activeItem.feedback.growth_notes?.trim() || ''

  return (
    <section className="card survey-my-feedback">
      <div className="survey-my-feedback-heading">
        <div className="survey-feedback-icon"><MessageSquareText size={18}/></div>
        <div>
          <span>Finalized management feedback</span>
          <h2>{formatSurveyMonth(activeItem.submission.survey_month)} review</h2>
          <p>Published {formatSubmittedAt(activeItem.feedback.finalized_at)}. Draft feedback is never visible here.</p>
        </div>
        {finalizedItems.length > 1 && (
          <label>
            <span>Feedback month</span>
            <select value={activeItem.submission.id} onChange={event => setSelectedSubmissionId(event.target.value)}>
              {finalizedItems.map(item => (
                <option value={item.submission.id} key={item.submission.id}>{formatSurveyMonth(item.submission.survey_month)}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="survey-my-feedback-list">
        {answeredFeedback.map(question => {
          const answer = activeItem.submission.responses?.[question.question_key]
          return (
            <article key={question.question_key}>
              <div>
                <h3>{question.prompt}</h3>
                <p className="survey-feedback-original-answer">Your answer: {question.response_type === 'scale_1_10' ? `${answer}/10` : String(answer || '').trim() || 'No response provided.'}</p>
              </div>
              <div className="survey-feedback-published"><MessageSquareText size={14}/><p>{activeItem.feedback.feedback[question.question_key]}</p></div>
            </article>
          )
        })}
      </div>
      {(publishedPraises || publishedGrowthNotes) && (
        <div className="survey-published-summary">
          <div className="survey-published-summary-heading">
            <CheckCircle2 size={15}/>
            <div><h3>Praises &amp; growth notes</h3><p>Your finalized month-level review.</p></div>
          </div>
          <div className="survey-published-summary-grid">
            <article>
              <span>Praises</span>
              <p>{publishedPraises || 'No praise was added for this review.'}</p>
            </article>
            <article>
              <span>Growth notes</span>
              <p>{publishedGrowthNotes || 'No growth note was added for this review.'}</p>
            </article>
          </div>
        </div>
      )}
    </section>
  )
}

function ScaleQuestion({ question, value, onChange, disabled = false }) {
  return (
    <div className="survey-scale-wrap">
      <div className="survey-scale-grid">
        {Array.from({ length: 10 }, (_, index) => index + 1).map(score => (
          <button
            key={score}
            type="button"
            className={`survey-scale-button ${Number(value) === score ? 'selected' : ''}`}
            onClick={() => onChange(score)}
            disabled={disabled}
            aria-label={`${question.prompt}: ${score} out of 10`}
            aria-pressed={Number(value) === score}
          >
            {score}
          </button>
        ))}
      </div>
      <div className="survey-scale-labels">
        <span>1 · {question.scale_low_label}</span>
        <span>10 · {question.scale_high_label}</span>
      </div>
    </div>
  )
}

function SurveyForm({ questions, responses, setResponses, submission, profile, onSave, saving, locked }) {
  const sections = useMemo(() => {
    const grouped = new Map()
    questions.forEach(question => {
      if (!grouped.has(question.section)) grouped.set(question.section, [])
      grouped.get(question.section).push(question)
    })
    return Array.from(grouped.entries())
  }, [questions])
  const progress = requiredSurveyProgress(questions, responses)

  function setAnswer(key, value) {
    setResponses(current => ({ ...current, [key]: value }))
  }

  return (
    <>
      <div className="survey-identity card">
        <div className="survey-avatar">{initials(profile?.full_name)}</div>
        <div>
          <div className="survey-identity-name">{profile?.full_name}</div>
          <div className="survey-muted">Your name and role are linked automatically from your Company Command profile.</div>
        </div>
        <StatusPill submission={submission}/>
      </div>

      <div className="survey-form-sections">
        {sections.map(([section, sectionQuestions], sectionIndex) => (
          <section className="card survey-section-card" key={section}>
            <div className="survey-section-heading">
              <span>{String(sectionIndex + 1).padStart(2, '0')}</span>
              <div>
                <h2>{section}</h2>
                <p>Reflect honestly on the month. Your response helps the team improve.</p>
              </div>
            </div>
            <div className="survey-section-questions">
              {sectionQuestions.map((question, questionIndex) => (
                <div className="survey-question" key={question.question_key}>
                  <div className="survey-question-label">
                    <span>{question.sort_order}</span>
                    <label htmlFor={question.response_type === 'long_text' ? `survey-${question.question_key}` : undefined}>
                      {question.prompt}
                      {!question.is_required && <em>Optional</em>}
                    </label>
                  </div>
                  {question.response_type === 'scale_1_10'
                    ? <ScaleQuestion question={question} value={responses[question.question_key]} onChange={value => setAnswer(question.question_key, value)} disabled={locked}/>
                    : (
                      <textarea
                        id={`survey-${question.question_key}`}
                        rows={questionIndex === sectionQuestions.length - 1 ? 4 : 3}
                        value={responses[question.question_key] || ''}
                        onChange={event => setAnswer(question.question_key, event.target.value)}
                        placeholder="Write your reflection here…"
                        disabled={locked}
                      />
                    )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {locked ? (
        <div className="survey-actions survey-locked-actions card">
          <LockKeyhole size={17}/>
          <div><strong>Survey locked after feedback finalization</strong><span>Your submitted answers and the published feedback now remain together as a fixed record.</span></div>
        </div>
      ) : (
        <div className="survey-actions card">
          <div>
            <div className="survey-action-progress">
              <strong>{progress.answered}/{progress.total}</strong> required questions complete
            </div>
            <div className="survey-progress-track" aria-label={`${progress.answered} of ${progress.total} required questions complete`}>
              <div style={{ width: `${progress.total ? (progress.answered / progress.total) * 100 : 0}%` }}/>
            </div>
          </div>
          <div className="survey-action-buttons">
            {submission?.status !== 'submitted' && (
              <button type="button" className="btn btn-ghost" onClick={() => onSave('draft')} disabled={saving}>
                <Save size={14}/>{saving ? 'Saving…' : 'Save draft'}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => onSave('submitted')} disabled={saving}>
              <CheckCircle2 size={14}/>{saving ? 'Saving…' : submission?.status === 'submitted' ? 'Update submitted survey' : 'Submit survey'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function OverviewMetric({ icon, label, value, detail, color }) {
  return (
    <div className="card survey-overview-metric">
      <div className="survey-overview-metric-label">{icon}{label}</div>
      <strong style={{ color }}>{value}</strong>
      <span>{detail}</span>
    </div>
  )
}

function FeedbackWorkspace({
  questions,
  submission,
  previousSubmission,
  feedbackRecord,
  canFinalize,
  saving,
  onSaveDraft,
  onFinalize,
}) {
  const [draftFeedback, setDraftFeedback] = useState(() => feedbackRecord?.feedback || {})
  const [praises, setPraises] = useState(() => feedbackRecord?.praises || '')
  const [growthNotes, setGrowthNotes] = useState(() => feedbackRecord?.growth_notes || '')
  const cleanedFeedback = cleanSurveyFeedback(questions, draftFeedback)
  const savedFeedback = cleanSurveyFeedback(questions, feedbackRecord?.feedback || {})
  const cleanedPraises = praises.trim()
  const cleanedGrowthNotes = growthNotes.trim()
  const answerFeedbackDirty = questions.some(question => (
    (cleanedFeedback[question.question_key] || '') !== (savedFeedback[question.question_key] || '')
  ))
  const summaryDirty = cleanedPraises !== (feedbackRecord?.praises || '').trim()
    || cleanedGrowthNotes !== (feedbackRecord?.growth_notes || '').trim()
  const isDirty = answerFeedbackDirty || summaryDirty
  const feedbackCount = surveyFeedbackCount(questions, draftFeedback)
  const hasReviewContent = feedbackCount > 0 || Boolean(cleanedPraises) || Boolean(cleanedGrowthNotes)
  const finalized = feedbackRecord?.status === 'finalized'

  function setAnswerFeedback(questionKey, value) {
    setDraftFeedback(current => ({ ...current, [questionKey]: value }))
  }

  return (
    <div className="card survey-feedback-workspace">
      <div className="survey-feedback-workspace-heading">
        <div>
          <div className="survey-feedback-eyebrow"><MessageSquareText size={13}/>Answers &amp; management feedback</div>
          <h3>Review each answer and respond where useful</h3>
          <p>Draft notes stay private. Feedback only becomes visible to the team member after Operations or the CEO finalizes it.</p>
        </div>
        <FeedbackStatusPill feedback={feedbackRecord}/>
      </div>

      <div className="survey-feedback-answer-list">
        {questions.map(question => {
          const answer = submission.responses?.[question.question_key]
          const numericAnswer = Number(answer)
          const hasAnswer = question.response_type === 'scale_1_10'
            ? Number.isFinite(numericAnswer) && numericAnswer >= 1 && numericAnswer <= 10
            : Boolean(String(answer || '').trim())
          const previous = previousSubmission?.responses?.[question.question_key]
          const numericPrevious = Number(previous)
          const feedbackText = draftFeedback[question.question_key] || ''

          return (
            <article className="survey-feedback-answer" key={question.question_key}>
              <div className="survey-feedback-answer-head">
                <span>{question.sort_order}</span>
                <div><h4>{question.prompt}</h4><small>{question.section}</small></div>
              </div>
              <div className={`survey-feedback-response ${hasAnswer ? '' : 'empty'}`}>
                <span>Team answer</span>
                {question.response_type === 'scale_1_10' ? (
                  <div className="survey-feedback-score-line">
                    <strong style={{ color: scoreColor(hasAnswer ? numericAnswer : null) }}>{hasAnswer ? `${numericAnswer}/10` : '—'}</strong>
                    <span>Previous month: {Number.isFinite(numericPrevious) && numericPrevious >= 1 && numericPrevious <= 10 ? `${numericPrevious}/10` : '—'}</span>
                    <Delta current={hasAnswer ? numericAnswer : null} previous={Number.isFinite(numericPrevious) && numericPrevious >= 1 && numericPrevious <= 10 ? numericPrevious : null}/>
                  </div>
                ) : <p>{String(answer || '').trim() || 'No response provided.'}</p>}
              </div>
              <div className="survey-feedback-editor">
                <label htmlFor={`feedback-${submission.id}-${question.question_key}`}>Management feedback for this answer</label>
                {finalized ? (
                  <div className={`survey-feedback-final-text ${feedbackText ? '' : 'empty'}`}>
                    {feedbackText ? <><MessageSquareText size={13}/><p>{feedbackText}</p></> : <p>No feedback was added for this answer.</p>}
                  </div>
                ) : (
                  <textarea
                    id={`feedback-${submission.id}-${question.question_key}`}
                    rows={3}
                    maxLength={5000}
                    value={feedbackText}
                    onChange={event => setAnswerFeedback(question.question_key, event.target.value)}
                    disabled={!hasAnswer || saving}
                    placeholder={hasAnswer ? 'Add a private draft note for this answer…' : 'No answer is available to review.'}
                  />
                )}
              </div>
            </article>
          )
        })}
      </div>

      <section className="survey-feedback-summary-editor">
        <div className="survey-feedback-summary-heading">
          <div>
            <div className="survey-feedback-eyebrow"><TrendingUp size={13}/>Month-level notes</div>
            <h3>Praises &amp; growth notes</h3>
            <p>Capture the wins worth reinforcing and the clearest next area for growth. These follow the same draft and finalization rules as per-answer feedback.</p>
          </div>
        </div>
        <div className="survey-feedback-summary-grid">
          <label>
            <span>Praises</span>
            <small>Recognize specific strengths, progress, or positive impact.</small>
            {finalized ? (
              <div className={`survey-feedback-final-text ${cleanedPraises ? '' : 'empty'}`}>
                <p>{cleanedPraises || 'No praise was added for this review.'}</p>
              </div>
            ) : (
              <textarea
                rows={4}
                maxLength={5000}
                value={praises}
                onChange={event => setPraises(event.target.value)}
                disabled={saving}
                placeholder="What should this team member keep doing?"
              />
            )}
          </label>
          <label>
            <span>Growth notes</span>
            <small>Record a practical development focus or next-step coaching note.</small>
            {finalized ? (
              <div className={`survey-feedback-final-text ${cleanedGrowthNotes ? '' : 'empty'}`}>
                <p>{cleanedGrowthNotes || 'No growth note was added for this review.'}</p>
              </div>
            ) : (
              <textarea
                rows={4}
                maxLength={5000}
                value={growthNotes}
                onChange={event => setGrowthNotes(event.target.value)}
                disabled={saving}
                placeholder="What is the most useful next area for growth?"
              />
            )}
          </label>
        </div>
      </section>

      <div className={`survey-feedback-actions ${finalized ? 'finalized' : ''}`}>
        <div>
          {finalized ? <ShieldCheck size={17}/> : <LockKeyhole size={17}/>}
          <span>{finalized
            ? `Finalized ${formatSubmittedAt(feedbackRecord.finalized_at)}. This feedback is locked and visible to the team member.`
            : `${feedbackCount} answer${feedbackCount === 1 ? '' : 's'} with feedback${cleanedPraises || cleanedGrowthNotes ? ' plus month-level notes' : ''}. Drafts remain private until finalized.`}</span>
        </div>
        {!finalized && (
          <div className="survey-feedback-action-buttons">
            <button type="button" className="btn btn-ghost" onClick={() => onSaveDraft(submission.id, {
              feedback: cleanedFeedback,
              praises: cleanedPraises,
              growth_notes: cleanedGrowthNotes,
            })} disabled={!isDirty || saving}>
              <Save size={14}/>{saving ? 'Saving…' : feedbackRecord ? 'Save draft changes' : 'Save feedback draft'}
            </button>
            {canFinalize ? (
              <button type="button" className="btn btn-primary" onClick={() => onFinalize(feedbackRecord)} disabled={!feedbackRecord || isDirty || !hasReviewContent || saving}>
                <ShieldCheck size={14}/>Finalize feedback
              </button>
            ) : <span className="survey-finalize-note">Operations or the CEO completes final review.</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function TeamOverview({
  questions,
  members,
  submissions,
  feedbackRows,
  selectedMonth,
  setSelectedMonth,
  canFinalizeFeedback,
  savingFeedbackId,
  onSaveFeedbackDraft,
  onFinalizeFeedback,
}) {
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const months = useMemo(() => {
    const values = new Set([...surveyMonthOptions(12), ...submissions.map(submission => submission.survey_month)])
    return Array.from(values).sort((a, b) => b.localeCompare(a))
  }, [submissions])
  const submissionsByKey = useMemo(
    () => new Map(submissions.map(submission => [`${submission.user_id}:${submission.survey_month}`, submission])),
    [submissions],
  )
  const feedbackBySubmissionId = useMemo(
    () => new Map(feedbackRows.map(feedback => [feedback.submission_id, feedback])),
    [feedbackRows],
  )
  const orderedMembers = useMemo(() => members.slice().sort((a, b) => {
    const roleOrder = collator.compare(roleLabel(a), roleLabel(b))
    return roleOrder || collator.compare(a.full_name || '', b.full_name || '')
  }), [members])

  const activeMemberId = selectedMemberId || orderedMembers[0]?.id || ''
  const previousMonth = previousMonthStart(selectedMonth)
  const rows = orderedMembers.map(member => {
    const submission = submissionsByKey.get(`${member.id}:${selectedMonth}`)
    const previousSubmission = submissionsByKey.get(`${member.id}:${previousMonth}`)
    return {
      member,
      submission,
      feedback: submission ? feedbackBySubmissionId.get(submission.id) : null,
      score: surveyAverage(submission, questions),
      previousScore: surveyAverage(previousSubmission, questions),
    }
  })
  const submittedRows = rows.filter(row => row.submission?.status === 'submitted')
  const drafts = rows.filter(row => row.submission?.status === 'draft').length
  const missing = rows.length - submittedRows.length - drafts
  const teamAverage = submittedRows.length
    ? Math.round((submittedRows.reduce((sum, row) => sum + (row.score || 0), 0) / submittedRows.length) * 10) / 10
    : null
  const completion = rows.length ? Math.round((submittedRows.length / rows.length) * 100) : 0

  const selectedMember = orderedMembers.find(member => member.id === activeMemberId)
  const selectedSubmission = selectedMember ? submissionsByKey.get(`${selectedMember.id}:${selectedMonth}`) : null
  const selectedPrevious = selectedMember ? submissionsByKey.get(`${selectedMember.id}:${previousMonth}`) : null
  const selectedFeedback = selectedSubmission ? feedbackBySubmissionId.get(selectedSubmission.id) : null
  const selectedScore = surveyAverage(selectedSubmission, questions)
  const selectedPreviousScore = surveyAverage(selectedPrevious, questions)
  const selectedHistory = selectedMember
    ? submissions
      .filter(submission => submission.user_id === selectedMember.id && submission.status === 'submitted')
      .map(submission => ({
        month: submission.survey_month,
        label: formatSurveyMonth(submission.survey_month).replace(/ \d{4}$/, ''),
        score: surveyAverage(submission, questions),
      }))
      .filter(item => item.score != null)
      .sort((a, b) => a.month.localeCompare(b.month))
    : []
  return (
    <div className="survey-overview">
      <div className="survey-overview-toolbar">
        <div>
          <h2>Team response overview</h2>
          <p>Completion, submitted answers, and month-over-month movement for every active team member.</p>
        </div>
        <label className="survey-month-select">
          <span>Survey month</span>
          <select value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)}>
            {months.map(month => <option value={month} key={month}>{formatSurveyMonth(month)}</option>)}
          </select>
        </label>
      </div>

      <div className="survey-overview-metrics">
        <OverviewMetric icon={<CheckCircle2 size={14}/>} label="Submitted" value={`${submittedRows.length}/${rows.length}`} detail={`${completion}% completion`} color="var(--green)"/>
        <OverviewMetric icon={<Save size={14}/>} label="Drafts" value={drafts} detail="Started, not submitted" color="var(--amber)"/>
        <OverviewMetric icon={<AlertCircle size={14}/>} label="Not started" value={missing} detail="Still awaiting a response" color={missing ? 'var(--red)' : 'var(--green)'}/>
        <OverviewMetric icon={<BarChart3 size={14}/>} label="Team average" value={teamAverage == null ? '—' : `${teamAverage}/10`} detail="Across submitted rating questions" color={scoreColor(teamAverage)}/>
      </div>

      <div className="card survey-response-table-card">
        <div className="survey-card-heading">
          <div>
            <h3>{formatSurveyMonth(selectedMonth)} responses</h3>
            <p>Select a person to inspect their submitted answers and monthly change.</p>
          </div>
        </div>
        <div className="survey-table-wrap">
          <table className="survey-response-table">
            <thead>
              <tr><th>Team member</th><th>Role</th><th>Survey</th><th>Feedback</th><th>Average</th><th>MoM</th><th>Submitted</th><th/></tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.member.id} className={activeMemberId === row.member.id ? 'selected' : ''}>
                  <td>
                    <button type="button" className="survey-member-button" onClick={() => setSelectedMemberId(row.member.id)}>
                      <span className="survey-table-avatar">{initials(row.member.full_name)}</span>
                      <strong>{row.member.full_name}</strong>
                    </button>
                  </td>
                  <td>{roleLabel(row.member)}</td>
                  <td><StatusPill submission={row.submission}/></td>
                  <td><FeedbackStatusPill feedback={row.feedback}/></td>
                  <td style={{ color: scoreColor(row.score), fontWeight: 700 }}>{row.score == null ? '—' : `${row.score}/10`}</td>
                  <td><Delta current={row.score} previous={row.previousScore}/></td>
                  <td>{row.submission?.status === 'submitted' ? formatSubmittedAt(row.submission.submitted_at) : '—'}</td>
                  <td><button type="button" className="survey-row-open" onClick={() => setSelectedMemberId(row.member.id)} aria-label={`View ${row.member.full_name}'s survey`}><ChevronRight size={15}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedMember && (
        <section className="survey-member-detail">
          <div className="survey-member-detail-heading">
            <div className="survey-avatar large">{initials(selectedMember.full_name)}</div>
            <div>
              <h2>{selectedMember.full_name}</h2>
              <p>{roleLabel(selectedMember)} · {formatSurveyMonth(selectedMonth)} review</p>
            </div>
            <StatusPill submission={selectedSubmission}/>
          </div>

          {selectedSubmission?.status === 'submitted' ? (
            <>
              <div className="survey-member-summary-grid">
                <div className="card survey-person-score">
                  <span>Monthly average</span>
                  <strong style={{ color: scoreColor(selectedScore) }}>{selectedScore}/10</strong>
                  <Delta current={selectedScore} previous={selectedPreviousScore}/>
                  <small>Compared with {formatSurveyMonth(previousMonth)}</small>
                </div>
                <div className="card survey-person-trend">
                  <div className="survey-card-heading compact">
                    <div><h3>Rating trend</h3><p>Average of the six monthly ratings</p></div>
                  </div>
                  {selectedHistory.length > 1 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={selectedHistory} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/>
                        <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                        <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}/>
                        <Line type="monotone" dataKey="score" stroke="var(--accent)" strokeWidth={2.5} dot={{ fill: 'var(--accent)', r: 3 }}/>
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <div className="survey-empty-mini">A trend appears after two submitted months.</div>}
                </div>
              </div>

              <FeedbackWorkspace
                key={`${selectedSubmission.id}:${selectedFeedback?.updated_at || 'new'}`}
                questions={questions}
                submission={selectedSubmission}
                previousSubmission={selectedPrevious}
                feedbackRecord={selectedFeedback}
                canFinalize={canFinalizeFeedback}
                saving={savingFeedbackId === selectedSubmission.id}
                onSaveDraft={onSaveFeedbackDraft}
                onFinalize={onFinalizeFeedback}
              />
            </>
          ) : (
            <div className="card survey-empty-detail">
              <ClipboardList size={28}/>
              <h3>{selectedSubmission?.status === 'draft' ? 'Survey is still a draft' : 'No survey submitted'}</h3>
              <p>Answers become available in this overview after the team member submits their survey.</p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default function MonthlySurvey() {
  const { profile, isCEO, isManagement, isOps } = useAuth()
  const canReviewTeam = isManagement || isOps
  const canFinalizeFeedback = isCEO || isOps
  const targetMonth = previousSurveyMonth()
  const [view, setView] = useState('mine')
  const [questions, setQuestions] = useState([])
  const [mySubmissions, setMySubmissions] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [teamSubmissions, setTeamSubmissions] = useState([])
  const [feedbackRows, setFeedbackRows] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(targetMonth)
  const [responses, setResponses] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingFeedbackId, setSavingFeedbackId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const currentSubmission = mySubmissions.find(submission => submission.survey_month === targetMonth)
  const currentFeedback = currentSubmission
    ? feedbackRows.find(feedback => feedback.submission_id === currentSubmission.id && feedback.status === 'finalized')
    : null

  useEffect(() => {
    let cancelled = false
    async function loadSurvey() {
      if (!profile?.id) return
      setLoading(true)
      setError('')
      const [questionResult, mineResult, memberResult, teamResult, feedbackResult] = await Promise.all([
        supabase.from('monthly_survey_questions').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('monthly_survey_submissions').select('*').eq('user_id', profile.id).order('survey_month', { ascending: false }),
        canReviewTeam
          ? supabase.from('profiles').select('id,full_name,role,position,avatar_url').eq('is_active', true).order('full_name')
          : Promise.resolve({ data: [], error: null }),
        canReviewTeam
          ? supabase.from('monthly_survey_submissions').select('*').order('survey_month', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase.from('monthly_survey_feedback').select('*').order('updated_at', { ascending: false }),
      ])
      if (cancelled) return
      const failed = [questionResult, mineResult, memberResult, teamResult, feedbackResult].find(result => result.error)
      if (failed) {
        setError(failed.error.message || 'Unable to load the monthly survey.')
      } else {
        const ownSubmissions = mineResult.data || []
        setQuestions(questionResult.data || [])
        setMySubmissions(ownSubmissions)
        setResponses(ownSubmissions.find(submission => submission.survey_month === targetMonth)?.responses || {})
        setTeamMembers((memberResult.data || []).filter(member => member.full_name))
        setTeamSubmissions(teamResult.data || [])
        setFeedbackRows(feedbackResult.data || [])
      }
      setLoading(false)
    }
    loadSurvey()
    return () => { cancelled = true }
  }, [profile?.id, canReviewTeam, targetMonth])

  async function saveSurvey(status) {
    if (!profile?.id || !questions.length || saving) return
    const progress = requiredSurveyProgress(questions, responses)
    if (status === 'submitted' && !progress.complete) {
      setError(`Complete all ${progress.total} required questions before submitting. You have completed ${progress.answered}.`)
      setMessage('')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')
    const cleanedResponses = Object.fromEntries(questions.flatMap(question => {
      const answer = responses[question.question_key]
      if (answer == null || answer === '') return []
      return [[question.question_key, typeof answer === 'string' ? answer.trim() : answer]]
    }))
    const payload = {
      user_id: profile.id,
      survey_month: targetMonth,
      question_set_version: questions[0].question_set_version,
      responses: cleanedResponses,
      status,
      submitted_at: status === 'submitted' ? currentSubmission?.submitted_at || new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }
    const { data, error: saveError } = await supabase
      .from('monthly_survey_submissions')
      .upsert(payload, { onConflict: 'user_id,survey_month' })
      .select()
      .single()

    if (saveError) {
      setError(saveError.message || 'Unable to save your survey.')
    } else {
      setMySubmissions(current => [data, ...current.filter(item => item.id !== data.id)])
      if (canReviewTeam) setTeamSubmissions(current => [data, ...current.filter(item => item.id !== data.id)])
      setMessage(status === 'submitted'
        ? `${formatSurveyMonth(targetMonth)} survey submitted. Thank you for the reflection.`
        : 'Draft saved. You can return and submit it later.')
    }
    setSaving(false)
  }

  async function saveFeedbackDraft(submissionId, review) {
    if (!canReviewTeam || !submissionId || savingFeedbackId) return
    setSavingFeedbackId(submissionId)
    setError('')
    setMessage('')
    const { data, error: saveError } = await supabase
      .from('monthly_survey_feedback')
      .upsert({ submission_id: submissionId, status: 'draft', ...review }, { onConflict: 'submission_id' })
      .select()
      .single()

    if (saveError) {
      setError(saveError.message || 'Unable to save the feedback draft.')
    } else {
      setFeedbackRows(current => [data, ...current.filter(item => item.submission_id !== data.submission_id)])
      setMessage('Feedback draft saved privately. The team member cannot see it until Operations or the CEO finalizes it.')
    }
    setSavingFeedbackId('')
  }

  async function finalizeFeedback(feedbackRecord) {
    if (!canFinalizeFeedback || !feedbackRecord || savingFeedbackId) return
    const confirmed = globalThis.confirm('Finalize this feedback? It will become visible to the team member and both the feedback and survey answers will be locked.')
    if (!confirmed) return

    setSavingFeedbackId(feedbackRecord.submission_id)
    setError('')
    setMessage('')
    const { data, error: finalizeError } = await supabase
      .from('monthly_survey_feedback')
      .update({ status: 'finalized' })
      .eq('submission_id', feedbackRecord.submission_id)
      .eq('status', 'draft')
      .select()
      .single()

    if (finalizeError) {
      setError(finalizeError.message || 'Unable to finalize the feedback.')
    } else {
      setFeedbackRows(current => [data, ...current.filter(item => item.submission_id !== data.submission_id)])
      setMessage('Feedback finalized. It is now visible to the team member and the review record is locked.')
    }
    setSavingFeedbackId('')
  }

  if (loading) return <div className="loading-screen"><div className="spinner"/></div>

  return (
    <>
      <div className="page-header survey-page-header">
        <div>
          <h1 className="page-title">Monthly Team Survey</h1>
          <p className="page-subtitle">Reflect on the previous month and turn team feedback into practical improvements.</p>
        </div>
        <div className="survey-tabs" role="tablist" aria-label="Monthly survey views">
          <button type="button" role="tab" aria-selected={view === 'mine'} className={view === 'mine' ? 'active' : ''} onClick={() => setView('mine')}><ClipboardList size={14}/>My survey</button>
          {canReviewTeam && <button type="button" role="tab" aria-selected={view === 'team'} className={view === 'team' ? 'active' : ''} onClick={() => setView('team')}><Users size={14}/>Team overview</button>}
        </div>
      </div>

      <div className="page-body survey-page-body">
        {error && <div className="survey-alert error"><AlertCircle size={16}/><span>{error}</span><button type="button" onClick={() => setError('')}>Dismiss</button></div>}
        {message && <div className="survey-alert success"><CheckCircle2 size={16}/><span>{message}</span><button type="button" onClick={() => setMessage('')}>Dismiss</button></div>}

        {view === 'mine' ? (
          <>
            <div className={`survey-due-banner ${currentSubmission?.status === 'submitted' ? 'complete' : ''}`}>
              <div className="survey-due-icon">{currentSubmission?.status === 'submitted' ? <CheckCircle2 size={22}/> : <CalendarDays size={22}/>}</div>
              <div>
                <span>{currentSubmission?.status === 'submitted' ? 'Submitted' : 'Monthly reflection due'}</span>
                <h2>{formatSurveyMonth(targetMonth)} Team Survey</h2>
                <p>{currentSubmission?.status === 'submitted'
                  ? currentFeedback
                    ? `Submitted ${formatSubmittedAt(currentSubmission.submitted_at)}. Management feedback is finalized, so this review is now locked.`
                    : `Submitted ${formatSubmittedAt(currentSubmission.submitted_at)}. You can still update your response if needed.`
                  : `This survey became available on the first of the month and reviews ${formatSurveyMonth(targetMonth)}.`}</p>
              </div>
            </div>
            <MyFeedbackPanel questions={questions} submissions={mySubmissions} feedbackRows={feedbackRows}/>
            <SurveyForm
              questions={questions}
              responses={responses}
              setResponses={setResponses}
              submission={currentSubmission}
              profile={profile}
              onSave={saveSurvey}
              saving={saving}
              locked={Boolean(currentFeedback)}
            />
          </>
        ) : (
          <TeamOverview
            questions={questions}
            members={teamMembers}
            submissions={teamSubmissions}
            feedbackRows={feedbackRows}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            canFinalizeFeedback={canFinalizeFeedback}
            savingFeedbackId={savingFeedbackId}
            onSaveFeedbackDraft={saveFeedbackDraft}
            onFinalizeFeedback={finalizeFeedback}
          />
        )}
      </div>
    </>
  )
}
