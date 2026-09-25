// DevShop Retail OS — partner FAQ. Source of truth for the FAQ page and the
// future FAQ bot. Virat's voice: first person, short, plain, no selling.
// Facts come from /retail-os/ and the moon-glasses admin. Commercial terms
// (pricing, split, settlement timing, term, exit) are NOT here: they live in
// the partnership agreement.
// Fields: topic, q, a (use \n\n for paragraphs), tags, visual (optional key
// into faq-visuals.js).
window.RETAIL_OS_FAQ = [
  // ---- The basics
  { topic: 'The basics', q: 'What is DevShop Retail OS?', visual: 'admin',
    a: 'A single system that runs an online brand: storefront, payments, shipping, WhatsApp, Meta ads, content and reporting. My team operates it with you.',
    tags: ['what is', 'overview', 'platform'] },
  { topic: 'The basics', q: 'How is it different from Shopify?',
    a: 'Shopify is software you run yourself. You add apps, hire for ads and content, and connect WhatsApp and couriers on your own.\n\nRetail OS comes with all of that already connected, and we run it with you. If you are on Shopify now, your catalog, customers and orders can move over.',
    tags: ['shopify', 'difference', 'compare', 'vs', 'woocommerce'] },
  { topic: 'The basics', q: 'Who is it for?',
    a: 'Founder-owned brands that sell online, whether already selling or just starting. It supports three ways of selling: your own store, a marketplace, or a subscription.',
    tags: ['fit', 'eligibility', 'who'] },
  { topic: 'The basics', q: 'Which brands use it today?',
    a: 'Travaholic Caps and Moonglasses are live. India Contemporary and Flowerbasket are launching.',
    tags: ['brands', 'proof', 'travaholic', 'moonglasses', 'india contemporary', 'flowerbasket'] },
  { topic: 'The basics', q: 'Which categories fit best?',
    a: 'Products with good margins, low returns, and that are easy to photograph and gift. Open right now: jewellery, beauty and skincare, men\'s grooming, pet accessories, home décor and apparel. If yours is not listed, ask me anyway.',
    tags: ['categories', 'jewellery', 'beauty', 'grooming', 'pet', 'decor', 'apparel'] },
  { topic: 'The basics', q: 'Is this the same as a DevShop custom build?',
    a: 'No. A custom build is a one-off piece of software for a specific problem. Retail OS is the full store, run with you on an ongoing basis.',
    tags: ['devshop', 'custom build', 'difference'] },

  // ---- Getting started
  { topic: 'Getting started', q: 'How do I start?',
    a: 'WhatsApp me with your brand, category and where it stands today. I reply within the week.',
    tags: ['start', 'apply', 'contact', 'whatsapp'] },
  { topic: 'Getting started', q: 'What happens next?',
    a: 'You get a tracker page with a quarterly forecast for your brand and three design options for your store. You see both before signing anything.',
    tags: ['next', 'tracker', 'forecast', 'design'] },
  { topic: 'Getting started', q: 'How long until the store is live?',
    a: 'About two weeks. The build is around 7 days. The rest depends on your setup answers and on approvals from the payment gateway, Meta and WhatsApp.',
    tags: ['timeline', 'how long', 'live'] },
  { topic: 'Getting started', q: 'How do I follow progress?', visual: 'tracker',
    a: 'On your tracker page. Each stage is marked done as it happens: catalog, design, payments, shipping, Meta, WhatsApp, go-live.',
    tags: ['stages', 'onboarding', 'progress', 'tracker'] },
  { topic: 'Getting started', q: 'What do you need from me?',
    a: 'Product details and photos, a pickup address, business and GST details, a WhatsApp number and Meta access. We ask for each one when that part of the build needs it.',
    tags: ['inputs', 'documents', 'need from me'] },
  { topic: 'Getting started', q: 'I do not have a brand yet. Can I still start?',
    a: 'Yes. We also set up the domain, email, Instagram and Meta accounts and build the brand with you. The terms for this are different and are covered in the agreement.',
    tags: ['new brand', 'from zero', 'ai-enabler'] },

  // ---- Who does what
  { topic: 'Who does what', q: 'What does DevShop do?', visual: 'connectors',
    a: 'The store, hosting and tech, and all connections: payments, shipping, Meta, WhatsApp and Google. We also run marketing, content and reporting.',
    tags: ['devshop handles', 'scope', 'responsibilities'] },
  { topic: 'Who does what', q: 'What do I do?',
    a: 'Make or source the product, keep stock and pack orders for the courier.',
    tags: ['my responsibilities', 'packing', 'inventory'] },
  { topic: 'Who does what', q: 'What do we decide together?',
    a: 'Product pricing, discounts and promotions, ad budget, and any freelancers we bring in.',
    tags: ['together', 'discounts', 'pricing', 'freelancers'] },

  // ---- Ads & Meta
  { topic: 'Ads & Meta', q: 'Do the ads run on their own?', visual: 'metaDaily',
    a: 'Yes. Our system is connected to Meta and handles scheduling and running campaigns. We agree the budget and the target return with you. You do not need to open Ads Manager.',
    tags: ['ads', 'meta', 'automatic', 'facebook', 'instagram', 'ads manager'] },
  { topic: 'Ads & Meta', q: 'Can anything spend money without my approval?', visual: 'adBrief',
    a: 'No. New campaigns are drafted and held paused until you approve them.',
    tags: ['approve', 'spend', 'budget', 'campaign'] },
  { topic: 'Ads & Meta', q: 'Who do the ads target?',
    a: 'Audiences are built from your own customer and order data, including lookalikes, and focused on the cities you choose.',
    tags: ['audience', 'lookalike', 'targeting', 'cities', 'woocommerce'] },
  { topic: 'Ads & Meta', q: 'I do not have a Meta Business account.',
    a: 'That is fine. We set it up during onboarding.',
    tags: ['business manager', 'no meta', 'setup'] },

  // ---- Content
  { topic: 'Content', q: 'Do I need a photoshoot?', visual: 'imageGen',
    a: 'Usually not. From one product photo we generate model shots, lifestyle images and short videos.',
    tags: ['photos', 'ai content', 'shoot', 'video', 'image generator'] },
  { topic: 'Content', q: 'Who plans the posts?', visual: 'calendar',
    a: 'The system drafts posts and ads and places them on a content calendar. You approve them before anything goes out.',
    tags: ['content calendar', 'posts', 'instagram', 'social'] },

  // ---- WhatsApp
  { topic: 'WhatsApp', q: 'What runs on WhatsApp?', visual: 'waCatalog',
    a: 'Catalog messages that open a ready cart, order updates, OTPs, review requests and a shared inbox.',
    tags: ['whatsapp', 'catalog', 'inbox', 'order updates'] },
  { topic: 'WhatsApp', q: 'Can I use my current number?',
    a: 'Yes, but it will stop working in the regular WhatsApp app. A new number is usually easier.',
    tags: ['number', 'business api'] },
  { topic: 'WhatsApp', q: 'What happens with abandoned carts?', visual: 'cartRecovery',
    a: 'The customer gets a WhatsApp reminder, then a coupon if they still have not ordered.',
    tags: ['abandoned cart', 'recovery', 'coupon'] },

  // ---- Store
  { topic: 'Store & catalog', q: 'Is my store a template?', visual: 'storefront',
    a: 'No. It is designed for your brand. You choose from three design directions.',
    tags: ['template', 'design', 'theme', 'storefront'] },
  { topic: 'Store & catalog', q: 'I am on Shopify. Do I re-list everything?',
    a: 'No. Products, images, customers and order history are imported.',
    tags: ['shopify', 'migration', 'import'] },
  { topic: 'Store & catalog', q: 'I am on WooCommerce or something else.',
    a: 'We import from a spreadsheet or from what you send us, and use your past order data for ads.',
    tags: ['woocommerce', 'wordpress', 'spreadsheet', 'other platform'] },
  { topic: 'Store & catalog', q: 'Will I show up on Google?',
    a: 'Google Business Profile and Search Console are set up at launch. A Google Shopping feed is coming.',
    tags: ['google', 'seo', 'search'] },

  // ---- Payments & shipping
  { topic: 'Payments & shipping', q: 'Which payments can customers use?',
    a: 'Cards, UPI, netbanking and wallets. Cash on delivery is available with or without a small advance.',
    tags: ['payments', 'upi', 'cod', 'cards'] },
  { topic: 'Payments & shipping', q: 'Do I need my own payment gateway?',
    a: 'No. Use your own, or we set one up.',
    tags: ['gateway', 'razorpay', 'kyc'] },
  { topic: 'Payments & shipping', q: 'How does shipping work?', visual: 'shipping',
    a: 'A courier is booked automatically when an order is confirmed. Labels print in batches, and your warehouse gets them on WhatsApp.',
    tags: ['shipping', 'courier', 'shiprocket', 'delhivery', 'labels'] },
  { topic: 'Payments & shipping', q: 'How are returns handled?',
    a: 'You set the return window. Once a return arrives back, the refund and restock happen automatically.',
    tags: ['returns', 'rto', 'refund'] },

  // ---- Customers
  { topic: 'Customers', q: 'Is there a loyalty programme?',
    a: 'Yes, if you want one. You set the points and rewards.',
    tags: ['loyalty', 'points', 'rewards'] },
  { topic: 'Customers', q: 'Are there referrals?',
    a: 'Yes. Each customer gets a code. Their friend gets a discount, and they earn points.',
    tags: ['referral', 'code'] },
  { topic: 'Customers', q: 'What is Pay with a Post?', visual: 'pwap',
    a: 'A customer can get their order in exchange for an Instagram post. Their order ships once the post has driven real orders, or right away if they have a verified following. You can turn it off.',
    tags: ['pay with a post', 'instagram', 'barter', 'ugc'] },

  // ---- Numbers
  { topic: 'Numbers & reporting', q: 'What reports do I get?', visual: 'statement',
    a: 'A daily summary by email, daily ad spend against sales, a monthly P&L, and a weekly itemised statement.',
    tags: ['reports', 'p&l', 'roas', 'statement', 'daily digest', 'meta daily report'] },
  { topic: 'Numbers & reporting', q: 'Can I see my numbers any time?',
    a: 'Yes. Every order and every past statement is in the dashboard.',
    tags: ['dashboard', 'backend', 'access', 'data'] },

  // ---- Commercials
  { topic: 'Commercials', q: 'What does it cost, and how do payments work?',
    a: 'The pricing, profit share, settlement and contract terms are set out in the partnership agreement. WhatsApp me and I will go through them with you.',
    tags: ['pricing', 'cost', 'fees', 'split', 'contract', 'terms', 'deposit', 'settlement', 'agreement'] },
  { topic: 'Commercials', q: 'Do I keep my brand?',
    a: 'Yes. Your brand stays yours. Brands we build with you from zero are the exception, and that is covered in the agreement.',
    tags: ['ip', 'ownership', 'brand'] },
];
