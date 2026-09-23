# Creative Leadership

Private workspace at `/creative-leadership`, linked from Tracking and the dashboard.

## Scope and permissions

- Explicitly active Head of Creative Strategy: starts their own weekly review, saves drafts, and submits it.
- Explicitly active CEO and Operations Manager, plus a separately provisioned AI Engineer reviewer: inspect reviews, request changes with feedback, and finalize submitted reviews.
- These authorized leadership users can maintain actions and private coaching notes. This does not grant the Head CS broader management access.
- Operations assistants and other existing Accountability users can read only the minimal review-completion signal, not the private review or coaching records.
- An active strategist can see only feedback deliberately published to them, on their dashboard. Private coaching text is never copied automatically.
- New private-table access additionally requires a server-managed capability grant, seeded for the existing active Head CS, Operations Manager, and CEO. Ordinary application users cannot add or alter these grants. Future leadership changes must be provisioned through a trusted database migration/admin operation as well as updating the profile role.
- This separate grant protects the new workspace from forged profile-role labels. It does not repair the pre-existing `profiles` RLS configuration; broader profile security remains a separate hardening task.

## Weekly workflow

1. On Monday in Dubai time, the Head CS dashboard prompts for the previous completed week. A persistent dashboard reminder remains until submission. Other dashboard dialogs take priority.
2. Starting a review captures the current active client roster and strategist assignments. It does not alter the roster. Historical backfills use the roster captured when that draft is created, not an inferred historical roster.
3. Review each captured client's creative status, research, brief, sign-off, learning, Growth Guide, next tests, and evidence link. Checks start blank, never automatically passed. Enter the client's newly classified weekly ad results from its Google Sheet, including the source link, or explicitly record a no-tests week or an unavailable-results reason.
4. Flagged clients require a diagnosis and an unresolved linked action with an owner and deadline. Blocked or insufficient-evidence statuses also require an explanation.
5. Submission captures spend and action snapshots. The lead cannot edit while submitted; Operations/CEO can return it for changes or finalize it. Finalized reviews are read-only.
6. Accountability for week W checks whether the review of W−1 is submitted or finalized. Changes requested removes the check. This is a completion signal, not a performance rating.

The first reviewable week is September 14, 2026; the new accountability requirement begins September 21. Earlier weeks are not retrospectively penalized. Current incomplete and future weeks cannot be reviewed.

## Actions, risks, and coaching

Actions persist across weeks and require evidence before resolution. Retention risks have explicit escalation and recovery-plan milestones. Their suggested deadlines are one and two Monday–Friday business days after identification, using Dubai dates, without a public-holiday calendar. Milestone buttons record events; they do not send notifications.

Coaching records contain observations, expected standards, agreed actions, follow-up dates, and outcomes. Resolving coaching requires a follow-up result. Publishing is a separate deliberate step with recipient confirmation. Replacing a published message is explicitly confirmed; private notes remain private.

## Measurement boundaries

- Weekly spend reuses existing Spend Tracker entries; no duplicate entry.
- Monthly operating summaries group weeks by Monday start date and use finalized snapshots only.
- Missing/invalid spend is not a measured zero. Weighted DDU share measures adoption, not ROAS or creative quality.
- Manual winner/super-winner reporting is available; no Google Sheets, Growth Tracker or ClickUp integration is needed. Elish copies counts and records the source link. There is no automatic source import.
- Winner rate is winners divided by eligible tested ads; super-winner rate uses the same denominator. Super-winners are included within winners. Benchmarks are 5–10% and 2–4%, respectively, interpreted with account/spend context. Above-range results are not failures. Blocked and inconclusive tests are recorded separately and excluded from the denominator.
- Log only newly classified outcomes for the review week, never cumulative monthly totals or repeated ads. Shared clients count once in portfolio totals. Strategist views use captured assignments and show full shared-client results, explicitly non-additive and not individual ownership scores.
- Monthly reporting assigns whole weeks by their Monday. The rolling-90-day view includes completed weeks whose Monday falls in the 90-date inclusive window ending on the selected Dubai date. It is a weekly snapshot view, not a daily or launch-cohort report. Only finalized records enter reporting; rates are recomputed from counts, not averaged across clients.
- Spend health reuses the existing shared thresholds: Low share below 20%; Healthy from 20% to below 50%; Excellent at 50% or above. Classification uses unrounded share. Portfolio spend is weighted using valid paired amounts, and coverage stays visible.
- The expectations weights remain 40% creative performance, 20% creative-related churn, 10% overall churn, and 30% quality/operating discipline. No composite 1–5 rating or creative-churn target is invented. Those formal ratings remain unscored; their absence does not disable winner or spend-health reporting.
- Planned concepts are capacity allocations, not evidence of completed creative output. Editing revisions are not performance-testing iterations.

## Data protection and verification

The migration only adds Creative Leadership tables, policies, indexes, and functions. It does not update existing client, profile, spend, allocation, health, survey, or accountability records. New tables use RLS and invoker triggers; immutable identity, audit timestamps, snapshots, and workflow transitions are enforced in the database. Updates use optimistic version checks.

Automated JavaScript tests cover role restrictions, Dubai week boundaries, launch cutoffs, review validation, evidence URLs, business-day deadlines, payload preservation, and accountability completion. The companion SQL verification runs in a rolled-back transaction to check the complete review workflow and permission boundaries without leaving test records behind.

Release verification (September 22, 2026): 152 JavaScript tests and 83 live-database rollback checks passed. Production build passed. Browser checks used the actual page with isolated synthetic data for draft saving, refresh-failure recovery, submission, Operations finalization, explicit feedback publication, and ordinary-strategist denial. Pre/post checksums matched for the existing profiles, clients, spend entries, and allocations. The security advisor reported no new findings; existing unrelated findings remain. No synthetic records were retained.

## Manual results preservation

The additive manual-results migration assigns `results_version=0` to existing reviews without rewriting their payloads, and the server assigns version 1 to new reviews. New reviews require every captured client to choose logged, no eligible tests, or unavailable before submission. Historical reviews are not retroactively required to supply results; any voluntarily supplied results are still validated.

All counts must be whole numbers from 0 through 1,000,000. The database rejects malformed values, impossible winner subsets and unsafe source links even in drafts. Confirmed no-tests weeks have zero eligible/winner/super-winner counts but no rate. Unavailable results require a reason and null counts, never zero. Submission history captures results and the contract version; the existing finalization, access, and optimistic-concurrency protections remain in force.

Manual-results release verification (September 22, 2026): all 169 JavaScript tests, scoped ESLint, production build, and 151 live-database rollback checks passed (83 existing workflow checks plus 68 manual-results checks). Isolated browser checks covered invalid subsets, draft saving, no-tests exclusions, submission, Operations finalization, read-only records, monthly/rolling reporting, shared-client attribution, and independent date filters. The native finalization confirmation required a user click after browser automation stopped responding; the finalized state and report were then verified. Pre/post checksums matched for existing reviews, clients, and spend entries. Existing review-payload preservation and legacy submission were additionally checked against a pre-migration fixture. No synthetic production records were retained, and the security advisor reported no new findings.
