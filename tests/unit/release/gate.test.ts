import { describe, expect, it } from 'vitest';
import { evaluateGate, splitTypeErrors } from '../../../src/lib/release/gate';
import type { GateCheck } from '../../../src/lib/release/gate';

const c = (o: Partial<GateCheck>): GateCheck => ({ id: 'x', area: 'tests', blocking: true, status: 'pass', evidence: '', ...o });

describe('release gate', () => {
  it('is READY only when every blocking check passes', () => {
    expect(evaluateGate([c({}), c({ id: 'y' })]).verdict).toBe('READY');
  });
  it('a failed blocking check blocks', () => {
    const r = evaluateGate([c({}), c({ id: 'build', status: 'fail' })]);
    expect(r.verdict).toBe('BLOCKED');
    expect(r.blockers.map((b) => b.id)).toEqual(['build']);
  });
  it('a pending blocking check blocks: unrun live verification is never READY', () => {
    expect(evaluateGate([c({ id: 'live', area: 'live', status: 'pending' })]).verdict).toBe('BLOCKED');
  });
  it('non-blocking failures are reported but do not block', () => {
    const r = evaluateGate([c({}), c({ id: 'debt', blocking: false, status: 'fail' })]);
    expect(r.verdict).toBe('READY');
    expect(r.nonBlocking.map((b) => b.id)).toEqual(['debt']);
  });
  it('splits typecheck errors into production path and documented debt', () => {
    const out = [
      "src/lib/work/registry.ts(1,1): error TS2322: bad",
      "src/lib/lead-mail/run.ts(244,40): error TS2339: old",
      "starters/next-brand-plane/app/page.tsx(1,26): error TS2307: old",
      "  continuation line",
    ].join('\n');
    const s = splitTypeErrors(out);
    expect(s.production).toHaveLength(1);
    expect(s.other).toHaveLength(2);
  });
  it('a public API route is production path: the missing-import bug in apply.ts would have blocked', () => {
    const s = splitTypeErrors("src/pages/retail-os/api/apply.ts(191,5): error TS2304: Cannot find name 'syncLeadFromApplication'.");
    expect(s.production).toHaveLength(1);
  });
  it('an unresolved name or module anywhere in src blocks, even outside the listed paths', () => {
    const s = splitTypeErrors([
      "src/lib/some-other.ts(3,1): error TS2304: Cannot find name 'x'.",
      "src/lib/some-other.ts(4,1): error TS2307: Cannot find module './gone'.",
      "src/lib/lead-mail/run.ts(244,40): error TS2339: Property 'purpose' does not exist.",
    ].join('\n'));
    expect(s.production).toHaveLength(2);
    expect(s.other).toHaveLength(1);
  });
});
