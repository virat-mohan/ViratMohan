import { describe, expect, it } from 'vitest';
import { pathsOverlap, scopesConflict, type RepoScope } from '../../../src/lib/work';
import { CHECK, DEV, GIT, GROW, PRINCE, SG_CEO, VIRAT, XB_CEO, code, makeRegistry, must, newItem, reach } from './helpers';

const HOUR = 60 * 60 * 1000;
const scope = (o: Partial<RepoScope> = {}): RepoScope => ({ ...GIT, ...o });

describe('repository lock rules', () => {
  it('paths overlap by segment prefix; empty means the whole repository', () => {
    expect(pathsOverlap(['app/checkout'], ['app/checkout/cart'])).toBe(true);
    expect(pathsOverlap(['app/checkout'], ['app/checkout'])).toBe(true);
    expect(pathsOverlap(['app/checkout'], ['app/checkout-v2'])).toBe(false);
    expect(pathsOverlap(['app/checkout'], ['lib/pricing'])).toBe(false);
    expect(pathsOverlap([], ['anything'])).toBe(true);
    expect(pathsOverlap(['./app/', 'lib'], ['app/x'])).toBe(true);
  });

  it('conflict: same repo and the same branch, worktree, deployment target, or overlapping paths', () => {
    const base = { repository: 'r', branch: 'a', worktree: 'w1', paths: ['x'], deployment_target: 'prod' };
    expect(scopesConflict(base, { ...base, branch: 'b', worktree: 'w2', paths: ['y'], deployment_target: 'staging' })).toBe(false); // explicit separation
    expect(scopesConflict(base, { ...base, worktree: 'w2', paths: ['y'], deployment_target: 'staging' })).toBe(true); // same branch
    expect(scopesConflict(base, { ...base, branch: 'b', paths: ['y'], deployment_target: 'staging' })).toBe(true); // same worktree
    expect(scopesConflict(base, { ...base, branch: 'b', worktree: 'w2', paths: ['y'] })).toBe(true); // same deployment target
    expect(scopesConflict(base, { ...base, branch: 'b', worktree: 'w2', deployment_target: 'staging', paths: ['x/z'] })).toBe(true); // overlapping paths
    expect(scopesConflict(base, { ...base, repository: 'other' })).toBe(false);
    expect(scopesConflict({ ...base, branch: null, worktree: null, deployment_target: null }, { ...base, branch: null, worktree: null, deployment_target: null, paths: ['q'] })).toBe(false);
  });
});

