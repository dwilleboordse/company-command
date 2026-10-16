# Q4 Media Buying: client-level measurements

Under OKRs → Departments → Media Buying, the spend-growth KR has a client-level measurement panel. The shared KR remains unchanged; a single manual agency value is no longer the input on this card. Client observations do not create new OKRs or overwrite the original aggregate/current_value, individual contributions or weekly snapshots.

Ahmad and administrators can enter/edit a separate client/month observation. Media Buying members and Operations coordinators can read the client-level evidence. Other departments cannot access this table. Existing access to shared company/department targets is unchanged.

For each client, confirm scope, record the previous/current comparable spend, currency, channel scope, client KPI targets and actuals, and evidence. The database calculates percentage growth. Every client KPI condition must be met as well as the shared growth minimum. An ongoing month's matched-date comparison is provisional; it cannot count as completed-month success. Missing data, zero prior spend, excluded clients and unconfirmed scope are distinct statuses. All client names in the current Media Buying roster are suggestions only; Ahmad confirms historical scope and adds missing/former clients as appropriate.

The panel shows clients meeting both conditions, misses, provisional results and coverage gaps separately. It does not replace per-client performance with a pooled spend average, change the shared target, declare overall KR completion, or calculate bonuses. Each observation records the configured target at save time. Previous saved revisions are retained on update, including previous targets and exclusions. Concurrent edits use optimistic revision checks. Deletes are not exposed.

At implementation the approved shared target is 15% minimum / 20% stretch. The supplied Slack screenshot mentions 10%; no target change is inferred from that screenshot. Dennis must resolve this separately.

Personal-plan and lead-review labels say “Department KR supported (shared)”. The plan remains a contributor's own commitment, completion criteria and milestones. Two contributions may link to the same department KR. Gino's contributions, approval status and deadlines have not been edited.

Verification: `node --test src/lib/clientObservations.test.js`. SQL transaction tests cover Ahmad writes, media-team read-only access, unrelated-team denial, server-calculated growth, missing evidence/KPIs, invalid months, zero baselines, identity immutability and saved revision history. All test rows are rolled back. Historical client observations start empty; no fabricated measurements are imported.
