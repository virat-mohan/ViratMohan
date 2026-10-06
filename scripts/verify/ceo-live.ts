// Opt-in live check of Founder -> CEO runtime -> real control-plane Work Registry.
// Run:  CEO_LIVE_VERIFY=yes SUPABASE_URL=https://vszjwgxvqoqyixpfthwl.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npm run verify:ceo-live
// Exit codes: 0 verified, 1 ran and failed, 2 not run (it never reports success without having written and read back).
// It writes ONE Work item marked "[IT-LIVE]". The schema forbids deleting Work (a database trigger blocks it), so this
// item cannot be removed; Virat resolves or closes it. Nothing else is written. No brand database is touched.
import { createClient } from '@supabase/supabase-js';
import { createSupabaseWorkStore } from '../../src/lib/work/db-store';
import { loadRegistry } from '../../src/lib/work/db-registry';
import { handleFounderInput } from '../../src/lib/ceo/founder-service';
import { advanceWork } from '../../src/lib/work/lifecycle-service';
import { VIRAT } from '../../src/lib/work/actors';
import { buildControlTowerView } from '../../src/lib/control-tower/view';

const { CEO_LIVE_VERIFY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
// The control plane project (CLAUDE.md, Team section). Anything else, such as a brand database, is refused.
const CONTROL_PLANE_REF = 'vszjwgxvqoqyixpfthwl';
const refuse = (why: string): never => { console.error(`NOT RUN: ${why} Nothing was written.`); process.exit(2); };
if (CEO_LIVE_VERIFY !== 'yes') refuse('set CEO_LIVE_VERIFY=yes to run this deliberately.');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) refuse('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
if (!SUPABASE_URL!.includes(CONTROL_PLANE_REF)) refuse(`SUPABASE_URL is not the control-plane project (${CONTROL_PLANE_REF}); brand databases are never touched.`);

const store = createSupabaseWorkStore(createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }));
const pw = 'live-verify-local-only';
const auth = 'Basic ' + Buffer.from(`admin:${pw}`).toString('base64');
const text = `[IT-LIVE] Verify the CEO runtime write path ${new Date().toISOString().slice(0, 10)}`;

const fail = (why: string, extra?: unknown): never => { console.error('FAILED:', why, extra ?? ''); process.exit(1); };
let r;
try { r = await handleFounderInput(auth, { text }, { store, adminPassword: pw }); }
catch (e) { fail(e instanceof Error ? e.message : String(e)); }
if (r!.status !== 200) fail(`the CEO input returned ${r!.status}`, r!.body);
const created = (r as Extract<typeof r, { status: 200 }>).body;

// 1. real creation, read back, audit chain, Control Tower visibility (before closing)
let reg = await loadRegistry(store);
const item = reg.get(created.work!.id);
if (!item) fail('the created Work could not be read back');
const visibleOpen = Object.values(buildControlTowerView(reg).byStage).flat().some((w) => w.id === item!.id);
const chainOk = reg.verifyAudit(item!.id).ok;
const eventsBefore = item!.events.length;
if (!visibleOpen || !chainOk) fail('read-back checks failed', { visibleOpen, chainOk });

// 2. real lifecycle closure (resolve, verify, close): no deletion, history retained
const keepOpen = process.env.CEO_LIVE_KEEP_OPEN === 'yes';
let closed = false;
if (!keepOpen) {
  const c = await advanceWork(store, { work: item!.id, action: 'close_test_record', by: VIRAT, method: 'verify:ceo-live read back the item, its audit chain and its Control Tower visibility' });
  if (!c.ok) fail(`closing the test record failed: ${c.error.code}: ${c.error.message}`);
  reg = await loadRegistry(store);
  const after = reg.get(item!.id)!;
  const history = after.events.length >= eventsBefore + 4 && after.events.slice(0, eventsBefore).every((e, i) => e.hash === item!.events[i].hash);
  const stillThere = Object.values(buildControlTowerView(reg, { includeAll: true }).byStage).flat().some((w) => w.id === item!.id);
  closed = after.state === 'closed' && after.title === item!.title && history && stillThere && reg.verifyAudit(item!.id).ok;
  if (!closed) fail('the closure checks failed', { state: after.state, history, stillThere });
}
console.log(JSON.stringify({ created: created.work?.ref, readBack: true, controlTowerVisible: visibleOpen, auditChainValid: chainOk, lifecycleClosed: closed, kept: keepOpen ? 'open (CEO_LIVE_KEEP_OPEN=yes)' : 'closed, not deleted' }));
console.log(keepOpen
  ? `Left open: "${text}". Close it with: POST /retail-os/api/admin/work-lifecycle {"work":"${created.work?.ref}","action":"close_test_record"}`
  : `Closed, not deleted: "${text}" (${created.work?.ref}). Its full history is retained; it appears under Learn in the Control Tower.`);
process.exit(0);
