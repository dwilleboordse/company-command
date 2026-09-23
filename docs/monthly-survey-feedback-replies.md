# Replies to finalized monthly survey feedback

## Workflow

Management drafts and finalizes feedback exactly as before. Finalization still
locks both the management feedback and the original survey answers. Team members
can then send separate replies beneath each published per-answer feedback item,
praise, or growth note in **Monthly Survey → My survey**. Earlier finalized
months are supported through the feedback month selector.

Replies are immediately available to the existing authorized survey reviewers
under **Team overview → select the member and month**. Only the survey owner
can write replies; reviewers read them without replying on someone else's
behalf. There is no new notification service or automatic email/Slack message.

Each sent reply records its author name and server timestamp. Sent replies are
append-only: corrections or additional detail are sent as follow-up replies.
Unsent text is not a submitted response and is not visible to management.

## Data and access contract

- `monthly_survey_feedback_replies` is an additive table. No existing survey,
  feedback, profile, client, spend, or allocation record is rewritten.
- `submission_id` references the existing feedback review. `section_key` is
  `question:<question_key>`, `praises`, or `growth_notes`.
- The parent must be finalized, the survey submitted, and the referenced
  feedback section nonempty. Question keys must belong to that survey's version.
- An explicitly active authenticated survey owner can insert replies only on
  their own review. The database stamps the author ID, display-name snapshot and
  timestamp; client-supplied attribution is not trusted.
- The owner and existing active survey reviewers (CEO, Management, Operations
  Manager/Assistant, and separately provisioned AI Engineer) can read replies.
  This mirrors the survey's existing reviewer boundary; it does not broaden
  management access or expose draft feedback to the team.
- Authenticated clients have SELECT/INSERT only. No UPDATE, DELETE or TRUNCATE is
  granted. An invoker trigger also rejects updates/deletes. Replies cannot be
  reassigned to another person, survey, or section after sending.
- Reply bodies are trimmed, nonempty text of at most 5,000 characters. They are
  rendered as text, not interpreted HTML.
- Each send retains its UUID across retries. A duplicate request cannot overwrite
  the original; an exact read-back resolves an uncertain response.
- Reads are scoped to the displayed review and deterministically ordered by
  `created_at,id`, with pagination rather than silently truncating long histories.

Existing profile-RLS and administrative-user-creation hardening gaps are separate
from this change. This feature does not claim to repair those legacy boundaries.

## Verification and release

`supabase/tests/monthly_survey_feedback_replies_verification.sql` uses synthetic
users and reviews inside a rolled-back transaction, without disabling triggers.
It covers the publication gate, section and text validation, owner/reviewer
boundaries, spoofing, retry uniqueness, inactive and anonymous denial, immutable
history, and preservation of the original survey/feedback locks.

Deploy the additive migration before the application update. An application
rollback can retain the new table and any real replies; do not drop the table or
delete messages to roll back the UI.

### Release checks — 23 September 2026

- 192 JavaScript tests, scoped ESLint, and the production build passed. The build
  retains the existing large-bundle warning.
- 103 reply database checks passed locally and against production inside a
  rolled-back transaction. The existing 173 AI-access checks also passed locally.
- Checksums confirmed that all 24 existing survey submissions and 16 feedback
  records were unchanged. Supabase security-advisor findings were unchanged.
- An isolated browser harness using the actual survey page and synthetic data
  verified sending, historical-month replies, drafts across month switches,
  reviewer read-only access, unrelated-member isolation, failed-send retries,
  recovery after a saved reply loses its response, read-error recovery, and
  paginated history without duplicates. No real replies were created for QA.
