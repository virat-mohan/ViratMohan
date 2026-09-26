// The post-NDA access checklist, stage rules and the drafts that go to Virat for approval. Pure.
import { sendAfter } from './brain/communicate';
import type { Source } from './lead-metrics';

export const LEAD_STAGES = ['new', 'contacted', 'nda_sent', 'nda_signed', 'access_requested', 'data_connected', 'plan_ready', 'plan_sent', 'discovery', 'proposal', 'won', 'lost', 'paused'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const AUDIT_FLOW: LeadStage[] = ['nda_signed', 'access_requested', 'data_connected', 'plan_ready', 'plan_sent'];
export type AccessStatus = 'not_started' | 'granted' | 'verified';
export type AccessRow = { source: Source; status: AccessStatus; config: Record<string, string>; last_error?: string | null; granted_at?: string | null; verified_at?: string | null; updated_at?: string };
export const STALL_HOURS = 48;

export type Field = { key: string; label: string; placeholder: string; secret?: boolean };
export type ChecklistItem = {
  source: Source;
  title: string;
  why: string;
  steps: { text: string; why?: string }[];
  fields: Field[];
  connector: boolean;          // true when a connector can verify it automatically
  csv: string;                 // what to export for the CSV fallback
  alt?: string;
};

export type AccessIdentity = { metaBusinessId?: string; googleEmail?: string; staffEmail?: string };

export function checklist(id: AccessIdentity): ChecklistItem[] {
  const meta = id.metaBusinessId || '(I will send my Business ID)';
  const google = id.googleEmail || '(I will send the email to add)';
  return [
    {
      source: 'shopify', title: 'Shopify', connector: true,
      why: 'Orders, products and customer counts show revenue, order value, repeat rate and your best sellers. I read totals only, never customer details.',
      steps: [
        { text: 'In Shopify admin, open Settings, then Apps and sales channels, then Develop apps.', why: 'A custom app gives read-only access you can switch off any time.' },
        { text: 'Choose Allow custom app development if asked, then Create an app. Name it "Virat Mohan (read-only)".', why: 'The name makes it clear in your admin who has access.' },
        { text: 'Under Configuration, Admin API scopes, tick only read_orders, read_products, read_customers and read_analytics. Save.', why: 'These four are read-only. Nothing I do can change your store.' },
        { text: 'Install the app, then reveal the Admin API access token once and paste it below with your store address.', why: 'The token is encrypted as soon as it arrives and is never shown again.' },
      ],
      fields: [
        { key: 'shop', label: 'Store address', placeholder: 'yourbrand.myshopify.com' },
        { key: 'token', label: 'Admin API access token', placeholder: 'shpat_…', secret: true },
      ],
      alt: `Prefer a staff account? Add ${id.staffEmail || google} under Settings, Users, with view access to Orders, Products, Customers and Analytics, then mark this granted. I will pull a CSV instead.`,
      csv: 'Orders, Export, last 90 days, "Plain CSV file".',
    },
    {
      source: 'meta', title: 'Meta ads', connector: true,
      why: 'Spend, purchases and purchase value show what your ads return (ROAS) and what a customer costs (CAC).',
      steps: [
        { text: 'Open Meta Business Settings, then Accounts, then Ad accounts, and pick your ad account.', why: 'Partner access is given per ad account, so you choose exactly what I see.' },
        { text: `Choose Assign partners, then enter my Business ID: ${meta}.`, why: 'Partner access goes to my business, not a personal login, so it is easy to remove later.' },
        { text: 'Tick View performance only. Leave every other permission off.', why: 'View only: I cannot spend money or change an ad.' },
        { text: 'Paste your ad account ID below (it starts with act_).', why: 'So I pull the right account.' },
      ],
      fields: [{ key: 'ad_account_id', label: 'Ad account ID', placeholder: 'act_1234567890' }],
      csv: 'Ads Manager, Reports, account level, last 90 days, with Amount spent, Impressions, Link clicks, Purchases and Purchases conversion value.',
    },
    {
      source: 'ga4', title: 'Google Analytics 4', connector: true,
      why: 'Sessions and transactions show how many visitors become customers, and which channels bring them.',
      steps: [
        { text: 'In Google Analytics, open Admin, then Property access management.', why: 'Access is per property, so I see only this website.' },
        { text: `Choose +, then Add users, and enter ${google}.`, why: 'This is the login my read-only reports run under.' },
        { text: 'Set the role to Viewer and untick Notify if you like. Add.', why: 'Viewer can read reports only.' },
        { text: 'Paste your property ID below (Admin, Property details).', why: 'So I pull the right property.' },
      ],
      fields: [{ key: 'property_id', label: 'Property ID', placeholder: '312345678' }],
      csv: 'Reports, Acquisition, Traffic acquisition, last 90 days, Share, Download CSV.',
    },
    {
      source: 'gsc', title: 'Google Search Console', connector: true,
      why: 'Search clicks, impressions and top queries show what people search for and where you are missed.',
      steps: [
        { text: 'In Search Console, pick your property, then Settings, then Users and permissions.', why: 'Access is per property.' },
        { text: `Choose Add user, enter ${google}, and set permission to Restricted.`, why: 'Restricted is read-only.' },
        { text: 'Paste the property below exactly as Search Console shows it.', why: 'So I pull the right site.' },
      ],
      fields: [{ key: 'site_url', label: 'Property', placeholder: 'https://yourbrand.com/ or sc-domain:yourbrand.com' }],
      csv: 'Performance, Search results, last 3 months, Export, Download CSV, then upload Queries.csv.',
    },
    {
      source: 'amazon', title: 'Amazon', connector: false,
      why: 'Marketplace sales and returns complete the picture of where your revenue comes from.',
      steps: [
        { text: 'In Seller Central, open Reports, then Fulfilment (or Order Reports), then All Orders.', why: 'This report has orders, amounts and status in one file.' },
        { text: 'Pick the last 90 days, request the report and download it when ready.', why: 'Ninety days is enough to see a trend without old noise.' },
        { text: 'Upload the file below and mark this granted.', why: 'I keep totals only; the file itself is not stored.' },
      ],
      fields: [],
      csv: 'All Orders report, last 90 days.',
    },
    {
      source: 'flipkart', title: 'Flipkart', connector: false,
      why: 'Marketplace sales, returns and RTO complete the picture of where your revenue comes from.',
      steps: [
        { text: 'In Seller Hub, open Reports, then Orders report.', why: 'This report has orders, amounts and return status in one file.' },
        { text: 'Pick the last 90 days and download it.', why: 'Ninety days is enough to see a trend.' },
        { text: 'Upload the file below and mark this granted.', why: 'I keep totals only; the file itself is not stored.' },
      ],
      fields: [],
      csv: 'Orders report, last 90 days.',
    },
  ];
}

/** Merge checklist with saved rows, defaulting to not_started. */
export function withStatus(items: ChecklistItem[], rows: AccessRow[]) {
  return items.map((it) => {
    const r = rows.find((x) => x.source === it.source);
    return { ...it, status: (r?.status ?? 'not_started') as AccessStatus, error: r?.last_error ?? null, config: publicConfig(r?.config ?? {}) };
  });
}

/** Only non-secret config ever goes to the page. */
export function publicConfig(config: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ['shop', 'ad_account_id', 'property_id', 'site_url']) if (typeof config[k] === 'string') out[k] = config[k] as string;
  return out;
}

