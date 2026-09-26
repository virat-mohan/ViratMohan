// Lead email assistant: the pure parts. Parsing, filtering, thread matching,
// intent, stage transitions, reply drafting in Virat's voice and the voice check.
// No network, no database: everything here is unit-tested.

export type LeadStage = 'new' | 'contacted' | 'nda_sent' | 'nda_signed' | 'discovery' | 'proposal' | 'won' | 'lost' | 'paused';

export type Lead = {
  id: string; brand_name: string; contact_name: string | null; contact_email: string | null;
  stage: LeadStage; next_step: string | null; next_step_due: string | null;
};

export type MailAttachment = { filename: string; mimeType: string };
export type MailMessage = {
  id: string; threadId: string;
  from: string; fromName: string; to: string[];
  subject: string; date: string; body: string;
  messageIdHeader: string; references: string;
  headers: Record<string, string>; // lower-cased names
  attachments: MailAttachment[];
  labelIds: string[];
};

export const addr = (s: string) => (/<([^>]+)>/.exec(s)?.[1] ?? s).trim().toLowerCase();
export const displayName = (s: string) => (/^\s*"?([^"<]+?)"?\s*</.exec(s)?.[1] ?? '').trim();

// ── Filtering ───────────────────────────────────────────────────────────────
const NOREPLY = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?|newsletter|news|updates|marketing|bounce[s]?|alerts?|info@.*(substack|mailchimp))/i;
const AUTO_SUBJECT = /^(auto(matic)?[- ]?reply|out of (the )?office|ooo\b|away from|undeliverable|delivery status notification|mail delivery failed)/i;

