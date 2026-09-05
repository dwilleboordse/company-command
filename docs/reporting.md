# Reporting periods and churn timing

These live views use `clients`, `client_churn_profiles`, and `spend_entries` in the existing Supabase project. There is no historical-data migration in this release.

## Date and measurement rules

- Calendar years include January 1 through December 31; the current year ends today. Previous year means the last complete calendar year. Month lookbacks include the current partial calendar month. Week lookbacks include the current partial Monday-based week. Visible date bounds are authoritative.
- Spend is recorded weekly. Monthly and annual totals assign each entire entry to its `week_start` date; there is no estimated daily allocation across month boundaries. Gaps without entries are missing data, not recorded zero spend. Aggregation preserves selected-period totals across all granularities.
- Onboardings use `engagement_start` for current, paused, and past clients. Exits use `engagement_end` for past clients only. Future-dated exits are excluded until that date. Missing lifecycle dates are disclosed and never inferred from database creation timestamps.
- Opening client churn divides exits from the opening client cohort by the number in that cohort. New clients that also leave during the period still appear in both movement bars, but do not enter the opening-cohort rate. Retainers are the current recorded values, not a historical revenue ledger.
- Partnership month 1 runs from engagement start until the first calendar-month anniversary; each anniversary starts the next month. Month-end anniversaries clamp to that month's last day. The distribution filters by exit date and reports counts/share of dated exits, not a survival probability or exposure-adjusted hazard rate.
- Current client/roster/OKR/onboarding sections remain current snapshots and are labeled separately from selected-period reporting. Existing single-engagement records cannot reconstruct multiple pauses or reactivations.

## Chart contract

| View | Question | Native chart and encoding | Detail / empty state |
| --- | --- | --- | --- |
| Churn movement | How many clients started and exited in each month? | Recharts grouped count bars, labeled onboarded/exits; separate percentage axis for opening-cohort churn. Existing green/red lifecycle semantics, blue rate line. | Period totals, exact-date tooltips, missing-date coverage. |
| Spend trend | How does recorded spend change over time? | Recharts total/DDU series with week/month/year controls, gaps for unrecorded buckets, money units and dated labels. | Recorded coverage and empty-period message; period total cards reconcile. |
| When clients churn | Which partnership months contain the most exits? | Recharts zero-based count bars in chronological partnership-month order; blue baseline, amber peak months, peak months also named in text. | Counts/share, tied peaks, client-level drill-down, missing/future-date coverage. |

Verification covers date boundaries, calendar anniversaries, aggregation reconciliation, pagination failures, production source totals, and browser filter/drill-down behavior. Synthetic unit fixtures exercise edge cases only and are never used as dashboard fallback data.
