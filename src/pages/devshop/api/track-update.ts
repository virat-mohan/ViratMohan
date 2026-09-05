export const prerender = false;
// Admin-only action endpoint for the post-approval pipeline (see the
// Demo-to-Delivery Pipeline design doc). Same protection gap as
// /devshop/admin/* — put a real gate in front of this path too.

import type { APIRoute } from 'astro';
import { getDb, PIPELINE_STAGES, type PipelineStage, type WeeklyUpdate } from '../../../lib/db';
import { getEnv } from '../../../lib/env';
import { buildHandoffMarkdown } from '../../../lib/handoff';

type Body =
  | { id: string; action: 'setStage'; status: PipelineStage }
  | { id: string; action: 'setComplexity'; tier: 'standard' | 'complex'; recommendation: string }
  | { id: string; action: 'markDepositPaid' }
  | { id: string; action: 'addWeeklyUpdate'; summary: string; blocker: WeeklyUpdate['blocker']; blockerDetail: string | null };

const VALID_STAGES = new Set<string>([...PIPELINE_STAGES, 'failed', 'refunded']);

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !body.id || !body.action) return json({ error: 'id and action are required' }, 400);

  const db = getDb(env);
  const row = await db.getById(body.id);
  if (!row) return json({ error: 'not found' }, 404);

  try {
    switch (body.action) {
      case 'setStage':
        if (!VALID_STAGES.has(body.status)) return json({ error: `invalid status "${body.status}"` }, 400);
        await db.setStage(body.id, body.status);
        break;
      case 'setComplexity':
        await db.setComplexity(body.id, body.tier, body.recommendation);
        break;
      case 'markDepositPaid': {
        await db.markDepositPaid(body.id);
        // Deposit clearing IS "approved for build" — generate the tech
        // handoff doc right here, off the row as it stood at approval.
        const updated = await db.getById(body.id);
        if (updated) await db.saveHandoff(body.id, buildHandoffMarkdown(updated));
        break;
      }
      case 'addWeeklyUpdate':
        await db.addWeeklyUpdate(body.id, {
          date: new Date().toISOString(),
          summary: body.summary,
          blocker: body.blocker,
          blocker_detail: body.blockerDetail,
        });
        break;
      default:
        return json({ error: 'unknown action' }, 400);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  return json({ ok: true }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
