import { describe, it, expect } from 'vitest';
import { checkVoice, brandVoicePrompt } from '../lib/brand-voice';
const blocks = (t: string) => checkVoice(t).filter((f) => f.level === 'block').map((f) => f.rule);
describe('Fresh For Paws brand voice', () => {
  it('passes on-book copy', () => { expect(blocks('Real food. Ready to eat. Fresh For Paws, made for Vanilla since 2018.')).toEqual([]); });
  it('blocks unconfirmed claims', () => { expect(blocks('Vet-formulated, human grade meals')).toHaveLength(2); });
  it('blocks medical claims', () => { expect(blocks('This recipe cures kidney disease')).toContain('medical claim'); });
  it('blocks name errors', () => { expect(blocks('Try FreshForPaws today')).toContain('write "Fresh For Paws" (three words)'); expect(blocks('Fresh for Paws')).toContain('capitalise "For": Fresh For Paws'); });
  it('allows the domain', () => { expect(blocks('Order at freshforpaws.com')).toEqual([]); });
  it('blocks DevShop leaks', () => { expect(blocks("Powered by DevShop. Let's talk.")).toHaveLength(1); });
  it('warns on prices', () => { expect(checkVoice('Only ₹249').some((f) => f.level === 'warn')).toBe(true); });
  it('prompt carries the rules', () => { expect(brandVoicePrompt('post')).toContain('Fresh For Purrs'); });
});
