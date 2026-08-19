import assert from 'node:assert/strict'
import test from 'node:test'
import {
  previousMonthStart,
  previousSurveyMonth,
  requiredSurveyProgress,
  surveyAverage,
  surveyMonthOptions,
} from './monthlySurvey.js'

test('monthly survey always reviews the previous calendar month', () => {
  assert.equal(previousSurveyMonth(new Date(2026, 7, 1)), '2026-07-01')
  assert.equal(previousSurveyMonth(new Date(2026, 0, 15)), '2025-12-01')
  assert.equal(previousMonthStart('2026-01-01'), '2025-12-01')
})

test('month options remain timezone-safe and descend by calendar month', () => {
  assert.deepEqual(surveyMonthOptions(3, new Date(2026, 7, 19)), [
    '2026-07-01',
    '2026-06-01',
    '2026-05-01',
  ])
})

test('required survey progress accepts scores and non-empty written answers', () => {
  const questions = [
    { question_key: 'score', response_type: 'scale_1_10', is_required: true },
    { question_key: 'reflection', response_type: 'long_text', is_required: true },
    { question_key: 'optional', response_type: 'long_text', is_required: false },
  ]
  assert.deepEqual(requiredSurveyProgress(questions, { score: 8, reflection: 'A useful answer' }), {
    answered: 2,
    total: 2,
    complete: true,
  })
})

test('survey average uses only submitted 1–10 responses', () => {
  const questions = [
    { question_key: 'one', response_type: 'scale_1_10' },
    { question_key: 'two', response_type: 'scale_1_10' },
    { question_key: 'note', response_type: 'long_text' },
  ]
  assert.equal(surveyAverage({ status: 'submitted', responses: { one: 8, two: 9, note: 'Text' } }, questions), 8.5)
  assert.equal(surveyAverage({ status: 'draft', responses: { one: 10, two: 10 } }, questions), null)
})