/** A lead may move itself between not_started and granted. Only a connector or a CSV sets verified. */
export function leadCanSet(from: AccessStatus, to: AccessStatus): boolean {
  return to !== 'verified' && from !== 'verified';
}

/** Stage after access changes: any verified source moves an early-stage lead to data_connected. Never moves backwards. */
export function stageAfterAccess(stage: LeadStage, rows: AccessRow[]): LeadStage {
  const early = stage === 'nda_signed' || stage === 'access_requested';
  return early && rows.some((r) => r.status === 'verified') ? 'data_connected' : stage;
}

export type StallLead = { id: string; stage: string; access_requested_at: string | null; access_reminded_at: string | null };
/** Access has stalled: requested 48h+ ago, nothing granted or verified since, and no reminder in the last 48h. */
export function isStalled(lead: StallLead, rows: AccessRow[], now: Date): boolean {
  if (lead.stage !== 'access_requested' || !lead.access_requested_at) return false;
  const req = Date.parse(lead.access_requested_at);
  const ms = STALL_HOURS * 3_600_000;
  if (now.getTime() - req < ms) return false;
  const lastMove = Math.max(req, ...rows.map((r) => Date.parse((r.verified_at ?? r.granted_at ?? '') || '0') || 0));
  if (now.getTime() - lastMove < ms) return false;
  if (lead.access_reminded_at && now.getTime() - Date.parse(lead.access_reminded_at) < ms) return false;
  return !rows.some((r) => r.status === 'verified');
}

