import { describe, it, expect } from 'vitest';
import { describeBrandKey } from '../../src/lib/retail-os-portfolio';

const jwt = (payload: Record<string, unknown>) =>
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
const caps = { name: 'Travaholic Caps', supabaseUrl: 'https://mdornfpcskvjnuawqpqf.supabase.co' };

describe('describeBrandKey', () => {
  it('accepts a service_role key for the same project', () => {
    const r = describeBrandKey({ ...caps, serviceKey: jwt({ ref: 'mdornfpcskvjnuawqpqf', role: 'service_role' }) });
    expect(r.problem).toBeNull();
    expect(r.keyType).toBe('service_role');
  });
  it('names both projects when the key is from another project', () => {
    const r = describeBrandKey({ ...caps, serviceKey: jwt({ ref: 'fewnyteoprmuyzfvopnb', role: 'service_role' }) });
    expect(r.problem).toMatch(/belongs to Supabase project "fewnyteoprmuyzfvopnb"/);
    expect(r.problem).toMatch(/project "mdornfpcskvjnuawqpqf"/);
    expect(r.problem).toMatch(/Vercel/);
  });
  it('rejects the anon key', () => {
    const r = describeBrandKey({ ...caps, serviceKey: jwt({ ref: 'mdornfpcskvjnuawqpqf', role: 'anon' }) });
    expect(r.problem).toMatch(/anon key/);
  });
  it('accepts a new sb_secret_ key without a ref', () => {
    const r = describeBrandKey({ ...caps, serviceKey: 'sb_secret_abc123' });
    expect(r.problem).toBeNull();
    expect(r.keyType).toBe('secret');
  });
  it('flags a truncated or pasted-wrong key', () => {
    expect(describeBrandKey({ ...caps, serviceKey: 'eyJ.abc' }).problem).toMatch(/not a valid Supabase key/);
    expect(describeBrandKey({ ...caps, serviceKey: 'sb_publishable_x' }).problem).toMatch(/publishable/);
  });
  it('flags a URL that is not a Supabase project', () => {
    expect(describeBrandKey({ name: 'X', supabaseUrl: 'https://example.com', serviceKey: 'sb_secret_x' }).problem).toMatch(/not a Supabase project URL/);
  });
});
