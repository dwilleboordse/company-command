import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  Target, ListChecks, Route, ShieldAlert, CheckCircle2,
  Download, Copy, ChevronLeft, ChevronRight, Plus, X,
  Pencil, Gauge, Flag, Lock, Check, Save
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────
   100-DAY PLAN BUILDER — Operator OS
   Integrated with the dashboard's OKR system. Pulls real
   objectives/key_results from Supabase and persists each
   team member's plan to hundred_day_plans.
   ───────────────────────────────────────────────────────────── */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

.hdp *{box-sizing:border-box;margin:0;padding:0}
.hdp{
  --ink:#17140F; --panel:#201C16; --panel2:#272018; --raise:#2E2619;
  --line:#3A332A; --line2:#4C4233;
  --parchment:#ECE6DA; --muted:#9C917E; --faint:#6E6556;
  --gold:#E0A340; --gold-2:#F0BC63; --teal:#5FB3A6; --danger:#D9684A;
  --sans:'Space Grotesk',system-ui,-apple-system,'Segoe UI',sans-serif;
  --mono:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;
  background:var(--ink); color:var(--parchment);
  font-family:var(--sans); -webkit-font-smoothing:antialiased;
  min-height:100%; width:100%; line-height:1.5;
}
.hdp button{font-family:inherit; cursor:pointer; border:none; background:none; color:inherit}
.hdp input,.hdp textarea,.hdp select{font-family:inherit}
.hdp::selection,.hdp ::selection{background:rgba(224,163,64,.28)}

.hdp-shell{max-width:1080px;margin:0 auto;padding:0 20px 64px}
.hdp-top{display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:26px 0 22px;border-bottom:1px solid var(--line)}
.hdp-brand{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.hdp-brand h1{font-size:19px;font-weight:600;letter-spacing:.16em;text-transform:uppercase}
.hdp-brand .os{font-family:var(--mono);font-size:11px;letter-spacing:.22em;color:var(--gold);
  text-transform:uppercase;border:1px solid var(--line2);border-radius:999px;padding:3px 9px}
.hdp-pill{font-family:var(--mono);font-size:12px;letter-spacing:.04em;color:var(--ink);
  background:var(--gold);border-radius:999px;padding:6px 13px;font-weight:600;white-space:nowrap}
.hdp-save-status{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--teal);
  display:flex;align-items:center;gap:6px}
.hdp-save-status.dim{color:var(--faint)}

.hdp-grid{display:grid;grid-template-columns:248px 1fr;gap:34px;padding-top:30px}
.hdp-main{min-width:0}

.hdp-steps{display:flex;flex-direction:column;gap:2px;margin-bottom:30px}
.hdp-step{display:flex;align-items:center;gap:12px;padding:10px 10px;border-radius:9px;
  text-align:left;width:100%;transition:background .15s,color .15s}
.hdp-step:hover{background:var(--panel)}
.hdp-step .n{font-family:var(--mono);font-size:12px;width:24px;height:24px;flex:none;
  display:grid;place-items:center;border-radius:6px;border:1px solid var(--line2);
  color:var(--muted);transition:all .15s}
.hdp-step .lbl{font-size:13.5px;color:var(--muted);transition:color .15s}
.hdp-step.active{background:var(--panel)}
.hdp-step.active .lbl{color:var(--parchment);font-weight:500}
.hdp-step.active .n{border-color:var(--gold);color:var(--gold);background:rgba(224,163,64,.08)}
.hdp-step.done .n{background:var(--teal);border-color:var(--teal);color:var(--ink)}
.hdp-step.done .lbl{color:#c8bfae}

.hdp-track-wrap{border:1px solid var(--line);border-radius:12px;background:var(--panel);
  padding:16px 16px 14px}
.hdp-track-h{font-family:var(--mono);font-size:10.5px;letter-spacing:.18em;
  text-transform:uppercase;color:var(--faint);margin-bottom:14px}
.hdp-track{position:relative;height:46px;margin:0 4px}
.hdp-rail{position:absolute;top:9px;left:0;right:0;height:2px;background:var(--line2)}
.hdp-rail-fill{position:absolute;top:9px;left:0;height:2px;background:var(--gold);
  transition:width .5s cubic-bezier(.2,.7,.3,1)}
.hdp-tick{position:absolute;top:0;transform:translateX(-50%);display:flex;flex-direction:column;
  align-items:center;gap:6px}
.hdp-tick .dot{width:9px;height:9px;border-radius:999px;background:var(--ink);
  border:2px solid var(--line2);transition:all .4s}
.hdp-tick.reached .dot{border-color:var(--gold);background:var(--gold)}
.hdp-tick .d{font-family:var(--mono);font-size:11px;color:var(--parchment);font-weight:500}
.hdp-tick .date{font-family:var(--mono);font-size:9.5px;color:var(--faint);white-space:nowrap}
.hdp-today{position:absolute;top:-2px;transform:translateX(-50%);width:2px;height:14px;
  background:var(--teal)}
.hdp-today::after{content:'NOW';position:absolute;top:-13px;left:50%;transform:translateX(-50%);
  font-family:var(--mono);font-size:8px;letter-spacing:.1em;color:var(--teal)}
.hdp-track-empty{font-size:12px;color:var(--faint);text-align:center;padding:8px 0}

.hdp-eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;
  color:var(--gold);display:flex;align-items:center;gap:9px;margin-bottom:12px}
.hdp-eyebrow .bar{flex:1;height:1px;background:var(--line)}
.hdp-h2{font-size:27px;font-weight:600;letter-spacing:-.01em;line-height:1.15;margin-bottom:8px}
.hdp-sub{font-size:14.5px;color:var(--muted);max-width:62ch;margin-bottom:26px}

