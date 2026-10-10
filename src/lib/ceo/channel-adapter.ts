// Channel Adapter: normalises all founder input channels into one canonical FounderInput.
// Three channels feed the SAME CEO context:
//   1. Command Centre (internal) — always available
//   2. founder@viratmohan.com — SETUP_REQUIRED (needs Gmail connector credentials)
//   3. Founder WhatsApp Business +91 80769 19458 — SETUP_REQUIRED (needs Meta WhatsApp API)
//
// The CEO never sees the channel — it sees a FounderInput.
// Nothing here calls external services; adapters translate structured payloads from
// connector webhooks (which are handled in the API layer) into FounderInput.

import { classifyFounderInput, type FounderInput } from './founder-input';
import type { CommChannel } from './types';
import { VIRAT } from '../work/actors';

// ── Channel state ─────────────────────────────────────────────────────────────────────────────────

export type ChannelState =
  | 'connected'         // live and receiving messages
  | 'partial'           // registered but not receiving (e.g. send-only)
  | 'setup_required'    // credentials / provider setup needed
  | 'not_configured';   // explicitly not wired

export interface ChannelStatus {
  channel: CommChannel;
  state: ChannelState;
  detail: string;
  setupSteps: string[];
}

// ── Command Centre channel ────────────────────────────────────────────────────────────────────────

/** Always available: the Founder Command Centre is the primary input surface. */
export const COMMAND_CENTRE_STATUS: ChannelStatus = {
  channel: 'internal',
  state: 'connected',
  detail: 'Founder Command Centre at /retail-os/admin/control-tower — primary CEO interface',
  setupSteps: [],
};

/**
 * Adapt a Command Centre request to a canonical FounderInput.
 * This is the synchronous, always-available path.
 */
export function adaptCommandCentre(
  text: string,
  opts: { brand?: string | null; work_id?: string | null; thread_id?: string | null; now?: Date } = {},
): FounderInput {
  return classifyFounderInput(text, VIRAT, {
    channel: 'internal',
    brand: opts.brand ?? null,
    work_id: opts.work_id ?? null,
    thread_id: opts.thread_id ?? null,
    now: opts.now,
  });
}

// ── Email channel ─────────────────────────────────────────────────────────────────────────────────

/** Email channel is SETUP_REQUIRED: needs Gmail API credentials and inbound routing in the API layer. */
export const EMAIL_CHANNEL_STATUS: ChannelStatus = {
  channel: 'email',
  state: 'setup_required',
  detail: 'founder@viratmohan.com must be configured as a Gmail connector with inbound webhook routing to /retail-os/api/admin/ceo-input',
  setupSteps: [
    'Connect Gmail to viratmohan.com via the Gmail MCP connector',
    'Create an inbound route: messages from virat@* or known addresses → POST /retail-os/api/admin/ceo-input',
    'Add GMAIL_INBOUND_SECRET to Vercel env',
    'Test: send "Hello CEO" from viratmohan@gmail.com, expect a classification response',
  ],
};

export interface InboundEmail {
  from: string;
  subject: string;
  bodyText: string;
  threadId?: string | null;
  messageId?: string | null;
  at?: Date;
}

const KNOWN_FOUNDER_EMAILS = new Set(['viratmohan@gmail.com', 'founder@viratmohan.com']);

/**
 * Adapt an inbound email to a canonical FounderInput.
 * Only processes messages from known founder addresses.
 */
export function adaptEmail(email: InboundEmail): FounderInput | { error: 'unknown_sender' | 'setup_required' } {
  if (!KNOWN_FOUNDER_EMAILS.has(email.from.toLowerCase().trim())) {
    return { error: 'unknown_sender' };
  }
  const text = email.subject && !email.bodyText.toLowerCase().startsWith(email.subject.toLowerCase())
    ? `${email.subject}: ${email.bodyText}`.trim()
    : email.bodyText.trim();

  return classifyFounderInput(text, VIRAT, {
    channel: 'email',
    thread_id: email.threadId ?? null,
    now: email.at,
  });
}

// ── WhatsApp channel ──────────────────────────────────────────────────────────────────────────────

/** WhatsApp channel is SETUP_REQUIRED: needs Meta WhatsApp Business API and webhook setup. */
export const WHATSAPP_CHANNEL_STATUS: ChannelStatus = {
  channel: 'whatsapp',
  state: 'setup_required',
  detail: 'Founder WhatsApp Business +91 80769 19458 requires Meta WhatsApp Business API webhook configured to POST /retail-os/api/admin/ceo-input',
  setupSteps: [
    'Set up Meta WhatsApp Business API for +91 80769 19458',
    'Configure webhook: incoming messages → POST /retail-os/api/admin/ceo-input with channel=whatsapp',
    'Add WHATSAPP_VERIFY_TOKEN and WHATSAPP_API_TOKEN to Vercel env',
    'Enable coexistence mode so the normal WhatsApp Business app still works',
    'Test: send "What is happening today?" from the founder number',
  ],
};

export interface InboundWhatsApp {
  from: string;           // phone number, e.g. '+919876543210'
  text: string;
  messageId?: string | null;
  contextMessageId?: string | null; // reply context
  at?: Date;
}

const KNOWN_FOUNDER_WHATSAPP = new Set(['+918076919458', '918076919458']);

/**
 * Adapt an inbound WhatsApp message to a canonical FounderInput.
 * Coexistence mode means the number also runs a normal WA Business app;
 * only webhook-delivered messages enter the CEO context.
 */
export function adaptWhatsApp(msg: InboundWhatsApp): FounderInput | { error: 'unknown_sender' | 'setup_required' } {
  if (!KNOWN_FOUNDER_WHATSAPP.has(msg.from.replace(/\s+/g, ''))) {
    return { error: 'unknown_sender' };
  }
  return classifyFounderInput(msg.text, VIRAT, {
    channel: 'whatsapp',
    thread_id: msg.contextMessageId ?? null,
    now: msg.at,
  });
}

// ── Channel registry ──────────────────────────────────────────────────────────────────────────────

export const CHANNEL_STATUSES: ChannelStatus[] = [
  COMMAND_CENTRE_STATUS,
  EMAIL_CHANNEL_STATUS,
  WHATSAPP_CHANNEL_STATUS,
];

export function channelStatus(channel: CommChannel): ChannelStatus {
  return CHANNEL_STATUSES.find((s) => s.channel === channel) ?? {
    channel,
    state: 'not_configured',
    detail: `Channel ${channel} is not configured`,
    setupSteps: [],
  };
}
