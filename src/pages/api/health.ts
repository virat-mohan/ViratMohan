export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/env';
import { serviceDb } from '../../lib/ledger';
import { mailConfigured } from '../../lib/mail/send';

type HealthCheck = {
  name: string;
  ok: boolean;
  error?: string;
};

type HealthResponse = {
  ok: boolean;
  timestamp: string;
  checks: HealthCheck[];
  status: 'healthy' | 'degraded' | 'unhealthy';
};

const CRITICAL = new Set(['Supabase', 'Environment']);
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'LEAD_TOKEN_SECRET'] as const;

// A real read of a real table. supabase-js returns failures in `error` instead of throwing, so it is checked.
// Messages are fixed strings: nothing from the database or the environment is echoed back.
async function readTable(name: string, table: string, failure: string): Promise<HealthCheck> {
  try {
    const { error } = await serviceDb(getEnv()).from(table).select('id').limit(1);
    return error ? { name, ok: false, error: failure } : { name, ok: true };
  } catch {
    return { name, ok: false, error: failure };
  }
}

export const GET: APIRoute = async (): Promise<Response> => {
  const env = getEnv();
  const missing = REQUIRED_ENV.filter((k) => !env[k]);
  const checks: HealthCheck[] = [
    await readTable('Supabase', 'leads', 'Cannot connect to database'),
    missing.length > 0 ? { name: 'Environment', ok: false, error: `Missing: ${missing.join(', ')}` } : { name: 'Environment', ok: true },
  ];

  try {
    const emailOk = mailConfigured(env);
    checks.push({ name: 'Email', ok: emailOk, ...(emailOk ? {} : { error: 'Not configured' }) });
  } catch {
    checks.push({ name: 'Email', ok: false, error: 'Configuration check failed' });
  }

  const criticalOk = checks.filter((c) => CRITICAL.has(c.name)).every((c) => c.ok);
  const allOk = checks.every((c) => c.ok);

  const response: HealthResponse = {
    ok: criticalOk,
    timestamp: new Date().toISOString(),
    checks,
    status: !criticalOk ? 'unhealthy' : allOk ? 'healthy' : 'degraded',
  };

  return new Response(JSON.stringify(response), {
    status: criticalOk ? 200 : 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
