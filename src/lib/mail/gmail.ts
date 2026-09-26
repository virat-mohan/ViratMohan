// The one Gmail API sender and reader for viratmohan.com. Every email the site
// sends leaves from Virat's own mailbox (GMAIL_ADDRESS, viratmohan@gmail.com),
// and lead replies are read from the same mailbox. OAuth refresh token only:
// no password is ever stored. Resend stays as a fallback when Gmail is not set up.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
];
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export type GmailCreds = { clientId: string; clientSecret: string; refreshToken: string; address: string };

export type GmailHeader = { name: string; value: string };
export type GmailPart = { mimeType?: string; filename?: string; headers?: GmailHeader[]; body?: { data?: string; attachmentId?: string; size?: number }; parts?: GmailPart[] };
export type GmailRawMessage = { id: string; threadId: string; labelIds?: string[]; historyId?: string; internalDate?: string; payload?: GmailPart };

/** Everything the site needs from Gmail. Tests pass a mock; production uses fetchGmail(). */
export interface GmailApi {
  listMessageIds(q: string, max?: number): Promise<{ id: string; threadId: string }[]>;
  getMessage(id: string): Promise<GmailRawMessage>;
  createDraft(raw: string, threadId?: string): Promise<{ id: string; messageId: string }>;
  sendDraft(draftId: string): Promise<{ id: string; threadId: string }>;
  sendRaw(raw: string, threadId?: string): Promise<{ id: string; threadId: string }>;
  profile(): Promise<{ emailAddress: string; historyId: string }>;
}

export function gmailConfigured(e: { GMAIL_CLIENT_ID?: string; GMAIL_CLIENT_SECRET?: string; GMAIL_ADDRESS?: string }): boolean {
  return !!(e.GMAIL_CLIENT_ID && e.GMAIL_CLIENT_SECRET && e.GMAIL_ADDRESS);
}

