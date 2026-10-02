import { describe, it, expect } from 'vitest';
import { inboxFromWebhook, threads, canReplyFreeForm } from '../../src/lib/whatsapp-inbox';

const hook = (value: any) => ({ entry: [{ changes: [{ field: 'messages', value }] }] });

describe('whatsapp inbox', () => {
  it('reads messages with the contact name, echoes from the phone app, and statuses', () => {
    const r = inboxFromWebhook(hook({
      contacts: [{ wa_id: '919999', profile: { name: 'Asha' } }],
      messages: [{ id: 'm1', from: '919999', timestamp: '1790850000', type: 'text', text: { body: 'Is the cap in stock?' } },
        { id: 'm2', from: '919999', timestamp: '1790850060', type: 'image', image: { id: 'img1' } }],
      message_echoes: [{ id: 'e1', to: '919999', timestamp: '1790850100', type: 'text', text: { body: 'Yes it is' } }],
      statuses: [{ id: 'o1', status: 'read' }],
    }));
    expect(r.messages.map((m) => [m.direction, m.body, m.contact_name])).toEqual([
      ['in', 'Is the cap in stock?', 'Asha'], ['in', '[image]', 'Asha'], ['out', 'Yes it is', null]]);
    expect(r.messages[1].media_id).toBe('img1');
    expect(r.statuses).toEqual([{ wa_message_id: 'o1', status: 'read' }]);
  });
  it('free-form replies only within 24 hours of the customer\'s last message', () => {
    const now = new Date('2026-10-02T12:00:00Z');
    const m = (at: string, direction: 'in' | 'out' = 'in') => ({ wa_message_id: at, direction, contact_phone: '1', contact_name: null, body: '', media_id: null, at });
    expect(canReplyFreeForm([m('2026-10-02T00:00:00Z')], now)).toBe(true);
    expect(canReplyFreeForm([m('2026-09-30T00:00:00Z'), m('2026-10-02T11:00:00Z', 'out')], now)).toBe(false);
    const t = threads([m('2026-10-01T10:00:00Z'), { ...m('2026-10-02T10:00:00Z'), contact_phone: '2' }], now);
    expect(t.map((x) => x.phone)).toEqual(['2', '1']);
    expect(t[0].unread).toBe(1);
  });
});
