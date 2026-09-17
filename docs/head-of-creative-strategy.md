# Head of Creative Strategy

`profiles.position = head_of_creative_strategy` is a job title within the
creative-strategy discipline, not a new global access role. It is available in
the Admin position selector. Promoting an existing strategist changes only the
position; keep their profile ID, global role, department and assignments intact.

- Spend Tracker: all active, unassigned and paused/past clients, saved history,
  weekly/monthly views, analytics and strategist filters.
- Dashboard: company-wide spend overview and CS leaderboard.
- Logging UI: assigned clients remain editable; peer-client visibility does not
  add editing or pause/unpause controls. Database policies are unchanged.
- Allocation, workload and hiring calculations: maps to the existing
  `creative_strategist` discipline, preserving source keys, capacity and history.
- Accountability, badges, leaderboard attribution and role-based OKRs/KPIs/
  milestones retain creative-strategist behavior. Company-wide spend visibility
  does not give credit for other strategists' clients.
- No additional management, Operations, survey-review, hiring-roadmap or CEO
  access is granted by the title.

After changing an account's position, refresh the app to reload its profile.
If an old session persists, sign out and back in.

Verification: `npm test`, `npm run build`, and authenticated database read checks.
No schema migration or changes to client/spend records are required.
