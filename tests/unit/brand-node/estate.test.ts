// Guards on the estate map so it cannot drift into claims it cannot back, and so no active client is omitted.
import { describe, expect, it } from 'vitest';
import { AGENT_REGISTRY } from '../../../src/lib/ceo/types';
import { InMemoryWorkRegistry, Scopes } from '../../../src/lib/work';
import { BRAND_CAPABILITIES, CAPABILITY_KEYS, ESTATE, validateLink, type EstateEntry } from '../../../src/lib/brand-node';

// brands.key values read from the control-plane registry on 2026-10-07.
const REGISTRY_KEYS = ['abhishekbahl', 'aloochips', 'blalsand', 'caps', 'ceremonykitchen', 'freshforpaws', 'indiacontemporary', 'korbi', 'moonglasses', 'papparich', 'partycollective', 'radicokhaitan', 'thefeelingco'];
const nodes = ESTATE.filter((e): e is EstateEntry & { connections: NonNullable<EstateEntry['connections']> } => !!e.connections);

describe('estate map', () => {
  it('has unique ids and every entry is classified with a status, an owner and a stack', () => {
    expect(new Set(ESTATE.map((e) => e.id)).size).toBe(ESTATE.length);
    for (const e of ESTATE) for (const k of ['class', 'status', 'owner', 'stack', 'database', 'deployment', 'domain'] as const) expect(e[k], `${e.id}.${k}`).toBeTruthy();
  });

  it('covers every repository in the estate and Fresh For Paws, which has no repository of its own', () => {
    const repos = ESTATE.map((e) => e.repo).filter(Boolean);
    for (const r of ['ViratMohan', 'retail-os-brand-config', 'moon-glasses', 'Travaholic_caps', 'ceremony-os', 'korbi', 'thefeelingco', 'indiacontemporary.net', 'Travaholic', 'Content-ment', 'Coachyourpsyche', 'Mystique']) expect(repos, r).toContain(r);
    const fresh = ESTATE.find((e) => e.brandKey === 'freshforpaws')!;
    expect(fresh.repo).toBeNull();
    expect(fresh.status).toBe('provisioning');
    expect(fresh.class).toBe('retail-os-brand');
  });

  it('Fresh For Paws and Ceremony are first-class: full connection rows, capabilities, unique features and a Brand CEO', () => {
    for (const key of ['freshforpaws', 'ceremonykitchen']) {
      const e = nodes.find((n) => n.brandKey === key)!;
      expect(e, key).toBeDefined();
      expect(e.unique.length, key).toBeGreaterThan(2);
      expect(Object.keys(e.connections)).toHaveLength(9);
      expect(BRAND_CAPABILITIES[key].map((c) => c.key).sort()).toEqual([...CAPABILITY_KEYS].sort());
    }
  });

  it('Fresh For Paws is never described as not started: its staged work is on the record', () => {
    const fresh = ESTATE.find((e) => e.brandKey === 'freshforpaws')!;
    expect(fresh.notes.join(' ')).toMatch(/schema/);
    expect(fresh.notes.join(' ')).toMatch(/Not "not started"/);
    expect(fresh.production).toBe('no');
  });
});

describe('connection claims', () => {
  it('every claim has its proof: evidence for CONNECTED/PARTIAL/LIVE/CONTRACT_ONLY, an exact reason for the rest', () => {
    for (const e of nodes) for (const [k, l] of Object.entries(e.connections)) expect(validateLink(l, `${e.id}.${k}`), `${e.id}.${k}`).toEqual([]);
  });

  it('nothing is CONNECTED or LIVE except what was actually verified: the registry rows, read from the real control plane', () => {
    for (const e of nodes) for (const [k, l] of Object.entries(e.connections)) {
      if (k === 'registry') continue;
      expect(['CONNECTED', 'LIVE'], `${e.id}.${k} is ${l.state}`).not.toContain(l.state);
    }
    for (const e of nodes) expect(e.connections.registry.state, e.id).toBe('LIVE');
  });

  it('every brand node resolves to a key in the central registry', () => {
    for (const e of nodes) expect(REGISTRY_KEYS, e.id).toContain(e.brandKey);
  });

  it('every Brand CEO scope is a registry key the Work Registry accepts (Ceremony was "ceremony", which it refused)', () => {
    const brandCeos = AGENT_REGISTRY.filter((a) => a.role === 'brand_ceo');
    expect(brandCeos.map((a) => a.id).sort()).toEqual(['CK-01', 'FP-01', 'KB-01', 'MG-01', 'TC-01']);
    const reg = new InMemoryWorkRegistry({ knownBrands: new Set(REGISTRY_KEYS), directory: { kindOf: () => 'agent' } });
    for (const a of brandCeos) {
      expect(REGISTRY_KEYS, a.id).toContain(a.scope?.brand);
      const r = reg.createItem({ type: 'task', title: `scope check ${a.id}`, scope: Scopes.brand(a.scope!.brand!) }, { kind: 'agent', id: a.id });
      expect(r.ok, `${a.id}: ${r.ok ? '' : r.error.message}`).toBe(true);
    }
    const bad = reg.createItem({ type: 'task', title: 'old key', scope: Scopes.brand('ceremony') }, { kind: 'agent', id: 'CK-01' });
    expect(bad.ok).toBe(false);
  });

  it('every active brand node has exactly one Brand CEO in the agent registry', () => {
    for (const key of ['moonglasses', 'caps', 'ceremonykitchen', 'korbi', 'freshforpaws']) {
      expect(AGENT_REGISTRY.filter((a) => a.role === 'brand_ceo' && a.scope?.brand === key), key).toHaveLength(1);
    }
  });
});
