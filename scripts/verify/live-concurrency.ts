// Opt-in live concurrency and rollback check against the real control-plane Work Registry.
// Run:  CEO_LIVE_VERIFY=yes SUPABASE_URL=https://vszjwgxvqoqyixpfthwl.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npm run verify:live-concurrency
// Exit codes: 0 verified, 1 ran and failed, 2 not run. Same guards as verify:ceo-live. No brand database is touched.
// Two writers are two simultaneous requests from two separate clients, each its own work_persist transaction through
// PostgREST (pooled connections). The checks are in live-concurrency-run.ts, where they are tested against a local database.
import { createClient } from '@supabase/supabase-js';
import { createSupabaseWorkStore } from '../../src/lib/work/db-store';
import { runConcurrencyVerification } from './live-concurrency-run';

const { CEO_LIVE_VERIFY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const CONTROL_PLANE_REF = 'vszjwgxvqoqyixpfthwl';
const refuse = (why: string): never => { console.error(`NOT RUN: ${why} Nothing was written.`); process.exit(2); };
if (CEO_LIVE_VERIFY !== 'yes') refuse('set CEO_LIVE_VERIFY=yes to run this deliberately.');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) refuse('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
if (!SUPABASE_URL!.includes(CONTROL_PLANE_REF)) refuse(`SUPABASE_URL is not the control-plane project (${CONTROL_PLANE_REF}); brand databases are never touched.`);

const client = () => createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const reader = client();
const countWhere = async (table: string, column: string, like: string) => {
  const { count, error } = await reader.from(table).select('*', { count: 'exact', head: true }).like(column, like);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
};

const report = await runConcurrencyVerification(createSupabaseWorkStore(client()), createSupabaseWorkStore(client()), countWhere);
for (const c of report.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail && !c.ok ? `  [${c.detail}]` : ''}`);
console.log(JSON.stringify({ run: report.run, checks: report.checks.length, ok: report.ok }));
process.exit(report.ok ? 0 : 1);