/** Newsletters, bulk mail, auto-replies and bounces. */
export function isAutomated(m: MailMessage): boolean {
  const h = m.headers;
  if (h['list-unsubscribe'] || h['list-id']) return true;
  if (/^(bulk|list|junk|auto_reply)$/i.test(h['precedence'] ?? '')) return true;
  if (h['auto-submitted'] && !/^no$/i.test(h['auto-submitted'])) return true;
  if (h['x-autoreply'] || h['x-autorespond']) return true;
  if (NOREPLY.test(addr(m.from).split('@')[0] + '@' + (addr(m.from).split('@')[1] ?? ''))) return true;
  if (AUTO_SUBJECT.test(m.subject.trim())) return true;
  if (m.labelIds.some((l) => ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS', 'CATEGORY_UPDATES', 'SPAM'].includes(l))) return true;
  return false;
}

const ENQUIRY = /\b(my (brand|business|store|shop|label|product)|our (brand|business|store|products?)|retail ?os|devshop|work with you|partner(ship)?|collaborat|launch (my|our)|sell (online|my|our)|online (store|business)|interested in|enquir|inquir|founder)\b/i;

/** A first email from a stranger that reads like someone wanting to do business. */
export function looksLikeEnquiry(m: MailMessage): boolean {
  if (isAutomated(m)) return false;
  return ENQUIRY.test(`${m.subject}\n${m.body.slice(0, 3000)}`);
}

// ── Thread matching ─────────────────────────────────────────────────────────
export type MatchIndex = { leadsByEmail: Map<string, Lead>; leadIdByThread: Map<string, string>; leadsById: Map<string, Lead> };

export function buildIndex(leads: Lead[], threads: { lead_id: string; gmail_thread_id: string }[]): MatchIndex {
  const leadsByEmail = new Map<string, Lead>(), leadsById = new Map<string, Lead>(), leadIdByThread = new Map<string, string>();
  for (const l of leads) { leadsById.set(l.id, l); if (l.contact_email) leadsByEmail.set(l.contact_email.trim().toLowerCase(), l); }
  for (const t of threads) if (t.gmail_thread_id) leadIdByThread.set(t.gmail_thread_id, t.lead_id);
  return { leadsByEmail, leadIdByThread, leadsById };
}

/** Which lead a message belongs to: a known lead thread first, then the sender (inbound) or recipients (outbound). */
export function matchLead(m: MailMessage, idx: MatchIndex, mailbox: string): { lead: Lead; via: 'thread' | 'email' } | null {
  const byThread = idx.leadIdByThread.get(m.threadId);
  if (byThread && idx.leadsById.has(byThread)) return { lead: idx.leadsById.get(byThread)!, via: 'thread' };
  const outbound = addr(m.from) === mailbox.toLowerCase();
  const candidates = outbound ? m.to.map(addr) : [addr(m.from)];
  for (const c of candidates) { const l = idx.leadsByEmail.get(c); if (l) return { lead: l, via: 'email' }; }
  return null;
}

// ── Intent and stage ────────────────────────────────────────────────────────
export type Intent = 'nda_signed' | 'nda_pending' | 'answers' | 'published_terms' | 'high_stakes' | 'general';

const HIGH_STAKES: { tag: string; re: RegExp }[] = [
  { tag: 'negotiation', re: /\b(negotiat|counter[- ]?offer|better (deal|rate|terms)|lower (the )?(fee|split|commission|price)|can you (do|reduce|waive)|discount|revis(e|ed) (the )?(terms|split|agreement))/i },
  { tag: 'legal', re: /\b(lawyer|legal (team|counsel|review)|redline|amend(ment)?|clause|indemn|liabilit|jurisdiction|arbitration|breach|court)\b/i },
  { tag: 'money', re: /\b(invoice|refund|payment (terms|schedule)|pay (you|upfront)|transfer|bank details|wire|advance|₹\s?\d|rs\.?\s?\d|inr\s?\d|\d+\s?(lakh|crore|k)\b)/i },
  { tag: 'custom_terms', re: /\b(custom (terms|deal|arrangement)|exclusiv|special (terms|arrangement)|different (terms|split)|equity|invest(ment|or)?|valuation)\b/i },
];
const PRICING_Q = /\b(pric(e|es|ing)|cost|fees?|charges?|split|commission|terms|how much|deposit|what do you take)\b/i;
const NDA_FILE = /\b(nda|ncnda|non[- ]?disclosure|non[- ]?circumvention)\b/i;

export function highStakesTags(text: string): string[] {
  return HIGH_STAKES.filter((h) => h.re.test(text)).map((h) => h.tag);
}

export function hasSignedNda(m: MailMessage): boolean {
  const file = m.attachments.some((a) => NDA_FILE.test(a.filename.replace(/[_.-]/g, ' ')) && /(pdf|word|document|image)/i.test(a.mimeType + ' ' + a.filename.split('.').pop()));
  // An NDA file attached to a reply is the signed copy coming back; Virat checks it before approving.
  return file;
}

const QUESTIONS_ANSWERED = /(^|\n)\s*(\d+[.)]|q\d|[-*•])\s+\S/;

export function classifyIntent(m: MailMessage, lead: Lead): { intent: Intent; tags: string[] } {
  const text = `${m.subject}\n${m.body}`;
  const tags = highStakesTags(text);
  if (tags.length) return { intent: 'high_stakes', tags };
  if (hasSignedNda(m)) return { intent: 'nda_signed', tags };
  if (lead.stage === 'nda_sent' && NDA_FILE.test(text)) return { intent: 'nda_pending', tags };
  if (['nda_signed', 'discovery'].includes(lead.stage) && (QUESTIONS_ANSWERED.test(m.body) || m.body.length > 600)) return { intent: 'answers', tags };
  if (PRICING_Q.test(text)) return { intent: 'published_terms', tags };
  return { intent: 'general', tags };
}

export type StagePlan = { stage: LeadStage; next_step: string; due_days: number };

/** Where the lead goes next. Stages only ever move forward; won/lost/paused are left for Virat. */
export function nextStage(current: LeadStage, intent: Intent): StagePlan {
  const order: LeadStage[] = ['new', 'contacted', 'nda_sent', 'nda_signed', 'discovery', 'proposal', 'won'];
  const fwd = (to: LeadStage): LeadStage => (['won', 'lost', 'paused'].includes(current) ? current : order.indexOf(to) > order.indexOf(current) ? to : current);
  switch (intent) {
    case 'nda_signed': return { stage: fwd('nda_signed'), next_step: 'Book the intro call', due_days: 2 };
    case 'nda_pending': return { stage: current, next_step: 'Wait for the signed NDA', due_days: 3 };
    case 'answers': return { stage: fwd('discovery'), next_step: 'Discovery call, then proposal', due_days: 2 };
    case 'published_terms': return { stage: fwd('contacted'), next_step: 'Call to walk through the standard terms', due_days: 2 };
    case 'high_stakes': return { stage: current, next_step: 'Virat to reply personally', due_days: 1 };
    default: return { stage: fwd('contacted'), next_step: 'Reply and agree the next step', due_days: 2 };
  }
}

/** Stage changes that are facts on receipt, applied straight away (not waiting for approval). */
export function stageOnReceipt(current: LeadStage, intent: Intent): LeadStage {
  return intent === 'nda_signed' ? nextStage(current, intent).stage : current;
}

// ── Call times ──────────────────────────────────────────────────────────────
const IST = 330 * 60_000;
/** Three slots on the next open weekdays (Mon to Fri), 11am, 3pm and 5pm IST, starting tomorrow. */
export function proposeCallTimes(now: Date, n = 3): string[] {
  const hours = [11, 15, 17];
  const out: string[] = [];
  let d = new Date(now.getTime() + IST);
  d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  let i = 0;
  while (out.length < n && i < 14) {
    d = new Date(d.getTime() + 86_400_000); i++;
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const h = hours[out.length % hours.length];
    out.push(`${label}, ${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'} IST`);
  }
  return out;
}

// ── Voice ───────────────────────────────────────────────────────────────────
const SLOP = /\b(great question|i'?d be (happy|delighted) to|hope this (email|message) finds you|don'?t hesitate|circle back|touch base|synerg|leverage|delve|game[- ]?chang|revolutioni[sz]e|seamless(ly)?|cutting[- ]edge|at your earliest convenience|kindly)\b/i;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

/** Problems with a draft against Virat's voice rules. Empty means it passes. */
export function voiceIssues(text: string): string[] {
  const issues: string[] = [];
  if (/\b(we|we're|we've|we'll|we'd|our|ours|us)\b/i.test(text.replace(/\bU\.?S\.?\b/g, ''))) issues.push('Uses "we/our/us": Virat writes as "I".');
  if (SLOP.test(text)) issues.push('Contains filler or AI-sounding phrases.');
  if (EMOJI.test(text)) issues.push('Contains emoji.');
  if (/—/.test(text.replace(/\n\n— Virat$/, ''))) issues.push('Contains an em-dash.');
  if (text.split(/\s+/).length > 220) issues.push('Too long: keep it brief.');
  return issues;
}

// ── Drafting ────────────────────────────────────────────────────────────────
export const TERMS_URL = 'https://viratmohan.com/retail-os/docs/DevShop-Retail-OS-Partnership-Terms.docx';
export const WHATSAPP_CTA = 'https://wa.me/'; // number filled by the caller when known

export type DraftInput = {
  lead: Lead; message: MailMessage; intent: Intent; now: Date;
  facts?: string | null; // a grounded Brain answer for their question, already voice-checked
};

function firstName(lead: Lead, m: MailMessage): string {
  const n = (lead.contact_name || m.fromName || '').trim().split(/\s+/)[0];
  return n && /^[\p{L}'-]+$/u.test(n) ? n : 'there';
}

/** Their words, retold to them: "we sell candles" becomes "you sell candles". */
export function toSecondPerson(s: string): string {
  const map: Record<string, string> = { we: 'you', "we're": "you're", "we've": "you've", "we'll": "you'll", "we'd": "you'd", our: 'your', ours: 'yours', us: 'you', i: 'you', "i'm": "you're", "i've": "you've", my: 'your', me: 'you', mine: 'yours' };
  const out = s.replace(/\b(we're|we've|we'll|we'd|we|ours|our|us|i'm|i've|i|my|mine|me)\b/gi, (w) => { const r = map[w.toLowerCase()]; return w[0] === w[0].toUpperCase() && w.toLowerCase() !== 'i' ? r[0].toUpperCase() + r.slice(1) : r; });
  return out[0] ? out[0].toUpperCase() + out.slice(1) : out;
}

function summarise(body: string): string[] {
  const clean = body.split(/\n\s*(On .+wrote:|From: .+|-----Original Message-----)/)[0];
  return clean.split(/\n\s*\n|\n(?=\s*(\d+[.)]|[-*•])\s)/).map((p) => (p ?? '').replace(/^\s*(\d+[.)]|[-*•])\s*/, '').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 25 && !/^(hi|hello|dear|thanks|thank you|regards|best|cheers)\b/i.test(p))
    .slice(0, 3).map((p) => { const s = toSecondPerson(p.split(/(?<=[.!?])\s/)[0]); return s.length > 140 ? s.slice(0, 137).trimEnd() + '...' : s; });
}

