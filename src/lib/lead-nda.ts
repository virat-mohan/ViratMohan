// The mutual Non-Compete & Non-Disclosure Agreement (NCNDA) a lead signs online, and the
// emails around it. Pure: no network, no database.
import { createHash } from 'node:crypto';
import { sendAfter } from './brain/communicate';

export const NDA_VERSION = 'v1-2026-09';

export const DEVSHOP_PARTY = {
  name: 'Virat Mohan, trading as DevShop Retail OS™',
  address: 'Villa 111, Laburnum, Sushant Lok Phase 1, Gurugram, Haryana 122001, India',
  email: 'viratmohan@gmail.com',
  phone: '+91 99992 77240',
};

export type NdaParty = { name: string; address: string; represented?: string };

/** The agreement, as numbered sections. Rendered on the page and hashed into the signature record. */
export function ndaSections(brand: NdaParty, effectiveDate: string): { heading: string; body: string }[] {
  const A = DEVSHOP_PARTY.name, B = brand.name;
  return [
    { heading: 'Parties', body: `This mutual Non-Compete & Non-Disclosure Agreement is made on ${effectiveDate} between ${A}, of ${DEVSHOP_PARTY.address} ("DevShop"), and ${B}, of ${brand.address}${brand.represented ? `, represented by ${brand.represented}` : ''} ("the Brand"). Each is a "Party"; together, "the Parties".` },
    { heading: '1. Purpose', body: 'The Parties wish to explore and, if agreed, carry on a commercial relationship in which DevShop runs part or all of the Brand\'s online business on the DevShop Retail OS platform ("the Purpose"). To do so each Party will disclose Confidential Information to the other.' },
    { heading: '2. Confidential Information', body: 'Confidential Information means any non-public information disclosed by one Party to the other in connection with the Purpose, in any form, including: sales, orders, customers, margins, costs, suppliers, pricing, marketing data and ad-account performance; product designs, recipes, formulations and specifications; and, for DevShop, the design, methods, code, prompts, commercial models and roadmaps of DevShop Retail OS, Pay with a Post™ and related systems. It excludes information that is or becomes public through no fault of the receiving Party, was already lawfully known to it, or is independently developed without use of the other Party\'s information.' },
    { heading: '3. Obligations', body: 'Each Party will: keep the other\'s Confidential Information strictly confidential; use it only for the Purpose; disclose it only to its own staff and advisers who need it for the Purpose and are bound by obligations at least as strict as these; protect it with at least the care it uses for its own confidential information, and no less than reasonable care; and on request return or destroy it, save for one archival copy required by law.' },
    { heading: '4. Non-compete and non-circumvention', body: 'For the term of any commercial relationship between the Parties and 24 months after it ends: the Brand will not build, commission, license or operate a system that replicates DevShop Retail OS or Pay with a Post™ using DevShop\'s Confidential Information, and will not solicit DevShop\'s staff, contractors or partner brands introduced by DevShop; DevShop will not launch or operate a brand in the Brand\'s product category using the Brand\'s Confidential Information, and will not solicit the Brand\'s suppliers or customers for a competing brand. Neither Party will circumvent the other to deal directly with a supplier, partner or customer introduced under this Agreement.' },
    { heading: '5. No licence, no obligation to proceed', body: 'Nothing here transfers ownership of or grants a licence to any intellectual property. The Brand\'s brand, products and customer relationships remain the Brand\'s. DevShop Retail OS, Pay with a Post™ and all DevShop methods remain DevShop\'s. Neither Party is obliged to enter any further agreement.' },
    { heading: '6. Term', body: 'This Agreement starts on the date above and the obligations in sections 2 and 3 last for 3 years from the last disclosure. Section 4 lasts as stated there.' },
    { heading: '7. Remedies', body: 'A breach may cause harm that money cannot fully repair, so the injured Party may seek an injunction or specific performance in addition to any other remedy.' },
    { heading: '8. General', body: 'This is the whole agreement on its subject and replaces prior discussions. It may only be changed in writing signed by both Parties. If a part is unenforceable the rest stands. It is governed by the laws of India, and the courts at Gurugram, Haryana have exclusive jurisdiction. It may be signed electronically; an electronic signature is as binding as a handwritten one.' },
  ];
}

export function ndaText(brand: NdaParty, effectiveDate: string): string {
  return [`Mutual Non-Compete & Non-Disclosure Agreement (${NDA_VERSION})`, ...ndaSections(brand, effectiveDate).map((s) => `${s.heading}\n${s.body}`)].join('\n\n');
}

export const ndaHash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

// ── Emails (drafts go to Virat for one-tap approval) ─────────────────────────
export type NdaDraft = { purpose: 'nda_request' | 'nda_reminder'; subject: string; body: string; sendAfter: string };
const hi = (name?: string | null) => (name?.trim() ? `Hi ${name.trim().split(/\s+/)[0]},` : 'Hi,');

export function ndaRequestDraft(lead: { brand_name: string; contact_name?: string | null }, link: string, now: Date): NdaDraft {
  return {
    purpose: 'nda_request',
    subject: `${lead.brand_name} x DevShop Retail OS: NDA first, then your plan`,
    body: `${hi(lead.contact_name)}

Good to connect. Before you share anything about ${lead.brand_name} with me, I'd like both sides covered.

Here is a mutual non-compete and non-disclosure agreement, with my details already filled in. It takes about three minutes: add your entity name and address, type your name, and it's signed. You get a copy by email and can open it any time:
${link}

Why first: it protects your numbers before I see them, and it binds me the same way. It doesn't commit either side to anything further.

Once it's signed, I'll send a short checklist for read-only access to your store and ads, and come back within 48 hours with where you stand and a plan.

Virat`,
    sendAfter: sendAfter(now).toISOString(),
  };
}

export function ndaReminderDraft(lead: { brand_name: string; contact_name?: string | null }, link: string, now: Date): NdaDraft {
  return {
    purpose: 'nda_reminder',
    subject: `${lead.brand_name}: the NDA, whenever you're ready`,
    body: `${hi(lead.contact_name)}

A gentle nudge on the mutual NDA. It's three minutes online, and it's the one thing I need before I can look at your numbers:
${link}

If anything in it gives you pause, reply and I'll explain or adjust it.

Virat`,
    sendAfter: sendAfter(now).toISOString(),
  };
}
