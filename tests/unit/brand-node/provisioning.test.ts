import { describe, expect, it } from 'vitest';
import { provisioningRecord, PROVISIONING_COMPONENTS, type ProvisioningFacts } from '../../../src/lib/brand-node';
import type { StandupTask } from '../../../src/lib/retail-os-standup';

const tk = (stage: number, status: string, owner: string, task: string): StandupTask => ({ stage, status, owner, task, priority: 2, sort: stage });

// The shape of the Fresh For Paws ops board read from the control plane on 2026-10-07 (statuses, owners and stages are real; task text is abridged).
const FRESH_TASKS: StandupTask[] = [
  tk(0, 'done', 'founder', 'NCNDA signed, terms signed at 25%, deposit marked paid'),
  tk(0, 'done', 'team', 'Chase signed NCNDA; then Woo access, products, order volume'),
  tk(1, 'na', 'brand', 'Shop Manager WordPress user + WooCommerce REST API key (read) for DevShop'),
  ...Array.from({ length: 8 }, (_, i) => tk(1, 'pending', 'team', `Setup item ${i + 1}`)),
  tk(1, 'todo', 'founder', 'Create freshforpaws-os Supabase project, GitHub repo, Vercel project'),
  tk(1, 'todo', 'team', 'Record hosting, registrar and who holds each login (names only)'),
  tk(2, 'todo', 'team', 'Record current gateway and settlement bank'),
  tk(3, 'na', 'brand', 'From Srishti: meals/day capacity, delivery method, zones'),
  tk(3, 'todo', 'team', 'Shiprocket or local courier only if own delivery cannot cover zones'),
  tk(4, 'todo', 'team', 'Brand email on their domain; Resend domain verified'),
  tk(5, 'na', 'brand', 'Keep current number or new WhatsApp Business API number'),
  tk(5, 'todo', 'team', 'Meta BM partner request, Business Verification, templates'),
  tk(6, 'todo', 'team', 'Connect @freshforpaws once backend admin exists'),
  tk(7, 'todo', 'team', 'Ad account + pixel partner access; GA and Search Console invites'),
  tk(8, 'todo', 'team', 'Admin setup code used once; password set'),
  tk(9, 'na', 'brand', 'Sheet from Srishti: products with cost, pack size, shelf life'),
];
const freshFacts = (over: Partial<ProvisioningFacts> = {}): ProvisioningFacts => ({
  brandKey: 'freshforpaws', clientName: 'Fresh For Paws', agreementSigned: true, depositPaid: true, registryStatus: 'building', foundation: null,
  approvedProducts: 0, agentId: 'FP-01', dashboardDeployed: false, health: null, tasks: FRESH_TASKS, workId: null, ...over,
});
const by = (r: ReturnType<typeof provisioningRecord>, c: string) => r.components.find((e) => e.component === c)!;

describe('provisioning record: Fresh For Paws as it really is', () => {
  const r = provisioningRecord(freshFacts());

  it('covers every standard component once, in order', () => {
    expect(r.components.map((c) => c.component)).toEqual([...PROVISIONING_COMPONENTS]);
    expect(r.total).toBe(22);
  });

  it('records what is genuinely done: client, brand, agreement, deposit, registry row, the build assigned, a Brand CEO', () => {
    for (const c of ['client', 'brand', 'agreement', 'payment', 'brand_registry', 'team', 'agents']) expect(by(r, c).state, c).toBe('COMPLETE');
    expect(r.complete).toBe(7);
  });

  it('shows the Supabase, GitHub and Vercel step as WAITING on the founder, the real external dependency', () => {
    for (const c of ['repository', 'database', 'deployment']) expect(by(r, c)).toMatchObject({ state: 'WAITING', owner: 'founder' });
  });

  it('does not call anything built that is not: no Foundation, catalogue, dashboard or health yet', () => {
    expect(by(r, 'foundation').state).toBe('NOT_STARTED');
    expect(by(r, 'catalogue').state).toBe('NOT_STARTED');
    expect(by(r, 'dashboard')).toMatchObject({ state: 'WAITING', owner: 'team' });
    expect(by(r, 'health').state).toBe('NOT_STARTED');
  });

  it('never marks go-live complete because its only task is "not applicable"; go-live is a human decision', () => {
    expect(by(r, 'go_live')).toMatchObject({ state: 'WAITING', owner: 'virat' });
  });

  it('is IN_PROGRESS overall with the next actionable component named', () => {
    expect(r.overall).toBe('IN_PROGRESS');
    expect(r.nextAction?.component).toBe('foundation');
    expect(r.blockers).toEqual([]);
  });

  it('carries the Work Registry link it was given and nothing else', () => {
    expect(provisioningRecord(freshFacts({ workId: 'W-0042' })).workId).toBe('W-0042');
    expect(r.workId).toBeNull();
  });
});

