import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Minus,
  Save,
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
  formatSurveyMonth,
  previousMonthStart,
  previousSurveyMonth,
  requiredSurveyProgress,
  surveyAverage,
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

function ScaleQuestion({ question, value, onChange }) {
  return (
    <div className="survey-scale-wrap">
      <div className="survey-scale-grid">
        {Array.from({ length: 10 }, (_, index) => index + 1).map(score => (
          <button
            key={score}
            type="button"
            className={`survey-scale-button ${Number(value) === score ? 'selected' : ''}`}
            onClick={() => onChange(score)}
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

function SurveyForm({ questions, responses, setResponses, submission, profile, onSave, saving }) {
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
                    ? <ScaleQuestion question={question} value={responses[question.question_key]} onChange={value => setAnswer(question.question_key, value)}/>
                    : (
                      <textarea
                        id={`survey-${question.question_key}`}
                        rows={questionIndex === sectionQuestions.length - 1 ? 4 : 3}
                        value={responses[question.question_key] || ''}
                        onChange={event => setAnswer(question.question_key, event.target.value)}
                        placeholder="Write your reflection here…"
                      />
                    )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

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

function TeamOverview({ questions, members, submissions, selectedMonth, setSelectedMonth }) {
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const months = useMemo(() => {
    const values = new Set([...surveyMonthOptions(12), ...submissions.map(submission => submission.survey_month)])
    return Array.from(values).sort((a, b) => b.localeCompare(a))
  }, [submissions])
  const submissionsByKey = useMemo(
    () => new Map(submissions.map(submission => [`${submission.user_id}:${submission.survey_month}`, submission])),
    [submissions],
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
  const scaleQuestions = questions.filter(question => question.response_type === 'scale_1_10')
  const writtenQuestions = questions.filter(question => question.response_type === 'long_text')

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
              <tr><th>Team member</th><th>Role</th><th>Status</th><th>Average</th><th>MoM</th><th>Submitted</th><th/></tr>
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

              <div className="card survey-comparison-card">
                <div className="survey-card-heading">
                  <div><h3>Month-over-month rating comparison</h3><p>Current scores against the immediately preceding month.</p></div>
                </div>
                <div className="survey-comparison-list">
                  {scaleQuestions.map(question => {
                    const current = Number(selectedSubmission.responses?.[question.question_key]) || null
                    const previous = Number(selectedPrevious?.responses?.[question.question_key]) || null
                    return (
                      <div className="survey-comparison-row" key={question.question_key}>
                        <span>{question.prompt}</span>
                        <strong style={{ color: scoreColor(current) }}>{current ?? '—'}</strong>
                        <span className="survey-muted">vs {previous ?? '—'}</span>
                        <Delta current={current} previous={previous}/>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="card survey-written-card">
                <div className="survey-card-heading">
                  <div><h3>Written responses</h3><p>Submitted reflections for {formatSurveyMonth(selectedMonth)}.</p></div>
                </div>
                <div className="survey-written-list">
                  {writtenQuestions.map(question => (
                    <div key={question.question_key}>
                      <h4>{question.prompt}</h4>
                      <p>{String(selectedSubmission.responses?.[question.question_key] || '').trim() || 'No response provided.'}</p>
                    </div>
                  ))}
                </div>
              </div>
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
  const { profile, isManagement, isOps } = useAuth()
  const canReviewTeam = isManagement || isOps
  const targetMonth = previousSurveyMonth()
  const [view, setView] = useState('mine')
  const [questions, setQuestions] = useState([])
  const [mySubmissions, setMySubmissions] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [teamSubmissions, setTeamSubmissions] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(targetMonth)
  const [responses, setResponses] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const currentSubmission = mySubmissions.find(submission => submission.survey_month === targetMonth)

  useEffect(() => {
    let cancelled = false
    async function loadSurvey() {
      if (!profile?.id) return
      setLoading(true)
      setError('')
      const [questionResult, mineResult, memberResult, teamResult] = await Promise.all([
        supabase.from('monthly_survey_questions').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('monthly_survey_submissions').select('*').eq('user_id', profile.id).order('survey_month', { ascending: false }),
        canReviewTeam
          ? supabase.from('profiles').select('id,full_name,role,position,avatar_url').eq('is_active', true).order('full_name')
          : Promise.resolve({ data: [], error: null }),
        canReviewTeam
          ? supabase.from('monthly_survey_submissions').select('*').order('survey_month', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ])
      if (cancelled) return
      const failed = [questionResult, mineResult, memberResult, teamResult].find(result => result.error)
      if (failed) {
        setError(failed.error.message || 'Unable to load the monthly survey.')
      } else {
        const ownSubmissions = mineResult.data || []
        setQuestions(questionResult.data || [])
        setMySubmissions(ownSubmissions)
        setResponses(ownSubmissions.find(submission => submission.survey_month === targetMonth)?.responses || {})
        setTeamMembers((memberResult.data || []).filter(member => member.full_name))
        setTeamSubmissions(teamResult.data || [])
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
                  ? `Submitted ${formatSubmittedAt(currentSubmission.submitted_at)}. You can still update your response if needed.`
                  : `This survey became available on the first of the month and reviews ${formatSurveyMonth(targetMonth)}.`}</p>
              </div>
            </div>
            <SurveyForm
              questions={questions}
              responses={responses}
              setResponses={setResponses}
              submission={currentSubmission}
              profile={profile}
              onSave={saveSurvey}
              saving={saving}
            />
          </>
        ) : (
          <TeamOverview
            questions={questions}
            members={teamMembers}
            submissions={teamSubmissions}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
          />
        )}
      </div>
    </>
  )
}
