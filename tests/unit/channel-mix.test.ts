import { describe, it, expect } from 'vitest';
import { classifyChannel } from '../../src/lib/retail-os-portfolio';

describe('channel classification (first touch)', () => {
  it('our own campaign clicks are paid, whatever else is on the URL', () => {
    expect(classifyChannel({ ad_brief_id: 'abc', utm_source: 'instagram', referrer_host: 'instagram.com' })).toBe('meta_ads');
  });
  it('UTM tags from the growth playbook land in the right channel', () => {
    expect(classifyChannel({ utm_source: 'reel' })).toBe('instagram_facebook');
    expect(classifyChannel({ utm_source: 'whatsapp' })).toBe('whatsapp');
    expect(classifyChannel({ utm_source: 'email' })).toBe('email');
    expect(classifyChannel({ utm_source: 'creator_bikerjay' })).toBe('creators_referrals');
    expect(classifyChannel({ utm_source: 'referral' })).toBe('creators_referrals');
    expect(classifyChannel({ utm_source: 'google_merchant' })).toBe('search');
    expect(classifyChannel({ utm_source: 'villas' })).toBe('other');
  });
  it('falls back to the referrer, then direct', () => {
    expect(classifyChannel({ referrer_host: 'l.instagram.com' })).toBe('instagram_facebook');
    expect(classifyChannel({ referrer_host: 'www.google.com' })).toBe('search');
    expect(classifyChannel({ referrer_host: 'wa.me' })).toBe('whatsapp');
    expect(classifyChannel({})).toBe('direct');
  });
});
