import { describe, it, expect } from 'vitest';
import { isProtectedPath, checkAdminAuth } from '../../src/lib/admin-auth';

// Regression coverage for failure mode #19 (brief §21): "unauthorized admin
// request" — admin/pipeline routes had ZERO authentication before the P0
// fix in src/middleware.ts. These tests pin the auth decision so a future
// refactor of the middleware can't silently reopen that hole.
describe('isProtectedPath', () => {
  it('protects admin pages, framework editing, and pipeline tracking', () => {
    expect(isProtectedPath('/devshop/admin')).toBe(true);
    expect(isProtectedPath('/devshop/admin/abc-123')).toBe(true);
    expect(isProtectedPath('/devshop/admin/frameworks')).toBe(true);
    expect(isProtectedPath('/devshop/api/track-update')).toBe(true);
    expect(isProtectedPath('/devshop/api/frameworks')).toBe(true);
    expect(isProtectedPath('/devshop/api/review-action')).toBe(true);
    expect(isProtectedPath('/devshop/api/delete-submission')).toBe(true);
  });

  it('protects the demo approve-and-send route (it emails client content)', () => {
    expect(isProtectedPath('/devshop/api/approve')).toBe(true);
    // What the middleware does with an anonymous request to it: 401, before the route runs.
    expect(checkAdminAuth(null, 'secret')).toEqual({ ok: false, status: 401 });
  });

  it('does not protect public intake/demo/tracker routes', () => {
    expect(isProtectedPath('/devshop')).toBe(false);
    expect(isProtectedPath('/devshop/api/intake')).toBe(false);
    expect(isProtectedPath('/devshop/track/abc-123')).toBe(false);
  });

  it('does not false-positive on a route that merely shares a prefix string', () => {
    expect(isProtectedPath('/devshop/administrator-portal')).toBe(false);
  });
});

describe('checkAdminAuth', () => {
  it('fails closed (503) when ADMIN_PASSWORD is unset, even with a header present', () => {
    const result = checkAdminAuth('Basic ' + btoa('admin:anything'), undefined);
    expect(result).toEqual({ ok: false, status: 503 });
  });

  it('rejects a missing Authorization header (401)', () => {
    const result = checkAdminAuth(null, 'correct-password');
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it('rejects a wrong password (401)', () => {
    const result = checkAdminAuth('Basic ' + btoa('admin:wrong-password'), 'correct-password');
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it('rejects an equal-length wrong header (timing-safe path, 401)', () => {
    const right = 'Basic ' + btoa('admin:correct-password');
    const wrong = 'Basic ' + btoa('admin:correct-passworX'); // same decoded length
    expect(wrong.length).toBe(right.length);
    expect(checkAdminAuth(wrong, 'correct-password')).toEqual({ ok: false, status: 401 });
  });

  it('accepts the correct password', () => {
    const result = checkAdminAuth('Basic ' + btoa('admin:correct-password'), 'correct-password');
    expect(result).toEqual({ ok: true });
  });
});
