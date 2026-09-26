import type { BrainEvent, Entity, Evidence, Fact, Rule, Visibility } from './types';

/** Storage the Brain runs on. Supabase in production, memory in tests and seed dry-runs. */
export interface BrainStore {
  search(query: string, audience: Visibility, limit: number): Promise<Evidence[]>;
  searchVector?(embedding: number[], audience: Visibility, limit: number): Promise<Evidence[]>;
  rules(schema: string): Promise<Rule[]>;
  insertRule(rule: Omit<Rule, 'id' | 'hits' | 'last_used'>): Promise<Rule>;
  updateRule(id: string, patch: Partial<Rule>): Promise<void>;
  insertFact(fact: Omit<Fact, 'id'>): Promise<Fact>;
  upsertEntity(entity: Omit<Entity, 'id'>): Promise<Entity>;
  log(event: BrainEvent): Promise<string>;
}

export const allowed = (a: Visibility): Visibility[] =>
  a === 'staff' ? ['public', 'partner', 'staff'] : a === 'partner' ? ['public', 'partner'] : ['public'];

const STOP = new Set('a an and are as at be by can do does for from how i in is it me my of on or so that the this to what when where which who why will with you your'.split(' '));
export const tokens = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}₹%]+/gu, ' ').split(' ').filter((t) => t.length > 1 && !STOP.has(t));

let seq = 0;
const id = (p: string) => `${p}_${(++seq).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** In-memory store with simple term-overlap scoring. Used by tests and the seed dry-run. */
export class MemoryStore implements BrainStore {
  entities: Entity[] = [];
  facts: Fact[] = [];
  ruleRows: Rule[] = [];
  events: (BrainEvent & { id: string; at: string })[] = [];

  async search(query: string, audience: Visibility, limit: number): Promise<Evidence[]> {
    const q = new Set(tokens(query));
    if (!q.size) return [];
    const ok = allowed(audience);
    const score = (text: string) => { const t = tokens(text); if (!t.length) return 0; let hit = 0; for (const x of new Set(t)) if (q.has(x)) hit++; return hit / Math.sqrt(q.size * new Set(t).size); };
    const now = Date.now();
    const out: Evidence[] = [];
    for (const f of this.facts) {
      if (!ok.includes(f.visibility) || (f.valid_to && Date.parse(f.valid_to) <= now)) continue;
      const s = score(`${f.topic ?? ''} ${f.statement}`) * f.confidence;
      if (s > 0) out.push({ id: f.id, kind: 'fact', title: f.topic ?? 'fact', body: f.statement, source: f.source, score: s });
    }
    for (const e of this.entities) {
      if (!ok.includes(e.visibility)) continue;
      const exact = [e.name, ...e.aliases].some((n) => n.toLowerCase() === query.toLowerCase().trim());
      const s = exact ? 1 : score(`${e.name} ${e.aliases.join(' ')} ${JSON.stringify(e.attributes)}`);
      if (s > 0) out.push({ id: e.id, kind: e.kind, title: e.name, body: JSON.stringify(e.attributes), source: e.source, score: s });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }
  async rules(schema: string) { return this.ruleRows.filter((r) => r.schema_name === schema && r.active); }
  async insertRule(r: Omit<Rule, 'id' | 'hits' | 'last_used'>) { const row: Rule = { ...r, id: id('rule'), hits: 0, last_used: null }; this.ruleRows.push(row); return row; }
  async updateRule(rid: string, patch: Partial<Rule>) { const r = this.ruleRows.find((x) => x.id === rid); if (r) Object.assign(r, patch); }
  async insertFact(f: Omit<Fact, 'id'>) {
    if (!f.source?.trim()) throw new Error('brain: every fact needs a source');
    const row: Fact = { ...f, id: id('fact') }; this.facts.push(row); return row;
  }
  async upsertEntity(e: Omit<Entity, 'id'>) {
    if (e.kind === 'customer' && e.visibility !== 'staff') throw new Error('brain: customer entities are staff-only');
    const found = this.entities.find((x) => x.kind === e.kind && x.name === e.name);
    if (found) { Object.assign(found, e); return found; }
    const row: Entity = { ...e, id: id('ent') }; this.entities.push(row); return row;
  }
  async log(ev: BrainEvent) { const row = { ...ev, id: id('evt'), at: new Date().toISOString() }; this.events.push(row); return row.id; }
}

type Sb = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Supabase-backed store (service role, server side only). Tables from migrations/0033_brain.sql. */
export class SupabaseStore implements BrainStore {
  constructor(private sb: Sb) {}
  private async ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await p; if (error) throw new Error(`brain store: ${error.message}`); return data;
  }
  async search(query: string, audience: Visibility, limit: number) {
    const rows = await this.ok<Evidence[]>(this.sb.rpc('brain_search', { q: query, audience, max_rows: limit }));
    return (rows ?? []).map((r) => ({ ...r, id: String(r.id) }));
  }
  async rules(schema: string) { return (await this.ok<Rule[]>(this.sb.from('brain_rules').select('*').eq('schema_name', schema).eq('active', true))) ?? []; }
  async insertRule(r: Omit<Rule, 'id' | 'hits' | 'last_used'>) { return this.ok<Rule>(this.sb.from('brain_rules').insert(r).select().single()); }
  async updateRule(rid: string, patch: Partial<Rule>) { await this.ok(this.sb.from('brain_rules').update(patch).eq('id', rid)); }
  async insertFact(f: Omit<Fact, 'id'>) {
    if (!f.source?.trim()) throw new Error('brain: every fact needs a source');
    return this.ok<Fact>(this.sb.from('brain_facts').upsert(f, { onConflict: 'source,statement' }).select().single());
  }
  async upsertEntity(e: Omit<Entity, 'id'>) { return this.ok<Entity>(this.sb.from('brain_entities').upsert(e, { onConflict: 'kind,name' }).select().single()); }
  async log(ev: BrainEvent) {
    const row = await this.ok<{ id: string }>(this.sb.from('brain_events').insert({ type: ev.type, actor: ev.actor ?? 'brain', payload: ev.payload, evidence: (ev.evidence ?? []).filter((x) => /^[0-9a-f-]{36}$/.test(x)), visibility: ev.visibility ?? 'staff' }).select('id').single());
    return row.id;
  }
}
