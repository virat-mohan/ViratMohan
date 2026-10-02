import { describe, it, expect } from 'vitest';
import { layoutWide, layoutNarrow, buildEdges, escalationTarget, replayDays, isRecent, groupOf } from '../../src/lib/org-visual';
import type { OrgMember, OrgUpdate } from '../../src/lib/org-board';

const m = (id: string, kind: OrgMember['kind'], reports_to: string | null, sort = 0): OrgMember => ({ id, name: id, role: '', kind, reports_to, owns: [], may_decide: null, must_escalate: null, brand_key: null, active: true, sort });
const members = [m('DS-00', 'founder', null), m('DS-01', 'cofounder', 'DS-00'), m('DS-02', 'ceo', 'DS-01'), m('TC-01', 'brand_ceo', 'DS-02'), m('MG-01', 'brand_ceo', 'DS-02'), m('DS-10', 'function', 'DS-02'), m('P-01', 'person', 'DS-00'), m('BD-01', 'board_seat', 'DS-00')];
const u = (member_id: string, at: string, o: Partial<OrgUpdate> = {}): OrgUpdate => ({ member_id, at, status: 'on_track', summary: '', pending: [], stuck_on: null, help_needed: null, next_step: null, links: [], ...o });

describe('org visual', () => {
  it('groups and lays out every member once, founders on top, Dev central', () => {
    const n = layoutWide(members);
    expect(n.map((x) => x.id).sort()).toEqual(members.map((x) => x.id).sort());
    const at = (id: string) => n.find((x) => x.id === id)!;
    expect(at('DS-00').y).toBeLessThan(at('DS-02').y);
    expect(at('P-01').x).toBeGreaterThan(at('DS-10').x);
    expect(groupOf(members[6])).toBe('side');
    for (const x of n) { expect(x.x).toBeGreaterThanOrEqual(0); expect(x.x).toBeLessThanOrEqual(1200); }
  });
  it('narrow layout stays inside 360 wide with 44px+ spacing', () => {
    const { nodes, height } = layoutNarrow(members);
    for (const x of nodes) { expect(x.x - 30).toBeGreaterThanOrEqual(0); expect(x.x + 30).toBeLessThanOrEqual(360); }
    for (const a of nodes) for (const b of nodes) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThan(0);
  });
  it('routes escalations by decision rights', () => {
    expect(escalationTarget('Need Prince to add DNS', members[3])).toBe('DS-00');
    expect(escalationTarget('Raise the ad cap to ₹500', members[3])).toBe('DS-00');
    expect(escalationTarget('Is this on brand book voice?', members[3])).toBe('DS-01');
    expect(escalationTarget('Shopify token expired', members[3])).toBe('DS-02');
    expect(escalationTarget('API down', members[2])).toBe('DS-01');
  });
  it('builds reporting and help edges', () => {
    const latest = new Map([['TC-01', u('TC-01', '2026-10-02T03:00:00Z', { status: 'blocked', stuck_on: 'token expired', help_needed: 'Prince to reconnect' })]]);
    const e = buildEdges(members, latest);
    expect(e.filter((x) => x.kind === 'reports')).toHaveLength(7);
    expect(e.filter((x) => x.kind === 'help').map((x) => x.to).sort()).toEqual(['DS-00', 'DS-02']);
  });
  it('replays status by IST day', () => {
    const r = replayDays('2026-10-02', [u('TC-01', '2026-09-30T05:00:00Z', { status: 'blocked' }), u('TC-01', '2026-10-01T20:00:00Z', { status: 'on_track' })]);
    expect(r.map((d) => d.day)).toEqual(['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(r[3].status['TC-01']).toBeUndefined();
    expect(r[4].status['TC-01']).toBe('blocked');
    expect(r[5].status['TC-01']).toBe('blocked'); // 1 Oct 20:00Z is 2 Oct 01:30 IST
    expect(r[6].status['TC-01']).toBe('on_track');
  });
  it('flags recent updates', () => {
    const now = Date.parse('2026-10-02T12:00:00Z');
    expect(isRecent('2026-10-02T11:00:00Z', now)).toBe(true);
    expect(isRecent('2026-10-02T09:00:00Z', now)).toBe(false);
  });
});
