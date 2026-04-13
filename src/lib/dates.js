// Central date utilities — avoids UTC timezone shift bug
// Always use these instead of new Date(dateStr)

export function today() {
  const d = new Date()
  return local(d)
}

export function local(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function parseLocal(str) {
  // Parses YYYY-MM-DD as LOCAL time, not UTC
  if (!str) return new Date()
  const [y,m,d] = str.split('-').map(Number)
  return new Date(y, m-1, d)
}

export function getMonday(d = new Date()) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0,0,0,0)
  return date
}

export function getMondayStr(d) {
  return local(getMonday(d))
}

export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export function weekLabel(dateStr) {
  const d = parseLocal(dateStr)
  const end = addDays(d, 6)
  const o = { month: 'short', day: 'numeric' }
  return `${d.toLocaleDateString('en-US', o)} – ${end.toLocaleDateString('en-US', o)}`
}

export function weekNum(dateStr) {
  const d = parseLocal(dateStr)
  const start = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7)
}

export function fmtDisplay(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function fmtFull(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday']
