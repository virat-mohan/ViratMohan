// Travaholic Caps as a Retail OS brand config (describes the live brand; no migration).
// Travaholic is the intended first Acquisition/MOF lab — its funnel + ad-brief
// attribution already exist; modules reflect that.
import { defineBrand } from '../config';

export const travaholic = defineBrand({
  identity: {
    key: 'caps',
    name: 'Travaholic',
    tagline: 'Stories You Can Wear',
    domain: 'travaholic.in',
    tokens: { expression: 'client', bg: '#f0eee4', ink: '#101820', gold: '#d4af37', secondary: '#e6c68f' },
  },
  commerce: { currency: 'INR', currencySymbol: '₹', productNounSingular: 'cap', productNounPlural: 'caps', productUnitNounSingular: 'Chapter', productUnitNounPlural: 'Chapters' },
  integrations: { payment: ['razorpay', 'upi'], logistics: 'shiprocket', whatsapp: 'msg91', meta: true, google: false, email: 'brevo', analytics: 'first_party' },
  experience: { narrative: { blog: 'Journal', community: 'Explorers', loyalty: 'Miles' } },
  modules: {
    loyalty: true, referrals: true, journal: true, 'community-ugc': true, 'pay-with-a-post': true,
    'ai-ad-briefs': true, 'performance-manager': true, 'growth-recommendations': true, 'business-plan': true,
    'ai-media-gen': true, 'whatsapp-inbox': true, 'ux-insights': true, 'abandoned-cart': true, 'leads-crm': true,
  },
});
