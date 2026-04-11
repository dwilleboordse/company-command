import { supabase } from './supabase'
import { getMondayStr } from './dates'

// ── BADGE AWARD ENGINE ────────────────────────────────────────
// Called on page load for the current user. Checks all conditions
// and awards any badges not yet earned. Idempotent.

export async function computeAndAwardBadges(userId, position) {
  // Load what they've already earned
  const { data: earned } = await supabase.from('user_badges').select('badge_id').eq('user_id', userId)
  const earnedSet = new Set(earned?.map(b => b.badge_id) || [])

  const toAward = [] // badge_ids to award
  const toAddPoints = [] // { points, reason, week_start }

  const weekStart = getMondayStr()

  // ── Load all needed data ──────────────────────────────────
  const [
    { data: kpiValues },
    { data: kpis },
    { data: milestones },
    { data: dayEntries },
    { data: meetingPreps },
    { data: spendEntries },
    { data: changeLogs },
    { data: clients },
  ] = await Promise.all([
    supabase.from('user_kpi_values').select('*').eq('user_id', userId).order('week_start', { ascending: false }),
    supabase.from('kpis').select('*').eq('is_active', true),
    supabase.from('milestones').select('*').eq('is_active', true),
    supabase.from('day_entries').select('*').eq('user_id', userId),
    supabase.from('meeting_preps').select('*').eq('user_id', userId).eq('is_completed', true),
    supabase.from('spend_entries').select('*').order('week_start', { ascending: false }),
    supabase.from('change_log').select('*').eq('entered_by', userId),
    supabase.from('clients').select('id').eq('is_active', true),
  ])

  // Helper: check if user hits goal for a kpi value
  function hitsGoal(value, kpi) {
    if (!kpi || value == null) return false
    return kpi.goal_direction === 'min' ? value <= kpi.goal_value : value >= kpi.goal_value
  }

  // Get KPI map
  const kpiMap = Object.fromEntries((kpis || []).map(k => [k.id, k]))

  // Get all weeks where user has ANY kpi value, sorted desc
  const allWeeks = [...new Set((kpiValues || []).map(v => v.week_start))].sort((a, b) => b.localeCompare(a))

  // Per-week: did they hit all their KPIs?
  function weekStatus(week) {
    const vals = (kpiValues || []).filter(v => v.week_start === week)
    if (!vals.length) return null
    const onTarget = vals.filter(v => hitsGoal(v.value, kpiMap[v.kpi_id]))
    return { total: vals.length, onTarget: onTarget.length, allOnTarget: onTarget.length === vals.length }
  }

  // ── CONSISTENCY BADGES ────────────────────────────────────

  // week_one: first KPI log
  if (kpiValues?.length > 0 && !earnedSet.has('week_one')) {
    toAward.push('week_one')
    toAddPoints.push({ points: 20, reason: 'Logged KPIs for the first time', week_start: weekStart })
  }

  // clockwork: 4 consecutive weeks with logs
  if (!earnedSet.has('clockwork') && allWeeks.length >= 4) {
    let streak = 0
    for (let i = 0; i < allWeeks.length - 1; i++) {
      const curr = new Date(allWeeks[i] + 'T00:00:00')
      const next = new Date(allWeeks[i + 1] + 'T00:00:00')
      const diff = (curr - next) / (7 * 24 * 60 * 60 * 1000)
      if (Math.abs(diff - 1) < 0.1) streak++
      else break
    }
    if (streak >= 3) { // 4 consecutive = 3 consecutive gaps
      toAward.push('clockwork')
      toAddPoints.push({ points: 100, reason: 'Logged KPIs 4 weeks in a row', week_start: weekStart })
    }
  }

  // iron_will: 12 consecutive weeks
  if (!earnedSet.has('iron_will') && allWeeks.length >= 12) {
    let streak = 0
    for (let i = 0; i < allWeeks.length - 1; i++) {
      const curr = new Date(allWeeks[i] + 'T00:00:00')
      const next = new Date(allWeeks[i + 1] + 'T00:00:00')
      const diff = (curr - next) / (7 * 24 * 60 * 60 * 1000)
      if (Math.abs(diff - 1) < 0.1) streak++
      else break
    }
    if (streak >= 11) {
      toAward.push('iron_will')
      toAddPoints.push({ points: 400, reason: 'Logged KPIs every week for 12 weeks', week_start: weekStart })
    }
  }

  // day_maker: 20 completed day outcomes
  const completedDays = (dayEntries || []).filter(d => d.day_outcome_done).length
  if (!earnedSet.has('day_maker') && completedDays >= 20) {
    toAward.push('day_maker')
    toAddPoints.push({ points: 100, reason: 'Completed 20 day outcomes', week_start: weekStart })
  }

  // prep_master: 8 completed meeting preps
  if (!earnedSet.has('prep_master') && (meetingPreps?.length || 0) >= 8) {
    toAward.push('prep_master')
    toAddPoints.push({ points: 150, reason: 'Completed meeting prep 8 times', week_start: weekStart })
  }

  // ── PERFORMANCE BADGES ────────────────────────────────────

  // on_point: first time hitting any KPI goal
  const everOnTarget = (kpiValues || []).some(v => hitsGoal(v.value, kpiMap[v.kpi_id]))
  if (!earnedSet.has('on_point') && everOnTarget) {
    toAward.push('on_point')
    toAddPoints.push({ points: 50, reason: 'Hit a KPI goal for the first time', week_start: weekStart })
  }

  // perfect_week: all KPIs on target same week
  const hasPerfectWeek = allWeeks.some(w => {
    const s = weekStatus(w)
    return s && s.allOnTarget && s.total > 0
  })
  if (!earnedSet.has('perfect_week') && hasPerfectWeek) {
    toAward.push('perfect_week')
    toAddPoints.push({ points: 150, reason: 'All KPIs on target in one week', week_start: weekStart })
  }

  // hot_streak: 4 consecutive on-target weeks
  if (!earnedSet.has('hot_streak') && allWeeks.length >= 4) {
    let streak = 0
    for (const w of allWeeks) {
      const s = weekStatus(w)
      if (s && s.allOnTarget) streak++
      else break
    }
    if (streak >= 4) {
      toAward.push('hot_streak')
      toAddPoints.push({ points: 100, reason: 'On target 4 weeks in a row', week_start: weekStart })
    }
  }

  // unstoppable: 8 consecutive on-target weeks
  if (!earnedSet.has('unstoppable') && allWeeks.length >= 8) {
    let streak = 0
    for (const w of allWeeks) {
      const s = weekStatus(w)
      if (s && s.allOnTarget) streak++
      else break
    }
    if (streak >= 8) {
      toAward.push('unstoppable')
      toAddPoints.push({ points: 250, reason: 'On target 8 weeks in a row', week_start: weekStart })
    }
  }

  // comeback: off target last week, on target this week
  if (!earnedSet.has('comeback') && allWeeks.length >= 2) {
    const thisW = weekStatus(allWeeks[0])
    const lastW = weekStatus(allWeeks[1])
    if (thisW?.allOnTarget && lastW && !lastW.allOnTarget) {
      toAward.push('comeback')
      toAddPoints.push({ points: 75, reason: 'Back on target after a tough week', week_start: weekStart })
    }
  }

  // Weekly points for on-target performance
  const thisWeekStatus = weekStatus(weekStart)
  if (thisWeekStatus) {
    // Check if we already gave points this week
    const { data: existingPoints } = await supabase.from('user_points')
      .select('id').eq('user_id', userId).eq('week_start', weekStart).eq('reason', 'Weekly KPIs on target')
    if (!existingPoints?.length && thisWeekStatus.allOnTarget) {
      toAddPoints.push({ points: 10, reason: 'Weekly KPIs on target', week_start: weekStart })
    }
    if (!existingPoints?.length && thisWeekStatus.allOnTarget) {
      // bonus for perfect
    }
  }

  // ── MILESTONE BADGES ──────────────────────────────────────
  const myMilestones = (milestones || []).filter(m => m.owner_id === userId || !m.owner_id) // approximate
  const completedMilestones = (milestones || []).filter(m => m.status === 'completed')
  // Use user-specific data: milestones don't have a direct user link, so we use role
  const roleMilestones = (milestones || []).filter(m => m.role_type === position)
  const completedRole = roleMilestones.filter(m => m.status === 'completed')

  if (!earnedSet.has('first_step') && completedRole.length >= 1) {
    toAward.push('first_step')
    toAddPoints.push({ points: 30, reason: 'Completed first milestone', week_start: weekStart })
  }
  if (!earnedSet.has('builder') && completedRole.length >= 10) {
    toAward.push('builder')
    toAddPoints.push({ points: 100, reason: 'Completed 10 milestones', week_start: weekStart })
  }
  if (!earnedSet.has('machine') && completedRole.length >= 25) {
    toAward.push('machine')
    toAddPoints.push({ points: 300, reason: 'Completed 25 milestones', week_start: weekStart })
  }

  // system_crusher: entire system completed
  const bySystem = roleMilestones.reduce((acc, m) => {
    if (!acc[m.system_name]) acc[m.system_name] = { total: 0, done: 0 }
    acc[m.system_name].total++
    if (m.status === 'completed') acc[m.system_name].done++
    return acc
  }, {})
  const crushedSystem = Object.values(bySystem).some(s => s.total > 0 && s.done === s.total)
  if (!earnedSet.has('system_crusher') && crushedSystem) {
    toAward.push('system_crusher')
    toAddPoints.push({ points: 200, reason: 'Completed an entire milestone system', week_start: weekStart })
  }

  // ── SPEND BADGES (CS only) ────────────────────────────────
  if (position === 'creative_strategist' && clients?.length) {
    // Get spend entries for clients assigned to this CS
    const { data: csClients } = await supabase.from('clients').select('id').eq('assigned_cs_id', userId)
    const csClientIds = csClients?.map(c => c.id) || []

    if (csClientIds.length > 0) {
      const { data: csSpend } = await supabase.from('spend_entries')
        .select('*').in('client_id', csClientIds).order('week_start', { ascending: false })

      // Group by week, get avg DDU% for this CS's clients
      const weeklyPct = {}
      csSpend?.forEach(e => {
        if (!weeklyPct[e.week_start]) weeklyPct[e.week_start] = []
        if (e.total_spend > 0) weeklyPct[e.week_start].push((e.ddu_spend / e.total_spend) * 100)
      })
      const weeklyAvg = Object.entries(weeklyPct)
        .map(([week, pcts]) => ({ week, avg: pcts.reduce((s, p) => s + p, 0) / pcts.length }))
        .sort((a, b) => b.week.localeCompare(a.week))

      // green_zone: first excellent week (≥50%)
      const hasExcellent = weeklyAvg.some(w => w.avg >= 50)
      if (!earnedSet.has('green_zone') && hasExcellent) {
        toAward.push('green_zone')
        toAddPoints.push({ points: 50, reason: 'First Excellent DDU% week', week_start: weekStart })
      }

      // spend_guardian: 4 consecutive excellent weeks
      if (!earnedSet.has('spend_guardian') && weeklyAvg.length >= 4) {
        let streak = 0
        for (const w of weeklyAvg) {
          if (w.avg >= 50) streak++
          else break
        }
        if (streak >= 4) {
          toAward.push('spend_guardian')
          toAddPoints.push({ points: 200, reason: 'Maintained Excellent DDU% for 4 weeks', week_start: weekStart })
        }
      }

      // trend_setter: DDU% improved 3 weeks in a row
      if (!earnedSet.has('trend_setter') && weeklyAvg.length >= 3) {
        const [w1, w2, w3] = weeklyAvg
        if (w1.avg > w2.avg && w2.avg > w3.avg) {
          toAward.push('trend_setter')
          toAddPoints.push({ points: 150, reason: 'DDU% improved 3 weeks in a row', week_start: weekStart })
        }
      }

      // climber: at risk → healthy in one week
      if (!earnedSet.has('climber') && weeklyAvg.length >= 2) {
        const [curr, prev] = weeklyAvg
        if (prev.avg < 20 && curr.avg >= 20) {
          toAward.push('climber')
          toAddPoints.push({ points: 75, reason: 'Went from At Risk to Healthy DDU%', week_start: weekStart })
        }
      }
    }
  }

  // ── ROLE-SPECIFIC BADGES ──────────────────────────────────

  // change_agent: media buyer logged 20 changes
  if (position === 'media_buyer' && !earnedSet.has('change_agent') && (changeLogs?.length || 0) >= 20) {
    toAward.push('change_agent')
    toAddPoints.push({ points: 100, reason: 'Logged 20 account changes', week_start: weekStart })
  }

  // brief_machine: CS hits briefs kpi 4 weeks in a row
  if (position === 'creative_strategist' && !earnedSet.has('brief_machine')) {
    const briefsKPI = (kpis || []).find(k => k.role_type === 'creative_strategist' && k.metric_name.toLowerCase().includes('briefs'))
    if (briefsKPI) {
      const briefVals = (kpiValues || []).filter(v => v.kpi_id === briefsKPI.id).sort((a, b) => b.week_start.localeCompare(a.week_start))
      let streak = 0
      for (const v of briefVals) {
        if (hitsGoal(v.value, briefsKPI)) streak++
        else break
      }
      if (streak >= 4) {
        toAward.push('brief_machine')
        toAddPoints.push({ points: 150, reason: 'Hit briefs goal 4 weeks in a row', week_start: weekStart })
      }
    }
  }

  // first_take: editor/designer hits approval rate
  if (['editor', 'designer'].includes(position)) {
    const badgeId = position === 'editor' ? 'first_take' : 'first_take_d'
    if (!earnedSet.has(badgeId)) {
      const approvalKPI = (kpis || []).find(k => k.role_type === position && k.metric_name.toLowerCase().includes('approval'))
      if (approvalKPI) {
        const approvalVals = (kpiValues || []).filter(v => v.kpi_id === approvalKPI.id)
        if (approvalVals.some(v => v.value >= 90)) {
          toAward.push(badgeId)
          toAddPoints.push({ points: 100, reason: 'Achieved 90%+ first pass approval rate', week_start: weekStart })
        }
      }
    }
  }

  // scale_master: media buyer hits scalable winners 4 weeks
  if (position === 'media_buyer' && !earnedSet.has('scale_master')) {
    const scaleKPI = (kpis || []).find(k => k.role_type === 'media_buyer' && k.metric_name.toLowerCase().includes('winner'))
    if (scaleKPI) {
      const scaleVals = (kpiValues || []).filter(v => v.kpi_id === scaleKPI.id).sort((a, b) => b.week_start.localeCompare(a.week_start))
      let streak = 0
      for (const v of scaleVals) {
        if (hitsGoal(v.value, scaleKPI)) streak++
        else break
      }
      if (streak >= 4) {
        toAward.push('scale_master')
        toAddPoints.push({ points: 150, reason: 'Hit scalable winners goal 4 weeks in a row', week_start: weekStart })
      }
    }
  }

  // ── AWARD ─────────────────────────────────────────────────
  const newBadges = toAward.filter(b => !earnedSet.has(b))

  if (newBadges.length > 0) {
    await supabase.from('user_badges').insert(
      newBadges.map(badge_id => ({ user_id: userId, badge_id }))
    )
    // Add badge points
    const { data: badgeDefs } = await supabase.from('badge_definitions').select('id,points,name').in('id', newBadges)
    for (const b of (badgeDefs || [])) {
      toAddPoints.push({ points: b.points, reason: `Badge earned: ${b.name}`, week_start: weekStart })
    }
  }

  if (toAddPoints.length > 0) {
    await supabase.from('user_points').insert(
      toAddPoints.map(p => ({ user_id: userId, ...p }))
    )
  }

  return newBadges
}

// ── LEADERBOARD COMPUTATION ───────────────────────────────────
export async function getLeaderboard() {
  const [{ data: profiles }, { data: badges }, { data: points }] = await Promise.all([
    supabase.from('profiles').select('id,full_name,position,avatar_url').neq('role', 'ceo'),
    supabase.from('user_badges').select('user_id, badge_id'),
    supabase.from('user_points').select('user_id, points'),
  ])

  return (profiles || []).map(p => {
    const userBadges = (badges || []).filter(b => b.user_id === p.id)
    const totalPoints = (points || []).filter(pt => pt.user_id === p.id).reduce((s, pt) => s + pt.points, 0)
    return {
      ...p,
      badgeCount: userBadges.length,
      totalPoints,
      badges: userBadges.map(b => b.badge_id),
    }
  }).sort((a, b) => b.totalPoints - a.totalPoints)
}
