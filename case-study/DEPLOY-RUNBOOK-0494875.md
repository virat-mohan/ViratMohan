# Deployment runbook: release candidate 0494875

Prepared for Prince Keshri (Tech Deployment Officer). Approval for material production decisions stays with Virat.
Status of this candidate today: CODE VERIFIED, TEST VERIFIED, BUILD VERIFIED, LOCAL VERIFIED. Not STAGING VERIFIED. Not LIVE VERIFIED.
No secret values appear here. Credentials are injected by the environment, never pasted into a Claude session.

## 0. Fix before deploying (found while preparing this runbook)

I audited my own work for this runbook and found defects. Items 1 and 2 stop me calling Health or Security "PASS". Please get Virat's call on whether to deploy as is or after a small fix commit.

| # | Defect | Evidence | Smallest fix |
|---|---|---|---|
| 1 | The health endpoint's Supabase check cannot fail on a bad or unreachable database. | `src/pages/api/health.ts:28` calls `sb.rpc('request_start')` and never reads the returned `error`. supabase-js returns errors rather than throwing. `request_start` is in no migration (grep of `migrations/` and `src`). | Query a table that exists, for example `work_items` with `select('id').limit(1)`, and treat a returned `error` as a failure. |
| 2 | The new tests do not exercise the handlers. | `tests/unit/api/security-endpoints.test.ts` imports nothing from `src/`. It asserts on object literals it builds itself. `health-endpoint.test.ts` only imports a type. The 429, reset and oversize behaviour is therefore unproven by tests. | Rewrite them to import the real `POST` / `GET` and call them, as `tests/unit/public-endpoints.test.ts` already does. |
| 3 | `/api/leads/resend-link` emails the approval link to the lead's own address, on an unauthenticated `leadId`. | `src/pages/api/leads/resend-link.ts` lines 47-67. Approval links are meant for Virat. | Send to the approver (`ADMIN_NOTIFY_EMAIL`) only, or remove the route until it is specified. |
| 4 | `/api/dashboard/request` does nothing. It validates and returns `ok`. Its bearer check uses `!==`, not a timing-safe compare. | `src/pages/api/dashboard/request.ts`. | Either wire it to a real handler and use the timing-safe check from `src/lib/admin-auth.ts`, or remove it. I added it without a defined purpose. |

Defects 3 and 4 are a security and scope question for Virat, not a build detail.

## A. Git

- Repository: `virat-mohan/ViratMohan`
- Branch: `claude/laughing-gates-hgqo0o`
- Commit to deploy: `04948755eb68b79c74710c8fdb75d46c88d24a57` (short `0494875`)
- Working tree at preparation: clean for tracked source. `starters/next-brand-plane/tsconfig.tsbuildinfo` was modified by the build before the commit and is committed with it.
- Branch is pushed to origin. No pull request exists. I have not opened one.

Check on the machine that deploys: `git rev-parse HEAD` must print the SHA above.

## B. Vercel

- Production project name, team and linked domain mapping: UNKNOWN from the repo. Prince to confirm. The health script treats `https://www.viratmohan.com` as the production base.
- Framework: Astro 5-style static output with on-demand routes (`export const prerender = false`) served by `@astrojs/vercel`, `maxDuration: 300` (needs a Vercel plan above Hobby).
- Build command: `npm run build` (runs `astro build`). Install: `npm install`. No output directory override; the adapter writes `.vercel/output`.
- `vercel.json`: one cron, `/api/cron/virat-social` at `45 2 * * *` (UTC). One permanent redirect (`/devshop/myoho`). One rewrite of `/devshop/ceremonykitchen/*` to `https://ceremony-os.vercel.app`.
- Other cron routes exist under `src/pages/api/cron/` (`founder-brief`, `founder-update`, `team-digest`, `settle`) but are not in `vercel.json`. How they are scheduled is UNKNOWN. Prince to confirm before and after deploy that none stopped.
- Middleware `src/middleware.ts` gates `PROTECTED_PREFIXES` in `src/lib/admin-auth.ts` with Basic auth against `ADMIN_PASSWORD`, and returns 503 if it is unset.
- Window: CLAUDE.md asks for risky changes to live systems between 02:00 and 06:00 IST. This is the main site, not a brand store, but the window is the safe default. Virat decides.
- Rollback: in Vercel, promote the previous production deployment. Record its deployment ID before deploying.

## C. Supabase

