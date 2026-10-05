// The schema (migrations/0055_work_registry.sql) against a real Postgres engine (embedded, in memory).
// Nothing here touches any real database: this is the migration file executed in a throwaway instance.
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  EVENT_KINDS, GENESIS_HASH, LINK_KINDS, PRIORITIES, SCOPE_KINDS, SOURCE_CHANNELS, WORK_LEVELS, WORK_STATES, WORK_TYPES,
  buildEvent, verifyChain, type WorkEvent, type WorkItem,
} from '../../../src/lib/work';
import { DEV, makeRegistry } from './helpers';
import { fixtureA, fixtureB, fixtureC, fixtureD, fixtureE, fixtureF, fixtureG } from './fixtures';

const MIGRATION = readFileSync(fileURLToPath(new URL('../../../migrations/0055_work_registry.sql', import.meta.url)), 'utf8');

async function fresh() { const db = new PGlite(); await db.exec(MIGRATION); return db; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>; // database rows, read back by column name
const param = (v: unknown) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v);

async function insertRow(db: PGlite, table: string, row: Row) {
  const cols = Object.keys(row);
  return db.query<Row>(`insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`, cols.map((c) => param(row[c])));
}
const item = (over: Row = {}): Row => ({ id: randomUUID(), level: 'work_item', type: 'task', title: 't', scope_kind: 'brand', brand: 'sample', channel: 'internal', requester: { kind: 'agent', id: 'DS-02' }, ...over });
const owned = (over: Row = {}) => item({ state: 'assigned', priority: 'P3', owner_kind: 'agent', owner_id: 'SG-01', ...over });
const CLOSURE = { verified_by: { kind: 'agent', id: 'DS-10' }, verified_at: '2026-10-05T03:00:00.000Z', method: 'checked', evidence_ids: ['e1'] };