describe('provisioning record: rules', () => {
  it('with no setup tasks, the build is WAITING on Virat: assigning it to the ops team stays a deliberate human step', () => {
    const r = provisioningRecord(freshFacts({ tasks: [], agentId: null }));
    expect(by(r, 'team')).toMatchObject({ state: 'WAITING', owner: 'virat' });
    expect(by(r, 'agents')).toMatchObject({ state: 'WAITING', owner: 'virat' });
  });

  it('a blocked task makes its component BLOCKED and the overall record BLOCKED with the reason', () => {
    const tasks = [tk(1, 'blocked', 'team', 'Supabase project created; GitHub repo created; Vercel project linked; ADMIN_PASSWORD set')];
    const r = provisioningRecord(freshFacts({ tasks: [{ ...tasks[0], note: 'project creation timed out twice' }] }));
    expect(by(r, 'database')).toMatchObject({ state: 'BLOCKED', detail: 'project creation timed out twice' });
    expect(r.overall).toBe('BLOCKED');
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it('a committed Foundation completes it; a draft one does not; a failing health reading is FAILED', () => {
    expect(by(provisioningRecord(freshFacts({ foundation: 'committed' })), 'foundation').state).toBe('COMPLETE');
    expect(by(provisioningRecord(freshFacts({ foundation: 'draft' })), 'foundation').state).toBe('IN_PROGRESS');
    const failed = provisioningRecord(freshFacts({ health: 'FAIL' }));
    expect(by(failed, 'health').state).toBe('FAILED');
    expect(failed.overall).toBe('FAILED');
  });

  it('everything done and live is COMPLETE; an unknown health reading never completes health', () => {
    const done: StandupTask[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => tk(s, 'done', 'team', `stage ${s}: Supabase GitHub Vercel ADMIN_PASSWORD domain analytics`));
    const f = freshFacts({ tasks: done, foundation: 'committed', approvedProducts: 12, dashboardDeployed: true, health: 'PASS', registryStatus: 'live' });
    const r = provisioningRecord(f);
    expect(r.overall).toBe('COMPLETE');
    expect(r.nextAction).toBeNull();
    expect(by(provisioningRecord({ ...f, health: 'UNKNOWN' }), 'health').state).toBe('IN_PROGRESS');
  });

  it('commerce is not complete while there are no approved products, even if shipping is set up', () => {
    const shipOnly: StandupTask[] = [tk(3, 'done', 'team', 'Shiprocket account created')];
    expect(by(provisioningRecord(freshFacts({ tasks: shipOnly, approvedProducts: 0 })), 'commerce').state).toBe('IN_PROGRESS');
    expect(by(provisioningRecord(freshFacts({ tasks: shipOnly, approvedProducts: 3 })), 'commerce').state).toBe('COMPLETE');
  });

  it('observed facts override stale task bookkeeping: a database that exists is COMPLETE even though its task still reads pending', () => {
    const r = provisioningRecord(freshFacts({ observed: {
      database: { state: 'COMPLETE', detail: 'Supabase freshforpaws-os ACTIVE_HEALTHY; 11 tables, RLS on' },
      commerce: { state: 'IN_PROGRESS', detail: 'Woo connector deployed; hourly sync ok' },
    } }));
    expect(by(r, 'database')).toMatchObject({ state: 'COMPLETE', owner: null });
    expect(by(r, 'database').detail).toMatch(/^observed: /);
    expect(by(r, 'commerce')).toMatchObject({ state: 'IN_PROGRESS' });
    expect(by(r, 'repository').state).toBe('WAITING');
    expect(r.complete).toBe(8);
  });
});