.hdp-row{display:grid;gap:16px;margin-bottom:18px}
.hdp-row.two{grid-template-columns:1fr 1fr}
.hdp-field label{display:block;font-size:12px;font-weight:500;letter-spacing:.03em;
  color:#c8bfae;margin-bottom:7px}
.hdp-field .hint{font-size:11.5px;color:var(--faint);margin-bottom:7px;font-weight:400}
.hdp-input,.hdp-area,.hdp-select{width:100%;background:var(--panel);border:1px solid var(--line);
  border-radius:9px;color:var(--parchment);font-size:14px;padding:11px 13px;transition:border .15s}
.hdp-area{resize:vertical;min-height:74px;line-height:1.55}
.hdp-input::placeholder,.hdp-area::placeholder{color:var(--faint)}
.hdp-input:focus,.hdp-area:focus,.hdp-select:focus{outline:none;border-color:var(--gold)}
.hdp-input.num{font-family:var(--mono);letter-spacing:.02em}
.hdp-select{appearance:none;cursor:pointer;
  background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);
  background-position:calc(100% - 18px) 18px,calc(100% - 13px) 18px;
  background-size:5px 5px,5px 5px;background-repeat:no-repeat;padding-right:38px}

.hdp-okr{border:1px solid var(--line);border-radius:11px;background:var(--panel);
  padding:15px 16px;margin-bottom:11px;cursor:pointer;transition:border .15s,background .15s}
.hdp-okr:hover{border-color:var(--line2)}
.hdp-okr.sel{border-color:var(--gold);background:rgba(224,163,64,.06)}
.hdp-okr-h{display:flex;align-items:flex-start;gap:12px}
.hdp-check{width:20px;height:20px;flex:none;border-radius:6px;border:1.5px solid var(--line2);
  display:grid;place-items:center;margin-top:1px;transition:all .15s}
.hdp-okr.sel .hdp-check{background:var(--gold);border-color:var(--gold);color:var(--ink)}
.hdp-okr-obj{font-size:14.5px;font-weight:600;letter-spacing:-.005em}
.hdp-okr-krs{list-style:none;margin:11px 0 0;padding:0 0 0 32px;display:flex;
  flex-direction:column;gap:5px}
.hdp-okr-krs li{font-size:12.5px;color:var(--muted);font-family:var(--mono);
  position:relative;padding-left:14px;line-height:1.45}
.hdp-okr-krs li::before{content:'';position:absolute;left:0;top:7px;width:4px;height:4px;
  background:var(--gold-2);border-radius:999px}

.hdp-card{border:1px solid var(--line);border-radius:13px;background:var(--panel);
  padding:18px;margin-bottom:16px;position:relative}
.hdp-card-tag{font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--gold);margin-bottom:13px;display:flex;align-items:center;gap:8px}
.hdp-remove{position:absolute;top:14px;right:14px;width:28px;height:28px;border-radius:7px;
  display:grid;place-items:center;color:var(--faint);transition:all .15s}
.hdp-remove:hover{background:var(--raise);color:var(--danger)}

.hdp-kr{display:grid;grid-template-columns:1.4fr .8fr .8fr 1fr auto;gap:9px;
  align-items:end;margin-bottom:9px}
.hdp-kr .micro{font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--faint);margin-bottom:5px;display:block}
.hdp-kr-x{width:34px;height:42px;border-radius:8px;display:grid;place-items:center;
  color:var(--faint);transition:all .15s}
.hdp-kr-x:hover{background:var(--raise);color:var(--danger)}
.hdp-arrow{align-self:end;height:42px;display:grid;place-items:center;color:var(--faint);
  font-family:var(--mono);font-size:13px}

.hdp-initrow{display:flex;gap:9px;align-items:center;margin-bottom:8px}
.hdp-initrow .idx{font-family:var(--mono);font-size:11px;color:var(--gold);width:18px;flex:none}

.hdp-add{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:500;
  color:var(--gold);border:1px dashed var(--line2);border-radius:9px;padding:10px 15px;
  transition:all .15s}
.hdp-add:hover{border-color:var(--gold);background:rgba(224,163,64,.06)}
.hdp-add:disabled{opacity:.35;cursor:not-allowed}
.hdp-add.block{display:flex;width:100%;justify-content:center}

.hdp-chips{display:flex;flex-wrap:wrap;gap:9px}
.hdp-chip{font-size:13px;padding:11px 15px;border:1px solid var(--line);border-radius:9px;
  background:var(--panel);color:var(--muted);transition:all .15s;display:flex;align-items:center;gap:8px}
.hdp-chip:hover{border-color:var(--line2);color:var(--parchment)}
.hdp-chip.on{border-color:var(--gold);color:var(--parchment);background:rgba(224,163,64,.08)}
.hdp-chip.on .ic{color:var(--gold)}

.hdp-cp{border:1px solid var(--line);border-radius:12px;background:var(--panel);
  padding:16px;margin-bottom:12px}
.hdp-cp-h{display:flex;align-items:center;gap:11px;margin-bottom:11px}
.hdp-cp-day{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--gold);
  background:rgba(224,163,64,.1);border:1px solid var(--line2);border-radius:7px;padding:4px 10px}
.hdp-cp-date{font-family:var(--mono);font-size:11.5px;color:var(--faint)}

.hdp-conf{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.hdp-slider{-webkit-appearance:none;appearance:none;height:4px;border-radius:999px;
  background:var(--line2);flex:1;min-width:200px;outline:none}
.hdp-slider::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:999px;
  background:var(--gold);cursor:pointer;border:3px solid var(--ink);box-shadow:0 0 0 1px var(--gold)}
.hdp-slider::-moz-range-thumb{width:20px;height:20px;border-radius:999px;background:var(--gold);
  cursor:pointer;border:3px solid var(--ink)}
.hdp-conf-val{font-family:var(--mono);font-size:30px;font-weight:600;color:var(--gold);
  min-width:78px;text-align:right}
.hdp-conf-val span{font-size:15px;color:var(--faint)}

.hdp-rev-head{border:1px solid var(--line);border-radius:13px;background:var(--panel2);
  padding:20px;margin-bottom:18px}
.hdp-rev-name{font-size:22px;font-weight:600;margin-bottom:5px}
.hdp-rev-meta{font-family:var(--mono);font-size:12px;color:var(--muted);line-height:1.7}
.hdp-rev-meta b{color:var(--gold-2);font-weight:500}
.hdp-rev-sec{margin-bottom:22px}
.hdp-rev-sec h3{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--gold);margin-bottom:12px;display:flex;align-items:center;gap:9px}
.hdp-rev-sec h3 .bar{flex:1;height:1px;background:var(--line)}
.hdp-rev-obj{border-left:2px solid var(--gold);padding-left:15px;margin-bottom:16px}
.hdp-rev-obj .t{font-size:16px;font-weight:600;margin-bottom:4px}
.hdp-rev-obj .why{font-size:13px;color:var(--muted);font-style:italic;margin-bottom:10px}
.hdp-rev-obj ul{list-style:none;display:flex;flex-direction:column;gap:6px;margin:8px 0}
.hdp-rev-obj li{font-family:var(--mono);font-size:12.5px;color:#c8bfae;padding-left:15px;
  position:relative;line-height:1.5}
