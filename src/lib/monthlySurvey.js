export function previousSurveyMonth(referenceDate = new Date()) {
  const currentMonthIndex = referenceDate.getMonth()
  const year = currentMonthIndex === 0 ? referenceDate.getFullYear() - 1 : referenceDate.getFullYear()
  const month = currentMonthIndex === 0 ? 12 : currentMonthIndex
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function previousMonthStart(monthStart) {
  const [year, month] = monthStart.slice(0, 7).split('-').map(Number)
  return month === 1
    ? `${year - 1}-12-01`
    : `${year}-${String(month - 1).padStart(2, '0')}-01`
}

export function formatSurveyMonth(monthStart) {
  if (!monthStart) return ''
  return new Date(`${monthStart.slice(0, 7)}-02T12:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export function surveyMonthOptions(count = 12, referenceDate = new Date()) {
  const months = []
  let month = previousSurveyMonth(referenceDate)
  for (let index = 0; index < count; index += 1) {
    months.push(month)
    month = previousMonthStart(month)
  }
  return months
}

export function isQuestionAnswered(question, response) {
  if (question.response_type === 'scale_1_10') {
    const score = Number(response)
    return Number.isFinite(score) && score >= 1 && score <= 10
  }
  return typeof response === 'string' && response.trim().length > 0
}

export function requiredSurveyProgress(questions = [], responses = {}) {
  const required = questions.filter(question => question.is_required)
  const answered = required.filter(question => isQuestionAnswered(question, responses[question.question_key])).length
  return { answered, total: required.length, complete: required.length > 0 && answered === required.length }
}

export function surveyAverage(submission, questions = []) {
  if (!submission || submission.status !== 'submitted') return null
  const values = questions
    .filter(question => question.response_type === 'scale_1_10')
    .map(question => Number(submission.responses?.[question.question_key]))
    .filter(value => Number.isFinite(value) && value >= 1 && value <= 10)
  if (!values.length) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

export function surveyStatusLabel(submission) {
  if (submission?.status === 'submitted') return 'Submitted'
  if (submission?.status === 'draft') return 'Draft'
  return 'Not started'
}