export async function refreshAccessToken(c: GmailCreds, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: 'refresh_token' }),
  });
  if (!res.ok) throw new Error(`Gmail token refresh failed: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return (await res.json() as { access_token: string }).access_token;
}

/** Swap the one-time OAuth code from the connect screen for a refresh token. */
export async function exchangeCode(p: { clientId: string; clientSecret: string; code: string; redirectUri: string }, fetchImpl: typeof fetch = fetch): Promise<{ refreshToken: string | null; scope: string }> {
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: p.clientId, client_secret: p.clientSecret, code: p.code, redirect_uri: p.redirectUri, grant_type: 'authorization_code' }),
  });
  if (!res.ok) throw new Error(`Google code exchange failed: ${res.status}`);
  const j = await res.json() as { refresh_token?: string; scope?: string };
  return { refreshToken: j.refresh_token ?? null, scope: j.scope ?? '' };
}

export function authUrl(p: { clientId: string; redirectUri: string; state: string; loginHint?: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId, redirect_uri: p.redirectUri, response_type: 'code', scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: p.state,
    ...(p.loginHint ? { login_hint: p.loginHint } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export function fetchGmail(c: GmailCreds, fetchImpl: typeof fetch = fetch): GmailApi {
  let token: string | null = null;
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    token ??= await refreshAccessToken(c, fetchImpl);
    const res = await fetchImpl(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
    if (!res.ok) throw new Error(`Gmail ${path.split('?')[0]} failed: ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`);
    return res.json() as Promise<T>;
  }
  return {
    async listMessageIds(q, max = 50) {
      const r = await call<{ messages?: { id: string; threadId: string }[] }>(`/messages?q=${encodeURIComponent(q)}&maxResults=${max}`);
      return r.messages ?? [];
    },
    getMessage: (id) => call(`/messages/${id}?format=full`),
    async createDraft(raw, threadId) {
      const r = await call<{ id: string; message: { id: string } }>('/drafts', { method: 'POST', body: JSON.stringify({ message: { raw, ...(threadId ? { threadId } : {}) } }) });
      return { id: r.id, messageId: r.message.id };
    },
    sendDraft: (draftId) => call('/drafts/send', { method: 'POST', body: JSON.stringify({ id: draftId }) }),
    sendRaw: (raw, threadId) => call('/messages/send', { method: 'POST', body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }) }),
    profile: () => call('/profile'),
  };
}

// ── MIME ────────────────────────────────────────────────────────────────────
export const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const encHeader = (s: string) => (/[^\x20-\x7e]/.test(s) ? `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=` : s);
const wrap76 = (s: string) => s.replace(/.{1,76}/g, '$&\r\n').trimEnd();

/** Always "Virat Mohan <address>". */
export const viratFromHeader = (address: string) => `Virat Mohan <${address}>`;

/** Plain-text twin of an HTML email, for the text/plain part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<div style="display:none[^>]*>[\s\S]*?<\/div>/i, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, t) => { const label = t.replace(/<[^>]+>/g, '').trim(); return href.startsWith('mailto:') || label === href ? label : `${label} (${href})`; })
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|h\d|tr|li|div)>/gi, '\n\n').replace(/<td[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, '·').replace(/&rarr;/g, '→').replace(/&trade;/g, '™').replace(/&mdash;/g, '-')
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export type MimeInput = {
  from: string; to: string; subject: string; text: string; html?: string;
  replyTo?: string; inReplyTo?: string; references?: string;
};

/** RFC 2822 message: multipart/alternative (text + HTML) when HTML is given, else plain text. */
export function buildMime(m: MimeInput, boundary = `vm_${randomBytes(9).toString('hex')}`): string {
  const refs = [m.references, m.inReplyTo].filter(Boolean).join(' ').trim();
  const head = [
    `From: ${m.from}`, `To: ${m.to}`, `Subject: ${encHeader(m.subject)}`,
    ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []),
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`] : []),
    ...(refs ? [`References: ${refs}`] : []),
    'MIME-Version: 1.0',
  ];
  const part = (type: string, body: string) => [`Content-Type: ${type}; charset="UTF-8"`, 'Content-Transfer-Encoding: base64', '', wrap76(Buffer.from(body, 'utf8').toString('base64'))].join('\r\n');
  if (!m.html) return [...head, part('text/plain', m.text)].join('\r\n');
  return [...head, `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, part('text/plain', m.text), `--${boundary}`, part('text/html', m.html), `--${boundary}--`, ''].join('\r\n');
}

// ── Reading ─────────────────────────────────────────────────────────────────
export function headerMap(p?: GmailPart): Record<string, string> {
  const h: Record<string, string> = {};
  for (const x of p?.headers ?? []) h[x.name.toLowerCase()] = x.value;
  return h;
}

/** The best plain-text body and the attachment list of a Gmail message. */
export function extractBody(p?: GmailPart): { text: string; attachments: { filename: string; mimeType: string }[] } {
  let plain = '', html = '';
  const attachments: { filename: string; mimeType: string }[] = [];
  const walk = (x?: GmailPart) => {
    if (!x) return;
    if (x.filename) attachments.push({ filename: x.filename, mimeType: x.mimeType ?? '' });
    else if (x.mimeType === 'text/plain' && x.body?.data && !plain) plain = fromB64url(x.body.data);
    else if (x.mimeType === 'text/html' && x.body?.data && !html) html = fromB64url(x.body.data);
    x.parts?.forEach(walk);
  };
  walk(p);
  return { text: (plain || htmlToText(html)).replace(/\r\n/g, '\n').trim(), attachments };
}

// ── Refresh token at rest ───────────────────────────────────────────────────
// Stored in Supabase (RLS on, no policies: only the service role can read it)
// and encrypted with AES-256-GCM under GMAIL_TOKEN_KEY, which lives only in Vercel.
// A leak of either the database or the env alone does not reveal the token.
const keyOf = (secret: string) => createHash('sha256').update(secret).digest();

export function sealToken(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1.${b64url(iv)}.${b64url(c.getAuthTag())}.${b64url(enc)}`;
}

export function openToken(sealed: string, secret: string): string {
  const [v, iv, tag, enc] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('Bad sealed token');
  const buf = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const d = createDecipheriv('aes-256-gcm', keyOf(secret), buf(iv));
  d.setAuthTag(buf(tag));
  return Buffer.concat([d.update(buf(enc)), d.final()]).toString('utf8');
}
