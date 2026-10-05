import { describe, expect, it } from 'vitest';
import { InMemoryWorkRegistry } from '../../../src/lib/work/registry';
import { stageOf, buildControlTowerView, brandWorkView } from '../../../src/lib/control-tower';
import type { WorkItem } from '../../../src/lib/work/types';

function makeRegistry(): InMemoryWorkRegistry {
  return new InMemoryWorkRegistry();
}

const SYS = { kind: 'system' as const, id: 'system:test' };
const DEV = { kind: 'agent' as const, id: 'agent:dev' };
const SG_CEO = { kind: 'agent' as const, id: 'SG-01' };

function must<T>(r: { ok: boolean; value?: T }): T {
  if (!r.ok) throw new Error(`expected ok, got: ${JSON.stringify(r)}`);
  return (r as { ok: true; value: T }).value;
}

function ingestFailure(reg: InMemoryWorkRegistry, brand: string | null, check: string, at: string) {
  return reg.ingestSourceEvent({
    channel: 'system_alert',
    external_ref: `health:${at}:${brand ?? 'devshop'}:${check}`,
    fingerprint: `health:${brand ?? 'devshop'}:${check}`,
    received_at: at,
    reporter: SYS,
    brand,
    title: `Health check failing: ${check}`,
    summary: `The health check "${check}" failed.`,
    type_hint: 'incident',
  });
}

function triageItem(reg: InMemoryWorkRegistry, id: string) {
  must(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P3', type: 'incident' } } }));
}

function assignItem(reg: InMemoryWorkRegistry, id: string) {
  triageItem(reg, id);
  must(reg.transition(id, 'assigned', DEV, { payload: { owner: SG_CEO } }));
}

describe('stageOf', () => {
  it('maps states to control tower stages', () => {
    const cases: [WorkItem['state'], string][] = [
      ['new', 'detect'],
      ['triaged', 'classify'],
      ['assigned', 'prioritise'],
      ['in_progress', 'track'],
      ['waiting', 'track'],
      ['blocked', 'escalate'],
      ['pending_approval', 'escalate'],
      ['resolved', 'verify'],
      ['verification', 'verify'],
      ['closed', 'learn'],
      ['reopened', 'detect'],
    ];
    for (const [state, expected] of cases) {
      expect(stageOf({ state } as WorkItem)).toBe(expected);
    }
  });
});

describe('buildControlTowerView', () => {
  it('returns an empty view for an empty registry', () => {
    const reg = makeRegistry();
    const view = buildControlTowerView(reg);
    expect(view.total).toBe(0);
    expect(view.blocked).toHaveLength(0);
    expect(view.critical).toHaveLength(0);
    expect(view.unassigned).toHaveLength(0);
  });

  it('shows ingested health failures as work items in the detect stage', () => {
    const reg = makeRegistry();
    ingestFailure(reg, 'moonglasses', 'cod-off', '2026-10-05T10:00:00Z');
    ingestFailure(reg, 'travaholic', 'page-home', '2026-10-05T10:00:00Z');
    const view = buildControlTowerView(reg);
    expect(view.total).toBe(2);
    expect(view.byStage.detect).toHaveLength(2);
  });

  it('triaged items are in the classify stage', () => {
    const reg = makeRegistry();
    const r = must(ingestFailure(reg, 'moonglasses', 'cod-off', '2026-10-05T10:00:00Z'));
    triageItem(reg, r.item.id);
    const view = buildControlTowerView(reg);
    expect(view.byStage.classify).toHaveLength(1);
  });

  it('assigned items are in the prioritise stage', () => {
    const reg = makeRegistry();
    const r = must(ingestFailure(reg, 'moonglasses', 'cod-off', '2026-10-05T10:00:00Z'));
    assignItem(reg, r.item.id);
    const view = buildControlTowerView(reg);
    expect(view.byStage.prioritise).toHaveLength(1);
  });

  it('in-progress items are in the track stage', () => {
    const reg = makeRegistry();
    const r = must(ingestFailure(reg, 'moonglasses', 'cod-off', '2026-10-05T10:00:00Z'));
    assignItem(reg, r.item.id);
    must(reg.transition(r.item.id, 'in_progress', SG_CEO, { reason: 'working' }));
    const view = buildControlTowerView(reg);
    expect(view.byStage.track).toHaveLength(1);
  });

  it('blocked items are in the escalate stage', () => {
    const reg = makeRegistry();
    const r = must(ingestFailure(reg, 'moonglasses', 'cod-off', '2026-10-05T10:00:00Z'));
    assignItem(reg, r.item.id);
    must(reg.transition(r.item.id, 'in_progress', SG_CEO, { reason: 'working' }));
    must(reg.transition(r.item.id, 'blocked', SG_CEO, { payload: { blocked: { reason: 'waiting for access' } } }));
    const view = buildControlTowerView(reg);
    expect(view.byStage.escalate).toHaveLength(1);
    expect(view.blocked).toHaveLength(1);
  });

  it('groups by brand', () => {
    const reg = makeRegistry();
    ingestFailure(reg, 'moonglasses', 'cod-off', '2026-10-05T10:00:00Z');
    ingestFailure(reg, 'moonglasses', 'upi-on', '2026-10-05T10:00:00Z');
    ingestFailure(reg, null, 'page-mission', '2026-10-05T10:00:00Z');
    const view = buildControlTowerView(reg);
    expect(view.byBrand['moonglasses']).toHaveLength(2);
    expect(view.byBrand['_devshop']).toHaveLength(1);
  });

  it('filters by brand', () => {
    const reg = makeRegistry();
    ingestFailure(reg, 'moonglasses', 'cod-off', '2026-10-05T10:00:00Z');
    ingestFailure(reg, 'travaholic', 'page-home', '2026-10-05T10:00:00Z');
    const view = buildControlTowerView(reg, { brandFilter: 'moonglasses' });
    expect(view.total).toBe(1);
    expect(view.byBrand['moonglasses']).toHaveLength(1);
  });

  it('identifies unassigned items (triaged but no owner)', () => {
    const reg = makeRegistry();
    const r = must(ingestFailure(reg, 'moonglasses', 'cod-off', '2026-10-05T10:00:00Z'));
    triageItem(reg, r.item.id);
    const view = buildControlTowerView(reg);
    expect(view.unassigned).toHaveLength(1);
  });

  it('critical items are P0 and P1', () => {
    const reg = makeRegistry();
    ingestFailure(reg, 'moonglasses', 'cod-off', '2026-10-05T10:00:00Z');
    // Default priority is P3, so no critical items
    const view = buildControlTowerView(reg);
    expect(view.critical).toHaveLength(0);
  });
});

describe('brandWorkView', () => {
  it('returns only the specified brand', () => {
    const reg = makeRegistry();
    ingestFailure(reg, 'moonglasses', 'cod-off', '2026-10-05T10:00:00Z');
    ingestFailure(reg, 'travaholic', 'page-home', '2026-10-05T10:00:00Z');
    const view = brandWorkView(reg, 'moonglasses');
    expect(view.total).toBe(1);
  });
});
