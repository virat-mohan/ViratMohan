import { describe, it, expect } from 'vitest';
import {
  adaptCommandCentre,
  adaptEmail,
  adaptWhatsApp,
  channelStatus,
  CHANNEL_STATUSES,
  COMMAND_CENTRE_STATUS,
  EMAIL_CHANNEL_STATUS,
  WHATSAPP_CHANNEL_STATUS,
  type InboundEmail,
  type InboundWhatsApp,
} from '../../../src/lib/ceo/channel-adapter';

describe('Channel Adapter', () => {
  const now = new Date('2026-10-07T09:00:00Z');

  describe('adaptCommandCentre', () => {
    it('classifies an instruction', () => {
      const r = adaptCommandCentre('Fix the checkout bug on caps', { brand: 'caps', now });
      expect(r.kind).toBe('work_request');
      expect(r.channel).toBe('internal');
      expect(r.brand).toBe('caps');
      expect(r.from.id).toBe('DS-00');
    });

    it('classifies a question', () => {
      const r = adaptCommandCentre('What is happening with moonglasses orders?', { now });
      expect(r.kind).toBe('question');
      expect(r.channel).toBe('internal');
    });

    it('classifies a relationship message', () => {
      const r = adaptCommandCentre('Good morning.', { now });
      expect(r.kind).toBe('relationship');
    });

    it('classifies an approval', () => {
      const r = adaptCommandCentre('Approved, go ahead', { work_id: 'W-001', now });
      expect(r.kind).toBe('approval');
      expect(r.work_id).toBe('W-001');
    });

    it('passes thread_id through', () => {
      const r = adaptCommandCentre('Update me', { thread_id: 'thread-123', now });
      expect(r.thread_id).toBe('thread-123');
    });
  });

  describe('adaptEmail', () => {
    it('adapts a known founder email', () => {
      const email: InboundEmail = { from: 'viratmohan@gmail.com', subject: 'Deploy korbi', bodyText: 'Deploy korbi today', at: now };
      const r = adaptEmail(email);
      expect('error' in r).toBe(false);
      if (!('error' in r)) {
        expect(r.channel).toBe('email');
        expect(r.kind).toBe('work_request');
        expect(r.from.id).toBe('DS-00');
      }
    });

    it('rejects unknown senders', () => {
      const email: InboundEmail = { from: 'stranger@example.com', subject: 'Hi', bodyText: 'Hello', at: now };
      const r = adaptEmail(email);
      expect('error' in r).toBe(true);
      if ('error' in r) expect(r.error).toBe('unknown_sender');
    });

    it('combines subject and body when they differ', () => {
      const email: InboundEmail = { from: 'founder@viratmohan.com', subject: 'Urgent', bodyText: 'Fix the payment gateway', at: now };
      const r = adaptEmail(email);
      if (!('error' in r)) {
        expect(r.text).toContain('Urgent');
        expect(r.text).toContain('Fix the payment gateway');
        expect(r.urgency).toBe('critical');
      }
    });

    it('handles case-insensitive email matching', () => {
      const email: InboundEmail = { from: 'ViratMohan@Gmail.Com', subject: 'Test', bodyText: 'Test', at: now };
      const r = adaptEmail(email);
      expect('error' in r).toBe(false);
    });
  });

  describe('adaptWhatsApp', () => {
    it('adapts a message from the founder number', () => {
      const msg: InboundWhatsApp = { from: '+918076919458', text: 'Check why korbi orders dropped', at: now };
      const r = adaptWhatsApp(msg);
      expect('error' in r).toBe(false);
      if (!('error' in r)) {
        expect(r.channel).toBe('whatsapp');
        expect(r.kind).toBe('instruction');
        expect(r.from.id).toBe('DS-00');
      }
    });

    it('rejects unknown numbers', () => {
      const msg: InboundWhatsApp = { from: '+919999999999', text: 'Hello', at: now };
      const r = adaptWhatsApp(msg);
      expect('error' in r).toBe(true);
      if ('error' in r) expect(r.error).toBe('unknown_sender');
    });

    it('handles number without + prefix', () => {
      const msg: InboundWhatsApp = { from: '918076919458', text: 'Good morning.', at: now };
      const r = adaptWhatsApp(msg);
      expect('error' in r).toBe(false);
    });

    it('passes context message id as thread_id', () => {
      const msg: InboundWhatsApp = { from: '+918076919458', text: 'Yes go ahead', contextMessageId: 'wa-msg-42', at: now };
      const r = adaptWhatsApp(msg);
      if (!('error' in r)) {
        expect(r.thread_id).toBe('wa-msg-42');
        expect(r.kind).toBe('approval');
      }
    });
  });

  describe('Channel registry', () => {
    it('has 3 channels', () => {
      expect(CHANNEL_STATUSES).toHaveLength(3);
    });

    it('command centre is connected', () => {
      expect(COMMAND_CENTRE_STATUS.state).toBe('connected');
    });

    it('email is setup_required', () => {
      expect(EMAIL_CHANNEL_STATUS.state).toBe('setup_required');
      expect(EMAIL_CHANNEL_STATUS.setupSteps.length).toBeGreaterThan(0);
    });

    it('whatsapp is setup_required', () => {
      expect(WHATSAPP_CHANNEL_STATUS.state).toBe('setup_required');
      expect(WHATSAPP_CHANNEL_STATUS.setupSteps.length).toBeGreaterThan(0);
    });

    it('channelStatus returns not_configured for unknown channel', () => {
      const s = channelStatus('slack' as any);
      expect(s.state).toBe('not_configured');
    });
  });

  describe('All channels → same FounderInput shape', () => {
    it('all three channels produce a FounderInput with the same fields', () => {
      const cc = adaptCommandCentre('Deploy caps', { brand: 'caps', now });
      const email = adaptEmail({ from: 'viratmohan@gmail.com', subject: 'Deploy caps', bodyText: 'Deploy caps', at: now });
      const wa = adaptWhatsApp({ from: '+918076919458', text: 'Deploy caps', at: now });

      expect('error' in email).toBe(false);
      expect('error' in wa).toBe(false);

      if (!('error' in email) && !('error' in wa)) {
        const fields = ['id', 'kind', 'from', 'channel', 'at', 'text', 'brand', 'work_id', 'thread_id', 'urgency', 'scope'];
        for (const f of fields) {
          expect(f in cc).toBe(true);
          expect(f in email).toBe(true);
          expect(f in wa).toBe(true);
        }
        expect(cc.from.id).toBe(email.from.id);
        expect(cc.from.id).toBe(wa.from.id);
      }
    });
  });
});