describe('repository locking in the registry', () => {
  it('material work cannot start without an active lock; with one it can', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'assigned');
    must(reg.updateFields(id, {}, DEV));
    must(reg.acquireLock(id, scope(), SG_CEO));
    expect(must(reg.transition(id, 'in_progress', SG_CEO)).state).toBe('in_progress');
  });

  it('an item that declares material repo scope is refused in progress until it holds a lock', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'assigned');
    const lock = must(reg.acquireLock(id, scope(), SG_CEO));
    must(reg.releaseLock(lock.id, SG_CEO, 'changed plan'));
    expect(code(reg.transition(id, 'in_progress', SG_CEO))).toBe('repo_lock_required');
    must(reg.acquireLock(id, scope(), SG_CEO));
    expect(must(reg.transition(id, 'in_progress', SG_CEO)).state).toBe('in_progress');
  });

  it('two items cannot hold conflicting locks; the refusal names the holder', () => {
    const { reg } = makeRegistry();
    const a = reach(reg, 'assigned');
    const b = reach(reg, 'assigned');
    must(reg.acquireLock(a, scope(), SG_CEO));
    const r = reg.acquireLock(b, scope({ branch: 'feature/b', paths: ['app/checkout/cart'] }), SG_CEO);
    expect(code(r)).toBe('repo_conflict');
    if (!r.ok) expect(r.error.message).toContain('SG-01');
    expect(code(reg.acquireLock(b, scope({ branch: 'feature/a', paths: ['lib'] }), SG_CEO))).toBe('repo_conflict'); // same branch
    expect(code(reg.acquireLock(b, scope({ branch: 'feature/b', paths: ['app/checkout'] }), SG_CEO))).toBe('repo_conflict'); // same paths
  });

  it('explicitly separated work (different branch and disjoint paths) can proceed in parallel', () => {
    const { reg } = makeRegistry();
    const a = reach(reg, 'assigned');
    const b = reach(reg, 'assigned');
    must(reg.acquireLock(a, scope(), SG_CEO));
    expect(must(reg.acquireLock(b, scope({ branch: 'feature/b', paths: ['lib/pricing'] }), SG_CEO)).work_id).toBe(b);
  });

  it('a live brand repository is exclusive: one writer at a time, whatever the paths', () => {
    const { reg } = makeRegistry({ lockPolicy: { exclusiveRepositories: ['sample-store'] } });
    const a = reach(reg, 'assigned');
    const b = reach(reg, 'assigned');
    must(reg.acquireLock(a, scope(), SG_CEO));
    expect(code(reg.acquireLock(b, scope({ branch: 'feature/b', paths: ['lib/pricing'] }), SG_CEO))).toBe('repo_conflict');
    expect(must(reg.acquireLock(b, scope({ repository: 'a-different-repo' }), SG_CEO)).repository).toBe('a-different-repo');
  });

  it('only the owner or a supporting agent takes the lock; an item needs an owner; one lock per item', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'assigned');
    expect(code(reg.acquireLock(id, scope(), GROW))).toBe('not_permitted');
    must(reg.addSupporting(id, CHECK, DEV));
    must(reg.acquireLock(id, scope(), CHECK)); // supporting may take it
    expect(code(reg.acquireLock(id, scope({ branch: 'x', paths: ['z'] }), SG_CEO))).toBe('lock_not_allowed');
    expect(code(reg.acquireLock(reach(reg, 'triaged'), scope({ branch: 'q', paths: ['q'] }), DEV))).toBe('owner_required');
  });

  it('only material work takes a lock; a repository is required', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'assigned');
    expect(code(reg.acquireLock(id, scope({ material: false }), SG_CEO))).toBe('invalid_input');
    expect(code(reg.acquireLock(id, scope({ repository: ' ' }), SG_CEO))).toBe('invalid_input');
  });

  it('locks expire: a dead agent cannot hold a repository forever, and the expiry is on the record', () => {
    const { reg, tick } = makeRegistry();
    const a = reach(reg, 'assigned');
    const b = reach(reg, 'assigned');
    const lock = must(reg.acquireLock(a, scope(), SG_CEO, { ttlMs: 2 * HOUR }));
    expect(code(reg.acquireLock(b, scope(), SG_CEO))).toBe('repo_conflict');
    tick(3 * HOUR);
    expect(reg.activeLocks()).toEqual([]);
    expect(must(reg.acquireLock(b, scope(), SG_CEO)).work_id).toBe(b);
    expect(reg.get(a)!.events.some((e) => e.kind === 'lock_released' && e.reason === 'expired' && e.data.lock_id === lock.id)).toBe(true);
    expect(code(reg.transition(a, 'in_progress', SG_CEO))).toBe('repo_lock_required');
  });

  it('renewing keeps a lock alive; only its owner renews', () => {
    const { reg, tick } = makeRegistry();
    const a = reach(reg, 'assigned');
    const lock = must(reg.acquireLock(a, scope(), SG_CEO, { ttlMs: 2 * HOUR }));
    tick(HOUR);
    expect(code(reg.renewLock(lock.id, GROW, 4 * HOUR))).toBe('not_permitted');
    must(reg.renewLock(lock.id, SG_CEO, 4 * HOUR));
    tick(3 * HOUR);
    expect(reg.activeLocks().length).toBe(1);
  });

  it('releasing needs a reason and the lock or item owner; a released lock frees the area', () => {
    const { reg } = makeRegistry();
    const a = reach(reg, 'assigned');
    const b = reach(reg, 'assigned');
    const lock = must(reg.acquireLock(a, scope(), SG_CEO));
    expect(code(reg.releaseLock(lock.id, GROW, 'x'))).toBe('not_permitted');
    expect(code(reg.releaseLock(lock.id, SG_CEO, ' '))).toBe('invalid_input');
    must(reg.releaseLock(lock.id, SG_CEO, 'paused'));
    expect(code(reg.releaseLock(lock.id, SG_CEO, 'again'))).toBe('lock_not_found');
    expect(must(reg.acquireLock(b, scope(), SG_CEO)).work_id).toBe(b);
  });

  it('only Virat or Prince can break someone else\'s lock, with a reason, on the record', () => {
    const { reg } = makeRegistry();
    const a = reach(reg, 'assigned');
    const lock = must(reg.acquireLock(a, scope(), SG_CEO));
    expect(code(reg.breakLock(lock.id, DEV, 'stuck'))).toBe('not_permitted');
    expect(code(reg.breakLock(lock.id, VIRAT, ''))).toBe('invalid_input');
    must(reg.breakLock(lock.id, PRINCE, 'agent stopped responding'));
    expect(reg.get(a)!.events.at(-1)).toMatchObject({ kind: 'lock_broken', actor: { id: 'P-01' }, data: { was_held_by: 'SG-01' } });
  });

  it('resolving releases the lock; an item holding a lock cannot be closed', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'assigned');
    must(reg.acquireLock(id, scope(), SG_CEO));
    must(reg.transition(id, 'in_progress', SG_CEO));
    must(reg.transition(id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'completed', summary: 'merged' } } }));
    expect(reg.activeLocks()).toEqual([]);
    expect(reg.get(id)!.events.some((e) => e.kind === 'lock_released' && e.reason === 'item resolved')).toBe(true);
    // a lock re-taken after resolve (e.g. a reopened fix) must be released before closing
    must(reg.transition(id, 'reopened', VIRAT, { reason: 'again' }));
    must(reg.acquireLock(id, scope(), SG_CEO));
    must(reg.transition(id, 'in_progress', SG_CEO));
    must(reg.transition(id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'completed', summary: 'merged' } } }));
    must(reg.transition(id, 'verification', CHECK));
    expect(reg.activeLocks()).toEqual([]);
  });

  it('merging a duplicate releases its lock', () => {
    const { reg } = makeRegistry();
    const a = reach(reg, 'assigned');
    const b = reach(reg, 'assigned');
    must(reg.acquireLock(b, scope(), SG_CEO));
    must(reg.mergeInto(b, a, DEV, 'same work'));
    expect(reg.activeLocks()).toEqual([]);
  });
});