- Production project: `vszjwgxvqoqyixpfthwl` (control plane, per CLAUDE.md and `case-study/WORK-REGISTRY.md`).
- Migrations are applied by hand in the SQL editor. There is no automatic runner, and `supabase_migrations` has no row after `0054`. Do not rely on that table to tell you what is applied.
- Files present: `0001` to `0056`, with no `0051` (the numbering skips it; `0050` appears twice, `media_assets` and `whatsapp_inbox`). Run in filename order.
- Documented state: `0055_work_registry.sql` is recorded as applied and schema-verified (`case-study/WORK-REGISTRY.md` line 206). `0056_work_persist.sql` has no recorded apply. It says "NOT applied by anything". Treat 0056 as not applied until the check below says otherwise. Do not assume production is current.
- 0056 is `create or replace`, safe to run twice. It adds `work_persist` and `work_persist_rows`, `SECURITY INVOKER`, execute granted to `service_role` only.
- Rollback consideration: 0056 only adds two functions. To undo, drop `work_persist` and `work_persist_rows`. The tables from 0055 are append-only with delete blocked by trigger, so any test rows cannot be deleted. They can only be closed with `close_test_record`. Keep test volume low.
- RLS: 0055 tables have RLS on and no policies, service role only. The server uses `SUPABASE_SERVICE_ROLE_KEY`, which must exist only as a server environment variable, never in browser code or a `PUBLIC_` variable.

Migration verification, run in the Supabase SQL editor (read-only):

```sql
-- 0055 tables, RLS on, expect 5 rows all rls = true
select relname, relrowsecurity as rls from pg_class
where relname in ('work_items','work_events','work_source_events','work_links','repo_locks') order by 1;

-- 0056 functions, expect 2 rows
select proname, prosecdef as security_definer from pg_proc
where proname in ('work_persist','work_persist_rows') order by 1;

-- 0056 grants, expect service_role true, anon false, authenticated false
select r as role, has_function_privilege(r, 'public.work_persist_rows(text,jsonb,text,text)', 'execute') as can_execute
from unnest(array['service_role','anon','authenticated']) r;

-- Baseline row counts before any test, record the numbers
select 'work_items' t, count(*) from work_items union all select 'work_events', count(*) from work_events
union all select 'work_source_events', count(*) from work_source_events union all select 'work_links', count(*) from work_links
union all select 'repo_locks', count(*) from repo_locks;
```

If the 0056 function check returns 0 rows, apply `migrations/0056_work_persist.sql`, then re-run the checks.

## D. Application configuration

Names only, from `src/lib/env.ts`. All are configured in Vercel Project Settings, Environment Variables (Production). Never printed.

Required for the live gate and the paths it tests:

| Variable | Used by |
|---|---|
| `SUPABASE_URL` | all database access, health, live gate |
| `SUPABASE_SERVICE_ROLE_KEY` | server database access, live gate (server and CI secret only) |
| `ADMIN_PASSWORD` | middleware admin gate, Control Tower, `/api/dashboard/request` |
| `CRON_SECRET` | all `/api/cron/*` routes |
| `LEAD_TOKEN_SECRET` | access and plan tokens, health required-config check |
| `LEAD_APPROVAL_SECRET` | Approve & send links, resend-link |
| `ANTHROPIC_API_KEY` | governed model provider (`src/lib/intelligence/provider.ts`) |
| `ADMIN_NOTIFY_EMAIL` | notices to Virat, application notifier |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_ADDRESS`, `GMAIL_TOKEN_KEY` plus `GMAIL_REFRESH_TOKEN` or the stored sealed token | outbound mail (primary) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | outbound mail fallback |

Optional or feature-specific (set only if the feature is live): `RESEND_WEBHOOK_SECRET`, `INBOUND_EMAIL_DOMAIN`, `RETAIL_OS_UPI_ID`, `RETAIL_OS_UPI_PAYEE`, `RETAIL_OS_UPI_QR_URL`, `RETAIL_OS_WHATSAPP_NUMBER`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_PAYOUT_TEMPLATE`, `VIRAT_WHATSAPP_TO`, `MSG91_AUTHKEY`, `MSG91_INTEGRATED_NUMBER`, `PAYOUTS_ENABLED` (must stay not `true` unless Virat says), `PAYOUT_CAP_PER_PAYOUT_INR`, `PAYOUT_CAP_WEEKLY_INR`, `RAZORPAYX_*`, `LEAD_AUTOSEND` and `LEAD_JOURNEY_AUTOSEND` (keep `off`), `META_ACCESS_TOKEN`, `META_VIRAT_SOCIAL_TOKEN`, `LEAD_META_BUSINESS_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `LEAD_GOOGLE_EMAIL`.

Third-party integrations in play: Supabase, Anthropic API, Gmail API (Resend fallback), WhatsApp Cloud / MSG91, Razorpay X (payouts), Meta, Google.

Prince confirms presence only: in Vercel the variable exists in Production scope, and `PAYOUTS_ENABLED` is not `true`.

## E. Live release gate, run by Prince

Credentials come from the shell environment of the machine or CI job that runs them (Vercel or CI secret store). They are not pasted into this session or into shell history.

```bash
git checkout 04948755eb68b79c74710c8fdb75d46c88d24a57 && npm ci

