// Shared vocabulary for brand operating nodes. Pure: no I/O, no framework.
// "Connected" means an implemented runtime path with evidence, never a document or an interface alone.

export const CONNECTION_STATES = [
  'NOT_CONNECTED', 'CONTRACT_ONLY', 'PARTIAL', 'CONNECTED', 'LIVE',
  'SETUP_REQUIRED', 'WAITING_FOR_HUMAN', 'DEFERRED', 'UNKNOWN',
] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

export interface Link { state: ConnectionState; evidence: string[]; note: string }

export const link = (state: ConnectionState, evidence: string[] = [], note = ''): Link => ({ state, evidence, note });

const NEEDS_EVIDENCE: ConnectionState[] = ['PARTIAL', 'CONNECTED', 'LIVE', 'CONTRACT_ONLY'];
const NEEDS_REASON: ConnectionState[] = ['NOT_CONNECTED', 'SETUP_REQUIRED', 'WAITING_FOR_HUMAN', 'DEFERRED', 'UNKNOWN'];

/** Problems with a claimed link. A claim without its proof is a defect, not a status. */
export function validateLink(l: Link, label = 'link'): string[] {
  const out: string[] = [];
  if (NEEDS_EVIDENCE.includes(l.state) && l.evidence.length === 0) out.push(`${label}: ${l.state} needs evidence (a file path or a recorded check)`);
  if (NEEDS_REASON.includes(l.state) && !l.note.trim()) out.push(`${label}: ${l.state} needs the exact reason in note`);
  if (l.state === 'LIVE' && !l.evidence.some((e) => e.startsWith('live:'))) out.push(`${label}: LIVE needs evidence from the real deployed environment ("live:...")`);
  return out;
}

export type HealthState = 'PASS' | 'WARN' | 'FAIL' | 'UNKNOWN';
export const HEALTH_COMPONENTS = [
  'APP', 'DATABASE', 'PAYMENTS', 'ORDERS', 'FULFILMENT', 'EMAIL', 'WHATSAPP', 'ADS', 'ANALYTICS', 'CRON', 'DOMAIN', 'INTEGRATIONS',
] as const;
export type HealthComponentName = (typeof HEALTH_COMPONENTS)[number];
export interface HealthComponent { name: HealthComponentName; state: HealthState; detail: string }

/** Every standard component, in order. Anything not reported is UNKNOWN, never assumed fine. */
export function fullHealth(reported: Partial<Record<HealthComponentName, { state: HealthState; detail?: string }>> = {}): HealthComponent[] {
  return HEALTH_COMPONENTS.map((name) => {
    const r = reported[name];
    return r ? { name, state: r.state, detail: r.detail ?? '' } : { name, state: 'UNKNOWN', detail: 'not reported' };
  });
}

const RANK: Record<HealthState, number> = { PASS: 0, UNKNOWN: 1, WARN: 2, FAIL: 3 };

/** Worst known state wins. PASS needs every component to pass: unknown never looks healthy. */
export function rollupHealth(components: HealthComponent[]): HealthState {
  const names = new Set(components.map((c) => c.name));
  const complete = HEALTH_COMPONENTS.every((n) => names.has(n));
  const worst = components.reduce<HealthState>((w, c) => (RANK[c.state] > RANK[w] ? c.state : w), 'PASS');
  return !complete && worst === 'PASS' ? 'UNKNOWN' : worst;
}
