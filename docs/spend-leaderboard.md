# Creative strategist spend leaderboard

## Scope and access

The authenticated Spend Tracker includes a read-only CS leaderboard for the team.
The home dashboard also displays a compact summary for CEO/management, Operations,
and creative strategists. It does not add anonymous access or change RLS policies.
The regular logging view retains its existing own-client scope for strategists.

## Sources and grain

`fetchSpendLeaderboardData` reads paginated, deterministically ordered subsets of
`public.clients`, active creative-strategist `public.profiles`, and
`public.spend_entries` using the existing authenticated Supabase client. It does
not load email addresses, notes, platform breakdowns or private model fields.
The source grain is one client/week-start record; duplicate records, if present,
resolve deterministically by latest update, creation time, then record ID.

Attribution uses current `clients.cs_ids` with `assigned_cs_id` as legacy fallback.
Each client's DDU and total spend are divided equally across distinct assigned
strategists. Unknown, inactive and non-CS assignees retain their share in the
denominator; it is reported as unattributed rather than given to someone else.
`entered_by` is never interpreted as the strategist responsible for the client.
The source does not preserve historical weekly ownership; the UI discloses that
past spend is attributed using today's roster, not ownership at the time.

## Metrics and periods

- Default ranking: allocated DDU spend, USD as recorded in the tracker.
- Alternative ranking: sum allocated DDU / sum allocated total spend, not the
  average of client percentages. This measures adoption, not revenue or ROAS.
- Only complete finite non-negative pairs with DDU <= total are counted.
- Missing or incomplete logs are excluded, never imputed as zero. Explicit zero
  remains zero; a strategist with zero total spend or no complete logs is unranked.
- Ties use competition ranks, at cents for dollars and 0.1 percentage point for
  share, followed by deterministic name ordering. Money tooltips expose cents.
- Reporting counts show actual complete client-week records and distinct clients,
  not a claim that every expected report has been filed. Shared row log counts
  are non-additive; the headline log count deduplicates client-weeks.
- Current and past clients' saved logs are included. Active CS are ranked.
- Default period: four completed Monday–Sunday weeks in Dubai. Current incomplete
  week is excluded. Calendar filters group by the saved week-start date; legacy
  Sunday dates remain unchanged. Each selected period stops at completed Sunday.
- Name search filters visible rows, not team totals or global ranks.

## Verification

`npm test` covers metric arithmetic, shared attribution, missing and zero data,
duplicates, ties, historical records and Dubai/calendar boundary conditions.
The implementation is read-only and does not modify spend logs or client records.
