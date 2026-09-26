// Every outbound email and draft passes through cleanLinks() before it leaves.
// Links copied out of Gmail arrive wrapped as https://www.google.com/url?q=<real>&sa=...,
// which lands people on Google's "Redirect notice" page instead of the site.

const WRAPPER = /^https?:\/\/(www\.)?google\.[a-z.]+\/url\?/i;

const decodeEntities = (s: string) => s.replace(/&amp;/gi, '&').replace(/&#38;/g, '&').replace(/&#x26;/gi, '&');

/** One URL: unwrap Google redirect wrappers (repeatedly, for nested ones) and force https. */
export function cleanUrl(input: string): string {
  let u = decodeEntities(input.trim());
  for (let i = 0; i < 5 && WRAPPER.test(u); i++) {
    const q = new URLSearchParams(u.slice(u.indexOf('?') + 1));
    const target = q.get('q') ?? q.get('url');
    if (!target) break;
    u = target; // URLSearchParams already percent-decodes one level
    if (/^https?%3A/i.test(u)) u = decodeURIComponent(u);
  }
  if (/^http:\/\//i.test(u)) u = 'https://' + u.slice(7);
  return u;
}

/** Readable link text: "viratmohan.com/retail-os". */
export function prettyUrl(u: string): string {
  return u.replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/$/, '');
}

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const URL_RE = /https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/gi;

/** Clean every link in an HTML email: hrefs, link text, and bare URLs become proper anchors. */
export function cleanLinks(html: string): string {
  // 1. hrefs
  let out = html.replace(/href=(["'])(.*?)\1/gi, (_m, q, u) => `href=${q}${escAttr(cleanUrl(u))}${q}`);
  // 2. bare URLs in text (not inside tags or existing anchors) → <a href>readable</a>
  const parts = out.split(/(<a\b[\s\S]*?<\/a>|<[^>]+>)/i);
  out = parts.map((p) => {
    if (p.startsWith('<a')) return p.replace(/>([\s\S]*?)<\/a>$/i, (_m, t) => `>${t.replace(URL_RE, (u: string) => prettyUrl(cleanUrl(u)))}</a>`);
    if (p.startsWith('<')) return p;
    return p.replace(URL_RE, (u) => { const c = cleanUrl(u); return `<a href="${escAttr(c)}" style="color:inherit;">${prettyUrl(c)}</a>`; });
  }).join('');
  return out;
}

/** Plain-text twin: unwrap and force https, keep URLs visible (plain text can't carry anchors). */
export function cleanTextLinks(text: string): string {
  return text.replace(URL_RE, (u) => cleanUrl(u));
}

// ── The one signature ───────────────────────────────────────────────────────
export const SITE_URL = 'https://viratmohan.com';
export const PHONE_DISPLAY = '+91 99992 77240';

export function signatureText(address?: string): string {
  return `Virat Mohan · viratmohan.com · ${PHONE_DISPLAY}${address ? `\n${address}` : ''}`;
}

export function signatureHtml(address?: string): string {
  const f = 'Arial, Helvetica, sans-serif';
  const mail = address ? ` &middot; <a href="mailto:${escAttr(address)}" style="color:#7A6E62;text-decoration:none;">${escAttr(address)}</a>` : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;border-top:1px solid #D9CDB4;width:100%;"><tr><td style="padding:14px 0 0;">
  <p style="margin:0;font-family:${f};font-size:13px;line-height:1.6;color:#4A4038;"><b style="color:#1A1410;">Virat Mohan</b> &middot; <a href="${SITE_URL}" style="color:#4A4038;text-decoration:none;">viratmohan.com</a> &middot; <a href="tel:+919999277240" style="color:#4A4038;text-decoration:none;">${PHONE_DISPLAY}</a>${mail}</p>
</td></tr></table>`;
}