// ---------------------------------------------------------------------------------------------------
// Drafts (all go to Virat for approval; sendAfter is inside 9am-8pm IST, Mon-Sat)
// ---------------------------------------------------------------------------------------------------

export type Draft = { purpose: 'access_request' | 'access_reminder' | 'plan_cover'; subject: string; body: string; sendAfter: string };
const hi = (name?: string | null) => (name?.trim() ? `Hi ${name.trim().split(/\s+/)[0]},` : 'Hi,');
const wa = (n?: string) => (n ? `\nLet's talk: https://wa.me/${n.replace(/\D/g, '')}` : "\nLet's talk.");

export function accessRequestDraft(lead: { brand_name: string; contact_name?: string | null }, link: string, now: Date, whatsapp?: string): Draft {
  return {
    purpose: 'access_request',
    subject: `${lead.brand_name}: read-only access, so I can come back with a plan`,
    body: `${hi(lead.contact_name)}

Thank you for signing the NDA. Instead of a long questionnaire, I would like to look at the real numbers myself.

Here is a short checklist to give me read-only access to Shopify, Meta ads, Google Analytics and Search Console, plus an upload for Amazon or Flipkart reports if you sell there:
${link}

Why: with your actual orders, ad spend and traffic, I can find the three gaps that cost you the most money and come back with a plan and one clear 90-day goal. Everything is view only. I keep totals, never customer details, and you can remove access any time.

Each step takes a minute or two. If anything is unclear, just reply.
${wa(whatsapp)}

Virat`,
    sendAfter: sendAfter(now).toISOString(),
  };
}

export function accessReminderDraft(lead: { brand_name: string; contact_name?: string | null }, link: string, now: Date, whatsapp?: string): Draft {
  return {
    purpose: 'access_reminder',
    subject: `${lead.brand_name}: the access checklist, whenever you are ready`,
    body: `${hi(lead.contact_name)}

A gentle nudge on the read-only access checklist:
${link}

Why it matters: the plan is built only on your real numbers, so I cannot start until at least one source is connected. Shopify alone is enough to begin. If a step is stuck, reply and I will walk you through it.
${wa(whatsapp)}

Virat`,
    sendAfter: sendAfter(now).toISOString(),
  };
}

export function planCoverDraft(lead: { brand_name: string; contact_name?: string | null }, link: string, goal: string, now: Date, whatsapp?: string): Draft {
  return {
    purpose: 'plan_cover',
    subject: `${lead.brand_name}: where you stand, and a plan`,
    body: `${hi(lead.contact_name)}

Thank you for the access. I have been through your numbers and written up where you stand, the three biggest gaps, and how I would close them:
${link}

The goal I would hold myself to: ${goal}

Every number on the page comes from your own data, with its source beside it. The standard terms that fit are at the end.
${wa(whatsapp)}

Virat`,
    sendAfter: sendAfter(now).toISOString(),
  };
}
