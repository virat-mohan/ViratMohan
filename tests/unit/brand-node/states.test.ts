import { describe, expect, it } from 'vitest';
import { fullHealth, link, rollupHealth, validateLink, HEALTH_COMPONENTS } from '../../../src/lib/brand-node';

describe('connection claims need their proof', () => {
  it('CONNECTED, PARTIAL and CONTRACT_ONLY without evidence are defects', () => {
    for (const s of ['CONNECTED', 'PARTIAL', 'CONTRACT_ONLY'] as const) expect(validateLink(link(s), 'x')).toHaveLength(1);
    expect(validateLink(link('CONNECTED', ['src/lib/a.ts']))).toEqual([]);
  });
  it('SETUP_REQUIRED, WAITING_FOR_HUMAN, DEFERRED, NOT_CONNECTED and UNKNOWN need the exact reason', () => {
    for (const s of ['SETUP_REQUIRED', 'WAITING_FOR_HUMAN', 'DEFERRED', 'NOT_CONNECTED', 'UNKNOWN'] as const) {
      expect(validateLink(link(s))).toHaveLength(1);
      expect(validateLink(link(s, [], 'a specific reason'))).toEqual([]);
    }
  });
  it('LIVE needs evidence from the real deployed environment, not just a file path', () => {
    expect(validateLink(link('LIVE', ['src/lib/a.ts']))).toHaveLength(1);
    expect(validateLink(link('LIVE', ['live:health 200 at 2026-10-07']))).toEqual([]);
  });
});

describe('health: unknown never looks healthy', () => {
  const all = (state: 'PASS' | 'WARN' | 'FAIL' | 'UNKNOWN') => HEALTH_COMPONENTS.map((name) => ({ name, state, detail: '' }));
  it('fullHealth fills every standard component and reports the rest UNKNOWN', () => {
    const h = fullHealth({ DATABASE: { state: 'PASS', detail: 'ok' } });
    expect(h.map((c) => c.name)).toEqual([...HEALTH_COMPONENTS]);
    expect(h.filter((c) => c.state === 'UNKNOWN')).toHaveLength(HEALTH_COMPONENTS.length - 1);
  });
  it('only a complete set of PASS is PASS', () => {
    expect(rollupHealth(all('PASS'))).toBe('PASS');
    expect(rollupHealth(all('PASS').slice(1))).toBe('UNKNOWN');
    expect(rollupHealth([])).toBe('UNKNOWN');
    expect(rollupHealth(fullHealth({ DATABASE: { state: 'PASS' } }))).toBe('UNKNOWN');
  });
  it('the worst known state wins: FAIL over WARN over UNKNOWN over PASS', () => {
    const base = all('PASS');
    expect(rollupHealth([{ ...base[0], state: 'UNKNOWN' }, ...base.slice(1)])).toBe('UNKNOWN');
    expect(rollupHealth([{ ...base[0], state: 'WARN' }, { ...base[1], state: 'UNKNOWN' }, ...base.slice(2)])).toBe('WARN');
    expect(rollupHealth([{ ...base[0], state: 'FAIL' }, { ...base[1], state: 'WARN' }, ...base.slice(2)])).toBe('FAIL');
  });
});
