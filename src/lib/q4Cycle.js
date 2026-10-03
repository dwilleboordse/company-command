export const PERIOD = 'Q4-2026'
export const START = '2026-10-01'
export const END = '2026-12-31'
export const FIRST_REVIEW = '2026-10-05'
export const DEPARTMENTS = { creative_strategy:'Creative Strategy', media_buying:'Media Buying', ugc:'UGC', operations:'Operations' }
export function dubaiDay(date = new Date()) { return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date) }
export function addDays(day,count) { const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10) }
export function monday(day=dubaiDay()){const d=new Date(`${day}T12:00:00Z`);return addDays(day,-((d.getUTCDay()+6)%7))}
export function weeks(day=dubaiDay()){const result=[];const last=monday(day>END?END:day);for(let w=monday(START);w<=last;w=addDays(w,7))result.push(w);return result.reverse()}
export function displayText(value){return String(value??'').replaceAll('\\n','\n').replaceAll('\\"','"')}
export function label(value){return String(value||'draft').replaceAll('_',' ')}
export function newContribution(){return {id:globalThis.crypto.randomUUID(),title:'',key_result_id:'',done_when:'',support:'',milestones:[{title:'',due_date:''}]}}
export function validateContributions(items,departmentId,results,submit=false){
 if(!Array.isArray(items)||items.length>2)return 'Use at most two contributions.'
 if(submit&&(!departmentId||!items.length))return 'Select a department and add one or two contributions.'
 for(const c of items){
  if(c.key_result_id&&!results.some(k=>k.id===c.key_result_id&&k.objective_id===departmentId))return 'Link each contribution to a key result in the selected department.'
  if(submit&&(!c.title?.trim()||!c.done_when?.trim()||!c.key_result_id||!c.milestones?.length))return 'Complete the contribution, KR link, definition of done and at least one milestone.'
  for(const m of c.milestones||[]){if(m.due_date&&(m.due_date<START||m.due_date>END))return 'Milestone dates must fall within October 1–December 31.';if(submit&&(!m.title?.trim()||!m.due_date))return 'Complete each milestone title and date.'}
 }
 return ''
}
export function checkinState(plan,pulse,day=dubaiDay()){
 if(pulse?.locked_at)return 'Submitted'
 if(!plan?.contributions?.length)return 'Plan not started'
 if(plan.status==='closed'||plan.status==='cancelled'||day>END)return 'Cycle closed'
 if(day<FIRST_REVIEW)return 'First review October 5'
 return pulse?'Draft update':'Update due'
}
export function resultValue(k){return k.current_value===null||k.current_value===undefined||!k.current_value_recorded_at?'Not measured':`${k.current_value}${k.unit==='%'?'%':` ${k.unit||''}`}`}
