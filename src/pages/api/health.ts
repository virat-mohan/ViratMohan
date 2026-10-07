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

export const GET: APIRoute = async (): Promise<Response> => {
  const checks: HealthCheck[] = [];
  const now = new Date();

  // Check Supabase connectivity (critical)
  try {
    const sb = serviceDb(getEnv());
    await sb.rpc('request_start').single();
    checks.push({ name: 'Supabase', ok: true });
  } catch (e) {
    checks.push({ name: 'Supabase', ok: false, error: 'Cannot connect to database' });
  }

  // Check required environment variables (critical)
  try {
    const env = getEnv();
    const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'LEAD_TOKEN_SECRET'];
    const missing = required.filter((k) => !env[k as keyof typeof env]);
    if (missing.length > 0) {
      checks.push({ name: 'Environment', ok: false, error: `Missing: ${missing.join(', ')}` });
    } else {
      checks.push({ name: 'Environment', ok: true });
    }
  } catch (e) {
    checks.push({ name: 'Environment', ok: false, error: 'Cannot read environment' });
  }

  // Check email configuration (non-critical)
  try {
    const env = getEnv();
    const emailOk = mailConfigured(env);
    checks.push({ name: 'Email', ok: emailOk, error: emailOk ? undefined : 'Not configured' });
  } catch (e) {
    checks.push({ name: 'Email', ok: false, error: 'Configuration check failed' });
  }

  const critical = checks.filter((c) => ['Supabase', 'Environment'].includes(c.name));
  const allCriticalOk = critical.every((c) => c.ok);

  const response: HealthResponse = {
    ok: allCriticalOk,
    timestamp: now.toISOString(),
    checks,
    status: allCriticalOk ? 'healthy' : critical.some((c) => !c.ok) ? 'unhealthy' : 'degraded',
  };

  return new Response(JSON.stringify(response), {
    status: allCriticalOk ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  });
};
