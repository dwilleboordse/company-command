# Weekly reflection per contribution

## Member workflow
Open 100-Day Plan → Weekly check-in. Each saved contribution has its own reflection, current result/evidence (or Not measured), status, optional blocker, and next commitment. One saved contribution shows one section; two show two sections. Complete the sections and submit once. No extra personal OKR or duplicate weekly report is created. Unsaved changes prompt before switching weeks or workspace tabs. No progress is a valid update when explained; it must not be represented as fabricated progress.

## Lead workflow
Lead review → Open → the selected week's snapshot shows both contribution reflections separately. Existing review feedback remains at weekly-snapshot level. Reflections also remain separate in the member's history.

## Data and compatibility
The additive hosted migration q4_weekly_contribution_reflections adds contribution_updates and reflection_plan_revision. Stable contribution IDs identify each entry. The database checks complete, unique IDs and plan revision, then captures authoritative contribution titles and KR links. A plan changed during editing is rejected rather than linking the response to the wrong contribution. The existing snapshot locking, ownership, reviewer and one-row-per-plan/week rules continue to apply. Old overall reflections remain unchanged and are labelled as older overall check-ins, never copied to both contributions. Old browser versions can still submit the previous format during rollout.

The legacy summary fields are derived from the entries for existing reports. Their overall risk is the worst reported contribution status, not an average or a performance score. Individual updates do not change department KR actuals, targets, approvals or bonus calculations.

## Verification and rollout
Run node --test src/lib/contributionReflections.test.js and npm run build. Deploy the additive database migration before the interface. Hosted rollback-only checks verify both reflections, IDs/order, blank/duplicate/foreign IDs, stale revision, lock protection and lead feedback. Existing snapshots must retain their previous content. No production sample reflections should remain after tests.
