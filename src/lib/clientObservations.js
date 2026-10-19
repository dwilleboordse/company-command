// Measurements are evidence beneath a shared KR, not new client OKRs.
export const CLIENT_MONTHS = ['2026-10-01', '2026-11-01', '2026-12-01']
export const isClientMeasuredResult = result => result?.planning_context?.code === 'DMB.2'
export function finiteNumber(value) {
  if (value === '' || value == null || typeof value === 'boolean') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
export function growthPercent(previous, current) {
  const p = finiteNumber(previous), c = finiteNumber(current)
  return p == null || p <= 0 || c == null || c < 0 ? null : (c / p - 1) * 100
}
export function comparisonDates(month, basis, asOf) {
  if (!CLIENT_MONTHS.includes(month)) return null
  const [y, m] = month.split('-').map(Number)
  const previousStart = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10)
  const previousEnd = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10)
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  if (basis === 'full_month') return { previousStart, previousEnd, currentStart: month, currentEnd: monthEnd }
  if (basis !== 'matched_mtd' || !/^\d{4}-\d{2}-\d{2}$/.test(asOf || '') || asOf < month || asOf > monthEnd || Number(asOf.slice(-2)) > Number(previousEnd.slice(-2))) return null
  return { previousStart, previousEnd: previousStart.slice(0, 8) + asOf.slice(-2), currentStart: month, currentEnd: asOf }
}
export function kpiMet(kpi) {
  const target = finiteNumber(kpi?.target), actual = finiteNumber(kpi?.actual)
  if (!kpi?.name?.trim() || !kpi?.unit?.trim() || target == null || actual == null) return null
  return kpi.direction === 'at_least' ? actual >= target : kpi.direction === 'at_most' ? actual <= target : null
}
export function observationError(row, today) {
  if (!CLIENT_MONTHS.includes(row.month_start) || !row.client_id) return 'Choose a client and Q4 comparison month.'
  if (!['pending','included','excluded'].includes(row.scope_status)) return 'Confirm whether this client is in scope.'
  if (row.scope_status === 'excluded' && !row.exclusion_reason?.trim()) return 'Explain why this client is excluded for this month.'
  for (const v of [row.previous_spend, row.current_spend]) if (v !== '' && v != null && (finiteNumber(v) == null || Number(v) < 0)) return 'Spend must be a non-negative number, or blank if unknown.'
  if (!Array.isArray(row.guardrails) || row.guardrails.length > 5) return 'Use up to five agreed KPI conditions.'
  if (row.entry_status !== 'recorded') return ''
  if (row.scope_status !== 'included') return 'Only an included client can have a recorded measurement.'
  const dates = comparisonDates(row.month_start, row.comparison_basis, row.as_of)
  if (!dates || row.as_of !== dates.currentEnd || dates.currentEnd > today) return 'Choose valid comparable dates, no future observations. Matched month-to-date comparisons use the same day in both months.'
  if (row.comparison_basis === 'full_month' && dates.currentEnd >= today) return 'This month is not complete. Use matched month-to-date and keep the result provisional.'
  if (growthPercent(row.previous_spend, row.current_spend) == null) return 'Record both spend values. Prior-period spend must be above zero; otherwise save a draft as not comparable.'
  if (!/^[A-Z]{3}$/.test(row.currency || '') || !row.channel_scope?.trim()) return 'Enter the account currency and the same channel scope for both periods.'
  if (!row.guardrails.length || row.guardrails.some(k => kpiMet(k) == null)) return 'Record the agreed KPI name, unit, direction, target and actual for every condition.'
  if (!row.evidence?.trim()) return 'Add evidence for the spend and KPI values, including the comparison periods.'
  return ''
}
export function observationState(row) {
  if (row.scope_status === 'excluded') return { code:'excluded', label:'Excluded — reason recorded' }
  if (row.scope_status !== 'included') return { code:'pending_scope', label:'Scope not confirmed' }
  const growth = growthPercent(row.previous_spend, row.current_spend)
  const target = finiteNumber(row.target_pct_snapshot)
  if (row.entry_status !== 'recorded' || growth == null || target == null || !row.guardrails?.length || row.guardrails.some(k => kpiMet(k) == null) || !row.evidence?.trim()) return { code:'not_measured', label:finiteNumber(row.previous_spend) === 0 ? 'Not comparable — zero prior spend' : 'Not measured / draft' }
  const met = growth + 1e-9 >= target && row.guardrails.every(k => kpiMet(k) === true)
  const reason = row.guardrails.some(k => kpiMet(k) === false) ? 'KPI condition missed' : growth + 1e-9 < target ? 'Growth below target' : 'Both conditions met'
  return { code:row.comparison_basis === 'matched_mtd' ? 'provisional' : met ? 'met' : 'not_met', label:row.comparison_basis === 'matched_mtd' ? `Provisional — ${reason.toLowerCase()}` : reason, met, growth }
}
export function observationSummary(rows) {
  const states = rows.map(observationState)
  return { included:rows.filter(r=>r.scope_status==='included').length, met:states.filter(s=>s.code==='met').length, notMet:states.filter(s=>s.code==='not_met').length, provisional:states.filter(s=>s.code==='provisional').length, missing:states.filter(s=>s.code==='not_measured').length, scopePending:states.filter(s=>s.code==='pending_scope').length, excluded:states.filter(s=>s.code==='excluded').length }
}
export function emptyObservation(clientId, month, today) {
  const full = comparisonDates(month, 'full_month')
  const completed = full.currentEnd < today
  const day = Math.min(Number(today.slice(-2)), Number(full.previousEnd.slice(-2)))
  const asOf = completed ? full.currentEnd : month.slice(0, 8) + String(day).padStart(2, '0')
  return { client_id:clientId,month_start:month,scope_status:'pending',exclusion_reason:'',entry_status:'draft',comparison_basis:completed?'full_month':'matched_mtd',as_of:asOf,currency:'',channel_scope:'',previous_spend:'',current_spend:'',guardrails:[],evidence:'',notes:'' }
}
export function observationPayload(row, keyResultId) {
  const keys=['client_id','month_start','scope_status','exclusion_reason','entry_status','comparison_basis','as_of','currency','channel_scope','evidence','notes']
  return { ...Object.fromEntries(keys.map(k=>[k,row[k] || ''])), key_result_id:keyResultId, previous_spend:finiteNumber(row.previous_spend),current_spend:finiteNumber(row.current_spend),guardrails:row.guardrails.map(k=>({name:k.name?.trim()||'',unit:k.unit?.trim()||'',direction:k.direction||'',target:finiteNumber(k.target),actual:finiteNumber(k.actual)})) }
}
