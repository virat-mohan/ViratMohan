// Phase 4: Parallel work operational — collision detection and ownership visibility
import { describe, it, expect } from 'vitest';
import { InMemoryWorkRegistry } from '../../../src/lib/work/registry';
import { VIRAT } from '../../../src/lib/work/actors';
import { Scopes } from '../../../src/lib/work/scope';
import { CEO } from '../../../src/lib/ceo/types';
import { checkCollisions, ownershipSummary, repoWorkStatus } from '../../../src/lib/ceo/parallel-work';
import { REPO_ESTATE, repoForBrand, reposByGroup, liveRepos, activeRepos, ACTIVE_CLIENTS } from '../../../src/lib/ceo/estate-registry';

describe('Estate registry', () => {
  it('has 12 repositories', () => {
    expect(REPO_ESTATE.length).toBe(12);
  });

  it('groups repos by business function', () => {
    const g = reposByGroup();
    expect(g.get('platform')?.length).toBeGreaterThanOrEqual(2);
    expect(g.get('live')?.length).toBeGreaterThanOrEqual(3);
  });

  it('finds the repo for a brand key', () => {
    expect(repoForBrand('moonglasses')?.slug).toBe('moon-glasses');
    expect(repoForBrand('caps')?.slug).toBe('Travaholic_caps');
    expect(repoForBrand('korbi')?.slug).toBe('korbi');
  });

  it('lists live repos', () => {
    const live = liveRepos();
    expect(live.length).toBe(3);
    expect(live.map(r => r.brand).sort()).toEqual(['caps', 'korbi', 'moonglasses']);
  });

  it('has 5 active clients', () => {
    expect(ACTIVE_CLIENTS.length).toBe(5);
    expect(ACTIVE_CLIENTS.find(c => c.brandKey === 'freshforpaws')?.technical).toBe('Provisioning');
  });
});

describe('Collision detection', () => {
  it('detects repo overlap when another work item is in progress', () => {
    const r = new InMemoryWorkRegistry();
    const item = r.createItem({ title: 'Update Moon products', description: '', type: 'task', level: 'work_item', scope: Scopes.brand('moonglasses') }, CEO);
    expect(item.ok).toBe(true);
    if (!item.ok) return;
    r.transition(item.value.id, 'triaged', CEO, { payload: { triage: { type: 'task', priority: 'P2', priority_reason: 'maintenance', scope: Scopes.brand('moonglasses') } } });
    r.transition(item.value.id, 'assigned', CEO, { payload: { owner: CEO } });
    r.transition(item.value.id, 'in_progress', CEO);

    const check = checkCollisions(r, 'moonglasses', 'moon-glasses', null);
    expect(check.ok).toBe(false);
    expect(check.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(check.conflicts.some(c => c.kind === 'repo_overlap' && c.severity === 'blocking')).toBe(true);
  });

  it('warns on brand overlap', () => {
    const r = new InMemoryWorkRegistry();
    const item = r.createItem({ title: 'Moon task', description: '', type: 'task', level: 'work_item', scope: Scopes.brand('moonglasses') }, CEO);
    expect(item.ok).toBe(true);
    if (!item.ok) return;
    r.transition(item.value.id, 'triaged', CEO, { payload: { triage: { type: 'task', priority: 'P3', priority_reason: 'test', scope: Scopes.brand('moonglasses') } } });
    r.transition(item.value.id, 'assigned', CEO, { payload: { owner: CEO } });
    r.transition(item.value.id, 'in_progress', CEO);

    const check = checkCollisions(r, 'moonglasses', null, null);
    expect(check.conflicts.some(c => c.kind === 'brand_overlap')).toBe(true);
  });

  it('passes when no conflicts', () => {
    const r = new InMemoryWorkRegistry();
    const check = checkCollisions(r, 'moonglasses', 'moon-glasses', null);
    expect(check.ok).toBe(true);
    expect(check.conflicts.length).toBe(0);
  });
});

describe('Ownership summary', () => {
  it('returns empty when no work exists', () => {
    const r = new InMemoryWorkRegistry();
    expect(ownershipSummary(r).length).toBe(0);
  });

  it('shows ownership across agents', () => {
    const r = new InMemoryWorkRegistry();
    r.createItem({ title: 'Moon task', description: '', type: 'task', level: 'work_item', scope: Scopes.brand('moonglasses') }, CEO);
    r.createItem({ title: 'Trav task', description: '', type: 'task', level: 'work_item', scope: Scopes.brand('caps') }, CEO);
    const items = r.list();
    r.transition(items[0].id, 'triaged', CEO, { payload: { triage: { type: 'task', priority: 'P3', priority_reason: 'test', scope: Scopes.brand('moonglasses') } } });
    r.transition(items[0].id, 'assigned', CEO, { payload: { owner: { kind: 'agent', id: 'MG-01' } } });

    const summary = ownershipSummary(r);
    expect(summary.some(s => s.agentId === 'MG-01')).toBe(true);
  });
});

describe('Repo work status', () => {
  it('shows work per branded repo', () => {
    const r = new InMemoryWorkRegistry();
    r.createItem({ title: 'Moon task', description: '', type: 'task', level: 'work_item', scope: Scopes.brand('moonglasses') }, CEO);
    const status = repoWorkStatus(r);
    const moon = status.find(s => s.repo.slug === 'moon-glasses');
    expect(moon).toBeDefined();
    expect(moon!.openItems).toBe(1);
  });
});
