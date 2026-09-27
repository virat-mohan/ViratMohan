// The first email a manual lead gets: research on their own site, the offer, one result in
// percentages, the terms, and the NDA link as the one next step. Pure: no network, no database.
// Client data is confidential: no brand names, no rupee amounts from any case study.
import { renderRetailOsEmail } from './retail-os-email';
import { sendAfter } from './brain/communicate';
import { TERMS_URL } from './lead-mail/core';

export type Research = { url: string; title: string | null; description: string | null; fetched_at: string };

/** Title and meta description from a page's HTML, so the opening line quotes their own words, cited. */
export function parseResearch(url: string, html: string | null, now = new Date()): Research {
  const pick = (re: RegExp) => { const m = re.exec(html ?? ''); return m ? decode(m[1]).replace(/\s+/g, ' ').trim().slice(0, 200) || null : null; };
  return {
    url,
    title: pick(/<title[^>]*>([\s\S]*?)<\/title>/i),
    description: pick(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i) ?? pick(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i),
    fetched_at: now.toISOString(),
  };
}
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '');

export const PROOF_LINE = 'The latest result: when Retail OS took over a brand\'s ads from a human, sales per day rose 59% in the first 3 days. Small base, early days, and I say so.';
export const TERMS_LINE = 'Terms are the same for everyone and published: zero capex, a ₹5,000 deposit fully adjusted against your onboarding tech costs, and 40% of the profit pool. A revenue-share model is available depending on turnover.';

export type FirstEmail = { purpose: 'nda_request'; subject: string; body: string; html: string; sendAfter: string };

const hi = (name?: string | null) => (name?.trim() ? `Hi ${name.trim().split(/\s+/)[0]},` : 'Hi,');
const host = (u: string) => u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

export function firstEmailDraft(lead: { brand_name: string; contact_name?: string | null; website?: string | null }, research: Research | null, ndaLink: string, now: Date): FirstEmail {
  const b = lead.brand_name;
  const opening = research?.description
    ? `I spent some time on ${host(research.url)}. "${research.description}" is a clear promise, and it deserves a machine behind it that sells every day.`
    : lead.website
      ? `I spent some time on ${host(lead.website)}. You've made something good; the next step is the machine that gets it to the world.`
      : `You've made something good with ${b}; the next step is the machine that gets it to the world.`;
  const lines = [
    opening,
    `That's what I do. DevShop Retail OS runs the whole online business for ${b}: storefront, payments, shipping, WhatsApp, Meta ads and content, on one stack. Live in 7 days, with an itemised statement and your share every Monday.`,
    PROOF_LINE,
    TERMS_LINE,
    `The one next step: sign the mutual NDA below. It protects your numbers before I see them and binds me the same way. Then I build your plan on your own data and walk you through it.`,
  ];
  const body = `${hi(lead.contact_name)}

${lines.join('\n\n')}

Sign the NDA (3 minutes, online): ${ndaLink}
The full terms: ${TERMS_URL}

Let's talk.

Virat

Questions any hour? My assistant, VM AI Assistant, answers on email and at viratmohan.com; anything about money or terms comes to me.`;
  const html = renderRetailOsEmail({
    preheader: `An idea for ${b}: live in 7 days, results every Monday.`,
    eyebrow: 'DevShop Retail OS',
    heading: `An idea for ${b}`,
    lines: [hi(lead.contact_name), ...lines],
    cta: { label: 'Sign the NDA, 3 minutes', url: ndaLink },
    secondary: { label: 'Read the full terms', url: TERMS_URL },
    note: "Let's talk. Questions any hour go to VM AI Assistant on email or viratmohan.com; anything about money or terms comes to me.",
  });
  return { purpose: 'nda_request', subject: `An idea for ${b}`, body, html, sendAfter: sendAfter(now).toISOString() };
}
