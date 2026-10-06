// npm run verify:release: runs the production-readiness checks and prints READY or BLOCKED. Writes nothing to any database.
import { spawnSync } from 'node:child_process';
import { evaluateGate, splitTypeErrors } from '../../src/lib/release/gate';
import type { GateCheck } from '../../src/lib/release/gate';

function run(cmd: string): { ok: boolean; out: string } {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
const tail = (s: string) => s.trim().split('\n').slice(-3).join(' | ').slice(0, 300);
const checks: GateCheck[] = [];

const tsc = run('npx tsc --noEmit');
const te = splitTypeErrors(tsc.out);
checks.push({ id: 'typecheck-production-path', area: 'typecheck', blocking: true, status: te.production.length === 0 ? 'pass' : 'fail', evidence: te.production.length === 0 ? `0 errors in production path (${te.other.length} documented debt elsewhere)` : te.production.slice(0, 3).join(' | ') });

const build = run('npx astro build');
checks.push({ id: 'astro-build', area: 'build', blocking: true, status: build.ok ? 'pass' : 'fail', evidence: tail(build.out) });

const suites: [string, string][] = [
  ['vitest-work-registry', 'npx vitest run tests/unit/work tests/unit/intelligence/provider-boundary.test.ts tests/unit/release'],
  ['node-test-ceo', 'npm run test:ceo'],
  ['node-test-intelligence-improvement', 'npx tsx --test tests/unit/intelligence/invocation-gate.test.ts tests/unit/intelligence/model-router.test.ts tests/unit/intelligence/visual-guardian.test.ts tests/unit/intelligence/responsible-tech.test.ts tests/unit/improvement/improvement-system.test.ts tests/unit/improvement/improvement-learning.test.ts'],
];
for (const [id, cmd] of suites) {
  const r = run(cmd);
  checks.push({ id, area: 'tests', blocking: true, status: r.ok ? 'pass' : 'fail', evidence: tail(r.out) });
}

const hasCreds = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.CEO_LIVE_VERIFY === 'yes';
if (hasCreds) {
  const live = run('npm run verify:ceo-live');
  checks.push({ id: 'live-ceo-verification', area: 'live', blocking: true, status: live.ok ? 'pass' : 'fail', evidence: tail(live.out) });
} else {
  checks.push({ id: 'live-ceo-verification', area: 'live', blocking: true, status: 'pending', evidence: 'LIVE VERIFICATION PENDING: needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and CEO_LIVE_VERIFY=yes. Re-run: CEO_LIVE_VERIFY=yes npm run verify:release' });
}
for (const id of ['live-concurrency', 'live-rollback']) {
  checks.push({ id, area: 'live', blocking: true, status: 'pending', evidence: 'No live procedure has been run; in-memory/embedded-Postgres tests only' });
}

const report = evaluateGate(checks);
for (const c of checks) console.log(`${c.status.toUpperCase().padEnd(7)} ${c.id}: ${c.evidence}`);
console.log(`\nVERDICT: ${report.verdict}${report.blockers.length ? ` (${report.blockers.map((b) => b.id).join(', ')})` : ''}`);
process.exit(report.verdict === 'READY' ? 0 : 2);
