// Founder → Work lifecycle, server side. Same gate as the CEO input: the admin password, checked here as well
// as in the middleware. No LLM, no outbound calls.

import type { WorkStore } from '../work/db-store';
import { WorkConflictError } from '../work/db-store';
import { advanceWork, type LifecycleAction } from '../work/lifecycle-service';
import { VIRAT } from '../work/actors';
import type { EvidenceInput, ResolutionKind } from '../work/types';
import { EVIDENCE_KINDS, RESOLUTION_KINDS } from '../work/types';
import { checkAdminAuth } from '../admin-auth';

const ACTIONS: readonly LifecycleAction[] = ['start', 'resolve', 'verify', 'close', 'close_test_record'];
const MAX_TEXT = 2000;

export interface LifecycleBody { work?: unknown; action?: unknown; summary?: unknown; resolution_kind?: unknown; method?: unknown; evidence?: unknown }
export type LifecycleResult =
  | { status: 200; body: { work: { id: string; ref: string; title: string; state: string; priority: string | null; owner: string | null; closed_at: string | null }; auditEvents: string[]; eventCount: number } }
  | { status: 400 | 401 | 404 | 409 | 503; body: { error: string } };

const text = (v: unknown, max = MAX_TEXT): string | undefined => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined);

export async function handleFounderLifecycle(authorization: string | null, body: LifecycleBody | null, deps: { store: WorkStore | null; adminPassword: string | undefined }): Promise<LifecycleResult> {
  const auth = checkAdminAuth(authorization, deps.adminPassword);
  if (!auth.ok) return { status: auth.status, body: { error: auth.status === 503 ? 'Admin access is not configured' : 'Authentication required' } };
  if (!deps.store) return { status: 503, body: { error: 'Work Registry not configured' } };
  const work = text(body?.work, 100);
  if (!body || !work) return { status: 400, body: { error: 'Say which Work (its reference)' } };
  if (typeof body.action !== 'string' || !ACTIONS.includes(body.action as LifecycleAction)) return { status: 400, body: { error: `action must be one of ${ACTIONS.join(', ')}` } };
  const kind = body.resolution_kind;
  if (kind !== undefined && !RESOLUTION_KINDS.includes(kind as ResolutionKind)) return { status: 400, body: { error: 'Unknown resolution kind' } };
  let evidence: EvidenceInput[] | undefined;
  if (body.evidence !== undefined) {
    const list = Array.isArray(body.evidence) ? body.evidence : null;
    const valid = list && list.length <= 10 && list.every((e) => e && EVIDENCE_KINDS.includes(e.kind) && text(e.ref, 300) && text(e.summary));
    if (!list || !valid) return { status: 400, body: { error: 'evidence needs a kind, a reference and a summary' } };
    evidence = list.map((e) => ({ kind: e.kind, ref: String(e.ref).trim(), summary: String(e.summary).trim() }));
  }

  try {
    const r = await advanceWork(deps.store, {
      work, action: body.action as LifecycleAction, by: VIRAT,
      summary: text(body.summary), resolutionKind: kind as ResolutionKind | undefined, method: text(body.method), evidence,
    });
    if (!r.ok) return { status: r.error.code === 'not_found' ? 404 : 400, body: { error: `${r.error.code}: ${r.error.message}` } };
    const i = r.value;
    return { status: 200, body: { work: { id: i.id, ref: i.ref, title: i.title, state: i.state, priority: i.priority, owner: i.owner?.id ?? null, closed_at: i.closed_at }, auditEvents: i.events.slice(-6).map((e) => e.kind), eventCount: i.events.length } };
  } catch (e) {
    if (e instanceof WorkConflictError) return { status: 409, body: { error: 'Another change to this Work landed first. Nothing was written; send it again.' } };
    throw e;
  }
}
