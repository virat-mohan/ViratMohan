import type { RetailOsApplication, RetailOsTerms } from './retail-os-db';
import { DEPOSIT_INR, BUILD_WINDOW_DAYS } from './retail-os-db';

export type TermLine = { label: string; value: string };

// The commercial terms a brand signs on its tracker. The same list renders on
// the page and is frozen into the signature record, so what was signed can
// always be shown exactly as it was.
export function buildTermLines(app: RetailOsApplication, terms: RetailOsTerms): TermLine[] {
  const lines: TermLine[] = [];

  if (terms.aiEnabler) {
    lines.push({
      label: 'Partnership model',
      value: 'AI-Enabler™ / Co-Founder: DevShop builds the brand with you from zero and holds 50% of the brand IP. There is no separate profit-pool split.',
    });
  } else {
    lines.push({
      label: "DevShop's share",
      value: `${terms.splitPct}% of the profit pool (revenue less product and packaging, shipping, payment and platform fees, marketing, and tech costs). The remaining ${100 - (terms.splitPct ?? 0)}% is yours.`,
    });
    lines.push({ label: 'Brand IP', value: 'Stays entirely yours.' });
  }

  lines.push(
    { label: 'Term', value: '12 months, with a 30-day break clause.' },
    { label: 'Break fee', value: 'If the partnership is ended before the 12 months are up, DevShop receives 5% of all revenue generated through the store from the start date to the termination date.' },
    { label: 'Deposit', value: `₹${DEPOSIT_INR.toLocaleString('en-IN')}, fully adjusted against your actual onboarding tech costs (hosting, database, WhatsApp number, email, domain, AI). DevShop keeps none of it; every charge and the remaining balance are shown on this page.` },
    { label: 'Payments', value: "Every customer payment is collected into DevShop's account first. Each week (Monday to Sunday) is settled the following Monday by 1 PM, with an itemised statement." },
    { label: 'Build time', value: `Your store goes live within ${BUILD_WINDOW_DAYS} days of the deposit being confirmed, subject to the setup answers and third-party approvals (payment gateway, Meta, WhatsApp).` },
    { label: 'DevShop handles', value: 'Storefront, hosting and tech, integrations (payments, shipping, Meta, WhatsApp, Google), pricing fixed with you per product, marketing execution, and reporting.' },
    { label: 'You handle', value: 'Product sourcing, manufacturing and inventory, packing and handing orders to the courier, and product photography unless agreed otherwise.' },
    { label: 'Decided together', value: 'Discount and promotion rules, and any freelancers hired (performance marketing, content, production) and their cost, since both come out of gross profit.' },
  );

  if (app.post_ack) {
    lines.push({ label: 'Pay with a Post™', value: '1% of the sales it drives, charged only once payment is received.' });
  }
  if (terms.notes) {
    lines.push({ label: 'Also agreed', value: terms.notes });
  }
  return lines;
}