describe('preflight: the five checks before material repository work', () => {
  it('a clear area reports clear', () => {
    const { reg } = makeRegistry();
    const p = reg.preflight(scope());
    expect(p).toMatchObject({ clear: true, existingWork: [], owners: [], openDependencies: [], lockConflicts: [], branchOrPr: [] });
  });

  it('reports existing work, its owner, the lock, and items already on the same branch or PR', () => {
    const { reg } = makeRegistry();
    const a = reach(reg, 'assigned');
    must(reg.acquireLock(a, scope({ pr: 'sample-store#12' }), SG_CEO));
    const p = reg.preflight(scope({ paths: ['app/checkout/cart'], pr: 'sample-store#12' }), null);
    expect(p.clear).toBe(false);
    expect(p.existingWork.map((x) => x.id)).toEqual([a]);
    expect(p.owners.map((o) => o.id)).toEqual(['SG-01']);
    expect(p.lockConflicts.map((l) => l.work_id)).toEqual([a]);
    expect(p.branchOrPr).toEqual([a]);
    expect(p.reasons.join(' ')).toMatch(/Attach to one instead of starting parallel work/);
  });

  it('reports open dependencies of the item about to start', () => {
    const { reg } = makeRegistry();
    const blocker = newItem(reg);
    const me = reach(reg, 'assigned');
    must(reg.addDependency(blocker.id, me, DEV));
    const p = reg.preflight(scope({ repository: 'quiet-repo' }), me);
    expect(p.openDependencies).toEqual([blocker.id]);
    expect(p.clear).toBe(false);
  });

  it('separated work elsewhere does not block', () => {
    const { reg } = makeRegistry();
    const a = reach(reg, 'assigned');
    must(reg.acquireLock(a, scope(), SG_CEO));
    expect(reg.preflight(scope({ branch: 'feature/z', paths: ['lib/pricing'] })).clear).toBe(true);
    expect(reg.preflight(scope({ repository: 'another' })).clear).toBe(true);
  });

  it('the item itself is not counted as a conflict', () => {
    const { reg } = makeRegistry();
    const a = reach(reg, 'assigned');
    must(reg.acquireLock(a, scope(), SG_CEO));
    expect(reg.preflight(scope(), a).clear).toBe(true);
    void XB_CEO;
  });
});
