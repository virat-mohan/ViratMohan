// Shared test helpers for the Work Registry. Everything here is synthetic.
import { InMemoryWorkRegistry, Scopes, type Actor, type NewWorkInput, type RegistryOptions, type RepoScope, type WorkState } from '../../../src/lib/work';

/** Org ids come from case-study/ORG-SOP.md. SG-01 and XB-01 are SYNTHETIC brand CEOs; the brands "sample" and "other" are synthetic. */
export const VIRAT: Actor = { kind: 'human', id: 'DS-00' };
export const PRINCE: Actor = { kind: 'human', id: 'P-01' };
export const DEV: Actor = { kind: 'agent', id: 'DS-02' };
export const CHECK: Actor = { kind: 'agent', id: 'DS-10' };
export const GROW: Actor = { kind: 'agent', id: 'DS-11' };
export const BOOKS: Actor = { kind: 'agent', id: 'DS-13' };
export const CARE: Actor = { kind: 'agent', id: 'DS-14' };
export const CREW: Actor = { kind: 'agent', id: 'DS-15' };
export const SG_CEO: Actor = { kind: 'agent', id: 'SG-01' };
export const XB_CEO: Actor = { kind: 'agent', id: 'XB-01' };
export const FOUNDER: Actor = { kind: 'external', id: 'external:founder:sample' };
export const OTHER_FOUNDER: Actor = { kind: 'external', id: 'external:founder:other' };
export const KHIWANI: Actor = { kind: 'external', id: 'external:khiwani' };
export const LEGAL: Actor = { kind: 'external', id: 'external:legal' };
export const HEALTH: Actor = { kind: 'system', id: 'system:health-check' };

const DIRECTORY: Record<string, 'agent' | 'human'> = {
  'DS-00': 'human', 'P-01': 'human', 'DS-01': 'agent', 'DS-02': 'agent', 'DS-10': 'agent', 'DS-11': 'agent', 'DS-12': 'agent',
  'DS-13': 'agent', 'DS-14': 'agent', 'DS-15': 'agent', 'SG-01': 'agent', 'XB-01': 'agent',
};

export function makeRegistry(over: RegistryOptions = {}) {
  let t = Date.UTC(2026, 9, 5, 3, 0, 0);
  let n = 0;
  const reg = new InMemoryWorkRegistry({
    now: () => new Date(t).toISOString(),
    newId: () => `id-${String(++n).padStart(4, '0')}`,
    directory: { kindOf: (id) => DIRECTORY[id] ?? null },
    knownBrands: new Set(['sample', 'other']),
    ...over,
  });
  return { reg, tick: (ms: number) => { t += ms; }, clock: () => new Date(t).toISOString() };
}
export type Reg = ReturnType<typeof makeRegistry>['reg'];

export const must = <T>(r: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}: ${r.error.message}`);
  return r.value;
};
export const code = (r: { ok: boolean; error?: { code: string } }): string | undefined => (r.ok ? undefined : r.error?.code);

export function newItem(reg: Reg, over: Partial<NewWorkInput> = {}, by: Actor = DEV) {
  return must(reg.createItem({ type: 'task', title: 'Synthetic work', description: 'Synthetic description', scope: Scopes.brand('sample'), ...over }, by));
}

export const GIT: RepoScope = { repository: 'sample-store', branch: 'feature/a', worktree: null, paths: ['app/checkout'], deployment_target: null, pr: null, material: true };

/** Drive a fresh item to `state` by legal moves. Returns its id. */
export function reach(reg: Reg, state: WorkState, over: Partial<NewWorkInput> = {}): string {
  const it = newItem(reg, over);
  const id = it.id;
  if (state === 'new') return id;
  must(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P3' } } }));
  if (state === 'triaged') return id;
  must(reg.transition(id, 'assigned', DEV, { payload: { owner: SG_CEO } }));
  if (state === 'assigned') return id;
  must(reg.transition(id, 'in_progress', SG_CEO));
  if (state === 'in_progress') return id;
  if (state === 'waiting') { must(reg.transition(id, 'waiting', SG_CEO, { payload: { waiting: { on: 'supplier' } } })); return id; }
  if (state === 'blocked') { must(reg.transition(id, 'blocked', SG_CEO, { payload: { blocked: { reason: 'needs vendor' } } })); return id; }
  if (state === 'pending_approval') {
    const ev = must(reg.addEvidence(id, { kind: 'note', ref: 'note:1', summary: 'context' }, SG_CEO));
    must(reg.requestApproval(id, { requested_from: 'virat', authority: 'pricing', reason: 'price change', evidence_ids: [ev.id], recommendation: 'approve' }, SG_CEO));
    return id;
  }
  must(reg.transition(id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'completed', summary: 'done' } } }));
  if (state === 'resolved') return id;
  must(reg.transition(id, 'verification', CHECK));
  if (state === 'verification') return id;
  must(reg.transition(id, 'closed', CHECK, { payload: { closure: { method: 'checked the result', evidence: [{ kind: 'note', ref: 'note:verified', summary: 'verified' }] } } }));
  if (state === 'closed') return id;
  must(reg.transition(id, 'reopened', VIRAT, { reason: 'came back' }));
  return id; // reopened
}
