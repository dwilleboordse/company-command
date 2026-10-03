import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { PERIOD, START, END, FIRST_REVIEW, dubaiDay, monday, label, checkinState } from '../lib/q4Cycle'
import '../pages/Q4Workspace.css'
export default function Q4PlanSummary({compact=false}){
 const {user}=useAuth(),location=useLocation()
 const [state,setState]=useState({loading:true,plan:null,pulse:null,error:''}),[day,setDay]=useState(dubaiDay())
 const load=useCallback(async()=>{
  if(!user?.id)return
  const p=await supabase.from('hundred_day_plan_cycles').select('id,status,contributions,review_note').eq('planning_period',PERIOD).eq('user_id',user.id).maybeSingle()
  if(p.error){setState({loading:false,error:'Q4 status unavailable',plan:null,pulse:null});return}
  let pulse=null
  if(p.data){const r=await supabase.from('hundred_day_plan_cycle_pulses').select('locked_at,track_status,review_note').eq('cycle_id',p.data.id).eq('week_start',monday(day)).maybeSingle();if(r.error){setState({loading:false,error:'Weekly status unavailable',plan:p.data,pulse:null});return}pulse=r.data}
  setState({loading:false,error:'',plan:p.data,pulse})
 },[user?.id,day])
 useEffect(()=>{load();const f=()=>load();const t=setInterval(()=>setDay(dubaiDay()),60000);window.addEventListener('q4-plan-updated',f);return()=>{clearInterval(t);window.removeEventListener('q4-plan-updated',f)}},[load])
 if(day<START||day>END||state.loading)return null
 if(compact){if(location.pathname.startsWith('/100-day-plan')||location.pathname==='/okrs'||state.pulse?.locked_at)return null;return <div className="q4-banner" role="status">{state.error||(!state.plan?.contributions?.length?'Q4: add one or two contributions linked to your department results.':day<FIRST_REVIEW?'Your first regular Q4 weekly review is Monday, October 5.':'Q4 weekly check-in: progress, evidence, blocker and next commitment.')} {' '}<Link to="/100-day-plan">Open your contribution plan</Link></div>}
 return <section className="q4" style={{padding:0,maxWidth:'none'}}><div className="card accent"><div className="eyebrow">Your Q4 focus</div><h2 className="spaced">One or two contributions. One weekly check-in.</h2><p>Client retention · Creative performance · Delivery efficiency</p>{state.error?<p role="alert">{state.error}. Open the workspace to retry.</p>:<p>{(state.plan?.contributions||[]).length}/2 contributions · {label(state.plan?.status)} · {checkinState(state.plan,state.pulse,day)}</p>}<div className="actions"><Link className="button" to="/100-day-plan">My contributions</Link><Link className="button" to="/100-day-plan?tab=weekly">Weekly check-in</Link><Link className="button" to="/okrs">Company and department OKRs</Link></div><p className="muted">Earlier plans remain in history. Reporting completion is not a performance or bonus score.</p></div></section>
}
export function Q4PlanReminder(){return <Q4PlanSummary compact/>}
