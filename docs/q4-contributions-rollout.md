# Q4 2026: company outcomes and individual contributions

## Entry points

- `/okrs`: company priorities, department worksheets, definitions and measured values.
- `/100-day-plan`: individual contributions, weekly updates, and lead review.
- Earlier tools remain at `/okrs/history` and `/100-day-plan/history`. Legacy rows are not reset or deleted.

## Source fidelity

The three October 3 worksheet uploads are stored as immutable JSON source snapshots. Creative Strategy contains two rate targets with unverified baselines. Media Buying contains one session-based result; the second KR is absent and the 9–12 range is not silently converted to an exact numerical goal. Operations uses conflicting retention/churn and first-delivery target definitions; numerical goals and directions remain null pending clarification. UGC has a department placeholder, but no invented results. Earlier Trishe proposals are not treated as the latest submission.

Company numerical targets retain their proposal status. The system has six company results and five submitted department results, with three missing department results remaining visibly absent. Finalisation does not occur merely on import. A technical duplicate produced during import was archived; only one active Q4 record per department is allowed.

## Workflow

One objective and two KRs per department. One or two contributions per individual, linked to a department KR, with a definition of done, dated milestones and support needs. Drafting can begin before department approval. Individual submission requires complete links and milestones; lead approval requires approved department commitments. Leads' own contribution plans route to Dennis. Changing an approved contribution returns it to draft.

38 active profiles were provisioned with empty Q4 plans. Planning department suggestions follow existing role disciplines. Designers/editors have a suggested Creative Strategy contribution home; this is explicitly not an HR reporting-line change. Unassigned roles can choose a contribution department with their lead. No contributions are written or submitted on another person's behalf.

## Weekly cadence

Q4 runs October 1 through December 31, not a rolling 100 days. Weekly periods begin Monday in Asia/Dubai. October 1–4 is an optional setup week; the first regular review is October 5. One submitted weekly snapshot records evidence/current result or Not measured, execution status, progress, blocker and the next dated commitment. The weekly form is saved only when submitted; no draft rows falsely count as completed in the existing Accountability page. That page already reads cycle pulses. Reminders are in-app and non-blocking; this release does not send Slack/email messages.

Each snapshot captures the plan revision and is immutable to the contributor after submission. Assigned leads can append review feedback but cannot rewrite the submitted evidence. No future weekly periods can be submitted. Historical reporting and legacy pulses are preserved.

## Measurement and compensation

Current values are manual evidence-backed entries with an observation period. Unknown values are null, never defaulted into measured zero. No aggregate achievement percentage is manufactured from incomplete definitions. Completing an initiative or weekly update does not achieve a KR. The proposed bonus programme is not activated.

## Database and security

Supabase project: zxhzrzcrajrzrymipjmm. Additive hosted migrations extend `objectives` and `key_results` with `planning_context`, add `okr_cycle_members` and `okr_change_history`, and extend existing normalized plan cycles and pulses. Applied migration history remains in Supabase. Trigger checks enforce one/two contributions, valid Q4 links/dates, source immutability, review permissions, explicit measured-value evidence and snapshot integrity. Original RLS policies remain; Q4 restrictions prevent leads editing unrelated departments. Existing Operations read access is retained for Accountability, while plan modifications remain owner/assigned-lead/admin controlled.

Do not backfill missing worksheet values with estimated achievements. Do not infer target agreement from the upload. Set baseline periods or validation owner/date, define calculations and single accountable owners, then mark two results ready and sign off at objective level. Supplied source snapshots remain read-only even when working definitions change.

## Verification

Run `node --test src/lib/q4Cycle.test.js` and `npm run build`. Date and validation tests cover Dubai rollover, setup weeks, quarter end, unknown versus zero, UGC draft links and milestone bounds. Transactional database tests exercise owner submission, snapshot creation and blocked edits, rolling all test data back.
