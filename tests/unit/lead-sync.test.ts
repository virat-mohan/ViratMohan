// syncLeadFromApplication was called without being imported in apply.ts and mark-deposit-paid.ts (a ReferenceError on
// the public apply form and the admin deposit endpoint). These tests pin the import and what the function may touch.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { syncLeadFromApplication } from '../../src/lib/lead-sync';

const read = (p: string) => readFileSync(p, 'utf8');

describe('syncLeadFromApplication is resolved where it is called', () => {
  for (const [file, spec] of [
    ['src/pages/retail-os/api/apply.ts', '../../../lib/lead-sync'],
    ['src/pages/retail-os/api/admin/mark-deposit-paid.ts', '../../../../lib/lead-sync'],
    ['src/pages/retail-os/api/admin/confirm-deposit.ts', '../../../../lib/lead-sync'],
    ['src/pages/retail-os/api/sign/[id].ts', '../../../../lib/lead-sync'],
  ] as const) {
    it(`${file} imports it`, () => {
      const src = read(file);
      expect(src).toContain('syncLeadFromApplication(');
      expect(src).toContain(`import { syncLeadFromApplication } from '${spec}'`);
    });
  }
});

// A recording stand-in for the Supabase client: no network, and it shows exactly which tables are written.
function recorder(existingLead: { id: string; stage: string } | null) {
  const writes: { table: string; op: string; row?: Record<string, unknown> }[] = [];
  const sb = {
    from(table: string) {
      const chain = {
        select: () => chain, eq: () => chain, ilike: () => chain,
        maybeSingle: async () => ({ data: existingLead, error: null }),
        single: async () => ({ data: { id: 'new-lead', stage: 'applied' }, error: null }),
        insert: (row: Record<string, unknown>) => { writes.push({ table, op: 'insert', row }); return chain; },
        update: (row: Record<string, unknown>) => { writes.push({ table, op: 'update', row }); return chain; },
        then: (res: (v: unknown) => unknown) => res({ data: null, error: null }),
      };
      return chain;
    },
  };
  return { sb: sb as never, writes };
}
const app = { id: 'a1', brand_name: 'Acme', founder_name: 'Fay', founder_email: 'Fay@Example.com' };

describe('syncLeadFromApplication writes only internal lead records', () => {
  it('a new application creates one lead and one internal note, in leads and lead_messages only', async () => {
    const { sb, writes } = recorder(null);
    expect(await syncLeadFromApplication(sb, app, 'applied')).toBe('new-lead');
    expect(new Set(writes.map((w) => w.table))).toEqual(new Set(['leads', 'lead_messages']));
    const note = writes.find((w) => w.table === 'lead_messages')!.row!;
    expect(note).toMatchObject({ direction: 'internal', channel: 'note', status: 'logged', created_by: 'lead-sync' });
    expect(writes.find((w) => w.table === 'leads')!.row!.contact_email).toBe('fay@example.com');
  });

  it('a deposit moves an existing lead forward and logs an internal note, never an outbound message', async () => {
    const { sb, writes } = recorder({ id: 'l1', stage: 'signed' });
    await syncLeadFromApplication(sb, app, 'deposit_paid');
    expect(writes.some((w) => w.table === 'leads' && w.op === 'update' && w.row!.stage === 'deposit_paid')).toBe(true);
    for (const w of writes.filter((x) => x.table === 'lead_messages')) expect(w.row).toMatchObject({ direction: 'internal', channel: 'note' });
  });

  it('never moves a lead backwards', async () => {
    const { sb, writes } = recorder({ id: 'l1', stage: 'live' });
    await syncLeadFromApplication(sb, app, 'applied');
    expect(writes.some((w) => w.row && 'stage' in w.row)).toBe(false);
  });

  it('a failure is swallowed and reported as null, so it cannot break the caller', async () => {
    const sb = { from: () => { throw new Error('db down'); } } as never;
    expect(await syncLeadFromApplication(sb, app, 'applied')).toBeNull();
  });
});