.hdp-rev-obj li::before{content:'›';position:absolute;left:0;color:var(--gold)}
.hdp-rev-lever{font-size:12.5px;margin:8px 0}
.hdp-rev-lever b{color:var(--teal)}
.hdp-rev-list{list-style:none}
.hdp-rev-list li{font-size:13.5px;color:#d4cbb9;padding:7px 0 7px 16px;position:relative;
  border-bottom:1px solid var(--line)}
.hdp-rev-list li:last-child{border-bottom:none}
.hdp-rev-list li::before{content:'';position:absolute;left:0;top:14px;width:5px;height:5px;
  background:var(--gold);border-radius:999px}
.hdp-export-box{background:var(--ink);border:1px solid var(--line);border-radius:10px;
  padding:14px;font-family:var(--mono);font-size:11.5px;color:var(--muted);
  white-space:pre-wrap;max-height:230px;overflow:auto;line-height:1.6}

.hdp-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;
  margin-top:32px;padding-top:22px;border-top:1px solid var(--line)}
.hdp-prog{font-family:var(--mono);font-size:12px;color:var(--faint);letter-spacing:.05em}
.hdp-prog b{color:var(--parchment)}
.hdp-nav{display:flex;gap:11px}
.hdp-btn{display:inline-flex;align-items:center;gap:9px;font-size:14px;font-weight:500;
  padding:12px 20px;border-radius:9px;transition:all .15s;letter-spacing:.01em}
.hdp-btn.ghost{color:var(--muted);border:1px solid var(--line)}
.hdp-btn.ghost:hover{color:var(--parchment);border-color:var(--line2)}
.hdp-btn.primary{background:var(--gold);color:var(--ink);font-weight:600}
.hdp-btn.primary:hover{background:var(--gold-2)}
.hdp-btn.primary:disabled{opacity:.35;cursor:not-allowed;background:var(--gold)}
.hdp-btn.teal{background:var(--teal);color:var(--ink);font-weight:600}
.hdp-btn.teal:hover{filter:brightness(1.07)}

.hdp-nudge{font-size:12px;color:var(--gold-2);margin-top:10px;display:flex;align-items:center;gap:7px}
.hdp-empty{border:1px dashed var(--line2);border-radius:12px;padding:24px;text-align:center;
  color:var(--faint);font-size:13.5px;margin-bottom:16px}

.hdp-fade{animation:hdpfade .35s ease}
@keyframes hdpfade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

.hdp-mobile-prog{display:none}

