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

const boundary = run('npx vitest run tests/unit/intelligence/provider-boundary.test.ts tests/unit/work/boundary.test.ts');
checks.push({ id: 'model-invocation-boundary', area: 'security', blocking: true, status: boundary.ok ? 'pass' : 'fail', evidence: boundary.ok ? 'only the governed provider calls the Anthropic API; no call site picks a model; Work Registry boundary holds' : tail(boundary.out) });

const suites: [string, string][] = [
  ['vitest-unit', 'npm test'],
  ['node-test-ceo', 'npm run test:ceo'],
  ['node-test-intelligence-improvement', 'npm run test:node'],
];
for (const [id, cmd] of suites) {
  const r = run(cmd);
  checks.push({ id, area: 'tests', blocking: true, status: r.ok ? 'pass' : 'fail', evidence: tail(r.out) });
}

const domains: [string, string, string][] = [
  ['brand-foundation', 'tests/unit/brand-foundation.test.ts', 'Brand Foundation data system'],
  ['brand-memory', 'tests/unit/brand-memory.test.ts', 'Brand Memory learning system'],
  ['catalogue', 'tests/unit/catalogue.test.ts', 'Product Catalogue system'],
  ['lead-journey', 'tests/unit/lead-journey.test.ts', 'Lead journey and NDA workflow'],
  ['shipping-policy', 'tests/unit/shipping-policy.test.ts', 'Shipping policy calculations'],
  ['invoice', 'tests/unit/invoice.test.ts', 'Invoice generation and settlement'],
  ['mail', 'tests/unit/mail.test.ts', 'Email sending and formatting'],
  ['security-boundary', 'tests/unit/security-boundary.test.ts', 'Security and data isolation'],
  ['dashboard-coherence', 'tests/unit/dashboard-coherence.test.ts', 'Admin dashboard platform consistency'],
];
for (const [id, file, name] of domains) {
  const r = run(`npx vitest run ${file}`);
  checks.push({ id: `domain-${id}`, area: 'tests', blocking: true, status: r.ok ? 'pass' : 'fail', evidence: r.ok ? `${name} verified` : tail(r.out) });
}

const hasCreds = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.CEO_LIVE_VERIFY === 'yes';
if (hasCreds) {
  const live = run('npm run verify:ceo-live');
  checks.push({ id: 'live-ceo-verification', area: 'live', blocking: true, status: live.ok ? 'pass' : 'fail', evidence: tail(live.out) });
  const conc = run('npm run verify:live-concurrency');
  const lines = conc.out.split('\n').filter((l) => /^(PASS|FAIL) /.test(l));
  const rb = lines.filter((l) => /^(PASS|FAIL)\s+rollback:/.test(l));
  const rest = lines.filter((l) => !rb.includes(l));
  checks.push({ id: 'live-concurrency', area: 'live', blocking: true, status: conc.ok && rest.length > 0 && rest.every((l) => l.startsWith('PASS')) ? 'pass' : 'fail', evidence: `${rest.filter((l) => l.startsWith('PASS')).length}/${rest.length} concurrency and cleanup checks passed` });
  checks.push({ id: 'live-rollback', area: 'live', blocking: true, status: conc.ok && rb.length > 0 && rb.every((l) => l.startsWith('PASS')) ? 'pass' : 'fail', evidence: `${rb.filter((l) => l.startsWith('PASS')).length}/${rb.length} rollback checks passed` });
} else {
  const how = 'Re-run: CEO_LIVE_VERIFY=yes SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run verify:release';
  checks.push({ id: 'live-ceo-verification', area: 'live', blocking: true, status: 'pending', evidence: `LIVE VERIFICATION PENDING: needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and CEO_LIVE_VERIFY=yes. ${how}` });
  for (const id of ['live-concurrency', 'live-rollback']) checks.push({ id, area: 'live', blocking: true, status: 'pending', evidence: `Not run: needs live credentials (npm run verify:live-concurrency). ${how}` });
}

const report = evaluateGate(checks);
for (const c of checks) console.log(`${c.status.toUpperCase().padEnd(7)} ${c.id}: ${c.evidence}`);
console.log(`\nVERDICT: ${report.verdict}${report.blockers.length ? ` (${report.blockers.map((b) => b.id).join(', ')})` : ''}`);
process.exit(report.verdict === 'READY' ? 0 : 2);
