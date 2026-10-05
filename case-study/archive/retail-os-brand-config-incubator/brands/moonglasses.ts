// Moon-glasses represented as a Retail OS brand config. This DESCRIBES the live
// brand from Stage 8 evidence; it does not migrate or change the live store.
import { defineBrand } from '../config';

export const moonglasses = defineBrand({
  identity: {
    key: 'moonglasses',
    name: 'Moon-glasses',
    tagline: 'See A Brighter You',
    domain: 'moon-glasses.store',
    social: { instagram: '@moonglassesonline' },
    tokens: { expression: 'client', bg: '#f4ead4', ink: '#1a1410', gold: '#d4af37', secondary: '#d9714b' },
  },
  commerce: { currency: 'INR', currencySymbol: '₹', productNounSingular: 'sunglasses', productNounPlural: 'sunglasses', productUnitNounSingular: 'Chapter', productUnitNounPlural: 'Chapters' },
  integrations: { payment: ['razorpay', 'paytm', 'upi'], logistics: 'shiprocket', whatsapp: 'msg91', meta: true, google: false, email: 'brevo', analytics: 'first_party' },
  experience: { narrative: { blog: 'Journal', community: 'Explorer', loyalty: 'Good Vibes' } },
  modules: {
    loyalty: true, referrals: true, preorders: true, journal: true, 'community-ugc': true,
    'creator-gifting': true, 'pay-with-a-post': true, 'ai-ad-briefs': true, 'performance-manager': true,
    'growth-recommendations': true, 'business-plan': true, 'ai-media-gen': true, 'whatsapp-inbox': true,
    'whatsapp-payment-confirm': true, 'abandoned-cart': true, 'leads-crm': true,
  },
});
