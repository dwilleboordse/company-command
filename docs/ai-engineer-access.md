# AI Engineer access

The distinct `ai_engineer` system role and position provide explicitly provisioned, CEO-equivalent **Command Center application access**. The person remains labelled AI Engineer and is not counted or impersonated as CEO.

## Provisioning and authorization

- John Carlo (`john.carlo@d-doubleumedia.com`) is linked to his existing Supabase Auth account. The migration resolves that exact email, creates his missing profile, and preserves other profiles.
- Full access requires an active profile with `role='ai_engineer'` **and** an administrator-provisioned `private.application_access` row with `capability='ai_engineer_full_access'`.
- The capability table uses RLS, exposes only the caller's own row to authenticated SQL, and permits no client inserts, updates, or deletes. It is outside the public API schema.
- The public `has_ai_engineer_access()` RPC is an authenticated, stable, security-invoker boolean lookup with a fixed search path. The frontend fetches it and fails closed on missing/failed/false responses. Profile labels or position changes alone do not grant this capability.
- Creative Leadership also requires a separate `creative_lead_access` reviewer grant, provisioned for John.
- Future AI engineers require the same explicit trusted database provisioning; selecting the label in Admin is not sufficient. Removing the private capability immediately removes database privileges; deactivate the profile to remove application sign-in access as well.

## Included scope

The business dashboard, all clients and spend, allocation and workload tools, all department/financial OKRs, analytics and churn, team/client health, survey response review and feedback finalization, private Creative Leadership/coaching, executive models, hiring roadmap, and Admin are included.

Existing workflow boundaries still apply: personal plan/survey answers remain owner-written; only the Head of Creative Strategy starts their review; reviewers may finalize or request changes; finalized feedback/reviews remain locked; retained records do not gain delete privileges. These are the same restrictions applied to the CEO, not missing AI Engineer access.

This does **not** grant Supabase organization/project administration, Vercel administration, database credentials, or access to unrelated `performance_*` / `orbit_*` applications sharing the database.

## Verification — September 23, 2026

- 176 JavaScript tests and production build passed; scoped permission/routing lint passed.
- Browser checks used the actual App, AuthContext and protected pages with isolated synthetic data: server-confirmed AI access displayed the executive menu and opened models, Admin, hiring, Design/CS, private Creative Leadership and team survey review. An unprovisioned AI profile with a forged client flag was rejected and direct privileged links redirected to the personal dashboard. Existing CEO access remained available. No browser errors or test writes occurred.
- 173 AI-access checks passed in an isolated schema and in a live rolled-back transaction, including CEO read parity over 44 application tables, authorized writes, private feedback/review workflows, immediate revocation, inactive/unprovisioned/forged-role denial, and no client capability provisioning.
- Existing Creative Leadership verification passed unchanged: 83 workflow checks plus 68 manual-results checks, all rolled back (324 live database checks total).
- Checksums for all 47 existing profiles, clients, and spend entries matched before/after provisioning. No synthetic records were retained.
- The security advisor reported no additional findings. Existing unrelated findings remain, including disabled `profiles` RLS and old definer/search-path warnings.

## Existing hardening gaps (not changed by this release)

`profiles` has pre-existing disabled RLS, and `api/create-user.js` has no caller-authorization check while using a server-side service key. The new AI privilege is not provisioned from that endpoint or any profile trigger. Broader profile/administrative API hardening should be handled as a separate compatibility-tested change; this release does not claim those legacy boundaries are secure.