const times = (now: Date) => proposeCallTimes(now).map((t) => `- ${t}`).join('\n');

/** The reply text, in Virat's voice. Returns null for intents that must go to Virat instead. */
export function draftReply(d: DraftInput): string | null {
  const name = firstName(d.lead, d.message);
  const hi = `Hi ${name},`;
  const sign = '\n\nVirat';
  const ask = `Would one of these times work for a 30 minute call? I'd like to hear how you run things today, so the plan I bring back fits you rather than a template.\n${times(d.now)}\n\nIf none suit, send me a time that does.`;
  switch (d.intent) {
    case 'high_stakes': return null;
    case 'nda_signed':
      return `${hi}\n\nThank you, I've got the signed NDA and filed it. That means you can talk to me openly about ${d.lead.brand_name}.\n\n${ask}${sign}`;
    case 'nda_pending':
      return `${hi}\n\nThanks for coming back to me. Whenever the NDA is signed, just reply here with it attached. I ask for it first so you can share your numbers with me freely.\n\nIf anything in it is unclear, tell me and I'll explain.${sign}`;
    case 'answers': {
      const s = summarise(d.message.body);
      const recap = s.length ? `Here's what I've taken from it:\n${s.map((x) => `- ${x}`).join('\n')}\n\n` : '';
      return `${hi}\n\nThank you for taking the time to answer these properly. It helps me plan around what ${d.lead.brand_name} actually needs.\n\n${recap}${ask}${sign}`;
    }
    case 'published_terms':
      return `${hi}\n\nGood to hear from you. My standard terms are all in one document, so you can see exactly how it works:\n${TERMS_URL}\n\n${d.facts ? d.facts + '\n\n' : ''}I keep the terms the same for every founder, which is why I'd rather walk you through them on a call than summarise them here. ${ask}${sign}`;
    default:
      return `${hi}\n\nThanks for writing. ${d.facts ? d.facts + ' ' : ''}The quickest way for me to understand ${d.lead.brand_name} and show you what the first 7 days would look like is a short call.\n\n${ask}${sign}`;
  }
}

export function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim() || 'your message'}`;
}

/** Two lines of context for Virat. */
export function contextSummary(lead: Lead, m: MailMessage, intent: Intent, tags: string[]): [string, string] {
  const who = `${lead.contact_name || m.fromName || addr(m.from)} (${lead.brand_name}), stage ${lead.stage.replace('_', ' ')}`;
  const what: Record<Intent, string> = {
    nda_signed: 'Sent the signed NDA. I have drafted a thank-you with call times.',
    nda_pending: 'Wrote about the NDA but no signed copy yet. Draft asks for it.',
    answers: 'Sent answers to the discovery questions. Draft thanks them and proposes call times.',
    published_terms: 'Asked about pricing or terms. Draft links the published terms only and offers a call.',
    high_stakes: `Needs you, no draft written (${tags.join(', ')}).`,
    general: 'General message. Draft proposes a call.',
  };
  return [`${who}: "${m.subject}"`, what[intent]];
}