@media (max-width:880px){
  .hdp-grid{grid-template-columns:1fr;gap:0;padding-top:20px}
  .hdp-aside{display:none}
  .hdp-mobile-prog{display:block;margin-bottom:22px}
  .hdp-h2{font-size:23px}
  .hdp-row.two{grid-template-columns:1fr}
  .hdp-kr{grid-template-columns:1fr 1fr;gap:8px}
  .hdp-kr .full{grid-column:1 / -1}
  .hdp-arrow{display:none}
  .hdp-foot{position:sticky;bottom:0;background:var(--ink);
    margin:32px -20px 0;padding:16px 20px;border-top:1px solid var(--line2)}
  .hdp-btn{padding:12px 16px}
}
@media (prefers-reduced-motion:reduce){
  .hdp *,.hdp *::before,.hdp *::after{animation:none!important;transition:none!important}
}
`;

const POSITION_LABELS = {
  creative_strategist: 'Creative Strategy',
  media_buyer:         'Paid Media',
  editor:              'Editing',
  designer:            'Design',
  ugc_manager:         'UGC',
  email_marketer:      'Retention (Email/SMS)',
  ops_manager:         'Operations',
  ops_assistant:       'Operations',
  hr_manager:          'HR',
  marketing:           'Marketing',
  management:          'Management',
  company_wide:        'Company Wide',
}
const DEPTS = Array.from(new Set(Object.values(POSITION_LABELS)))

const STEPS = [
  { label: "Setup", icon: Target },
  { label: "Anchor OKRs", icon: Lock },
  { label: "Objectives", icon: Flag },
  { label: "Results & gameplan", icon: ListChecks },
  { label: "Checkpoints", icon: Route },
  { label: "Risks & resourcing", icon: ShieldAlert },
  { label: "Review & export", icon: CheckCircle2 },
];

function currentQuarter() {
  const m = new Date().getMonth() + 1
  const y = new Date().getFullYear()
  return `Q${m<=3?1:m<=6?2:m<=9?3:4}-${y}`
}

const uid = () => Math.random().toString(36).slice(2, 9);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmt = (d) => d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
const fmtY = (d) => d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

export default function HundredDayPlan() {
  const { profile } = useAuth()
  const [step, setStep] = useState(0);
  const [okrCfg, setOkrCfg] = useState({});       // department label → [{ id, objective, keyResults: [string,...] }]
  const [editOkr, setEditOkr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [saveStatus, setSaveStatus] = useState({ state: 'idle', at: null }); // 'idle' | 'saving' | 'saved' | 'error'

  const [member, setMember] = useState({ name: "", role: "", department: "", startDate: "" });
  const [anchors, setAnchors] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [cps, setCps] = useState({ d25: "", d50: "", d75: "" });
  const [risk, setRisk] = useState({ blocker: "", need: "", deps: "" });
  const [confidence, setConfidence] = useState(6);

  const deptOkrs = okrCfg[member.department] || []

  const dates = useMemo(() => {
    if (!member.startDate) return null;
    const s = member.startDate;
    return {
      start: s, d25: addDays(s, 24), d50: addDays(s, 49),
      d75: addDays(s, 74), d100: addDays(s, 99),
    };
  }, [member.startDate]);

  const todayPct = useMemo(() => {
    if (!dates) return null;
    const s = new Date(dates.start).getTime();
    const e = new Date(dates.d100).getTime();
    const n = Date.now();
    if (n < s || e === s) return null;
    return Math.min(100, ((n - s) / (e - s)) * 100);
  }, [dates]);

  // ── INITIAL LOAD: fetch real OKRs + existing plan ─────────
  useEffect(() => {
    if (!profile?.id) return
    let cancel = false

    ;(async () => {
      setLoadingPlan(true)

      // 1) Pull all active OKRs for the current quarter from the dashboard's OKR system
      const quarter = currentQuarter()
      const { data: objData } = await supabase
        .from('objectives')
        .select('*')
        .eq('is_active', true)
        .eq('quarter', quarter)
      const objIds = (objData || []).map(o => o.id)
      const { data: krData } = objIds.length
        ? await supabase.from('key_results').select('*').in('objective_id', objIds).eq('is_active', true)
        : { data: [] }

      // Group OKRs by friendly department label
      const cfg = {}
      ;(objData || []).forEach(o => {
        const dept = POSITION_LABELS[o.role_type] || o.role_type || 'Other'
        if (!cfg[dept]) cfg[dept] = []
        cfg[dept].push({
          id: o.id,
          objective: o.title,
          keyResults: (krData || [])
            .filter(k => k.objective_id === o.id)
            .map(k => {
              const dir = k.goal_direction === 'min' ? '≤' : '≥'
              const goal = k.goal_value != null ? `${dir} ${k.goal_value}${k.unit || ''}` : ''
              return goal ? `${k.metric_name} (${goal})` : k.metric_name
            }),
        })
      })

      // 2) Load existing plan (if any)
      const { data: planData } = await supabase
        .from('hundred_day_plans')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle()

      if (cancel) return

      setOkrCfg(cfg)

      const defaultDept = POSITION_LABELS[profile.position] || ''

      if (planData) {
        setMember({
          name:       planData.name       || profile.full_name || '',
          role:       planData.role       || (POSITION_LABELS[profile.position] || ''),
          department: planData.department || defaultDept,
          startDate:  planData.start_date || '',
        })
        setAnchors(planData.anchored_objective_ids || [])
        setObjectives(planData.objectives || [])
        setCps(planData.checkpoints || { d25: '', d50: '', d75: '' })
        setRisk(planData.risks || { blocker: '', need: '', deps: '' })
        setConfidence(planData.confidence ?? 6)
      } else {
        // Pre-fill from profile so the user doesn't re-type basics
        setMember(m => ({
          ...m,
          name: m.name || profile.full_name || '',
          role: m.role || (POSITION_LABELS[profile.position] || profile.position || ''),
          department: m.department || defaultDept,
        }))
      }

      setLoadingPlan(false)
    })()

    return () => { cancel = true }
  }, [profile?.id])

  // ── SAVE ─────────────────────────────────────────────────
  const savePlan = useCallback(async (status = 'draft') => {
    if (!profile?.id) return
    setSaveStatus({ state: 'saving' })
    const payload = {
      user_id: profile.id,
      name: member.name || null,
      role: member.role || null,
      department: member.department || null,
      start_date: member.startDate || null,
      end_date: dates ? new Date(dates.d100).toISOString().slice(0, 10) : null,
      anchored_objective_ids: anchors,
      objectives,
      checkpoints: cps,
      risks: risk,
      confidence,
      status,
    }
    const { error } = await supabase
      .from('hundred_day_plans')
      .upsert(payload, { onConflict: 'user_id' })
    if (error) {
      console.error('Save plan failed:', error)
      setSaveStatus({ state: 'error', message: error.message || 'unknown error' })
    } else {
      setSaveStatus({ state: 'saved', at: Date.now() })
    }
  }, [profile?.id, member, dates, anchors, objectives, cps, risk, confidence])

  // Debounced auto-save (1.2s after last edit)
  const saveTimer = useRef(null)
  useEffect(() => {
    if (!profile?.id || loadingPlan) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { savePlan('draft') }, 1200)
    return () => clearTimeout(saveTimer.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member, anchors, objectives, cps, risk, confidence])

  // ── OBJECTIVE HELPERS ───────────────────────────────────
  const addObjective = () => objectives.length < 3 && setObjectives([...objectives,
    { id: uid(), statement: "", why: "", lever: "", keyResults: [{ id: uid(), metric: "", baseline: "", target: "", unit: "", source: "" }], initiatives: [""] }]);
  const setObj = (id, patch) => setObjectives(objectives.map(o => o.id === id ? { ...o, ...patch } : o));
  const delObj = (id) => setObjectives(objectives.filter(o => o.id !== id));
  const addKR = (oid) => setObjectives(objectives.map(o => o.id === oid && o.keyResults.length < 4
    ? { ...o, keyResults: [...o.keyResults, { id: uid(), metric: "", baseline: "", target: "", unit: "", source: "" }] } : o));
  const setKR = (oid, kid, patch) => setObjectives(objectives.map(o => o.id === oid
    ? { ...o, keyResults: o.keyResults.map(k => k.id === kid ? { ...k, ...patch } : k) } : o));
  const delKR = (oid, kid) => setObjectives(objectives.map(o => o.id === oid
    ? { ...o, keyResults: o.keyResults.filter(k => k.id !== kid) } : o));
  const setInit = (oid, i, v) => setObjectives(objectives.map(o => o.id === oid
    ? { ...o, initiatives: o.initiatives.map((x, j) => j === i ? v : x) } : o));
  const addInit = (oid) => setObjectives(objectives.map(o => o.id === oid && o.initiatives.length < 5
    ? { ...o, initiatives: [...o.initiatives, ""] } : o));
  const delInit = (oid, i) => setObjectives(objectives.map(o => o.id === oid
    ? { ...o, initiatives: o.initiatives.filter((_, j) => j !== i) } : o));

  // OKR config editing (local-only — doesn't write back to the OKR system)
  const editObjText = (id, v) => setOkrCfg({ ...okrCfg, [member.department]: deptOkrs.map(o => o.id === id ? { ...o, objective: v } : o) });
  const editKrText = (id, i, v) => setOkrCfg({ ...okrCfg, [member.department]: deptOkrs.map(o => o.id === id ? { ...o, keyResults: o.keyResults.map((k, j) => j === i ? v : k) } : o) });
  const addCfgKr = (id) => setOkrCfg({ ...okrCfg, [member.department]: deptOkrs.map(o => o.id === id ? { ...o, keyResults: [...o.keyResults, ""] } : o) });
  const delCfgKr = (id, i) => setOkrCfg({ ...okrCfg, [member.department]: deptOkrs.map(o => o.id === id ? { ...o, keyResults: o.keyResults.filter((_, j) => j !== i) } : o) });
  const addCfgOkr = () => setOkrCfg({ ...okrCfg, [member.department]: [...deptOkrs, { id: uid(), objective: "", keyResults: [""] }] });
  const delCfgOkr = (id) => { setOkrCfg({ ...okrCfg, [member.department]: deptOkrs.filter(o => o.id !== id) }); setAnchors(anchors.filter(a => a !== id)); };

  const toggleAnchor = (id) => setAnchors(anchors.includes(id) ? anchors.filter(a => a !== id) : [...anchors, id]);

  const canContinue = () => {
    if (step === 0) return member.name.trim() && member.department && member.startDate;
    if (step === 1) return anchors.length > 0;
    if (step === 2) return objectives.length > 0 && objectives.every(o => o.statement.trim());
    if (step === 3) return objectives.every(o => o.keyResults.some(k => k.metric.trim()));
    return true;
  };

  const buildMarkdown = () => {
    const L = [];
    L.push(`# 100-Day Plan — ${member.name || "Unnamed"}${member.role ? ` (${member.role})` : ""}`);
    L.push(`Department: ${member.department || "—"}`);
    if (dates) {
      L.push(`Window: ${fmtY(dates.start)} → ${fmtY(dates.d100)}  (Day 1–100)`);
      L.push(`Checkpoints: D25 ${fmt(dates.d25)} · D50 ${fmt(dates.d50)} · D75 ${fmt(dates.d75)} · D100 ${fmt(dates.d100)}`);
    }
    L.push("");
    L.push("## Anchored OKRs");
    deptOkrs.filter(o => anchors.includes(o.id)).forEach(o => L.push(`- ${o.objective}`));
    objectives.forEach((o, i) => {
      L.push("");
      L.push(`## Objective ${i + 1} — ${o.statement}`);
      if (o.why) L.push(`Why: ${o.why}`);
      L.push("Key results:");
      o.keyResults.filter(k => k.metric.trim()).forEach(k =>
        L.push(`- ${k.metric}: ${k.baseline || "?"} → ${k.target || "?"} ${k.unit}`.trim() + (k.source ? `  (source: ${k.source})` : "")));
      if (o.lever) L.push(`Biggest lever: ${o.lever}`);
      const inits = o.initiatives.filter(x => x.trim());
      if (inits.length) { L.push("Gameplan:"); inits.forEach(x => L.push(`- ${x}`)); }
    });
    L.push("");
    L.push("## Checkpoints");
    L.push(`- Day 25 (${dates ? fmt(dates.d25) : "—"}): ${cps.d25 || "—"}`);
    L.push(`- Day 50 (${dates ? fmt(dates.d50) : "—"}): ${cps.d50 || "—"}`);
    L.push(`- Day 75 (${dates ? fmt(dates.d75) : "—"}): ${cps.d75 || "—"}`);
    L.push("");
    L.push("## Risks & resourcing");
    L.push(`Blocker: ${risk.blocker || "—"}`);
    L.push(`Needs: ${risk.need || "—"}`);
    L.push(`Dependencies: ${risk.deps || "—"}`);
    L.push("");
    L.push(`Confidence: ${confidence}/10`);
    return L.join("\n");
  };

  const buildJSON = () => JSON.stringify({
    member, cycle: dates ? {
      start: new Date(dates.start).toISOString().slice(0, 10),
      end: new Date(dates.d100).toISOString().slice(0, 10),
      checkpoints: { day25: new Date(dates.d25).toISOString().slice(0, 10), day50: new Date(dates.d50).toISOString().slice(0, 10), day75: new Date(dates.d75).toISOString().slice(0, 10), day100: new Date(dates.d100).toISOString().slice(0, 10) },
    } : null,
    anchoredOKRs: deptOkrs.filter(o => anchors.includes(o.id)),
    objectives: objectives.map(o => ({ statement: o.statement, why: o.why, lever: o.lever, keyResults: o.keyResults.filter(k => k.metric.trim()), gameplan: o.initiatives.filter(x => x.trim()) })),
    checkpointTargets: cps, risks: risk, confidence,
  }, null, 2);

  const copyPlan = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); }
    catch (e) {
      try { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); setCopied(true); } catch (_) {}
    }
    setTimeout(() => setCopied(false), 1800);
  };
  const downloadFile = (name, text, type = "application/json") => {
    try { const b = new Blob([text], { type }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u); } catch (e) {}
  };

  const go = (n) => setStep(Math.max(0, Math.min(STEPS.length - 1, n)));

  const Track = () => {
    const ticks = [
      { p: 0, d: "D1", date: dates && fmt(dates.start) },
      { p: 25, d: "25", date: dates && fmt(dates.d25) },
      { p: 50, d: "50", date: dates && fmt(dates.d50) },
      { p: 75, d: "75", date: dates && fmt(dates.d75) },
      { p: 100, d: "100", date: dates && fmt(dates.d100) },
    ];
    return (
      <div className="hdp-track-wrap">
        <div className="hdp-track-h">The 100-day window</div>
        {dates ? (
          <div className="hdp-track">
            <div className="hdp-rail" />
            <div className="hdp-rail-fill" style={{ width: `${todayPct ?? 0}%` }} />
            {todayPct != null && <div className="hdp-today" style={{ left: `${todayPct}%` }} />}
            {ticks.map(t => (
              <div key={t.p} className={`hdp-tick${todayPct != null && todayPct >= t.p ? " reached" : ""}`} style={{ left: `${t.p}%` }}>
                <div className="dot" />
                <div className="d">{t.d}</div>
                <div className="date">{t.date}</div>
              </div>
            ))}
          </div>
        ) : <div className="hdp-track-empty">Set a start date to lock your checkpoints.</div>}
      </div>
    );
  };

  const SaveStatus = () => {
    if (saveStatus.state === 'saving') return <span className="hdp-save-status dim"><Save size={12}/> Saving…</span>
    if (saveStatus.state === 'saved')  return <span className="hdp-save-status"><Check size={12}/> Saved</span>
    if (saveStatus.state === 'error')  return (
      <span
        className="hdp-save-status"
        style={{ color: 'var(--danger)', maxWidth: 560, whiteSpace: 'normal', textAlign: 'right', lineHeight: 1.4 }}
        title={saveStatus.message || 'Save failed'}
      >
        Save failed: {saveStatus.message || 'unknown error'}
      </span>
    )
    return null
  }

  return (
    <div className="hdp">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="hdp-shell">

        <div className="hdp-top">
          <div className="hdp-brand">
            <h1>100-Day Plan</h1>
            <span className="os">Operator OS</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <SaveStatus />
            {member.department && <div className="hdp-pill">{member.department}</div>}
          </div>
        </div>

        <div className="hdp-grid">
          <aside className="hdp-aside">
            <div className="hdp-steps">
              {STEPS.map((s, i) => {
                const state = i === step ? "active" : i < step ? "done" : "";
                return (
                  <button key={i} className={`hdp-step ${state}`} onClick={() => i <= step && go(i)}>
                    <span className="n">{i < step ? <Check size={13} /> : i + 1}</span>
                    <span className="lbl">{s.label}</span>
                  </button>
                );
              })}
            </div>
            <Track />
          </aside>

          <main className="hdp-main">
            <div className="hdp-mobile-prog"><Track /></div>
            <div className="hdp-fade" key={step}>

              {/* STEP 0 — SETUP */}
              {step === 0 && (<>
                <div className="hdp-eyebrow">Step 01 — Setup<span className="bar" /></div>
                <h2 className="hdp-h2">Who's planning, and when does the clock start?</h2>
                <p className="hdp-sub">Your start date sets the whole cycle. We'll lock Day 25, 50, 75 and 100 to real calendar dates so checkpoints aren't vague.</p>
                <div className="hdp-row two">
                  <div className="hdp-field">
                    <label>Your name</label>
                    <input className="hdp-input" value={member.name} placeholder="e.g. Alex Rivera" onChange={e => setMember({ ...member, name: e.target.value })} />
                  </div>
                  <div className="hdp-field">
                    <label>Role</label>
                    <input className="hdp-input" value={member.role} placeholder="e.g. Senior Media Buyer" onChange={e => setMember({ ...member, role: e.target.value })} />
                  </div>
                </div>
                <div className="hdp-row two">
                  <div className="hdp-field">
                    <label>Department</label>
                    <select className="hdp-select" value={member.department} onChange={e => { setMember({ ...member, department: e.target.value }); setAnchors([]); }}>
                      <option value="">Select your department…</option>
                      {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="hdp-field">
                    <label>Cycle start date</label>
                    <input type="date" className="hdp-input num" value={member.startDate} onChange={e => setMember({ ...member, startDate: e.target.value })} />
                  </div>
                </div>
                {dates && <div className="hdp-nudge"><Route size={14} /> Day 100 lands on {fmtY(dates.d100)}.</div>}
              </>)}

              {/* STEP 1 — ANCHOR OKRs */}
              {step === 1 && (<>
                <div className="hdp-eyebrow">Step 02 — Anchor OKRs<span className="bar" /></div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                  <div>
                    <h2 className="hdp-h2">Which department OKR does this serve?</h2>
                    <p className="hdp-sub">Pulled live from your dashboard's OKR system for {currentQuarter()}. If it doesn't ladder up to a {member.department || "department"} OKR, it doesn't belong in this cycle.</p>
                  </div>
                  <button className="hdp-add" onClick={() => setEditOkr(!editOkr)} style={{ flex: "none" }}>
                    <Pencil size={14} />{editOkr ? "Done" : "Edit OKRs"}
                  </button>
                </div>
                {deptOkrs.length === 0 && <div className="hdp-empty">No active OKRs found for {member.department || 'your department'} in {currentQuarter()}. Open the OKRs page to add them, or use "Edit OKRs" to draft locally.</div>}
                {deptOkrs.map(o => editOkr ? (
                  <div key={o.id} className="hdp-card">
                    <button className="hdp-remove" onClick={() => delCfgOkr(o.id)}><X size={15} /></button>
                    <div className="hdp-card-tag"><Lock size={12} /> Objective</div>
                    <input className="hdp-input" value={o.objective} placeholder="Objective…" onChange={e => editObjText(o.id, e.target.value)} style={{ marginBottom: 12 }} />
                    {o.keyResults.map((k, i) => (
                      <div className="hdp-initrow" key={i}>
                        <span className="idx">KR{i + 1}</span>
                        <input className="hdp-input num" value={k} placeholder="Key result…" onChange={e => editKrText(o.id, i, e.target.value)} />
                        <button className="hdp-kr-x" onClick={() => delCfgKr(o.id, i)}><X size={14} /></button>
                      </div>
                    ))}
                    <button className="hdp-add" onClick={() => addCfgKr(o.id)} style={{ marginTop: 6 }}><Plus size={14} /> Add key result</button>
                  </div>
                ) : (
                  <div key={o.id} className={`hdp-okr${anchors.includes(o.id) ? " sel" : ""}`} onClick={() => toggleAnchor(o.id)}>
                    <div className="hdp-okr-h">
                      <span className="hdp-check">{anchors.includes(o.id) && <Check size={13} />}</span>
                      <span className="hdp-okr-obj">{o.objective}</span>
                    </div>
                    <ul className="hdp-okr-krs">{o.keyResults.filter(Boolean).map((k, i) => <li key={i}>{k}</li>)}</ul>
                  </div>
                ))}
                {editOkr && <button className="hdp-add block" onClick={addCfgOkr}><Plus size={14} /> Add another OKR</button>}
                {!editOkr && anchors.length === 0 && <div className="hdp-nudge"><Lock size={14} /> Select at least one OKR to continue.</div>}
              </>)}

              {/* STEP 2 — OBJECTIVES */}
              {step === 2 && (<>
                <div className="hdp-eyebrow">Step 03 — Objectives<span className="bar" /></div>
                <h2 className="hdp-h2">Name the 1–3 outcomes that define your 100 days.</h2>
                <p className="hdp-sub">Outcomes, not activities. "Make the creative engine produce winners predictably," not "make more ads." Three is the ceiling — pick what actually moves the OKR.</p>
                {objectives.length === 0 && <div className="hdp-empty">No objectives yet. Add the outcomes you'll be measured on at Day 100.</div>}
                {objectives.map((o, i) => (
                  <div key={o.id} className="hdp-card">
                    <button className="hdp-remove" onClick={() => delObj(o.id)}><X size={15} /></button>
                    <div className="hdp-card-tag"><Flag size={12} /> Objective {i + 1}</div>
                    <div className="hdp-field" style={{ marginBottom: 14 }}>
                      <label>The outcome</label>
                      <input className="hdp-input" value={o.statement} placeholder="What will be true by Day 100?" onChange={e => setObj(o.id, { statement: e.target.value })} />
                    </div>
                    <div className="hdp-field">
                      <label>Why it matters</label>
                      <span className="hint">Connect it to the OKR you anchored. One sentence.</span>
                      <textarea className="hdp-area" value={o.why} placeholder="This moves [OKR] because…" onChange={e => setObj(o.id, { why: e.target.value })} />
                    </div>
                  </div>
                ))}
                <button className="hdp-add block" onClick={addObjective} disabled={objectives.length >= 3}>
                  <Plus size={14} /> {objectives.length >= 3 ? "Maximum 3 objectives" : "Add objective"}
                </button>
              </>)}

              {/* STEP 3 — RESULTS & GAMEPLAN */}
              {step === 3 && (<>
                <div className="hdp-eyebrow">Step 04 — Results & gameplan<span className="bar" /></div>
                <h2 className="hdp-h2">Make each objective measurable — then say how.</h2>
                <p className="hdp-sub">Key results are numbers with a baseline and a target. The gameplan is the strategy attached to the goal: the concrete bets you'll make to hit it.</p>
                {objectives.length === 0 && <div className="hdp-empty">Add objectives in the previous step first.</div>}
                {objectives.map((o, i) => (
                  <div key={o.id} className="hdp-card">
                    <div className="hdp-card-tag"><ListChecks size={12} /> Objective {i + 1} — {o.statement || "untitled"}</div>

                    {o.keyResults.map((k) => (
                      <div className="hdp-kr" key={k.id}>
                        <div className="full"><span className="micro">Metric</span><input className="hdp-input" value={k.metric} placeholder="e.g. Blended MER" onChange={e => setKR(o.id, k.id, { metric: e.target.value })} /></div>
                        <div><span className="micro">Baseline</span><input className="hdp-input num" value={k.baseline} placeholder="2.0" onChange={e => setKR(o.id, k.id, { baseline: e.target.value })} /></div>
                        <div className="hdp-arrow">→</div>
                        <div><span className="micro">Target</span><input className="hdp-input num" value={k.target} placeholder="2.4" onChange={e => setKR(o.id, k.id, { target: e.target.value })} /></div>
                        <div><span className="micro">Source</span><input className="hdp-input" value={k.source} placeholder="Triple Whale" onChange={e => setKR(o.id, k.id, { source: e.target.value })} /></div>
                        <button className="hdp-kr-x" onClick={() => delKR(o.id, k.id)} title="Remove"><X size={14} /></button>
                      </div>
                    ))}
                    <button className="hdp-add" onClick={() => addKR(o.id)} disabled={o.keyResults.length >= 4} style={{ marginTop: 4, marginBottom: 18 }}>
                      <Plus size={13} /> {o.keyResults.length >= 4 ? "Max 4 key results" : "Add key result"}
                    </button>

                    <div className="hdp-field" style={{ marginBottom: 16 }}>
                      <label>Biggest lever</label>
                      <span className="hint">If you could only do one thing to hit this, what is it?</span>
                      <input className="hdp-input" value={o.lever} placeholder="The single highest-leverage move…" onChange={e => setObj(o.id, { lever: e.target.value })} />
                    </div>

                    <div className="hdp-field">
                      <label>Gameplan</label>
                      <span className="hint">The initiatives that get you there.</span>
                    </div>
                    {o.initiatives.map((it, ii) => (
                      <div className="hdp-initrow" key={ii}>
                        <span className="idx">{ii + 1}</span>
                        <input className="hdp-input" value={it} placeholder="Concrete initiative or bet…" onChange={e => setInit(o.id, ii, e.target.value)} />
                        {o.initiatives.length > 1 && <button className="hdp-kr-x" onClick={() => delInit(o.id, ii)}><X size={14} /></button>}
                      </div>
                    ))}
                    <button className="hdp-add" onClick={() => addInit(o.id)} disabled={o.initiatives.length >= 5} style={{ marginTop: 4 }}>
                      <Plus size={13} /> Add initiative
                    </button>
                  </div>
                ))}
                {!canContinue() && objectives.length > 0 && <div className="hdp-nudge"><ListChecks size={14} /> Give each objective at least one named metric.</div>}
              </>)}

              {/* STEP 4 — CHECKPOINTS */}
              {step === 4 && (<>
                <div className="hdp-eyebrow">Step 05 — Checkpoints<span className="bar" /></div>
                <h2 className="hdp-h2">What's true at each checkpoint?</h2>
                <p className="hdp-sub">A plan with no mid-points drifts. Write the one thing that must be true by each date. These become your weekly review anchors.</p>
                {[["d25", "Day 25", dates && dates.d25], ["d50", "Day 50", dates && dates.d50], ["d75", "Day 75", dates && dates.d75]].map(([key, label, date]) => (
                  <div className="hdp-cp" key={key}>
                    <div className="hdp-cp-h">
                      <span className="hdp-cp-day">{label}</span>
                      <span className="hdp-cp-date">{date ? fmtY(date) : "set a start date"}</span>
                    </div>
                    <textarea className="hdp-area" value={cps[key]} placeholder={key === "d50" ? "Mid-cycle: on track to hit targets, or course-correcting because…" : "By this date, the following will be true…"} onChange={e => setCps({ ...cps, [key]: e.target.value })} />
                  </div>
                ))}
              </>)}

              {/* STEP 5 — RISKS & RESOURCING */}
              {step === 5 && (<>
                <div className="hdp-eyebrow">Step 06 — Risks & resourcing<span className="bar" /></div>
                <h2 className="hdp-h2">What could stop this — and what do you need?</h2>
                <p className="hdp-sub">Before asking for headcount, ask if a system or a tool solves it. Name the real blocker and the real need so leadership can act on it at Day 50, not Day 99.</p>
                <div className="hdp-field" style={{ marginBottom: 18 }}>
                  <label>The most likely blocker</label>
                  <textarea className="hdp-area" value={risk.blocker} placeholder="What's most likely to get in the way?" onChange={e => setRisk({ ...risk, blocker: e.target.value })} />
                </div>
                <div className="hdp-field" style={{ marginBottom: 22 }}>
                  <label>What do you need to clear it?</label>
                  <div className="hdp-chips">
                    {[["A system or process fix", Route], ["A tool", Gauge], ["A hire", Plus], ["A leadership decision", Flag]].map(([t, Ic]) => (
                      <button key={t} className={`hdp-chip${risk.need === t ? " on" : ""}`} onClick={() => setRisk({ ...risk, need: risk.need === t ? "" : t })}>
                        <Ic size={14} className="ic" />{t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="hdp-field" style={{ marginBottom: 26 }}>
                  <label>Dependencies on other people or teams</label>
                  <input className="hdp-input" value={risk.deps} placeholder="e.g. Creative needs research briefs by week 2" onChange={e => setRisk({ ...risk, deps: e.target.value })} />
                </div>
                <div className="hdp-field">
                  <label>Confidence you'll hit this plan</label>
                  <span className="hint">Be honest. A 4 is a conversation, not a failure.</span>
                  <div className="hdp-conf">
                    <input type="range" min="1" max="10" value={confidence} className="hdp-slider" onChange={e => setConfidence(+e.target.value)} />
                    <div className="hdp-conf-val">{confidence}<span>/10</span></div>
                  </div>
                </div>
              </>)}

              {/* STEP 6 — REVIEW */}
              {step === 6 && (<>
                <div className="hdp-eyebrow">Step 07 — Review & export<span className="bar" /></div>
                <h2 className="hdp-h2">Here's your 100-day plan.</h2>
                <p className="hdp-sub">Read it like your team lead will. Save it as committed, then download the JSON or copy the summary.</p>

                <div className="hdp-rev-head">
                  <div className="hdp-rev-name">{member.name || "Unnamed"}{member.role ? ` · ${member.role}` : ""}</div>
                  <div className="hdp-rev-meta">
                    <b>{member.department || "—"}</b><br />
                    {dates && <>Window <b>{fmtY(dates.start)} → {fmtY(dates.d100)}</b><br />
                      D25 {fmt(dates.d25)} · D50 {fmt(dates.d50)} · D75 {fmt(dates.d75)} · D100 {fmt(dates.d100)}<br /></>}
                    Confidence <b>{confidence}/10</b>
                  </div>
                </div>

                <div className="hdp-rev-sec">
                  <h3>Anchored OKRs<span className="bar" /></h3>
                  <ul className="hdp-rev-list">
                    {deptOkrs.filter(o => anchors.includes(o.id)).map(o => <li key={o.id}>{o.objective}</li>)}
                  </ul>
                </div>

                <div className="hdp-rev-sec">
                  <h3>Objectives<span className="bar" /></h3>
                  {objectives.map((o, i) => (
                    <div className="hdp-rev-obj" key={o.id}>
                      <div className="t">{i + 1}. {o.statement || "—"}</div>
                      {o.why && <div className="why">{o.why}</div>}
                      <ul>{o.keyResults.filter(k => k.metric.trim()).map(k => (
                        <li key={k.id}>{k.metric}: {k.baseline || "?"} → {k.target || "?"} {k.unit}{k.source ? `  ·  ${k.source}` : ""}</li>
                      ))}</ul>
                      {o.lever && <div className="hdp-rev-lever"><b>Biggest lever:</b> {o.lever}</div>}
                      {o.initiatives.filter(x => x.trim()).length > 0 && (
                        <ul>{o.initiatives.filter(x => x.trim()).map((x, j) => <li key={j}>{x}</li>)}</ul>
                      )}
                    </div>
                  ))}
                </div>

                <div className="hdp-rev-sec">
                  <h3>Checkpoints<span className="bar" /></h3>
                  <ul className="hdp-rev-list">
                    <li>Day 25 ({dates ? fmt(dates.d25) : "—"}): {cps.d25 || "—"}</li>
                    <li>Day 50 ({dates ? fmt(dates.d50) : "—"}): {cps.d50 || "—"}</li>
                    <li>Day 75 ({dates ? fmt(dates.d75) : "—"}): {cps.d75 || "—"}</li>
                  </ul>
                </div>

                <div className="hdp-rev-sec">
                  <h3>Risks & resourcing<span className="bar" /></h3>
                  <ul className="hdp-rev-list">
                    <li>Blocker: {risk.blocker || "—"}</li>
                    <li>Needs: {risk.need || "—"}</li>
                    <li>Dependencies: {risk.deps || "—"}</li>
                  </ul>
                </div>

                <div className="hdp-rev-sec">
                  <h3>Dashboard payload (JSON)<span className="bar" /></h3>
                  <div className="hdp-export-box">{buildJSON()}</div>
                </div>

                <div style={{ display: "flex", gap: 11, flexWrap: "wrap" }}>
                  <button className="hdp-btn primary" onClick={() => savePlan('committed')}>
                    <Lock size={16} /> Commit plan
                  </button>
                  <button className="hdp-btn teal" onClick={() => downloadFile(`100-day-plan-${(member.name || "plan").toLowerCase().replace(/\s+/g, "-")}.json`, buildJSON())}>
                    <Download size={16} /> Download JSON
                  </button>
                  <button className="hdp-btn ghost" onClick={() => copyPlan(buildMarkdown())}>
                    {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy summary"}
                  </button>
                </div>
              </>)}

            </div>

            <div className="hdp-foot">
              <span className="hdp-prog">Step <b>{step + 1}</b> / {STEPS.length}{loadingPlan ? ' · loading…' : ''}</span>
              <div className="hdp-nav">
                {step > 0 && <button className="hdp-btn ghost" onClick={() => go(step - 1)}><ChevronLeft size={16} /> Back</button>}
                {step < STEPS.length - 1 && (
                  <button className="hdp-btn primary" disabled={!canContinue()} onClick={() => go(step + 1)}>
                    Continue <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </div>

          </main>
        </div>
      </div>
    </div>
  );
}
