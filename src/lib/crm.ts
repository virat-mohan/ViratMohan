// The founder CRM: every client in one list, whichever system they live in today.
// Leads (the leads table), applications (retail_os_applications) and live brands
// (each on its own Supabase project, from RETAIL_OS_LIVE_BRANDS) are merged by
// link or brand name, and each client shows once at its furthest stage.
// The stages are the lead journey in lead-journey.ts, split at the moment data connects.

import { JOURNEY, indexOf, health, OWNER_LABEL } from './lead-journey';

export type Phase = 'Before data' | 'After data' | 'Live';
export type CrmRow = {
  key: string; brand: string; contact: string | null; email: string | null;
  stage: string; label: string; phase: Phase; owner: string; does: string;
  daysIn: number; late: boolean; sources: string[];
};

export type CrmLead = { id: string; brand_name: string; contact_name: string | null; contact_email: string | null; stage: string; stage_changed_at?: string | null; updated_at?: string; application_id?: string | null };
export type CrmApp = { id: string; brand_name: string; founder_name: string | null; founder_email: string | null; step: string; since?: string | null };
export type CrmBrand = { key: string; name: string };

const DATA_AT = indexOf('data_connected');
export const phaseOf = (stage: string): Phase =>
  stage === 'live' || stage === 'won' ? 'Live' : indexOf(stage) >= DATA_AT ? 'After data' : 'Before data';

// Application steps (retail-os-db journeyStep) placed on the lead journey.
const APP_STAGE: Record<string, string> = { preparing: 'applied', review: 'applied', sign: 'applied', deposit: 'signed', confirming: 'signed', building: 'building', live: 'live' };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function buildCrm(leads: CrmLead[], apps: CrmApp[], brands: CrmBrand[], now = new Date()): CrmRow[] {
  const rows = new Map<string, CrmRow>();
  const byApp = new Map<string, string>();
  const place = (key: string, r: Omit<CrmRow, 'key' | 'sources' | 'phase' | 'label' | 'owner' | 'does' | 'late' | 'daysIn'> & { since?: string | null }, source: string) => {
    const existing = rows.get(key);
    if (existing && indexOf(existing.stage) >= indexOf(r.stage)) { existing.sources.push(source); existing.contact ??= r.contact; existing.email ??= r.email; return; }
    const h = health({ stage: r.stage, stage_changed_at: r.since ?? null }, now);
    rows.set(key, {
      key, brand: r.brand, contact: r.contact ?? existing?.contact ?? null, email: r.email ?? existing?.email ?? null,
      stage: r.stage, label: h.step?.label ?? r.stage, phase: phaseOf(r.stage), owner: h.owner, does: h.does,
      daysIn: r.since ? h.daysIn : 0, late: r.since ? h.late : false, sources: [...(existing?.sources ?? []), source],
    });
  };
  for (const l of leads) {
    if (l.stage === 'lost') continue;
    const key = norm(l.brand_name);
    if (l.application_id) byApp.set(l.application_id, key);
    place(key, { brand: l.brand_name, contact: l.contact_name, email: l.contact_email, stage: l.stage, since: l.stage_changed_at ?? l.updated_at }, 'lead');
  }
  for (const a of apps) {
    const key = byApp.get(a.id) ?? norm(a.brand_name);
    place(key, { brand: a.brand_name, contact: a.founder_name, email: a.founder_email, stage: APP_STAGE[a.step] ?? 'applied', since: a.since }, 'application');
  }
  for (const b of brands) place(norm(b.name), { brand: b.name, contact: null, email: null, stage: 'live' }, 'live store');
  const order = (r: CrmRow) => indexOf(r.stage);
  return [...rows.values()].sort((a, b) => Number(b.late) - Number(a.late) || order(a) - order(b));
}

export const PHASES: Phase[] = ['Before data', 'After data', 'Live'];
export { JOURNEY, OWNER_LABEL };
