import { describe, expect, it } from 'vitest';
import { CHAT_SYSTEM, VIRAT_TOOL, approveLink, viratRequestEmail } from '../../src/lib/retail-os-chat';

const rules = CHAT_SYSTEM.split('FAQ knowledge')[0];

describe('chat prompt rules', () => {
  it('keeps the promises word for word', () => {
    for (const p of ['3–7 days after signing', 'results every Monday', 'before 1 PM IST', 'three ways to work']) expect(rules).toContain(p);
  });
  it('speaks as "I", never "we", and discloses it is an AI assistant', () => {
    expect(rules).toMatch(/first person "I"/);
    expect(rules).toContain('Never "we"');
    expect(rules).toContain("I'm Virat's AI assistant");
    expect(rules).not.toMatch(/\bwe (build|run|will|can)\b/i);
  });
  it('escalates with context and an honest next step', () => {
    for (const p of ['so Virat comes prepared and doesn\'t waste your time', 'Virat will look at this today and I\'ll send you a time', 'request_virat', 'never share a booking link yourself']) expect(rules).toContain(p);
    expect(VIRAT_TOOL.input_schema.required).toEqual(expect.arrayContaining(['name', 'contact', 'summary']));
  });
  it('forbids invented numbers', () => expect(rules).toMatch(/Never invent numbers/));
});

describe('Virat approval email', () => {
  it('builds a WhatsApp approve link for phone numbers', () => {
    expect(approveLink('98765 43210', 'https://cal.example/v')).toMatch(/^https:\/\/wa\.me\/919876543210\?text=.*cal\.example/);
  });
  it('builds a mailto approve link for email contacts', () => {
    expect(approveLink('asha@brand.in')).toMatch(/^mailto:asha@brand\.in\?/);
  });
  it('has no approve link without contact', () => expect(approveLink('')).toBeNull());
  it('puts the context before the approve link and escapes input', () => {
    const { html } = viratRequestEmail({ name: 'Asha <b>', brand: 'Chai Co, tea', wants: 'custom terms', timeline: 'this month', contact: '9876543210', reason: 'high_stakes', summary: 'Selling ₹2L a month.' }, '/', 's1');
    expect(html).toContain('Asha &lt;b&gt;');
    expect(html.indexOf('Selling')).toBeLessThan(html.indexOf('Approve'));
  });
});
