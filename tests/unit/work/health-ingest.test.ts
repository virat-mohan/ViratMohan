import { describe, expect, it } from 'vitest';
import { ingestHealthRun, type HealthRun } from '../../../src/lib/work';
import { CHECK, DEV, SG_CEO, code, makeRegistry, must } from './helpers';

// Synthetic health runs in the exact shape scripts/health/check.mjs prints. Brand "sample" is synthetic;
// "site" stands for the control-plane site (not a brand). The resolver maps names to registry scope.
const resolve = (n: string) => (n === 'sample' ? 'sample' : null);
const run = (at: string, results: { check: string; ok: boolean; detail?: string }[], brand = 'sample'): HealthRun => ({ at, report: [{ brand, base: 'https://x.example', failed: results.filter((r) => !r.ok).length, results }] });

describe('health-check ingestion: failures become canonical source events', () => {
  it('a failing check creates ONE new work item at NEW, with no owner (awaiting triage), DevShop/system scope kept honest', () => {
    const { reg } = makeRegistry();
    const r = must(ingestHealthRun(reg, run('2026-10-05T03:00:00.000Z', [
      { check: 'page /cart', ok: true, detail: '200 120ms' },
      { check: 'page /checkout', ok: false, detail: '500 90ms' },
    ]), { resolveBrand: resolve }));
    expect(r).toMatchObject({ failing_checks: 1, created: 1, attached: 0, duplicate: 0 });
    const items = reg.list();
    expect(items.length).toBe(1);
    expect(items[0]).toMatchObject({ state: 'new', type: 'incident', owner: null, scope: { kind: 'brand', brand: 'sample' } });
    expect(items[0].source.channel).toBe('system_alert');
    expect(items[0].source.requester).toEqual({ kind: 'system', id: 'system:health-check' });
    expect(items[0].title).toContain('page /checkout');
  });

  it('a passing run creates nothing', () => {
    const { reg } = makeRegistry();
    const r = must(ingestHealthRun(reg, run('2026-10-05T03:00:00.000Z', [{ check: 'page /', ok: true }]), { resolveBrand: resolve }));
    expect(r.failing_checks).toBe(0);
    expect(reg.list()).toEqual([]);
  });

  it('the control-plane site (not a brand) becomes DevShop-scoped work, never a guessed brand', () => {
    const { reg } = makeRegistry();
    must(ingestHealthRun(reg, run('2026-10-05T03:00:00.000Z', [{ check: 'page /', ok: false, detail: '503' }], 'site'), { resolveBrand: resolve }));
    expect(reg.list()[0].scope).toMatchObject({ kind: 'devshop', brand: null });
  });

  it('re-ingesting the SAME run is idempotent: the same event, nothing new', () => {
    const { reg } = makeRegistry();
    const r1 = run('2026-10-05T03:00:00.000Z', [{ check: 'page /checkout', ok: false, detail: '500' }]);
    const a = must(ingestHealthRun(reg, r1, { resolveBrand: resolve }));
    const b = must(ingestHealthRun(reg, r1, { resolveBrand: resolve }));
    expect(a.created).toBe(1);
    expect(b).toMatchObject({ created: 0, duplicate: 1 });
    expect(reg.list().length).toBe(1);
    expect(reg.allSourceEvents().length).toBe(1);
  });

  it('the same check still failing on a LATER run attaches to the open item (no uncontrolled duplicates)', () => {
    const { reg } = makeRegistry();
    must(ingestHealthRun(reg, run('2026-10-05T03:00:00.000Z', [{ check: 'page /checkout', ok: false, detail: '500' }]), { resolveBrand: resolve }));
    const next = must(ingestHealthRun(reg, run('2026-10-05T05:00:00.000Z', [{ check: 'page /checkout', ok: false, detail: '502' }]), { resolveBrand: resolve }));
    expect(next).toMatchObject({ created: 0, attached: 1 });
    expect(reg.list().length).toBe(1);
    expect(reg.list()[0].source_event_ids.length).toBe(2);
  });

  it('a different failing check is its own item; two failures in one run create two items', () => {
    const { reg } = makeRegistry();
    const r = must(ingestHealthRun(reg, run('2026-10-05T03:00:00.000Z', [
      { check: 'page /checkout', ok: false, detail: '500' },
      { check: 'admin locked /admin', ok: false, detail: '200' },
    ]), { resolveBrand: resolve }));
    expect(r.created).toBe(2);
    expect(reg.list().length).toBe(2);
  });

  it('a recovered check produces no event and never auto-closes the open item (no autonomous state change)', () => {
    const { reg } = makeRegistry();
    must(ingestHealthRun(reg, run('2026-10-05T03:00:00.000Z', [{ check: 'page /checkout', ok: false, detail: '500' }]), { resolveBrand: resolve }));
    const id = reg.list()[0].id;
    const recovered = must(ingestHealthRun(reg, run('2026-10-05T05:00:00.000Z', [{ check: 'page /checkout', ok: true, detail: '200' }]), { resolveBrand: resolve }));
    expect(recovered.failing_checks).toBe(0);
    expect(reg.get(id)!.state).toBe('new'); // unchanged; a person resolves it
  });

  it('a check failing again after its item was CLOSED is flagged as a possible regression, never silently reopened', () => {
    const { reg } = makeRegistry();
    must(ingestHealthRun(reg, run('2026-10-05T03:00:00.000Z', [{ check: 'page /checkout', ok: false, detail: '500' }]), { resolveBrand: resolve }));
    const id = reg.list()[0].id;
    must(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P1' } } }));
    must(reg.transition(id, 'assigned', DEV, { payload: { owner: SG_CEO } }));
    must(reg.transition(id, 'in_progress', SG_CEO));
    must(reg.updateIncident(id, { diagnosis: 'a deploy regressed checkout', result: 'rolled back', addTests: [{ description: 're-ran the health check', result: 'pass' }] }, SG_CEO));
    must(reg.transition(id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'fixed', summary: 'patched' } } }));
    must(reg.setLearning(id, { lesson: 'smoke-test checkout before deploy', reference: null, rule_added: false }, SG_CEO));
    must(reg.updateIncident(id, { cost: { value: null, unit: 'INR', basis: 'unknown', source: null }, revenue_impact: { value: null, unit: 'INR', basis: 'unknown', source: null }, addPrevention: [{ action: 'smoke test' }] }, SG_CEO));
    must(reg.transition(id, 'verification', CHECK));
    must(reg.transition(id, 'closed', CHECK, { payload: { closure: { method: 're-ran the check', evidence: [{ kind: 'metric', ref: 'health:ok', summary: 'green' }] } } }));
    const again = must(ingestHealthRun(reg, run('2026-10-06T03:00:00.000Z', [{ check: 'page /checkout', ok: false, detail: '500' }]), { resolveBrand: resolve }));
    expect(again.possible_regression).toBe(1);
    expect(reg.get(id)!.state).toBe('closed'); // untouched
    const fresh = reg.list({ openOnly: true }).find((i) => i.id !== id)!;
    expect(reg.possibleDuplicatesOf(fresh.id).map((l) => l.to)).toContain(id);
  });

  it('malformed runs and results are refused safely; nothing is written', () => {
    const { reg } = makeRegistry();
    expect(code(ingestHealthRun(reg, { at: '', report: [] } as HealthRun))).toBe('invalid_input');
    expect(code(ingestHealthRun(reg, { at: 'not-a-date', report: [] } as HealthRun))).toBe('invalid_input');
    expect(code(ingestHealthRun(reg, { at: '2026-10-05T03:00:00.000Z', report: {} as never }))).toBe('invalid_input');
    expect(code(ingestHealthRun(reg, { at: '2026-10-05T03:00:00.000Z', report: [{ brand: '', failed: 0, results: [] }] }))).toBe('invalid_input');
    expect(code(ingestHealthRun(reg, { at: '2026-10-05T03:00:00.000Z', report: [{ brand: 'sample', failed: 1, results: [{ check: 'x' } as never] }] }))).toBe('invalid_input');
    expect(reg.list()).toEqual([]);
    expect(reg.allSourceEvents()).toEqual([]);
  });

  it('an unknown resolved brand is refused by the registry (the adapter never invents a brand)', () => {
    const { reg } = makeRegistry();
    expect(code(ingestHealthRun(reg, run('2026-10-05T03:00:00.000Z', [{ check: 'page /', ok: false }]), { resolveBrand: () => 'ghost-brand' }))).toBe('unknown_brand');
    expect(reg.list()).toEqual([]);
  });

  it('is read-only toward the health system: it only calls the registry, and every created item keeps a full audit chain', () => {
    const { reg } = makeRegistry();
    must(ingestHealthRun(reg, run('2026-10-05T03:00:00.000Z', [{ check: 'refuses /api/x', ok: false, detail: '200' }]), { resolveBrand: resolve }));
    const it = reg.list()[0];
    expect(it.events[0].kind).toBe('created');
    expect(it.events.some((e) => e.kind === 'source_attached')).toBe(true);
    expect(must(reg.verifyAudit(it.id))).toEqual({ ok: true });
  });

  it('a mixed multi-brand run routes each failure to the right scope in one pass', () => {
    const { reg } = makeRegistry();
    const r: HealthRun = { at: '2026-10-05T03:00:00.000Z', report: [
      { brand: 'sample', base: 'x', failed: 1, results: [{ check: 'page /cart', ok: false, detail: '500' }] },
      { brand: 'site', base: 'y', failed: 1, results: [{ check: 'homepage links (12)', ok: false, detail: '404 /old' }] },
      { brand: 'other', base: 'z', failed: 0, results: [{ check: 'page /', ok: true }] },
    ] };
    const out = must(ingestHealthRun(reg, r, { resolveBrand: resolve }));
    expect(out).toMatchObject({ failing_checks: 2, created: 2 });
    const byScope = reg.list().map((i) => i.scope.kind).sort();
    expect(byScope).toEqual(['brand', 'devshop']);
  });
});