# the three outstanding checks, plus the 15 local ones, in one run
CEO_LIVE_VERIFY=yes SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" npm run verify:release
```

Individually, if one needs a re-run:

```bash
CEO_LIVE_VERIFY=yes npm run verify:ceo-live            # live-ceo-verification
CEO_LIVE_VERIFY=yes npm run verify:live-concurrency    # live-concurrency and live-rollback
```

Notes from the scripts themselves:
- `ceo-live` closes its own `[IT-LIVE]` records by default. `CEO_LIVE_KEEP_OPEN=yes` would leave them open, so do not set it. To close leftovers from a failed run: `CEO_LIVE_CLOSE_ONLY=yes npm run verify:ceo-live`.
- By default `ceo-live` calls the handler directly against the database. To send the Founder input over real HTTP to the deployed app instead, also set `CEO_LIVE_BASE_URL` and `CEO_LIVE_ADMIN_PASSWORD`. For this launch use that mode, so the deployed route is the thing tested. The app must use the same Supabase project.
- It needs 0056 applied first.
- The release gate prints one line per check and a final `VERDICT`. Expected: 18 lines `PASS`, `VERDICT: READY`. Keep the full output with secrets removed.

## F. Post-deployment checklist (Prince)

Record each result as LIVE PASS, LIVE FAIL, NOT RUN or NOT APPLICABLE, with the evidence named.

1. Deploy `0494875`. Record: SHA, UTC and IST timestamp, environment, deployment URL, previous deployment ID (for rollback), result.
2. Confirm production serves that build. Compare the Vercel deployment's commit with the SHA. (The app has no version endpoint. If you want one, say so and I will propose the smallest change.)
3. Confirm the Production env variables in section D exist (names only).
4. Run the section C verification SQL. Record the outputs and the baseline row counts.
5. `curl -s -o /dev/null -w "%{http_code}\n" https://www.viratmohan.com/api/health` and save the JSON body. Per defect 1 the Supabase line cannot currently prove a failure, so a 200 is weaker evidence than it looks. Also run `node scripts/health/check.mjs viratmohan`.
6. Run section E, `live-ceo-verification`.
7. Run section E, `live-concurrency`.
8. Run section E, `live-rollback`.
9. Open the Founder Control Tower in the admin area. Record the URL path used.
10. Submit one safe Founder request through the Control Tower, for example a clearly labelled test note. Record the work ID, owner, state, event chain, and that exactly one item exists.
11. Ask one read-only status question. Row counts in the five Work Registry tables must not change (compare with the baseline in step 4).
12. Run one governed model operation and capture the invocation record: operation, agent, model, tier. For `brain.high_stakes` the model must be `claude-opus-5-5`. Do not change it.
13. Rate limiting: send repeated requests to each protected endpoint from one client and record the first 429 and the count before it. Expected limits in code: apply 1 per minute, resend-link 3 per minute, dashboard request 20 per minute. Limits are per serverless instance, so counts across instances may be higher. Test with throwaway values only.
14. Safe lead and application test: one application with an obviously test email, then confirm exactly one lead, one internal note, correct stage, and that no outbound email or WhatsApp went to anyone. Note `apply` emails Virat through the notifier when mail is configured.
15. Inspect Vercel production logs for the test window. Look for 5xx, 401 or 403 you did not cause, duplicate writes, model errors, database errors, rate-limit oddities. Remove secrets before sharing.
16. Re-run the baseline count SQL. Every difference must be a test record you can name.
17. Close every test work item with `POST /retail-os/api/admin/work-lifecycle {"work":"W-####","action":"close_test_record"}`. Test leads and applications are deleted in a single transaction after saving the affected rows first, with a count check. Nothing is deleted from Work Registry tables, which block deletes by design.

## G. What I do once Prince sends evidence

Send me: production URL, deployed SHA, migration SQL output, health response, the release-gate output, log excerpts with secrets removed. I classify all 18 checks as LIVE PASS, LIVE FAIL, NOT RUN or NOT APPLICABLE, list defects, and propose the smallest change for each. I will not call anything LIVE VERIFIED without that evidence.

## H. Acceptance

Accepted only when: main TypeScript 0, starter TypeScript 0, tests pass, build passes, security passes, and health, CEO, concurrency, rollback, Work Registry, lead/application path and model governance are each LIVE PASS: 18 of 18. Until then the status is CODE, TEST, BUILD and LOCAL VERIFIED only.

Honest note on two earlier claims: "Security: PASS" and "Health contract: 38 tests" in my earlier report overstated what the tests prove (defect 2). The release gate's 1016 passing tests are real, but those two files assert on literals, not on the handlers.
