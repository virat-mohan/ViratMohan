export const prerender = false;

// Stage 5C — Custom Build delivery control. Admin only (add /devshop/api/delivery to
// PROTECTED_PREFIXES). Records canonical delivery events on the existing stage_transitions
// audit trail and moves the existing pipeline status. Deterministic guards enforce the gates:
// QA must pass before client review, acceptance requires client review, go-live requires
// acceptance. Nothing here auto-advances and no LLM decides any transition.
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';
import { json } from '../../../lib/retail-os-http';
import {
  deliveryRecord, evaluateQa, canSendForReview, canAccept, canGoLive,
  type QaResult, type Transition,
} from '../../../lib/devshop-delivery';

type Body =
  | { id: string; action: 'get' }
  | { id: string; action: 'build_started' }
  | { id: string; action: 'build_blocked'; detail: string }
  | { id: string; action: 'ready_for_qa' }
  | { id: string; action: 'qa'; results: QaResult; detail?: string }
  | { id: string; action: 'send_for_review'; detail?: string }
  | { id: string; action: 'changes_requested'; detail: string }
  | { id: string; action: 'revision_completed'; detail?: string }
  | { id: string; action: 'accept'; detail?: string }
  | { id: string; action: 'go_live'; detail?: string };

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !body.id || !body.action) return json({ error: 'id and action are required' }, 400);

  const db = getDb(env);
  const row = await db.getById(body.id);
  if (!row) return json({ error: 'not found' }, 404);

  const transitions = (await db.listTransitions(body.id)) as unknown as Transition[];
  const rec = deliveryRecord(row.status, transitions);

  // Record a canonical event and (optionally) move the pipeline status.
  const record = async (tag: string, detail: string | null, toStatus?: string, actor: 'admin' | 'client' | 'system' = 'admin') => {
    if (toStatus && toStatus !== row.status) await db.setStage(body.id, toStatus as never);
    await db.logTransition(body.id, row.status, toStatus ?? row.status, actor, `${tag}${detail ? `: ${detail.slice(0, 400)}` : ''}`);
  };

  try {
    switch (body.action) {
      case 'get':
        break;
      case 'build_started':
        await record('BUILD_STARTED', null, 'in_build');
        break;
      case 'build_blocked':
        if (!body.detail?.trim()) return json({ error: 'a blocker reason is required' }, 400);
        await record('BUILD_BLOCKED', body.detail);
        break;
      case 'ready_for_qa':
        await record('BUILD_READY_FOR_QA', null, 'uat');
        break;
      case 'qa': {
        const { passed, failed, missing } = evaluateQa(body.results ?? {});
        if (missing.length) return json({ error: `QA incomplete: ${missing.join(', ')}` }, 400);
        await record(passed ? 'QA_PASSED' : 'QA_FAILED', passed ? (body.detail ?? null) : `failed: ${failed.join(', ')}`, 'uat');
        return json({ ok: true, qa: passed ? 'passed' : 'failed', failed }, 200);
      }
      case 'send_for_review': {
        const why = canSendForReview(rec);
        if (why) return json({ error: why }, 409); // QA gate: a failed/absent QA blocks client review
        await record('CLIENT_REVIEW_SENT', body.detail ?? null, 'uat');
        break;
      }
      case 'changes_requested':
        if (!body.detail?.trim()) return json({ error: 'the requested changes are required' }, 400);
        await record('CHANGES_REQUESTED', body.detail, 'uat', 'client');
        break;
      case 'revision_completed':
        await record('REVISION_COMPLETED', body.detail ?? null, 'uat'); // returns through QA before review again
        break;
      case 'accept': {
        const why = canAccept(rec);
        if (why) return json({ error: why }, 409);
        // Explicit acceptance event; does NOT set the build live.
        await record('BUILD_ACCEPTED', body.detail ?? null, undefined, 'client');
        break;
      }
      case 'go_live': {
        const why = canGoLive(rec); // requires an accepted build; go-live is separate from acceptance
        if (why) return json({ error: why }, 409);
        await record('GO_LIVE_APPROVED', body.detail ?? null, 'delivered');
        break;
      }
      default:
        return json({ error: 'unknown action' }, 400);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  const after = deliveryRecord(
    body.action === 'go_live' ? 'delivered' : body.action === 'build_started' || body.action === 'ready_for_qa' ? (body.action === 'build_started' ? 'in_build' : 'uat') : row.status,
    (await db.listTransitions(body.id)) as unknown as Transition[],
  );
  return json({ ok: true, delivery: after }, 200);
};
