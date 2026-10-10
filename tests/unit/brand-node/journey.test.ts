import { describe, expect, it } from 'vitest';
import { currentStage, evaluateJourney, JOURNEY_STAGES, provisioningRecord, sevenDay, type DatedTask, type JourneyFacts } from '../../../src/lib/brand-node';

const nothing: JourneyFacts = { leadStage: null, applied: false, registryRow: false, provisioning: null, foundation: null, approvedProducts: null, agentId: null, dashboardDeployed: null, health: null, firstActionDone: false, mondayResultProduced: false };
const st = (stages: ReturnType<typeof evaluateJourney>, id: string) => stages.find((s) => s.id === id)!;

describe('self-serve journey', () => {
  it('has the 15 stages from discovery to the first Monday result, in order', () => {
    expect(JOURNEY_STAGES.map((s) => s.id)).toEqual(['DISCOVER', 'APPLICATION', 'QUALIFICATION', 'COMMERCIAL', 'PAYMENT_DEPOSIT', 'BRAND_CREATED', 'PROVISIONING', 'FOUNDATION', 'CATALOGUE', 'BRAND_PLANE', 'DASHBOARD', 'BRAND_CEO', 'HEALTH', 'FIRST_OPERATING_ACTION', 'MONDAY_RESULT']);
  });

  it('with no facts nothing is complete and the first open stage is Discover', () => {
    const s = evaluateJourney(nothing);
    expect(s.every((x) => x.state !== 'COMPLETE')).toBe(true);
    expect(currentStage(s)?.id).toBe('DISCOVER');
    expect(st(s, 'APPLICATION').waitingOn).toBe('Discover');
  });

  it('does not claim a stage is implemented where the evidence says it is not', () => {
    const partial = JOURNEY_STAGES.filter((s) => s.implemented !== 'yes').map((s) => s.id);
    for (const id of ['BRAND_CREATED', 'PROVISIONING', 'BRAND_PLANE', 'DASHBOARD', 'BRAND_CEO', 'HEALTH', 'FIRST_OPERATING_ACTION', 'MONDAY_RESULT']) expect(partial, id).toContain(id);
    for (const s of JOURNEY_STAGES) expect(s.evidence.length, s.id).toBeGreaterThan(10);
  });

  it('every stage that needs a person names who, and no stage is silently automatic when it needs a login or an approval', () => {
    for (const id of ['QUALIFICATION', 'COMMERCIAL', 'PAYMENT_DEPOSIT', 'BRAND_CREATED', 'PROVISIONING', 'BRAND_CEO']) expect(JOURNEY_STAGES.find((s) => s.id === id)!.mode, id).toBe('WAITING_FOR_HUMAN');
    expect(JOURNEY_STAGES.find((s) => s.id === 'BRAND_PLANE')!.mode).toBe('SETUP_REQUIRED');
  });

  it('a failing health reading is FAILED, an unknown one is not complete', () => {
    expect(st(evaluateJourney({ ...nothing, health: 'FAIL' }), 'HEALTH').state).toBe('FAILED');
    expect(st(evaluateJourney({ ...nothing, health: 'UNKNOWN' }), 'HEALTH').state).toBe('AUTO');
    expect(st(evaluateJourney({ ...nothing, health: 'PASS' }), 'HEALTH').state).toBe('COMPLETE');
  });

  it('a blocked provisioning component blocks the provisioning stage and says so', () => {
    const prov = provisioningRecord({
      brandKey: 'x', clientName: 'X', agreementSigned: true, depositPaid: true, registryStatus: 'building', foundation: null, approvedProducts: 0, agentId: null, dashboardDeployed: false, health: null, workId: null,
      tasks: [{ stage: 1, status: 'blocked', owner: 'team', task: 'Supabase project created', note: 'creation timed out', priority: 1, sort: 1 }],
    });
    expect(st(evaluateJourney({ ...nothing, provisioning: prov }), 'PROVISIONING').state).toBe('BLOCKED');
  });
});

