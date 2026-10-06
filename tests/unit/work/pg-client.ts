// A Supabase-client-shaped adapter over embedded Postgres running the real migration 0055.
// Test harness only: it lets the real store (createSupabaseWorkStore) run against the real schema,
// constraints and triggers without a network or a real project.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migration = (f: string) => readFileSync(fileURLToPath(new URL(`../../../migrations/${f}`, import.meta.url)), 'utf8');
export const MIGRATIONS = [migration('0055_work_registry.sql'), migration('0056_work_persist.sql')];

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  for (const m of MIGRATIONS) await db.exec(m);
  return db;
}

type Row = Record<string, unknown>;
type Res = { data: Row[] | null; error: { message: string } | null };

export function pgClient(db: PGlite) {
  const jsonCols = new Map<string, Set<string>>();
  async function jsonColumns(table: string): Promise<Set<string>> {
    if (!jsonCols.has(table)) {
      const r = await db.query<{ column_name: string; data_type: string }>(
        `select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1`, [table]);
      jsonCols.set(table, new Set(r.rows.filter((c) => c.data_type === 'jsonb' || c.data_type === 'json').map((c) => c.column_name)));
    }
    return jsonCols.get(table)!;
  }
  async function write(table: string, rows: Row[], onConflict?: string): Promise<{ error: { message: string } | null }> {
    if (!rows.length) return { error: null };
    try {
      const js = await jsonColumns(table);
      const cols = Object.keys(rows[0]);
      const params: unknown[] = [];
      const tuples = rows.map((r) => `(${cols.map((c) => {
        const v = r[c];
        params.push(v !== null && v !== undefined && (js.has(c) || (typeof v === 'object' && !Array.isArray(v))) ? JSON.stringify(v) : v ?? null);
        return `$${params.length}`;
      }).join(', ')})`);
      const conflict = onConflict
        ? ` on conflict (${onConflict}) do update set ${cols.filter((c) => c !== onConflict).map((c) => `${c} = excluded.${c}`).join(', ')}`
        : '';
      await db.query(`insert into ${table} (${cols.join(', ')}) values ${tuples.join(', ')}${conflict}`, params);
      return { error: null };
    } catch (e) {
      return { error: { message: e instanceof Error ? e.message : String(e) } };
    }
  }
  return {
    async rpc(fn: string, args: { p: unknown }): Promise<{ data: unknown; error: { message: string; code?: string } | null }> {
      if (fn !== 'work_persist') return { data: null, error: { message: `unknown function ${fn}` } };
      try {
        const r = await db.query<{ r: unknown }>('select work_persist($1::jsonb) as r', [JSON.stringify(args.p)]);
        return { data: r.rows[0].r, error: null };
      } catch (e) {
        const err = e as { message?: string; code?: string };
        return { data: null, error: { message: err.message ?? String(e), code: err.code } };
      }
    },
    from(table: string) {
      return {
        select: async (cols = '*'): Promise<Res> => {
          try { return { data: (await db.query<Row>(`select ${cols} from ${table}`)).rows, error: null }; }
          catch (e) { return { data: null, error: { message: e instanceof Error ? e.message : String(e) } }; }
        },
        upsert: (rows: unknown[], opts?: { onConflict: string }) => write(table, rows as Row[], opts?.onConflict),
        insert: (rows: unknown[]) => write(table, rows as Row[]),
      };
    },
  };
}
