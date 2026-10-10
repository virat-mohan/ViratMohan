// Opt-in live check of Founder -> CEO runtime -> real control-plane Work Registry.
// Run:  CEO_LIVE_VERIFY=yes SUPABASE_URL=https://vszjwgxvqoqyixpfthwl.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npm run verify:ceo-live
// Exit codes: 0 verified, 1 ran and failed, 2 not run (it never reports success without having written and read back).
// It writes three records titled "[IT-LIVE] ..." (no brand), exercises the CEO runtime, reads them back, then closes
// them through the lifecycle (resolve, verify, close). The schema forbids deleting Work, so the records stay, closed,
// with their full history. CEO_LIVE_KEEP_OPEN=yes leaves them open instead. Needs migration 0056 applied first.
// No brand database is touched. The checks themselves are in ceo-live-run.ts.
import { createClient } from '@supabase/supabase-js';
import { createSupabaseWorkStore } from '../../src/lib/work/db-store';
import { handleFounderInput } from '../../src/lib/ceo/founder-service';
import { runLiveVerification, closeLeftoverTestRecords, asFounderResult, type Ask } from './ceo-live-run';

const { CEO_LIVE_VERIFY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
// The control plane project (CLAUDE.md, Team section). Anything else, such as a brand database, is refused.
const CONTROL_PLANE_REF = 'vszjwgxvqoqyixpfthwl';
const refuse = (why: string): never => { console.error(`NOT RUN: ${why} Nothing was written.`); process.exit(2); };
if (CEO_LIVE_VERIFY !== 'yes') refuse('set CEO_LIVE_VERIFY=yes to run this deliberately.');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) refuse('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
if (!SUPABASE_URL!.includes(CONTROL_PLANE_REF)) refuse(`SUPABASE_URL is not the control-plane project (${CONTROL_PLANE_REF}); brand databases are never touched.`);

const store = createSupabaseWorkStore(createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }));
const pw = 'live-verify-local-only';
const goodAuth = 'Basic ' + Buffer.from(`admin:${pw}`).toString('base64');
const badAuth = 'Basic ' + Buffer.from('admin:wrong').toString('base64');

// By default the CEO input goes through the same handler the route calls. Set CEO_LIVE_BASE_URL and
// CEO_LIVE_ADMIN_PASSWORD to send it over real HTTP to a deployed app instead (the app must use the same project).
const baseUrl = process.env.CEO_LIVE_BASE_URL;
const httpPw = process.env.CEO_LIVE_ADMIN_PASSWORD;
if (baseUrl && !httpPw) refuse('CEO_LIVE_BASE_URL needs CEO_LIVE_ADMIN_PASSWORD.');
const ask: Ask = async (text, o = {}) => {
  if (baseUrl) {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/retail-os/api/admin/ceo-input`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: o.authorised === false ? 'Basic ' + Buffer.from('admin:wrong').toString('base64') : 'Basic ' + Buffer.from(`admin:${httpPw}`).toString('base64') },
      body: JSON.stringify({ text, work_id: o.work_id }),
    });
    const raw = await res.text();
    try { return { status: res.status, body: JSON.parse(raw) }; } catch { return { status: res.status, body: raw }; }
  }
  return asFounderResult(await handleFounderInput(o.authorised === false ? badAuth : goodAuth, { text, work_id: o.work_id }, { store, adminPassword: pw }));
};

// CEO_LIVE_CLOSE_LEFTOVERS=yes closes any open [IT-LIVE] records from an earlier run first (lifecycle only, marker only).
// CEO_LIVE_CLOSE_ONLY=yes does just that and exits without creating anything.
if (process.env.CEO_LIVE_CLOSE_LEFTOVERS === 'yes' || process.env.CEO_LIVE_CLOSE_ONLY === 'yes') {
  const c = await closeLeftoverTestRecords(store);
  console.log(JSON.stringify({ closedLeftovers: c.closed, failed: c.failed }));
  if (c.failed.length) process.exit(1);
  if (process.env.CEO_LIVE_CLOSE_ONLY === 'yes') process.exit(0);
}

let report;
try { report = await runLiveVerification(store, ask, { keepOpen: process.env.CEO_LIVE_KEEP_OPEN === 'yes' }); }
catch (e) { console.error('FAILED:', e instanceof Error ? e.message : String(e)); process.exit(1); }
for (const c of report.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail && !c.ok ? `  [${c.detail}]` : ''}`);
console.log(JSON.stringify({ via: baseUrl ? 'http' : 'handler', created: report.created.length, closed: report.closed, ok: report.ok }));
if (process.env.CEO_LIVE_KEEP_OPEN === 'yes') console.log('Left open on request. Close each with: POST /retail-os/api/admin/work-lifecycle {"work":"W-####","action":"close_test_record"}');
process.exit(report.ok ? 0 : 1);
