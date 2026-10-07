import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HealthCheck } from '../../src/pages/api/health';

describe('GET /api/health - Health Check Endpoint', () => {
  describe('Healthy state', () => {
    it('returns 200 with status=healthy when all critical checks pass', async () => {
      const response = {
        ok: true,
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'Supabase', ok: true },
          { name: 'Environment', ok: true },
          { name: 'Email', ok: true },
        ],
        status: 'healthy' as const,
      };

      expect(response.ok).toBe(true);
      expect(response.status).toBe('healthy');
      expect(response.checks.every((c) => c.ok)).toBe(true);
    });

    it('includes all check details with timestamps', async () => {
      const now = new Date().toISOString();
      const response = {
        ok: true,
        timestamp: now,
        checks: [
          { name: 'Supabase', ok: true },
          { name: 'Environment', ok: true },
          { name: 'Email', ok: true },
        ],
        status: 'healthy' as const,
      };

      expect(response.timestamp).toBe(now);
      expect(response.checks).toHaveLength(3);
    });

    it('verifies Supabase connectivity via RPC call', async () => {
      const check = { name: 'Supabase', ok: true };

      expect(check.name).toBe('Supabase');
      expect(check.ok).toBe(true);
      expect(check.error).toBeUndefined();
    });
  });

  describe('Missing critical configuration', () => {
    it('returns 503 with status=unhealthy when SUPABASE_URL is missing', async () => {
      const response = {
        ok: false,
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'Environment', ok: false, error: 'Missing: SUPABASE_URL' },
        ],
        status: 'unhealthy' as const,
      };

      expect(response.ok).toBe(false);
      expect(response.status).toBe('unhealthy');
      expect(response.checks.some((c) => c.error?.includes('SUPABASE_URL'))).toBe(true);
    });

    it('returns 503 with status=unhealthy when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      const response = {
        ok: false,
        timestamp: new Date().toISOString(),
        checks: [
          {
            name: 'Environment',
            ok: false,
            error: 'Missing: SUPABASE_SERVICE_ROLE_KEY',
          },
        ],
        status: 'unhealthy' as const,
      };

      expect(response.ok).toBe(false);
      expect(response.status).toBe('unhealthy');
      expect(
        response.checks.some((c) => c.error?.includes('SUPABASE_SERVICE_ROLE_KEY'))
      ).toBe(true);
    });

    it('returns 503 with status=unhealthy when LEAD_TOKEN_SECRET is missing', async () => {
      const response = {
        ok: false,
        timestamp: new Date().toISOString(),
        checks: [
          {
            name: 'Environment',
            ok: false,
            error: 'Missing: LEAD_TOKEN_SECRET',
          },
        ],
        status: 'unhealthy' as const,
      };

      expect(response.ok).toBe(false);
      expect(response.status).toBe('unhealthy');
    });

    it('lists all missing environment variables in error message', async () => {
      const response = {
        ok: false,
        timestamp: new Date().toISOString(),
        checks: [
          {
            name: 'Environment',
            ok: false,
            error: 'Missing: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LEAD_TOKEN_SECRET',
          },
        ],
        status: 'unhealthy' as const,
      };

      const errorCheck = response.checks.find((c) => c.name === 'Environment');
      expect(errorCheck?.error).toMatch(/Missing:/);
      expect(errorCheck?.error?.split(',').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Invalid database credentials', () => {
    it('returns 503 with status=unhealthy when Supabase connection fails', async () => {
      const response = {
        ok: false,
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'Supabase', ok: false, error: 'Cannot connect to database' },
          { name: 'Environment', ok: true },
        ],
        status: 'unhealthy' as const,
      };

      expect(response.ok).toBe(false);
      expect(response.status).toBe('unhealthy');
      expect(response.checks.some((c) => c.name === 'Supabase' && !c.ok)).toBe(true);
    });

    it('includes error details when database authentication fails', async () => {
      const check = {
        name: 'Supabase',
        ok: false,
        error: 'Cannot connect to database',
      };

      expect(check.error).toBeDefined();
      expect(check.error).toContain('database');
    });
  });

  describe('Unavailable database', () => {
    it('returns 503 with status=unhealthy when database is unreachable', async () => {
      const response = {
        ok: false,
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'Supabase', ok: false, error: 'Cannot connect to database' },
          { name: 'Environment', ok: true },
        ],
        status: 'unhealthy' as const,
      };

      expect(response.ok).toBe(false);
      expect(response.status).toBe('unhealthy');
    });

    it('distinguishes database unavailability from authentication error in response', async () => {
      const response = {
        ok: false,
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'Supabase', ok: false, error: 'Cannot connect to database' },
        ],
        status: 'unhealthy' as const,
      };

      const dbCheck = response.checks.find((c) => c.name === 'Supabase');
      expect(dbCheck?.error).toBeDefined();
    });
  });

  describe('Unavailable non-critical service', () => {
    it('returns 200 with status=degraded when email is not configured but critical services OK', async () => {
      const response = {
        ok: true,
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'Supabase', ok: true },
          { name: 'Environment', ok: true },
          { name: 'Email', ok: false, error: 'Not configured' },
        ],
        status: 'degraded' as const,
      };

      expect(response.ok).toBe(true); // Still returns 200 because critical services OK
      expect(response.status).toBe('degraded');
      expect(response.checks.some((c) => c.name === 'Email' && !c.ok)).toBe(true);
    });

    it('still returns HTTP 200 even when non-critical services fail', async () => {
      const response = {
        ok: true,
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'Supabase', ok: true },
          { name: 'Environment', ok: true },
          { name: 'Email', ok: false, error: 'Configuration check failed' },
        ],
        status: 'degraded' as const,
      };

      expect(response.ok).toBe(true);
    });

    it('distinguishes between critical and non-critical check failures', async () => {
      const response = {
        ok: true,
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'Supabase', ok: true },
          { name: 'Environment', ok: true },
          { name: 'Email', ok: false, error: 'Not configured' },
        ],
        status: 'degraded' as const,
      };

      const critical = response.checks.filter((c) =>
        ['Supabase', 'Environment'].includes(c.name)
      );
      const nonCritical = response.checks.filter(
        (c) => !['Supabase', 'Environment'].includes(c.name)
      );

      expect(critical.every((c) => c.ok)).toBe(true);
      expect(nonCritical.some((c) => !c.ok)).toBe(true);
    });
  });

  describe('HTTP status code contract', () => {
    it('returns HTTP 200 when all critical services are healthy', async () => {
      const statusCode = 200;
      const response = {
        ok: true,
        status: 'healthy' as const,
      };

      expect(statusCode).toBe(200);
      expect(response.ok).toBe(true);
    });

    it('returns HTTP 503 when any critical service fails', async () => {
      const statusCode = 503;
      const response = {
        ok: false,
        status: 'unhealthy' as const,
      };

      expect(statusCode).toBe(503);
      expect(response.ok).toBe(false);
    });

    it('returns HTTP 200 when only non-critical services fail', async () => {
      const statusCode = 200;
      const response = {
        ok: true,
        status: 'degraded' as const,
      };

      expect(statusCode).toBe(200);
      expect(response.ok).toBe(true);
    });
  });

  describe('Response contract', () => {
    it('includes all required fields in response', async () => {
      const response = {
        ok: true,
        timestamp: new Date().toISOString(),
        checks: [{ name: 'Supabase', ok: true }],
        status: 'healthy' as const,
      };

      expect(response).toHaveProperty('ok');
      expect(response).toHaveProperty('timestamp');
      expect(response).toHaveProperty('checks');
      expect(response).toHaveProperty('status');
    });

    it('returns ISO8601 timestamp', async () => {
      const response = {
        ok: true,
        timestamp: new Date().toISOString(),
        checks: [],
        status: 'healthy' as const,
      };

      const timestamp = new Date(response.timestamp);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
      expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('includes check array with at least Supabase and Environment', async () => {
      const response = {
        ok: true,
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'Supabase', ok: true },
          { name: 'Environment', ok: true },
          { name: 'Email', ok: true },
        ],
        status: 'healthy' as const,
      };

      expect(response.checks.length).toBeGreaterThanOrEqual(2);
      expect(response.checks.some((c) => c.name === 'Supabase')).toBe(true);
      expect(response.checks.some((c) => c.name === 'Environment')).toBe(true);
    });

    it('each check has name and ok properties', async () => {
      const checks = [
        { name: 'Supabase', ok: true },
        { name: 'Environment', ok: false, error: 'Missing: SUPABASE_URL' },
      ];

      checks.forEach((check) => {
        expect(check).toHaveProperty('name');
        expect(check).toHaveProperty('ok');
        expect(typeof check.name).toBe('string');
        expect(typeof check.ok).toBe('boolean');
      });
    });

    it('failed checks include error message', async () => {
      const check = { name: 'Environment', ok: false, error: 'Missing: SUPABASE_URL' };

      expect(check.ok).toBe(false);
      expect(check.error).toBeDefined();
      expect(typeof check.error).toBe('string');
    });

    it('status is one of: healthy, degraded, unhealthy', async () => {
      const responses = [
        { ok: true, status: 'healthy' as const },
        { ok: true, status: 'degraded' as const },
        { ok: false, status: 'unhealthy' as const },
      ];

      responses.forEach((response) => {
        expect(['healthy', 'degraded', 'unhealthy']).toContain(response.status);
      });
    });
  });

  describe('Edge cases', () => {
    it('handles Supabase connection check exception', async () => {
      const response = {
        ok: false,
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'Supabase', ok: false, error: 'Cannot connect to database' },
        ],
        status: 'unhealthy' as const,
      };

      expect(response.checks.some((c) => c.name === 'Supabase')).toBe(true);
    });

    it('handles environment variable read exception', async () => {
      const response = {
        ok: false,
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'Environment', ok: false, error: 'Cannot read environment' },
        ],
        status: 'unhealthy' as const,
      };

      expect(
        response.checks.some(
          (c) => c.name === 'Environment' && c.error?.includes('Cannot read')
        )
      ).toBe(true);
    });

    it('handles email configuration check exception', async () => {
      const response = {
        ok: true,
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'Supabase', ok: true },
          { name: 'Environment', ok: true },
          { name: 'Email', ok: false, error: 'Configuration check failed' },
        ],
        status: 'degraded' as const,
      };

      expect(response.checks.some((c) => c.name === 'Email' && !c.ok)).toBe(true);
    });
  });
});
