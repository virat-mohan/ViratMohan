// A minimal PostgREST-compatible HTTP server over embedded Postgres running the real migration 0055.
// Lets the real Astro server and the real supabase-js client run the real Work Registry store end to end,
// with no real project. It implements only what the store uses: select, insert, upsert by on_conflict.
import { createServer, type Server } from 'node:http';
import type { PGlite } from '@electric-sql/pglite';
import { pgClient } from '../unit/work/pg-client';

const SAFE_NAME = /^[a-z_]+$/;
const SAFE_COLS = /^[a-z_*, ]+$/;

export function startShim(port: number, initial: PGlite): { server: Server; setDb(db: PGlite): void; ready: Promise<void> } {
  let client = pgClient(initial);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://shim');
    const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    const send = (status: number, body?: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(body === undefined ? '' : JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
    };
    if (!m || !SAFE_NAME.test(m[1])) return send(404, { message: 'not found' });
    const table = m[1];
    if (req.method === 'GET') {
      const cols = (url.searchParams.get('select') ?? '*').replace(/%2C/gi, ',');
      if (!SAFE_COLS.test(cols)) return send(400, { message: 'bad select' });
      const r = await client.from(table).select(cols);
      return r.error ? send(400, { message: r.error.message }) : send(200, r.data);
    }
    if (req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const rows = JSON.parse(raw || '[]');
      const upsert = String(req.headers.prefer ?? '').includes('resolution=merge-duplicates');
      const conflict = url.searchParams.get('on_conflict') ?? undefined;
      const r = upsert ? await client.from(table).upsert(rows, conflict ? { onConflict: conflict } : undefined) : await client.from(table).insert(rows);
      return r.error ? send(400, { message: r.error.message }) : send(201);
    }
    return send(405, { message: 'method not allowed' });
  });
  const ready = new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { server, setDb: (db) => { client = pgClient(db); }, ready };
}