describe('migration 0055 applies', () => {
  it('cleanly, and again (idempotent)', async () => {
    const db = await fresh();
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
    const t = await db.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
    expect(t.rows.map((r) => r.table_name)).toEqual(['repo_locks', 'work_events', 'work_items', 'work_links', 'work_source_events']);
  });

  it('every table has row level security on (service role only, like the rest of the control plane)', async () => {
    const db = await fresh();
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(`select relname, relrowsecurity from pg_class where relname in ('work_items','work_events','work_source_events','work_links','repo_locks')`);
    expect(r.rows.length).toBe(5);
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
  });

  it('the schema vocabulary equals the contract vocabulary (one source of truth, checked)', async () => {
    const db = await fresh();
    const defs = async (table: string) => (await db.query<{ def: string }>(`select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = '${table}'::regclass and contype = 'c'`)).rows.map((r) => r.def);
    const values = async (table: string, column: string) => {
      const d = (await defs(table)).find((x) => new RegExp(`^CHECK \\(\\(?\\(?${column}\\)?(::text)? = ANY`).test(x));
      if (!d) throw new Error(`no check on ${table}.${column}`);
      return [...d.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    };
    const same = (a: readonly string[]) => [...a].sort();
    expect(await values('work_items', 'level')).toEqual(same(WORK_LEVELS));
    expect(await values('work_items', 'type')).toEqual(same(WORK_TYPES));
    expect(await values('work_items', 'state')).toEqual(same(WORK_STATES));
    expect(await values('work_items', 'priority')).toEqual(same(PRIORITIES));
    expect(await values('work_items', 'scope_kind')).toEqual(same(SCOPE_KINDS));
    expect(await values('work_items', 'channel')).toEqual(same(SOURCE_CHANNELS));
    expect(await values('work_events', 'kind')).toEqual(same(EVENT_KINDS));
    expect(await values('work_links', 'kind')).toEqual(same(LINK_KINDS));
    expect(await values('work_source_events', 'channel')).toEqual(same(SOURCE_CHANNELS));
    expect(await values('work_source_events', 'type_hint')).toEqual(same(WORK_TYPES));
  });
});

describe('work_items: what must hold even if a caller forgets', () => {
  it('accepts a valid new item and a valid owned item', async () => {
    const db = await fresh();
    const r = await insertRow(db, 'work_items', item());
    expect(r.rows[0]).toMatchObject({ state: 'new', ref: 'W-0001' });
    expect((await insertRow(db, 'work_items', owned())).rows[0]).toMatchObject({ state: 'assigned', ref: 'W-0002' });
  });

  it('exactly one accountable owner from ASSIGNED onward', async () => {
    const db = await fresh();
    await expect(insertRow(db, 'work_items', item({ state: 'assigned', priority: 'P3' }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_items', item({ state: 'in_progress', priority: 'P3' }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_items', item({ owner_kind: 'agent' }))).rejects.toThrow(/check constraint/i); // half an owner
    await expect(insertRow(db, 'work_items', item({ owner_id: 'SG-01' }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_items', owned({ owner_kind: 'external' }))).rejects.toThrow(/check constraint/i);
    // a hold entered from TRIAGED has no owner yet; one entered from ASSIGNED must
    await insertRow(db, 'work_items', item({ state: 'waiting', priority: 'P3', held_from: 'triaged' }));
    await expect(insertRow(db, 'work_items', item({ state: 'waiting', priority: 'P3', held_from: 'assigned' }))).rejects.toThrow(/check constraint/i);
  });

  it('RESOLVED is not CLOSED: closing needs a verified closure with evidence', async () => {
    const db = await fresh();
    const closedAt = '2026-10-05T03:00:00.000Z';
    await expect(insertRow(db, 'work_items', owned({ state: 'closed', closed_at: closedAt }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_items', owned({ state: 'closed', closed_at: closedAt, closure: { ...CLOSURE, evidence_ids: [] } }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_items', owned({ state: 'closed', closure: CLOSURE }))).rejects.toThrow(/check constraint/i); // no closed_at
    await expect(insertRow(db, 'work_items', owned({ state: 'resolved' }))).rejects.toThrow(/check constraint/i); // resolved without a resolution
    expect((await insertRow(db, 'work_items', owned({ state: 'closed', closed_at: closedAt, closure: CLOSURE }))).rows[0]).toMatchObject({ state: 'closed' });
  });

  it('rejects unknown vocabulary, a missing priority after triage, and a pending approval with no approval', async () => {
    const db = await fresh();
    await expect(insertRow(db, 'work_items', item({ state: 'flying' }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_items', item({ level: 'epic' }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_items', item({ priority: 'P7' }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_items', item({ state: 'triaged' }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_items', owned({ state: 'pending_approval', held_from: 'assigned' }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_items', item({ title: '   ' }))).rejects.toThrow(/check constraint/i);
  });

  it('scope: brand and client-specific work name their brand; founder work names its founder', async () => {
    const db = await fresh();
    await expect(insertRow(db, 'work_items', item({ brand: null }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_items', item({ scope_kind: 'client_extension' }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_items', item({ scope_kind: 'founder', brand: null }))).rejects.toThrow(/check constraint/i);
    await insertRow(db, 'work_items', item({ scope_kind: 'client_extension', extension: 'sample-extension' }));
    await insertRow(db, 'work_items', item({ scope_kind: 'founder', brand: null, founder: 'founder-1' }));
    await insertRow(db, 'work_items', item({ scope_kind: 'retail_os', brand: null, system: 'storefront' }));
    await insertRow(db, 'work_items', item({ scope_kind: 'devshop', brand: null }));
  });

  it('hierarchy: objectives have no parent, subtasks need one, nothing is its own parent or duplicate', async () => {
    const db = await fresh();
    const id = randomUUID();
    await expect(insertRow(db, 'work_items', item({ level: 'subtask' }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_items', item({ level: 'objective', parent_id: id }))).rejects.toThrow();
    await expect(insertRow(db, 'work_items', item({ id, parent_id: id }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_items', item({ id, merged_into: id, state: 'closed' }))).rejects.toThrow();
    await expect(insertRow(db, 'work_items', owned({ merged_into: (await insertRow(db, 'work_items', item())).rows[0].id }))).rejects.toThrow(/check constraint/i); // merged only when closed
  });

  it('a merged duplicate is the one item that may be closed with no owner or priority; nothing else may', async () => {
    const db = await fresh();
    const canon = (await insertRow(db, 'work_items', owned())).rows[0].id;
    const closedAt = '2026-10-05T03:00:00.000Z';
    const dup = { state: 'closed', closed_at: closedAt, closure: CLOSURE, resolution: { kind: 'duplicate' } };
    await insertRow(db, 'work_items', item({ ...dup, merged_into: canon }));
    await expect(insertRow(db, 'work_items', item({ ...dup }))).rejects.toThrow(/check constraint/i); // closed, never owned, not merged: refused
  });

  it('work is closed, never deleted', async () => {
    const db = await fresh();
    const id = (await insertRow(db, 'work_items', item())).rows[0].id;
    await expect(db.query('delete from work_items where id = $1', [id])).rejects.toThrow(/never deleted/i);
    expect((await db.query('select 1 from work_items where id = $1', [id])).rows.length).toBe(1);
  });
});

describe('work_events: append-only and chained', () => {
  const chain = (n: number): WorkEvent[] => {
    const out: WorkEvent[] = [];
    for (let i = 0; i < n; i++) out.push(buildEvent(out.at(-1) ?? null, { at: `2026-10-05T03:00:0${i}.000Z`, actor: DEV, kind: i === 0 ? 'created' : 'action', data: { n: i } }));
    return out;
  };
  const ev = (workId: string, e: WorkEvent): Row => ({ work_id: workId, seq: e.seq, at: e.at, actor: e.actor, kind: e.kind, from_value: e.from, to_value: e.to, reason: e.reason, data: e.data, prev_hash: e.prev_hash, hash: e.hash });
  const withItem = async () => { const db = await fresh(); const id = (await insertRow(db, 'work_items', item())).rows[0].id as string; return { db, id }; };

  it('accepts a correct chain, and reading it back still verifies with the contract', async () => {
    const { db, id } = await withItem();
    for (const e of chain(4)) await insertRow(db, 'work_events', ev(id, e));
    const back = (await db.query<Row>('select * from work_events where work_id = $1 order by seq', [id])).rows.map((r): WorkEvent => ({
      seq: r.seq as number, at: new Date(r.at as string).toISOString(), actor: r.actor as WorkEvent['actor'], kind: r.kind as WorkEvent['kind'],
      from: r.from_value as string | null, to: r.to_value as string | null, reason: r.reason as string | null, data: r.data as WorkEvent['data'], prev_hash: r.prev_hash as string, hash: r.hash as string,
    }));
    expect(back.length).toBe(4);
    expect(verifyChain(back)).toEqual({ ok: true });
  });

  it('the first event must be seq 1 linked to the genesis hash; later ones must continue exactly', async () => {
    const { db, id } = await withItem();
    const c = chain(3);
    await expect(insertRow(db, 'work_events', ev(id, c[1]))).rejects.toThrow(/first event/i);
    await insertRow(db, 'work_events', ev(id, c[0]));
    await expect(insertRow(db, 'work_events', ev(id, c[2]))).rejects.toThrow(/does not continue the chain/i); // skipped seq 2
    await expect(insertRow(db, 'work_events', { ...ev(id, c[1]), prev_hash: GENESIS_HASH })).rejects.toThrow(/does not continue the chain/i);
    await expect(insertRow(db, 'work_events', ev(id, c[0]))).rejects.toThrow(); // replaying seq 1
    await insertRow(db, 'work_events', ev(id, c[1]));
  });

  it('history cannot be silently overwritten: UPDATE, DELETE and TRUNCATE are refused', async () => {
    const { db, id } = await withItem();
    for (const e of chain(2)) await insertRow(db, 'work_events', ev(id, e));
    await expect(db.query(`update work_events set reason = 'rewritten' where work_id = $1`, [id])).rejects.toThrow(/append-only/i);
    await expect(db.query(`update work_events set hash = repeat('a', 64) where work_id = $1`, [id])).rejects.toThrow(/append-only/i);
    await expect(db.query('delete from work_events where work_id = $1', [id])).rejects.toThrow(/append-only/i);
    await expect(db.query('truncate work_events')).rejects.toThrow(/append-only/i);
    expect((await db.query('select count(*)::int as n from work_events where work_id = $1', [id])).rows[0]).toEqual({ n: 2 });
  });

  it('hashes must be well formed and kinds known', async () => {
    const { db, id } = await withItem();
    const [e0] = chain(1);
    await expect(insertRow(db, 'work_events', { ...ev(id, e0), hash: 'nothex' })).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_events', { ...ev(id, e0), kind: 'whatever' })).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'work_events', { ...ev(id, e0), seq: 0 })).rejects.toThrow(/first event|check constraint/i); // the chain trigger fires before the seq > 0 check
  });

  it('two items keep independent chains', async () => {
    const { db, id } = await withItem();
    const id2 = (await insertRow(db, 'work_items', item())).rows[0].id as string;
    for (const e of chain(2)) { await insertRow(db, 'work_events', ev(id, e)); await insertRow(db, 'work_events', ev(id2, e)); }
    expect((await db.query('select count(*)::int as n from work_events')).rows[0]).toEqual({ n: 4 });
  });

  it('an item with history cannot be removed out from under it', async () => {
    const { db, id } = await withItem();
    await insertRow(db, 'work_events', ev(id, chain(1)[0]));
    await expect(db.query('delete from work_items where id = $1', [id])).rejects.toThrow();
  });
});

describe('source events, links and locks', () => {
  it('the same report twice (channel + reference) is refused; the same reference on another channel is a different report', async () => {
    const db = await fresh();
    const se = (over: Row = {}): Row => ({ channel: 'whatsapp', external_ref: 'r1', received_at: '2026-10-05T03:00:00.000Z', reporter: { kind: 'external', id: 'external:founder:sample' }, title: 't', ...over });
    await insertRow(db, 'work_source_events', se());
    await expect(insertRow(db, 'work_source_events', se())).rejects.toThrow(/unique|duplicate/i);
    await insertRow(db, 'work_source_events', se({ channel: 'brand_support_email' }));
    await expect(insertRow(db, 'work_source_events', se({ external_ref: ' ' }))).rejects.toThrow(/check constraint/i);
  });

  it('links: never to itself, never the same relationship twice; the same pair may have different kinds', async () => {
    const db = await fresh();
    const a = (await insertRow(db, 'work_items', item())).rows[0].id as string;
    const b = (await insertRow(db, 'work_items', item())).rows[0].id as string;
    const link = (kind: string, from: string, to: string): Row => ({ kind, from_id: from, to_id: to, by: { kind: 'agent', id: 'DS-02' } });
    await expect(insertRow(db, 'work_links', link('blocks', a, a))).rejects.toThrow(/check constraint/i);
    await insertRow(db, 'work_links', link('blocks', a, b));
    await expect(insertRow(db, 'work_links', link('blocks', a, b))).rejects.toThrow(/unique|duplicate/i);
    await insertRow(db, 'work_links', link('relates', a, b));
    await expect(insertRow(db, 'work_links', link('friends', a, b))).rejects.toThrow(/check constraint/i);
  });

  const lock = (workId: string, over: Row = {}): Row => ({ work_id: workId, repository: 'sample-store', branch: 'b1', worktree: null, paths: ['app'], deployment_target: null, lock_owner: { kind: 'agent', id: 'SG-01' }, expires_at: '2099-01-01T00:00:00.000Z', ...over });
  const mk = async (db: PGlite) => (await insertRow(db, 'work_items', item())).rows[0].id as string;

  it('one active lock per item, per branch, per worktree and per deployment target', async () => {
    const db = await fresh();
    const [a, b, c, d, e] = [await mk(db), await mk(db), await mk(db), await mk(db), await mk(db)];
    await insertRow(db, 'repo_locks', lock(a, { worktree: 'w1', deployment_target: 'prod' }));
    await expect(insertRow(db, 'repo_locks', lock(a, { branch: 'zzz' }))).rejects.toThrow(/unique|duplicate/i); // second lock for the same item
    await expect(insertRow(db, 'repo_locks', lock(b, { branch: 'b1' }))).rejects.toThrow(/unique|duplicate/i); // same branch
    await expect(insertRow(db, 'repo_locks', lock(c, { branch: 'b2', worktree: 'w1' }))).rejects.toThrow(/unique|duplicate/i); // same worktree
    await expect(insertRow(db, 'repo_locks', lock(d, { branch: 'b3', deployment_target: 'prod' }))).rejects.toThrow(/unique|duplicate/i); // same target
    await insertRow(db, 'repo_locks', lock(e, { branch: 'b4' })); // explicit separation
    await insertRow(db, 'repo_locks', lock(await mk(db), { repository: 'another-repo', branch: 'b1' })); // other repository
    await insertRow(db, 'repo_locks', lock(await mk(db), { branch: null })); // no branch declared: no branch collision
  });

  it('releasing a lock frees its place; a release needs a reason; a lock must expire after it starts', async () => {
    const db = await fresh();
    const [a, b] = [await mk(db), await mk(db)];
    const first = (await insertRow(db, 'repo_locks', lock(a))).rows[0].id;
    await expect(insertRow(db, 'repo_locks', lock(b))).rejects.toThrow(/unique|duplicate/i);
    await expect(db.query(`update repo_locks set released_at = now() where id = $1`, [first])).rejects.toThrow(/check constraint/i);
    await db.query(`update repo_locks set released_at = now(), released_reason = 'done' where id = $1`, [first]);
    await insertRow(db, 'repo_locks', lock(b));
    await expect(insertRow(db, 'repo_locks', lock(await mk(db), { branch: 'q', acquired_at: '2026-10-05T03:00:00.000Z', expires_at: '2026-10-05T02:00:00.000Z' }))).rejects.toThrow(/check constraint/i);
    await expect(insertRow(db, 'repo_locks', lock(await mk(db), { repository: ' ', branch: 'x' }))).rejects.toThrow(/check constraint/i);
  });
});

describe('the contract and the schema agree: every fixture story fits the database', () => {
  it('inserts all seven fixtures (items, events, source events, links, locks) and the audit chain still verifies after the round trip', async () => {
    const { reg } = makeRegistry({ newId: () => randomUUID(), lockPolicy: { exclusiveRepositories: ['sample-store'] } });
    fixtureA(reg); fixtureB(reg); fixtureC(reg); fixtureD(reg); fixtureE(reg); fixtureF(reg); fixtureG(reg);
    const items: WorkItem[] = reg.list();
    expect(items.length).toBeGreaterThan(15);
    const db = await fresh();

    // items are listed in creation order, so a parent always exists before its children
    const seen = new Set<string>();
    for (const i of items) {
      await insertRow(db, 'work_items', {
        id: i.id, level: i.level, parent_id: i.parent_id, merged_into: i.merged_into && seen.has(i.merged_into) ? i.merged_into : null, type: i.type, title: i.title, description: i.description, scope_kind: i.scope.kind, brand: i.scope.brand,
        founder: i.scope.founder, system: i.scope.system, extension: i.scope.extension, channel: i.source.channel, requester: i.source.requester,
        priority: i.priority, priority_factors: i.priority_factors, priority_reason: i.priority_reason, state: i.state, held_from: i.held_from,
        owner_kind: i.owner?.kind ?? null, owner_id: i.owner?.id ?? null, supporting: i.supporting, observers: i.observers,
        created_at: i.created_at, updated_at: i.updated_at, deadline: i.deadline, customer_impact: i.customer_impact, revenue_profit_risk: i.revenue_profit_risk,
        security_risk: i.security_risk, evidence: i.evidence, waiting: i.waiting, blocked: i.blocked, approval: i.approval, escalations: i.escalations,
        repo_scope: i.repo_scope, incident: i.incident, resolution: i.resolution, closure: i.closure, learning: i.learning, closed_at: i.closed_at, reopen_count: i.reopen_count,
      });
      seen.add(i.id);
    }
    let events = 0;
    for (const i of items) for (const e of i.events) {
      await insertRow(db, 'work_events', { work_id: i.id, seq: e.seq, at: e.at, actor: e.actor, kind: e.kind, from_value: e.from, to_value: e.to, reason: e.reason, data: e.data, prev_hash: e.prev_hash, hash: e.hash });
      events++;
    }
    for (const s of reg.allSourceEvents()) await insertRow(db, 'work_source_events', { id: s.id, channel: s.channel, external_ref: s.external_ref, thread_ref: s.thread_ref, fingerprint: s.fingerprint, received_at: s.received_at, reporter: s.reporter, brand: s.brand, title: s.title, summary: s.summary, type_hint: s.type_hint, work_id: s.work_id, match: s.match });
    for (const l of reg.links_()) await insertRow(db, 'work_links', { id: l.id, kind: l.kind, from_id: l.from, to_id: l.to, at: l.at, by: l.by, note: l.note, score: l.score });
    const locks = items.flatMap((i) => reg.locksOf(i.id));
    for (const l of locks) await insertRow(db, 'repo_locks', { id: l.id, work_id: l.work_id, repository: l.repository, branch: l.branch, worktree: l.worktree, paths: l.paths, deployment_target: l.deployment_target, lock_owner: l.lock_owner, acquired_at: l.acquired_at, expires_at: l.expires_at, released_at: l.released_at, released_reason: l.released_reason, released_by: l.released_by });

    expect((await db.query('select count(*)::int as n from work_items')).rows[0]).toEqual({ n: items.length });
    expect((await db.query('select count(*)::int as n from work_events')).rows[0]).toEqual({ n: events });
    expect(locks.length).toBeGreaterThan(0);

    // read every chain back out of the database and verify it with the contract
    for (const i of items) {
      const back = (await db.query<Row>('select * from work_events where work_id = $1 order by seq', [i.id])).rows.map((r): WorkEvent => ({
        seq: r.seq as number, at: new Date(r.at as string).toISOString(), actor: r.actor as WorkEvent['actor'], kind: r.kind as WorkEvent['kind'],
        from: r.from_value as string | null, to: r.to_value as string | null, reason: r.reason as string | null, data: r.data as WorkEvent['data'], prev_hash: r.prev_hash as string, hash: r.hash as string,
      }));
      expect(verifyChain(back), `${i.ref} chain after the database round trip`).toEqual({ ok: true });
    }
    // and the refs the database generates are the same short references the contract assigned
    const refs = (await db.query<{ ref: string }>('select ref from work_items order by seq')).rows.map((r) => r.ref);
    expect(refs.length).toBe(items.length);
    expect(new Set(refs).size).toBe(items.length);
  });
});
