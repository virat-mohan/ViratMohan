export const prerender = false;
// Admin-only. Same protection gap as /devshop/admin/* — gate this path too.
// Structured human-reviewer action capture (brief §18-19) — this is the
// disagreement data a future expert-disagreement-loop feature would build
// on: category + reason, not yet a full before/after diff of what changed.

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';

const VALID_ACTIONS = new Set([
  'approved',
  'approved_with_edits',
  'diagnosis_changed',
  'framework_changed',
  'pnl_changed',
  'mechanism_changed',
  'blocked',
]);

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const { id, reviewerName, action, note } = (await request.json().catch(() => ({}))) as {
    id?: string;
    reviewerName?: string;
    action?: string;
    note?: string;
  };
  if (!id || !reviewerName?.trim() || !action) return json({ error: 'id, reviewerName, and action are required' }, 400);
  if (!VALID_ACTIONS.has(action)) return json({ error: `invalid action "${action}"` }, 400);
  if (action !== 'approved' && !note?.trim()) {
    return json({ error: 'a note is required when the action is not a plain approval' }, 400);
  }

  const db = getDb(env);
  try {
    await db.addReviewAction({
      submissionId: id,
      reviewerName: reviewerName.trim(),
      action: action as any,
      note: note?.trim() || null,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  return json({ ok: true }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
