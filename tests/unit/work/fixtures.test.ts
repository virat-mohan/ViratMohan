import { describe, expect, it } from 'vitest';
import { makeRegistry, must } from './helpers';
import { fixtureA, fixtureB, fixtureC, fixtureD, fixtureE, fixtureF, fixtureG } from './fixtures';

const chainsHold = (reg: ReturnType<typeof makeRegistry>['reg']) => {
  for (const it of reg.list()) expect(must(reg.verifyAudit(it.id)), `${it.ref} audit chain`).toEqual({ ok: true });
};

describe('synthetic fixtures (examples, not live tickets)', () => {
  it('A. a brand founder request runs the whole lifecycle with a brand-CEO owner and specialist subtasks', () => {
    const { reg } = makeRegistry();
    const f = fixtureA(reg);
    const it = reg.get(f.id)!;
    expect(it).toMatchObject({ state: 'closed', type: 'request', priority: 'P3', owner: { id: 'SG-01' }, source: { channel: 'command_centre', requester: { id: 'external:founder:sample' } } });
    expect(it.scope).toMatchObject({ kind: 'brand', brand: 'sample' });
    expect(reg.get(f.copy)!.owner?.id).toBe('DS-11');
    expect(reg.get(f.template)!.owner?.id).toBe('DS-02');
    expect(reg.children(f.id).every((c) => c.state === 'closed' && c.level === 'subtask')).toBe(true);
    expect(it.closure?.verified_by.id).toBe('DS-10');
    chainsHold(reg);
  });

  it('B. a critical incident: alert deduped with an agent detection, exclusive lock, evidence, verification by someone else, learning and prevention', () => {
    const { reg } = makeRegistry({ lockPolicy: { exclusiveRepositories: ['sample-store'] } });
    const f = fixtureB(reg);
    const it = reg.get(f.id)!;
    expect(it).toMatchObject({ state: 'closed', type: 'incident', priority: 'P0', owner: { id: 'SG-01' } });
    expect(it.supporting.map((a) => a.id).sort()).toEqual(['DS-02', 'DS-10']);
    expect(f.deduped).toBe('attached');
    expect(it.source_event_ids.length).toBe(2);
    expect(f.preflightClear).toBe(true);
    expect(f.conflict).toBe('repo_conflict'); // the second writer on a live repo was refused
    expect(reg.activeLocks()).toEqual([]);
    expect(it.closure?.verified_by.id).toBe('DS-10');
    expect(it.resolution?.by.id).toBe('SG-01');
    expect(it.incident).toMatchObject({ diagnosis: expect.any(String), result: expect.any(String), cost: { basis: 'unknown' }, revenue_impact: { basis: 'unknown' } });
    expect(it.incident!.tests[0].result).toBe('pass');
    expect(it.incident!.prevention[0].work_id).toBe(f.followUp);
    expect(it.learning?.rule_added).toBe(true);
    expect(it.evidence.map((e) => e.kind)).toEqual(expect.arrayContaining(['log', 'deploy', 'metric']));
    expect(reg.actionsOf(f.id).length).toBe(1);
    chainsHold(reg);
  });

  it('C. a finance clarification: lateral to Books, human escalation to the accountants with full capture, Virat approves what is sent', () => {
    const { reg } = makeRegistry();
    const f = fixtureC(reg);
    const it = reg.get(f.id)!;
    expect(it).toMatchObject({ state: 'closed', owner: { id: 'DS-13' } });
    expect(it.supporting.map((a) => a.id)).toEqual(['DS-14']);
    expect(f.waitingOn).toBe('Khiwani & Co.');
    expect(it.escalations.map((e) => e.kind)).toEqual(['lateral', 'human']);
    const human = it.escalations[1];
    if (human.kind === 'human') expect(Object.keys(human)).toEqual(expect.arrayContaining(['what_happened', 'evidence_ids', 'impact', 'risk', 'tried', 'decision_required', 'recommended_action', 'owner']));
    expect(f.approvedBy).toBe('DS-00');
    expect(it.approval).toMatchObject({ authority: 'outbound_comms', decision: { outcome: 'approved' } });
    chainsHold(reg);
  });

  it('D. an agent-generated improvement sits in the backlog under an initiative and an objective', () => {
    const { reg } = makeRegistry();
    const f = fixtureD(reg);
    const item = reg.get(f.item)!;
    expect(item).toMatchObject({ state: 'triaged', priority: 'P4', type: 'improvement', level: 'work_item', parent_id: f.initiative, source: { channel: 'agent_detection', requester: { id: 'DS-10' } } });
    expect(reg.get(f.initiative)).toMatchObject({ level: 'initiative', parent_id: f.objective });
    expect(reg.get(f.objective)).toMatchObject({ level: 'objective', parent_id: null });
    expect(reg.get(f.sub)).toMatchObject({ level: 'subtask', parent_id: f.item });
    expect(item.observers.map((o) => o.id)).toEqual(['DS-00']);
    expect(item.owner).toBeNull(); // nobody owns backlog work until it is assigned
    expect(reg.actionsOf(f.item).length).toBe(1);
    chainsHold(reg);
  });

  it('E. a duplicate request from two channels ends as ONE canonical item; a later message on the duplicate\'s thread joins it', () => {
    const { reg } = makeRegistry();
    const f = fixtureE(reg);
    expect(f.secondOutcome).toBe('possible_duplicate');
    expect(f.thirdOutcome).toBe('attached');
    expect(f.thirdItem).toBe(f.canonical);
    expect(reg.list({ openOnly: true }).map((i) => i.id)).toEqual([f.canonical]);
    expect(reg.sourceEventsOf(f.canonical).map((e) => e.channel)).toEqual(['command_centre', 'whatsapp', 'whatsapp']);
    expect(reg.get(f.duplicate)).toMatchObject({ state: 'closed', merged_into: f.canonical, resolution: { kind: 'duplicate' } });
    chainsHold(reg);
  });

  it('F. work needing Virat: an agent cannot approve, Virat can; Prince is assigned only by Virat', () => {
    const { reg } = makeRegistry();
    const f = fixtureF(reg);
    expect(f.agentTry).toBe('approval_not_allowed');
    expect(f.outcome).toBe('approved');
    expect(reg.get(f.id)).toMatchObject({ state: 'in_progress', approval: { authority: 'pricing', requested_from: 'virat', decision: { by: { id: 'DS-00' } } } });
    expect(f.devTry).toBe('prince_requires_virat');
    expect(f.owner).toBe('P-01');
    expect(reg.get(f.deploy)!.events.filter((e) => e.kind === 'state_change').at(-1)!.actor.id).toBe('DS-00');
    chainsHold(reg);
  });

  it('G. work blocked by another work item cannot resume until it closes; the blocker carries the dependency\'s priority; cycles are refused', () => {
    const { reg } = makeRegistry();
    const f = fixtureG(reg);
    expect(f.cycle).toBe('invalid_input');
    expect(f.early).toBe('still_blocked');
    expect(f.blockedBy).toEqual([f.y]);
    expect(reg.get(f.y)).toMatchObject({ state: 'closed', priority: 'P1' });
    expect(f.resumedState).toBe('in_progress');
    expect(f.blockedField).toBeNull();
    chainsHold(reg);
  });

  it('all seven live side by side in one registry without interfering', () => {
    const { reg } = makeRegistry({ lockPolicy: { exclusiveRepositories: ['sample-store'] } });
    fixtureA(reg); fixtureB(reg); fixtureC(reg); fixtureD(reg); fixtureE(reg); fixtureF(reg); fixtureG(reg);
    expect(reg.list().length).toBeGreaterThan(15);
    chainsHold(reg);
    expect(reg.activeLocks()).toEqual([]);
  });
});
