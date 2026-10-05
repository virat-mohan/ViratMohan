// Opt-in live check of Founder -> CEO runtime -> real control-plane Work Registry.
// Run:  CEO_LIVE_VERIFY=yes SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run verify:ceo-live
// It writes ONE Work item marked "[IT-LIVE]". The schema forbids deleting Work (a database trigger blocks it), so this
// item cannot be removed; Virat resolves or closes it. Nothing else is written. No brand database is touched.
import { createClient } from '@supabase/supabase-js';
import { createSupabaseWorkStore } from '../../src/lib/work/db-store';
import { loadRegistry } from '../../src/lib/work/db-registry';
import { handleFounderInput } from '../../src/lib/ceo/founder-service';
import { buildControlTowerView } from '../../src/lib/control-tower/view';

const { CEO_LIVE_VERIFY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (CEO_LIVE_VERIFY !== 'yes' || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log('SKIPPED: set CEO_LIVE_VERIFY=yes, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run. Nothing was written.');
  process.exit(0);
}

const store = createSupabaseWorkStore(createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }));
const pw = 'live-verify-local-only';
const auth = 'Basic ' + Buffer.from(`admin:${pw}`).toString('base64');
const text = `[IT-LIVE] Verify the CEO runtime write path ${new Date().toISOString().slice(0, 10)}`;

const r = await handleFounderInput(auth, { text }, { store, adminPassword: pw });
if (r.status !== 200) { console.error('FAILED', r.status, r.body); process.exit(1); }
const reg = await loadRegistry(store);
const item = reg.get(r.body.work!.id);
const visible = buildControlTowerView(reg).byStage;
const inView = Object.values(visible).flat().some((w) => w.id === item?.id);
const chain = item ? reg.verifyAudit(item.id).ok : false;
console.log(JSON.stringify({ created: r.body.work?.ref, readBack: !!item, controlTowerVisible: inView, auditChainValid: chain, kind: r.body.outcome.kind }));
process.exit(item && inView && chain ? 0 : 1);
