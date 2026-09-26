// How the business talks to people. Always as Virat. The Brain picks channel, time and dedupe key;
// the outbox owner's notify() does the sending.
import { createHash } from 'node:crypto';
import type { Channel, NotifyPort, OutboundMessage, Purpose, Recipient } from './types';

export const DEFAULT_TZ = 'Asia/Kolkata';
export const QUIET = { startHour: 9, endHour: 20, days: [1, 2, 3, 4, 5, 6] }; // Mon–Sat, 09:00–20:00 local
const SHORT = 400;

export function chooseChannel(r: Recipient, p: Purpose, content: string): { channel: Channel; why: string } {
  if (!r.phone && r.email) return { channel: 'email', why: 'Only an email address on file.' };
  if (r.phone && !r.email) return { channel: 'whatsapp', why: 'Only a WhatsApp number on file.' };
  if (r.firstContact) return { channel: 'email', why: 'First contact goes by email.' };
  if (p.formal) return { channel: 'email', why: 'Formal message goes by email.' };
  if (p.needsRecord) return { channel: 'email', why: 'Needs a record, so email.' };
  if (content.length > SHORT) return { channel: 'email', why: 'Too long for WhatsApp.' };
  return { channel: 'whatsapp', why: p.timeSensitive ? 'Short and time-sensitive, one to one.' : 'Short, one to one.' };
}

function local(d: Date, tz: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Earliest moment at or after `now` inside the recipient's allowed hours. Urgent sends now. */
export function sendAfter(now: Date, tz = DEFAULT_TZ, urgent = false): Date {
  if (urgent) return now;
  let t = new Date(now.getTime());
  for (let i = 0; i < 8; i++) {
    const { day, minutes } = local(t, tz);
    const open = QUIET.startHour * 60, close = QUIET.endHour * 60;
    if (QUIET.days.includes(day) && minutes >= open && minutes < close) return t;
    const toOpen = minutes < open && QUIET.days.includes(day) ? open - minutes : 24 * 60 - minutes + open;
    t = new Date(t.getTime() + toOpen * 60_000);
    t.setUTCSeconds(0, 0);
  }
  return t;
}

export function dedupeKey(r: Recipient, p: Purpose, content: string) {
  const who = (r.phone || r.email || r.name).toLowerCase().replace(/\s+/g, '');
  const what = p.ref ? `${p.kind}:${p.ref}` : `${p.kind}:${content.trim().toLowerCase().replace(/\s+/g, ' ')}`;
  return createHash('sha256').update(`${who}|${what}`).digest('hex').slice(0, 32);
}

export type CommunicatePlan = OutboundMessage & { why: string };

export function planMessage(r: Recipient, p: Purpose, content: string, now = new Date()): CommunicatePlan {
  const { channel, why } = chooseChannel(r, p, content);
  const signed = /—\s*virat\s*$|virat\s*$/i.test(content.trim()) ? content.trim() : `${content.trim()}\n\n— Virat`;
  return {
    channel, why, from: 'virat', purpose: p.kind,
    to: { name: r.name, phone: r.phone, email: r.email },
    subject: channel === 'email' ? (p.subject ?? `From Virat: ${p.kind.replace(/_/g, ' ')}`) : undefined,
    body: signed,
    sendAfter: sendAfter(now, r.timezone || DEFAULT_TZ, !!p.urgent).toISOString(),
    dedupeKey: dedupeKey(r, p, content),
  };
}

export async function communicate(notify: NotifyPort | undefined, r: Recipient, p: Purpose, content: string, now = new Date()) {
  const plan = planMessage(r, p, content, now);
  const result = notify ? await notify.notify(plan) : null;
  return { ...plan, dispatched: result };
}
