import {useCallback,useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabase'
import {dubaiDay} from '../lib/q4Cycle'
import {CLIENT_MONTHS,comparisonDates,emptyObservation,finiteNumber,growthPercent,kpiMet,observationError,observationPayload,observationState,observationSummary} from '../lib/clientObservations'
import './ClientResultMeasurements.css'

function Field({name,value,onChange,type='text',area=false,children,...rest}) {
 return <label>{name}{children || (area ? <textarea value={value??''} onChange={e=>onChange(e.target.value)} {...rest}/> : <input type={type} value={value??''} onChange={e=>onChange(e.target.value)} {...rest}/>)}</label>
}
const formatNumber=n=>finiteNumber(n)==null?'Not measured':Number(n).toLocaleString('en-US',{maximumFractionDigits:2})
const monthLabel=m=>new Date(`${m}T12:00:00Z`).toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'})
async function allRows(factory) {
 const rows=[]
 for(let from=0;;from+=500){const response=await factory().range(from,from+499);if(response.error)throw response.error;rows.push(...response.data);if(response.data.length<500)return rows}
}
function Evidence({row}) {
 const dates=comparisonDates(row.month_start,row.comparison_basis,row.as_of)
 return <details><summary>Evidence and saved history</summary><dl>
 <dt>Comparison periods</dt><dd>{dates?`${dates.previousStart} to ${dates.previousEnd} versus ${dates.currentStart} to ${dates.currentEnd}`:'Not supplied'}</dd>
 <dt>Scope / currency</dt><dd>{row.channel_scope||'Not supplied'} · {row.currency||'Not supplied'}</dd>
 <dt>Spend</dt><dd>{formatNumber(row.previous_spend)} → {formatNumber(row.current_spend)}</dd>
 <dt>Growth target when saved</dt><dd>{formatNumber(row.target_pct_snapshot)}%</dd>
 <dt>Client KPI conditions</dt><dd>{row.guardrails?.length?row.guardrails.map((k,i)=><div key={i}>{k.name||'Unnamed KPI'}: {k.direction==='at_most'?'at most':'at least'} {formatNumber(k.target)} {k.unit}; actual {formatNumber(k.actual)} — {kpiMet(k)==null?'Not measured':kpiMet(k)?'On target':'Off target'}</div>):'Not supplied'}</dd>
 <dt>Evidence</dt><dd>{row.evidence||'Not supplied'}</dd><dt>Notes / exclusion reason</dt><dd>{[row.notes,row.exclusion_reason].filter(Boolean).join('\n')||'None'}</dd></dl>
 {!!row.history?.length&&<details><summary>{row.history.length} previous saved version(s)</summary>{[...row.history].reverse().map(old=><div className="metric" key={old.revision}><strong>Revision {old.revision} · {old.updated_at}</strong><p>{old.scope_status} · {old.entry_status} · {old.comparison_basis} through {old.as_of}</p><p>{old.currency} spend: {formatNumber(old.previous_spend)} → {formatNumber(old.current_spend)}. Growth: {formatNumber(growthPercent(old.previous_spend,old.current_spend))}%.</p><p className="plain">{old.evidence || old.exclusion_reason || 'No evidence recorded'}</p><p className="plain">{(old.guardrails||[]).map(k=>`${k.name}: ${k.direction} ${k.target} ${k.unit}; actual ${k.actual}`).join('\n')}</p></div>)}</details>}
 </details>
}
export default function ClientResultMeasurements({result,canEdit,canView,onDirtyChange}) {
 const today=dubaiDay(),initialMonth=CLIENT_MONTHS.find(m=>m.slice(0,7)===today.slice(0,7))||CLIENT_MONTHS[0]
 const [month,setMonth]=useState(initialMonth),[rows,setRows]=useState([]),[clients,setClients]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[form,setForm]=useState(null),[dirty,setDirty]=useState(false),[extraClient,setExtraClient]=useState('')
 useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false)},[dirty,onDirtyChange])
 const load=useCallback(async()=>{
  if(!canView)return
  setLoading(true);setError('')
  try {const [observations,roster]=await Promise.all([allRows(()=>supabase.from('okr_client_observations').select('*').eq('key_result_id',result.id).order('month_start').order('client_id')),allRows(()=>supabase.from('clients').select('id,name,is_active,is_archived,mb_ids').order('name').order('id'))]);setRows(observations);setClients(roster)}
  catch(e){setError(e.message||'Client measurements could not load. Please retry.')}
  finally{setLoading(false)}
 },[result.id,canView])
 useEffect(()=>{load()},[load])
 const list=useMemo(()=>{
  const saved=rows.filter(r=>r.month_start===month),savedIds=new Set(saved.map(r=>r.client_id))
  const suggestions=clients.filter(c=>c.is_active&&c.is_archived!==true&&Array.isArray(c.mb_ids)&&c.mb_ids.length&&!savedIds.has(c.id)).map(c=>({...emptyObservation(c.id,month,today),client_name:c.name}))
  return [...saved,...suggestions].sort((a,b)=>a.client_name.localeCompare(b.client_name))
 },[rows,clients,month,today])
 const summary=observationSummary(list),selectedClient=clients.find(c=>c.id===form?.client_id),formDates=form?comparisonDates(form.month_start,form.comparison_basis,form.as_of):null
 function abandon(){return !dirty||window.confirm('Discard the unsaved client measurement?')}
 function edit(row){if(!abandon())return;setDirty(false);setError('');setNotice('');setForm(structuredClone(row))}
 function change(key,value){setDirty(true);setForm(f=>({...f,[key]:value}))}
 function changeKpi(i,patch){change('guardrails',form.guardrails.map((k,j)=>i===j?{...k,...patch}:k))}
 async function save(){
  const message=observationError(form,today);if(message){setError(message);return}
  setBusy(true);setError('');setNotice('')
  try {
   const payload=observationPayload(form,result.id)
   const query=form.id?supabase.from('okr_client_observations').update(payload).eq('id',form.id).eq('revision',form.revision):supabase.from('okr_client_observations').insert(payload)
   const response=await query.select('*').single()
   if(response.error)throw new Error(['PGRST116','23505'].includes(response.error.code)?'This client/month was changed in another window. Copy any unsaved text, refresh the list and review the latest record before saving.':response.error.message)
   setRows(current=>[...current.filter(r=>r.id!==response.data.id),response.data]);setDirty(false);setForm(null);setNotice('Client measurement saved. Shared targets, contribution plans and weekly snapshots are unchanged.')
  }catch(e){setError(e.message||'Could not save. Your unsaved inputs are still here.')}
  finally{setBusy(false)}
 }
 if(!canView)return <section className="card" id="client-result-measurements"><h2>Client-level measurements</h2><p>The Media Buying team and Operations/management can view this client-level evidence beneath the shared result.</p></section>
 return <section className="card client-observations" id="client-result-measurements">
  <h2>Client-level measurements</h2><p>One shared department KR, with a separate observed result for every client. Growth must meet the shared target <strong>and</strong> the client's agreed KPI conditions.</p>
  <p><strong>Shared target:</strong> {result.planning_context?.target_text}. This view does not change the approved target or calculate a bonus.</p>
  <div className="two"><Field name="Comparison month"><select disabled={busy} value={month} onChange={e=>{if(!abandon())return;setDirty(false);setForm(null);setMonth(e.target.value);setNotice('');setError('')}}>{CLIENT_MONTHS.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></Field><div className="actions"><button disabled={busy||loading} onClick={()=>{if(abandon()){setDirty(false);setForm(null);load()}}}>Refresh client list</button></div></div>
  {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
  {loading?<p role="status">Loading client observations…</p>:<>
   <div className="notice"><strong>{summary.met} of {summary.included} included clients have a completed-month record meeting both conditions.</strong><br/>{summary.notMet} completed-month records below a condition · {summary.provisional} provisional month-to-date · {summary.missing} unmeasured/draft · {summary.scopePending} scope unconfirmed · {summary.excluded} excluded.</div>
   <p className="muted">The current Media Buying roster is suggested below, not treated as the agreed historical client list. Confirm each client's scope for the month, add missing clients, and keep exclusion reasons visible. No averaging hides a missed client; an incomplete list is not overall KR achievement.</p>
   <div className="table-wrap"><table><thead><tr><th>Client</th><th>Period / scope</th><th>Observed growth</th><th>KPI + growth result</th><th>Details</th></tr></thead><tbody>{list.map(row=>{const state=observationState(row),growth=growthPercent(row.previous_spend,row.current_spend);return <tr key={row.client_id}><td><strong>{row.client_name}</strong></td><td>{row.id?`${row.comparison_basis==='matched_mtd'?'Matched MTD':'Full month'} · ${row.as_of}`:'No saved observation'}<br/>{row.scope_status}</td><td>{growth==null?'Not measured':`${formatNumber(growth)}%`}{row.entry_status==='draft'&&growth!=null?<small> (draft)</small>:null}</td><td>{state.label}</td><td>{canEdit&&<button className="minor" disabled={busy} onClick={()=>edit(row)}>{row.id?'Edit client':'Enter client values'}</button>}{row.id&&<Evidence row={row}/>}</td></tr>})}</tbody></table></div>
   {!list.length&&<p>No client observations yet. Add the relevant client below; no results have been assumed.</p>}
   {canEdit&&<div className="two spaced"><Field name="Add another client, including a former client"><select disabled={busy} value={extraClient} onChange={e=>setExtraClient(e.target.value)}><option value="">Select client</option>{clients.filter(c=>!list.some(r=>r.client_id===c.id)).map(c=><option key={c.id} value={c.id}>{c.name}{c.is_archived?' (archived)':!c.is_active?' (inactive)':''}</option>)}</select></Field><div className="actions"><button disabled={busy||!extraClient} onClick={()=>edit(emptyObservation(extraClient,month,today))}>Add client observation</button></div></div>}
  </>}
  {form&&canEdit&&<div className="client-observation-form"><h3>{selectedClient?.name||form.client_name} · {monthLabel(month)}</h3><fieldset disabled={busy}>
   <div className="two"><Field name="Client scope for this month"><select value={form.scope_status} onChange={e=>{setDirty(true);setForm(f=>({...f,scope_status:e.target.value,entry_status:e.target.value==='included'?f.entry_status:'draft'}))}}><option value="pending">Needs confirmation</option><option value="included">Included</option><option value="excluded">Excluded — reason required</option></select></Field><Field name="Measurement status"><select value={form.entry_status} onChange={e=>change('entry_status',e.target.value)}><option value="draft">Draft / missing evidence</option><option value="recorded" disabled={form.scope_status!=='included'}>Recorded with evidence</option></select></Field></div>
   {form.scope_status==='excluded'&&<Field area name="Reason for exclusion (not a missing or weak result)" value={form.exclusion_reason} onChange={v=>change('exclusion_reason',v)}/>}
   <div className="two"><Field name="Comparison basis"><select value={form.comparison_basis} onChange={e=>{setDirty(true);setForm(f=>({...f,comparison_basis:e.target.value,as_of:e.target.value==='full_month'?comparisonDates(month,'full_month').currentEnd:emptyObservation(f.client_id,month,today).as_of}))}}><option value="full_month">Completed calendar months</option><option value="matched_mtd">Same-day month-to-date (provisional)</option></select></Field><Field type="date" name="Current period measured through" value={form.as_of} onChange={v=>change('as_of',v)}/></div>
   <p className="muted">{formDates?`Enter ${formDates.previousStart}–${formDates.previousEnd} versus ${formDates.currentStart}–${formDates.currentEnd}.`:'Choose comparable dates available in both months.'} Month-to-date is always provisional, not a completed month.</p>
   <div className="two"><Field type="number" min="0" step="any" name="Previous-period spend" value={form.previous_spend} onChange={v=>change('previous_spend',v)}/><Field type="number" min="0" step="any" name="Current-period spend" value={form.current_spend} onChange={v=>change('current_spend',v)}/></div>
   <div className="two"><Field name="Currency (same in both periods, e.g. USD)" maxLength={3} value={form.currency} onChange={v=>change('currency',v.toUpperCase())}/><Field name="Account/channel scope (same in both periods)" value={form.channel_scope} onChange={v=>change('channel_scope',v)}/></div>
   <p><strong>Calculated observed growth:</strong> {growthPercent(form.previous_spend,form.current_spend)==null?'Not measured / not comparable':`${formatNumber(growthPercent(form.previous_spend,form.current_spend))}%`}. Previous spend of zero is not automatically successful growth.</p>
   <h3>Agreed client KPI conditions</h3><p className="muted">Use the actual client agreement, not a new target chosen after seeing the result. Include every condition needed for this client to count as on target.</p>
   {form.guardrails.map((k,i)=><div className="metric" key={i}><div className="two"><Field name={`KPI ${i+1} name (e.g. blended CPA)`} value={k.name} onChange={v=>changeKpi(i,{name:v})}/><Field name="Unit (e.g. USD, ratio, %)" value={k.unit} onChange={v=>changeKpi(i,{unit:v})}/></div><div className="grid"><Field name="Target direction"><select value={k.direction} onChange={e=>changeKpi(i,{direction:e.target.value})}><option value="">Choose</option><option value="at_most">At most</option><option value="at_least">At least</option></select></Field><Field type="number" step="any" name="Agreed KPI target" value={k.target} onChange={v=>changeKpi(i,{target:v})}/><Field type="number" step="any" name="Observed KPI actual" value={k.actual} onChange={v=>changeKpi(i,{actual:v})}/></div><button className="minor" onClick={()=>change('guardrails',form.guardrails.filter((_,j)=>i!==j))}>Remove condition</button></div>)}
   {form.guardrails.length<5&&<button onClick={()=>change('guardrails',[...form.guardrails,{name:'',unit:'',direction:'',target:'',actual:''}])}>Add KPI condition</button>}
   <Field area name="Evidence for spend + KPI actuals, target and period (source link or reference)" value={form.evidence} onChange={v=>change('evidence',v)}/><Field area name="Notes / blockers" value={form.notes} onChange={v=>change('notes',v)}/>
   <div className="actions"><button className="primary" onClick={save}>{busy?'Saving…':'Save client observation'}</button><button onClick={()=>{if(abandon()){setDirty(false);setForm(null);setError('')}}}>Cancel</button></div><p className="muted">{dirty?'Unsaved changes. ':''}Save each client separately. Previous saved revisions remain visible.</p>
  </fieldset></div>}
 </section>
}
