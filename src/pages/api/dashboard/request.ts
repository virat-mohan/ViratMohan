export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env';
import { endpointLimit } from '../../../lib/rate-limit';
import { checkAdminAuth } from '../../../lib/admin-auth';

// Rate limit: 20 admin requests per minute, 100 per hour per IP.
// Admin operations are less frequent than public endpoints.
const limit = endpointLimit({ rules: [{ limit: 20, windowMs: 60_000 }, { limit: 100, windowMs: 3_600_000 }], body: { error: 'Too many dashboard requests. Please wait a moment and try again.' } });

// Max payload size: 50 KB (admin operations can have larger payloads than public APIs)
const MAX_BODY_SIZE = 50 * 1024;

export interface DashboardRequest {
  operationType?: string;
  operationId?: string;
  payload?: unknown;
}

// Dashboard admin request endpoint.
// Rate limited per IP. Input validated and size-capped.
// Requires the admin password (Basic auth). Validates and acknowledges; it changes no data.
export const POST: APIRoute = async ({ request }) => {
  const limited = limit(request);
  if (limited) return limited;

  // Check Content-Length early
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_SIZE) {
    return json({ error: 'Request too large' }, 413);
  }

  const env = getEnv();

  // Same timing-safe, fail-closed check as the admin middleware (Basic auth, 503 when ADMIN_PASSWORD is unset).
  const auth = checkAdminAuth(request.headers.get('authorization'), env.ADMIN_PASSWORD);
  if (!auth.ok) {
    return auth.status === 503 ? json({ error: 'Admin access is not configured' }, 503) : json({ error: 'Unauthorized' }, 401);
  }

  let body: DashboardRequest;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // Validate required fields
  const operationType = (body.operationType || '').trim();
  const operationId = (body.operationId || '').trim();

  if (!operationType || !operationId) {
    return json({ error: 'operationType and operationId are required' }, 400);
  }

  // Validate field lengths
  if (operationType.length > 100 || operationId.length > 255) {
    return json({ error: 'Input too long' }, 400);
  }

  try {
    // Dashboard operations are handled here.
    // For now, acknowledge the request.
    // Actual operations (workflow transitions, approvals, etc.) would be implemented here.
    return json({ ok: true, operationType, operationId }, 200);
  } catch (err) {
    console.error('dashboard request failed', err);
    return json({ error: 'Unable to process request. Please try again in a moment.' }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
