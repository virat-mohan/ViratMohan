// The step-by-step setup questions a brand answers on its tracker once terms
// are signed. One definition drives the tracker forms, the save endpoint's
// validation and the admin view. Questions come from what the five source
// codebases actually need to run (their WHITELABEL_INVENTORY §7).
//
// Never ask for passwords, API keys or card/bank numbers here — access to
// gateways, Meta and couriers is requested through the provider itself.

export type SetupField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  options?: string[];
  placeholder?: string;
  hint?: string;
};

export type SetupSection = {
  key: string;
  title: string;
  why: string;
  onlyFor?: 'new_brand' | 'Marketplace' | 'Subscription';
  fields: SetupField[];
};

const YES_NO_UNSURE = ['Yes', 'No', 'Not sure'];

export const SETUP_SECTIONS: SetupSection[] = [
  {
    key: 'identity',
    title: 'Brand identity',
    why: "You don't have a brand online yet, so we set up the basics: domain, email, Instagram and Meta.",
    onlyFor: 'new_brand',
    fields: [
      { key: 'domainIdeas', label: 'Domain names you like, in order of preference', type: 'textarea', placeholder: 'brandname.in, brandname.com, getbrandname.in' },
      { key: 'haveDomain', label: 'Do you already own a domain?', type: 'select', options: ['No', 'Yes'] },
      { key: 'ownedDomain', label: 'If yes, which one and where is it registered?', type: 'text', placeholder: 'brandname.in on GoDaddy' },
      { key: 'emailSetup', label: 'Email for the brand', type: 'select', options: ['Set up Google Workspace for me', 'I already have brand email'] },
      { key: 'instagramHandle', label: 'Instagram handle you want', type: 'text', placeholder: '@brandname' },
      { key: 'nameOptions', label: 'Still choosing a name? List the options', type: 'textarea' },
    ],
  },
  {
    key: 'team',
    title: 'Your team',
    why: 'Everyone listed gets their own login to your store admin, with access only to what their role needs.',
    fields: [
      {
        key: 'members', label: 'One person per line: name, email, role', type: 'textarea',
        placeholder: 'Priya Sharma, priya@brand.in, Operations\nRahul Mehta, rahul@brand.in, Marketing',
        hint: 'Roles: Owner, Operations, Marketing, Finance, Support.',
      },
    ],
  },
  {
    key: 'catalog',
    title: 'Catalogue',
    why: 'This is what your store launches with.',
    fields: [
      { key: 'source', label: 'Where should we take your products from?', type: 'select', options: ['My Shopify store', 'A spreadsheet I will share', 'Photos and details over WhatsApp'] },
      { key: 'link', label: 'Shopify URL, or a link to the sheet or folder', type: 'text', placeholder: 'https://…' },
      { key: 'photos', label: 'Link to product photos', type: 'text', placeholder: 'Google Drive or Dropbox folder' },
      { key: 'launchProducts', label: 'How many products at launch?', type: 'text', placeholder: 'e.g. 12' },
      { key: 'weights', label: 'Typical packed weight and box size per product', type: 'textarea', placeholder: 'Caps: 150 g, 25×20×10 cm', hint: 'Courier rates depend on this, so estimates are fine.' },
    ],
  },
  {
    key: 'marketplace',
    title: 'Sellers',
    why: 'How sellers join, list and get paid on your marketplace.',
    onlyFor: 'Marketplace',
    fields: [
      { key: 'firstSellers', label: 'Sellers ready to list at launch', type: 'textarea', placeholder: 'Name, what they sell, contact — one per line' },
      { key: 'payoutCycle', label: 'How often should sellers be paid?', type: 'select', options: ['Weekly', 'Every two weeks', 'Monthly', 'After the buyer confirms delivery'] },
      { key: 'sellerAgreement', label: 'Do you already have a seller agreement?', type: 'select', options: ['No, use the standard one', 'Yes, I will share it'] },
    ],
  },
  {
    key: 'subscription',
    title: 'Delivery schedule',
    why: 'Subscriptions depend on dependable delivery days and areas.',
    onlyFor: 'Subscription',
    fields: [
      { key: 'deliveryDays', label: 'Days you can deliver', type: 'text', placeholder: 'Mon, Wed, Fri' },
      { key: 'slots', label: 'Delivery time slots', type: 'text', placeholder: '7–10 am, 5–8 pm' },
      { key: 'pincodes', label: 'PIN codes or areas you serve, with any delivery fee', type: 'textarea', placeholder: '110017 free, 122001 ₹49' },
      { key: 'cutoff', label: 'Order cut-off before a delivery', type: 'text', placeholder: '6 pm the day before' },
    ],
  },
  {
    key: 'payments',
    title: 'Payments',
    why: 'Every customer payment is collected into DevShop\'s account and settled to you weekly. We need your business details for the settlement.',
    fields: [
      { key: 'entityName', label: 'Business name as it appears on your bank account', type: 'text' },
      { key: 'gstin', label: 'GST number, if registered', type: 'text', placeholder: '22AAAAA0000A1Z5' },
      { key: 'existingGateway', label: 'Payment gateway you use today', type: 'select', options: ['None', 'Razorpay', 'Paytm', 'Cashfree', 'PayU', 'Other'] },
      { key: 'codPolicy', label: 'Cash on delivery', type: 'select', options: ['Offer COD with a small advance', 'Prepaid only', 'Offer COD without an advance'] },
    ],
  },
  {
    key: 'shipping',
    title: 'Shipping and pickup',
    why: 'Couriers collect from here, and your warehouse contact gets each order\'s label and invoice on WhatsApp.',
    fields: [
      { key: 'pickupAddress', label: 'Pickup address', type: 'textarea' },
      { key: 'pickupPincode', label: 'Pickup PIN code', type: 'text' },
      { key: 'contactName', label: 'Warehouse contact name', type: 'text' },
      { key: 'contactPhone', label: 'Warehouse contact phone (WhatsApp)', type: 'text' },
      { key: 'contactEmail', label: 'Warehouse contact email', type: 'text' },
      { key: 'dispatchDays', label: 'Days you dispatch', type: 'text', placeholder: 'Mon–Sat' },
      { key: 'courier', label: 'Courier account you already have', type: 'select', options: ['None, use DevShop\'s', 'Shiprocket', 'Delhivery', 'Other'] },
      { key: 'returns', label: 'How returns should work', type: 'textarea', placeholder: 'Defects only, within 3 days of delivery' },
    ],
  },
  {
    key: 'meta',
    title: 'Meta and Instagram',
    why: 'Ads, your product catalogue on Instagram, and measuring what sells all run through Meta.',
    fields: [
      { key: 'businessManager', label: 'Do you have a Meta Business Manager?', type: 'select', options: YES_NO_UNSURE },
      { key: 'businessManagerId', label: 'Business Manager ID, if you have one', type: 'text' },
      { key: 'adAccount', label: 'Do you have an ad account?', type: 'select', options: YES_NO_UNSURE },
      { key: 'adSpend', label: 'Current monthly ad spend', type: 'select', options: ['None yet', 'Under ₹25,000', '₹25,000–1 lakh', '₹1–5 lakh', 'Over ₹5 lakh'] },
      { key: 'instagram', label: 'Instagram handle', type: 'text', placeholder: '@brand' },
      { key: 'facebookPage', label: 'Facebook page link', type: 'text' },
    ],
  },
  {
    key: 'whatsapp',
    title: 'WhatsApp',
    why: 'Order updates, OTP login and abandoned-cart messages go out from this number.',
    fields: [
      { key: 'number', label: 'Number to use for WhatsApp Business', type: 'text', placeholder: '+91 98xxxxxxxx' },
      { key: 'onAppToday', label: 'Is this number on the WhatsApp app today?', type: 'select', options: YES_NO_UNSURE, hint: 'A number moved to the WhatsApp Business API stops working in the app, so a fresh number is often easier.' },
      { key: 'metaVerified', label: 'Is your business verified with Meta?', type: 'select', options: YES_NO_UNSURE, hint: 'Verification takes days to weeks, so we start it early.' },
    ],
  },
  {
    key: 'google',
    title: 'Google',
    why: 'So customers find you on Google Search, Maps and Shopping from launch day.',
    fields: [
      { key: 'businessProfile', label: 'Do you have a Google Business Profile?', type: 'select', options: YES_NO_UNSURE },
      { key: 'publicAddress', label: 'Can your business address be shown publicly?', type: 'select', options: ['Yes', 'No, service area only'] },
      { key: 'searchConsole', label: 'Is your current site in Google Search Console?', type: 'select', options: [...YES_NO_UNSURE, 'No site yet'] },
      { key: 'keywords', label: 'What should people be searching when they find you?', type: 'textarea', placeholder: 'handmade trucker caps, travel caps india' },
    ],
  },
];

export type SetupAnswers = Record<string, { answers: Record<string, string>; savedAt: string }>;

export function sectionsFor(app: { brand_status: string | null; format: string | null }): SetupSection[] {
  const newBrand = app.brand_status === 'new_sub_brand' || app.brand_status === 'from_zero';
  return SETUP_SECTIONS.filter((s) => {
    if (s.onlyFor === 'new_brand') return newBrand;
    if (s.onlyFor === 'Marketplace' || s.onlyFor === 'Subscription') return app.format === s.onlyFor;
    return true;
  });
}

export function cleanSectionAnswers(section: SetupSection, raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of section.fields) {
    const v = raw[f.key];
    if (typeof v !== 'string') continue;
    const trimmed = v.trim().slice(0, f.type === 'textarea' ? 2000 : 300);
    if (!trimmed) continue;
    if (f.type === 'select' && f.options && !f.options.includes(trimmed)) continue;
    out[f.key] = trimmed;
  }
  return out;
}
