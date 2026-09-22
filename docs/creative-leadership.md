# Creative Leadership — first release

Private workspace at `/creative-leadership`, linked from Tracking and the dashboard.

## Scope and permissions

- Explicitly active Head of Creative Strategy: starts their own weekly review, saves drafts, and submits it.
- Explicitly active CEO and Operations Manager: inspect reviews, request changes with feedback, and finalize submitted reviews.
- Those three roles can maintain actions and private coaching notes. This does not grant the Head CS broader management access.
- Operations assistants and other existing Accountability users can read only the minimal review-completion signal, not the private review or coaching records.
- An active strategist can see only feedback deliberately published to them, on their dashboard. Private coaching text is never copied automatically.
- New private-table access additionally requires a server-managed capability grant, seeded for the existing active Head CS, Operations Manager, and CEO. Ordinary application users cannot add or alter these grants. Future leadership changes must be provisioned through a trusted database migration/admin operation as well as updating the profile role.
- This separate grant protects the new workspace from forged profile-role labels. It does not repair the pre-existing `profiles` RLS configuration; broader profile security remains a separate hardening task.

## Weekly workflow

1. On Monday in Dubai time, the Head CS dashboard prompts for the previous completed week. A persistent dashboard reminder remains until submission. Other dashboard dialogs take priority.
2. Starting a review captures the current active client roster and strategist assignments. It does not alter the roster. Historical backfills use the roster captured when that draft is created, not an inferred historical roster.
3. Review each captured client's creative status, research, brief, sign-off, learning, Growth Guide, next tests, and evidence link. Checks start blank, never automatically passed.
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
- Formal performance scoring, winner/super-winner calculations, Growth Tracker/ClickUp integrations, and creative-related churn scoring are **not enabled** in this first release. Definitions, eligible tests, attribution, targets, and effective dates must be agreed first.
- Planned concepts are capacity allocations, not evidence of completed creative output. Editing revisions are not performance-testing iterations.

## Data protection and verification

The migration only adds Creative Leadership tables, policies, indexes, and functions. It does not update existing client, profile, spend, allocation, health, survey, or accountability records. New tables use RLS and invoker triggers; immutable identity, audit timestamps, snapshots, and workflow transitions are enforced in the database. Updates use optimistic version checks.

Automated JavaScript tests cover role restrictions, Dubai week boundaries, launch cutoffs, review validation, evidence URLs, business-day deadlines, payload preservation, and accountability completion. The companion SQL verification runs in a rolled-back transaction to check the complete review workflow and permission boundaries without leaving test records behind.

Release verification (September 22, 2026): 152 JavaScript tests and 83 live-database rollback checks passed. Production build passed. Browser checks used the actual page with isolated synthetic data for draft saving, refresh-failure recovery, submission, Operations finalization, explicit feedback publication, and ordinary-strategist denial. Pre/post checksums matched for the existing profiles, clients, spend entries, and allocations. The security advisor reported no new findings; existing unrelated findings remain. No synthetic records were retained.
