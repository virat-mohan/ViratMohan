// The lead journey: one ordered list of stages from first contact to a live store, with
// who acts at each one and how long it should take. The admin page, the cron nudges and
// every stage transition read from here, so the journey is defined in exactly one place.
//
//   new ─ nda_sent ─ nda_signed ─ access_requested ─ data_connected ─ plan_ready ─ plan_sent
//     ─ discovery ─ proposal ─ applied ─ signed ─ deposit_paid ─ building ─ live
//
// The target: LIVE IN 7 DAYS from the moment the NDA is signed and data is connected. That
// moment starts the clock (leads.clock_started_at); every later stage's allowance is a slice
// of those 7 days, and goLiveTarget() is the date everyone works to.
//
// Stages only move forward (lost/paused are the exits). 'contacted' and 'won' are legacy
// stages kept for old rows: contacted sits between new and nda_sent, won means live.

export const LIVE_IN_DAYS = 7;

export type Owner = 'system' | 'virat' | 'founder' | 'team';

export type JourneyStep = {
  stage: string;
  label: string;
  owner: Owner;              // who the ball is with while the lead sits in this stage
  does: string;              // what happens here, in plain words
  slaDays: number;           // how long it should take before it counts as slipping
  nudge?: 'nda_reminder' | 'access_reminder';
};

export const JOURNEY: JourneyStep[] = [
  { stage: 'new', label: 'New lead', owner: 'virat', does: 'NDA email drafted; you approve it with one tap.', slaDays: 1 },
  { stage: 'contacted', label: 'Contacted', owner: 'virat', does: 'In conversation; the NDA goes next.', slaDays: 2 },
  { stage: 'nda_sent', label: 'NDA sent', owner: 'founder', does: 'They sign the mutual NCNDA online.', slaDays: 3, nudge: 'nda_reminder' },
  { stage: 'nda_signed', label: 'NDA signed', owner: 'virat', does: 'Access checklist email drafted; you approve it.', slaDays: 1 },
  { stage: 'access_requested', label: 'Access requested', owner: 'founder', does: 'They connect Shopify, Meta and Google, or upload CSVs.', slaDays: 2, nudge: 'access_reminder' },
  { stage: 'data_connected', label: 'Data connected', owner: 'system', does: 'Clock starts. The audit runs on their numbers and a plan is drafted, same day.', slaDays: 0 },
  { stage: 'plan_ready', label: 'Plan ready', owner: 'virat', does: 'You approve the plan and its cover email (day 1).', slaDays: 1 },
  { stage: 'plan_sent', label: 'Plan sent', owner: 'founder', does: 'They read the plan and pick a time to talk (day 1 to 2).', slaDays: 1 },
  { stage: 'discovery', label: 'Call', owner: 'virat', does: 'The 30-minute call (day 2).', slaDays: 0 },
  { stage: 'proposal', label: 'Proposal', owner: 'founder', does: 'They apply at /retail-os/apply and see their forecast and designs (day 2).', slaDays: 0 },
  { stage: 'applied', label: 'Applied', owner: 'virat', does: 'Forecast and designs are on their page; you send the terms (day 2).', slaDays: 0 },
  { stage: 'signed', label: 'Terms signed', owner: 'founder', does: 'They pay the ₹5,000 deposit on their page (day 3).', slaDays: 1 },
  { stage: 'deposit_paid', label: 'Deposit paid', owner: 'team', does: 'Build starts: setup tasks land on the ops tracker (day 3).', slaDays: 0 },
  { stage: 'building', label: 'Building', owner: 'team', does: 'Catalog, payments, shipping, Meta, WhatsApp, go-live review (days 3 to 7).', slaDays: 4 },
  { stage: 'live', label: 'Live', owner: 'system', does: 'Selling. Results every Monday.', slaDays: 0 },
];

export const EXITS = ['lost', 'paused'] as const;
const ALIAS: Record<string, string> = { won: 'live' };

export const stepFor = (stage: string): JourneyStep | undefined => JOURNEY.find((s) => s.stage === (ALIAS[stage] ?? stage));
export const indexOf = (stage: string): number => JOURNEY.findIndex((s) => s.stage === (ALIAS[stage] ?? stage));

/** Where a lead may move: forward along the journey, or out to lost/paused. Never backwards. */
export function canMove(from: string, to: string): boolean {
  if ((EXITS as readonly string[]).includes(to)) return true;
  if ((EXITS as readonly string[]).includes(from)) return indexOf(to) >= 0; // resuming from paused/lost is allowed
  const a = indexOf(from), b = indexOf(to);
  return a >= 0 && b >= 0 && b > a;
}

/** The later of two stages, so a hook can never pull a lead backwards. */
export function forward(current: string, proposed: string): string {
  return canMove(current, proposed) ? proposed : current;
}

export const OWNER_LABEL: Record<Owner, string> = { system: 'Automatic', virat: 'You', founder: 'The founder', team: 'The team' };

export type Health = { step: JourneyStep | undefined; daysIn: number; late: boolean; owner: string; does: string };

/** How a lead is doing in its current stage, for the admin page and nudges. */
export function health(lead: { stage: string; stage_changed_at?: string | null; updated_at?: string }, now = new Date()): Health {
  const step = stepFor(lead.stage);
  const since = Date.parse(lead.stage_changed_at ?? lead.updated_at ?? '') || now.getTime();
  const daysIn = Math.max(0, Math.floor((now.getTime() - since) / 86_400_000));
  const late = !!step && step.slaDays > 0 && daysIn > step.slaDays;
  return { step, daysIn, late, owner: step ? OWNER_LABEL[step.owner] : 'You', does: step?.does ?? (lead.stage === 'lost' ? 'Closed.' : 'Paused.') };
}

/** Pipeline counts in journey order, for the admin header. */
export function pipeline(leads: { stage: string }[]): { stage: string; label: string; count: number }[] {
  return JOURNEY.filter((s) => s.stage !== 'contacted').map((s) => ({
    stage: s.stage, label: s.label,
    count: leads.filter((l) => (ALIAS[l.stage] ?? l.stage) === s.stage || (s.stage === 'new' && l.stage === 'contacted')).length,
  }));
}

/** Which stage follows once an approved draft of this purpose has gone out. */
export function stageAfterSent(purpose: string | null | undefined, current: string): string {
  const map: Record<string, string> = { nda_request: 'nda_sent', nda_reminder: current, access_request: 'access_requested', access_reminder: current, plan_cover: 'plan_sent' };
  const to = map[purpose ?? ''] ?? current;
  return forward(current, to);
}

/** The date the store must be live: 7 days after the clock started. Null until the NDA is signed and data is connected. */
export function goLiveTarget(lead: { clock_started_at?: string | null }): Date | null {
  const t = Date.parse(lead.clock_started_at ?? '');
  return t ? new Date(t + LIVE_IN_DAYS * 86_400_000) : null;
}

/** Days left to the go-live target (negative when missed). Null when the clock has not started. */
export function daysToLive(lead: { clock_started_at?: string | null; stage: string }, now = new Date()): number | null {
  const target = goLiveTarget(lead);
  if (!target || indexOf(lead.stage) >= indexOf('live')) return null;
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}
