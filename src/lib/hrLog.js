// HR Log (CEO and management only): the HR issue log in the CCC from 2027, same fields as the 2026
// ClickUp form "HR Issue Tracking Log". 2026 stays in ClickUp (Vanessa, 26 Nov 2026: start fresh).

import { parseReportingDate } from './reportingPeriods.js'

export const HR_LOG_TABLE = 'hr_log_entries'
export const HR_STATUSES = ['Open', 'Escalated', 'No Action']
// Options seen on the ClickUp form. Category, severity and topic stay free text: anything typed once is
// offered from then on, so a new option needs no code change.
export const CATEGORY_OPTIONS = ['Complaint', 'Compliment', 'Leave of Absence']
export const SEVERITY_OPTIONS = ['Minor']

export const EMPTY_ENTRY = {
  subject: '', team_member: '', what_happened: '', incident_date: '',
  status: 'No Action', category: 'Complaint', severity: 'Minor', topic_category: '',
  slack_link: '', follow_up: false, follow_up_date: '', consequences: false, what_consequences: '', agreements: '',
}

const clean = value => (typeof value === 'string' ? value.trim() : '')
// A real calendar day (YYYY-MM-DD), checked in local time so every time zone agrees.
const isDay = value => Boolean(parseReportingDate(value))

export function entryForm(entry) {
  if (!entry) return { ...EMPTY_ENTRY }
  const form = {}
  for (const key of Object.keys(EMPTY_ENTRY)) {
    const value = entry[key]
    form[key] = typeof EMPTY_ENTRY[key] === 'boolean' ? value === true : (value ?? '')
  }
  return form
}

// The first problem, worded for the person filling the form, or '' when it can be saved.
export function validateEntry(form) {
  if (!clean(form.subject)) return 'Add a subject.'
  if (!clean(form.team_member)) return 'Say which team member this is about.'
  if (!clean(form.what_happened)) return 'Tell what happened.'
  if (clean(form.subject).length > 200) return 'The subject is too long (200 characters at most).'
  if (clean(form.team_member).length > 120) return 'The team member name is too long.'
  if (clean(form.what_happened).length > 5000) return 'What happened is too long (5,000 characters at most).'
  if (form.incident_date && !isDay(form.incident_date)) return 'The incident date is not a valid date.'
  if (!HR_STATUSES.includes(form.status)) return 'Pick a status: Open, Escalated or No Action.'
  if (!clean(form.category)) return 'Pick a category.'
  if (!clean(form.severity)) return 'Pick a severity level.'
  if (clean(form.category).length > 60 || clean(form.severity).length > 60) return 'Category and severity are 60 characters at most.'
  if (clean(form.topic_category).length > 80) return 'The topic category is too long (80 characters at most).'
  const link = clean(form.slack_link)
  if (link && (!/^https:\/\//.test(link) || link.length > 500)) return 'The Slack link should be the full link, starting with https://'
  if (form.follow_up && form.follow_up_date && !isDay(form.follow_up_date)) return 'The follow-up date is not a valid date.'
  if (clean(form.what_consequences).length > 2000 || clean(form.agreements).length > 2000) return 'Consequences and agreements are 2,000 characters at most.'
  return ''
}

// What is saved: trimmed text, empty optional fields as null, follow-up and consequence details only when ticked.
export function entryPayload(form) {
  const opt = value => clean(value) || null
  return {
    subject: clean(form.subject),
    team_member: clean(form.team_member),
    what_happened: clean(form.what_happened),
    incident_date: form.incident_date || null,
    status: form.status,
    category: clean(form.category),
    severity: clean(form.severity),
    topic_category: opt(form.topic_category),
    slack_link: opt(form.slack_link),
    follow_up: form.follow_up === true,
    follow_up_date: form.follow_up === true ? (form.follow_up_date || null) : null,
    consequences: form.consequences === true,
    what_consequences: form.consequences === true ? opt(form.what_consequences) : null,
    agreements: opt(form.agreements),
  }
}

// The day an entry belongs to: the incident date, or the day it was logged when no incident date was given.
export function entryDay(entry) {
  return entry.incident_date || (entry.created_at ? String(entry.created_at).slice(0, 10) : '')
}

// Defaults first, then anything already used, without duplicates (case-insensitive).
export function optionList(defaults, entries, key) {
  const seen = new Map()
  for (const value of [...defaults, ...entries.map(entry => entry[key])]) {
    const text = clean(value)
    if (text && !seen.has(text.toLowerCase())) seen.set(text.toLowerCase(), text)
  }
  return [...seen.values()]
}

export function filterEntries(entries, { search = '', member = '', status = '', category = '', year = '' } = {}) {
  const needle = clean(search).toLowerCase()
  return entries
    .filter(entry => !member || clean(entry.team_member).toLowerCase() === member.toLowerCase())
    .filter(entry => !status || entry.status === status)
    .filter(entry => !category || clean(entry.category).toLowerCase() === category.toLowerCase())
    .filter(entry => !year || entryDay(entry).startsWith(String(year)))
    .filter(entry => !needle || [entry.subject, entry.team_member, entry.what_happened, entry.topic_category, entry.agreements, entry.what_consequences]
      .some(text => clean(text).toLowerCase().includes(needle)))
    .sort((a, b) => entryDay(b).localeCompare(entryDay(a)) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
}

export function yearsOf(entries) {
  return [...new Set(entries.map(entry => entryDay(entry).slice(0, 4)).filter(Boolean))].sort().reverse()
}
