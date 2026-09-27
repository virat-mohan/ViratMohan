import { describe, it, expect } from 'vitest';
import { buildCrm, phaseOf } from '../../src/lib/crm';

describe('founder CRM', () => {
  it('splits the journey at data connected', () => {
    expect(phaseOf('nda_sent')).toBe('Before data');
    expect(phaseOf('data_connected')).toBe('After data');
    expect(phaseOf('live')).toBe('Live');
  });
  it('shows each client once at its furthest stage across leads, applications and live stores', () => {
    const rows = buildCrm(
      [{ id: 'l1', brand_name: 'Kora Living', contact_name: 'A', contact_email: 'a@x.in', stage: 'plan_sent', application_id: 'app1' },
       { id: 'l2', brand_name: 'Gone', contact_name: null, contact_email: null, stage: 'lost' }],
      [{ id: 'app1', brand_name: 'Kora', founder_name: 'A', founder_email: 'a@x.in', step: 'deposit' }],
      [{ key: 'caps', name: 'Caps Co' }, { key: 'kl', name: 'kora living' }],
    );
    const kora = rows.find((r) => r.stage === 'live' && r.sources.includes('lead'))!;
    expect(kora.sources).toEqual(['lead', 'application', 'live store']);
    expect(kora.email).toBe('a@x.in');
    expect(rows).toHaveLength(2);
  });
});