describe('the 7 day promise', () => {
  const task = (stage: number, status: string, owner: string, dueOn: string, extra: Partial<DatedTask> = {}): DatedTask => ({ stage, status, owner, task: `t${stage}`, due_on: dueOn, priority: 2, sort: stage, ...extra });
  const start = '2026-09-30';
  const at = (ymd: string) => new Date(`${ymd}T06:00:00Z`);

  it('day 1 with nothing late is ON_TRACK', () => {
    const r = sevenDay([task(1, 'todo', 'team', '2026-09-30'), task(9, 'todo', 'team', '2026-10-06')], start, at('2026-09-30'), false);
    expect(r).toMatchObject({ status: 'ON_TRACK', dayNumber: 0, daysLeft: 7, risks: [] });
  });

  it('an open task past its due date is AT_RISK, names its owner, and counts the later tasks waiting behind it', () => {
    const r = sevenDay([task(1, 'todo', 'founder', '2026-10-01'), task(2, 'todo', 'team', '2026-10-02'), task(3, 'todo', 'team', '2026-10-03')], start, at('2026-10-03'), false);
    expect(r.status).toBe('AT_RISK');
    expect(r.risks[0]).toMatchObject({ owner: 'founder', daysLate: 2 });
    expect(r.laterTasksWaiting).toBeGreaterThan(0);
  });

  it('on the last day, open setup before go-live is AT_RISK even when no task has a due date (Fresh For Paws on 7 Oct 2026)', () => {
    const undated = (stage: number, status: string, owner: string): DatedTask => ({ stage, status, owner, task: `fresh-s${stage}`, due_on: null, priority: 3, sort: stage });
    const r = sevenDay([undated(0, 'done', 'team'), undated(1, 'pending', 'team'), undated(1, 'todo', 'founder'), undated(9, 'na', 'brand')], '2026-09-30', new Date('2026-10-07T06:00:00Z'), false);
    expect(r).toMatchObject({ status: 'AT_RISK', dayNumber: 7, daysLeft: 0 });
    expect(r.risks[0].reason).toMatch(/still open before the go-live review/);
  });

  it('on day 2 the same open setup is not yet a risk', () => {
    const t: DatedTask = { stage: 1, status: 'todo', owner: 'team', task: 's1', due_on: null, priority: 2, sort: 1 };
    expect(sevenDay([t], '2026-09-30', new Date('2026-10-02T06:00:00Z'), false).status).toBe('ON_TRACK');
  });

  it('a blocked task is BLOCKED with the reason', () => {
    const r = sevenDay([task(1, 'blocked', 'team', '2026-10-01', { note: 'Supabase project creation timed out' })], start, at('2026-10-01'), false);
    expect(r.status).toBe('BLOCKED');
    expect(r.risks[0].reason).toBe('Supabase project creation timed out');
  });

  it('all tasks done, or live, is COMPLETE; not applicable tasks are ignored', () => {
    expect(sevenDay([task(1, 'done', 'team', '2026-10-01'), task(2, 'na', 'brand', '2026-10-01')], start, at('2026-10-04'), false).status).toBe('COMPLETE');
    expect(sevenDay([task(1, 'todo', 'team', '2026-10-01')], start, at('2026-10-09'), true).status).toBe('COMPLETE');
  });

  it('past day 7 and not live is AT_RISK even if no single task is late', () => {
    const r = sevenDay([task(9, 'todo', 'team', '2026-10-20')], start, at('2026-10-09'), false);
    expect(r.status).toBe('AT_RISK');
    expect(r.risks.some((x) => x.task === 'the 7 day promise')).toBe(true);
  });

  it('a running clock with no setup tasks is AT_RISK: the build was never assigned', () => {
    const r = sevenDay([], start, at('2026-10-02'), false);
    expect(r.status).toBe('AT_RISK');
    expect(r.risks[0].reason).toMatch(/never assigned/);
    expect(sevenDay([], start, at('2026-09-30'), false).status).toBe('ON_TRACK');
  });
});
