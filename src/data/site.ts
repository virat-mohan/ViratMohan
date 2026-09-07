// Single source of truth for site-wide facts.
// Do NOT invent biography, dates, clients or numbers — everything here is
// drawn from the approved brief.

export const site = {
  name: 'Virat Mohan',
  domain: 'https://viratmohan.com',
  positioning: 'I build the operating layer between capital and execution.',
  thesis:
    'AI has made capability cheap and judgment scarce. The businesses that compound are the ones that put humans in front of the machine, not behind it.',
  email: 'viratmohan@gmail.com',
  whatsapp: '919999277240',
  linkedin: 'https://www.linkedin.com/in/viratmohan/', // TODO: confirm exact handle
  instagram: 'https://www.instagram.com/vmviews/',
  clarityhq: 'https://clarityhq.ai',
  bookingUrl: 'https://meetings-na2.hubspot.com/virat-mohan',
  location: {
    city: 'Gurugram',
    region: 'Haryana',
    country: 'IN',
  },
} as const;

export type Stat = {
  value: string;
  countTo?: number; // present only for numerals that count up
  prefix?: string;
  suffix?: string;
  label: string;
  context: string;
};

// THE NUMBERS — the site's centrepiece. Currency & arrow figures fade only.
export const stats: Stat[] = [
  {
    value: '122',
    countTo: 122,
    label: 'Cloud kitchens built',
    context: 'CloudKitchens®, three cities, under 24 months',
  },
  {
    value: '90%',
    countTo: 90,
    suffix: '%',
    label: 'Occupancy in 12 months',
    context: '25+ enterprise F&B brands onboarded',
  },
  {
    value: '$2M',
    label: 'Raised, equity + NCDs',
    context: 'Valuation doubled to ₹150 Cr in 18 months',
  },
  {
    value: '6→21',
    label: 'Units scaled',
    context: 'Pita Pit India, revenue quadrupled',
  },
];

export type ArcBlock = {
  range: string;
  title: string;
  body: string;
};

// THE ARC — eleven prose blocks, no timeline component.
export const arc: ArcBlock[] = [
  {
    range: 'Education',
    title: 'The Foundation',
    body: 'Don Bosco School and The Shri Ram School, then LSE and Bayes Business School (formerly Cass). Qualified ACA — chartered accountant. Microsoft Certified Systems Engineer and C++ certified, from age twelve.',
  },
  {
    range: '2002',
    title: 'The Trade',
    body: 'Traded computer hardware between the UAE and India — cabinets, mice, keyboards. The first business.',
  },
  {
    range: '~2005',
    title: 'The Brand',
    body: 'General Manager, India, for Surya Henna, a Brazilian hair-colour brand. First time running a consumer brand end to end.',
  },
  {
    range: '2008–2015',
    title: 'The Discipline',
    body: 'KPMG London and HSBC statutory audits. Seven years that built the habit of tying every claim back to a number.',
  },
  {
    range: '2009–2014',
    title: 'The Ice',
    body: 'Founded Perfect Ice, a D2C ice brand with home delivery. Production, cold-chain and last-mile, one business.',
  },
  {
    range: '2010',
    title: 'The Daily',
    body: 'Started a free daily newspaper for metro commuters — content, print and distribution, on advertising alone.',
  },
  {
    range: '~2010',
    title: 'The Pavers',
    body: 'Ran a tile manufacturing unit producing concrete pavers for the Commonwealth Games.',
  },
  {
    range: '2015–2020',
    title: 'The Operator',
    body: 'Pita Pit, regional director to CEO across India, the UK, the UAE, KSA and Singapore. 6 to 21 units, revenue quadrupled.',
  },
  {
    range: '2020–2022',
    title: 'The Scale',
    body: 'CloudKitchens®. 122 kitchens, three cities, under 24 months. APAC customer success for 1,000+ brands.',
  },
  {
    range: '2022–2025',
    title: 'The Capital',
    body: 'Daryaganj — $2M raised, Shark Tank India, ₹150 Cr valuation. Then Chief of Staff at Foodlink through a pre-IPO round.',
  },
  {
    range: '2024–now',
    title: 'Consulting and AI',
    body: 'ClarityHQ and Dev Shop. Advisory and AI-native builds, same operator instinct, new tools.',
  },
];

export type Facet = {
  title: string;
  body: string;
};

// OFF THE RÉSUMÉ — the parts that don't fit a career timeline.
export const facets: Facet[] = [
  {
    title: 'Learning to DJ',
    body: 'Deep house and minimal techno — Boris Brejcha, Deadmau5.',
  },
  {
    title: 'Pianist',
    body: 'National competitions, and a band — Anachronox.',
  },
  {
    title: 'Marathoner',
    body: 'Vienna — rained out before the finish.',
  },
  {
    title: 'Longevity',
    body: 'Studying the Bryan Johnson school of it.',
  },
  {
    title: 'Community',
    body: 'President, Shri Ram Alumni Society — 7 years.',
  },
  {
    title: 'Fitness',
    body: 'Ongoing, not for show.',
  },
];

export type NetworkColumn = {
  n: string;
  title: string;
  body: string;
};

// THE NETWORK — freelancer / partner model.
export const network: NetworkColumn[] = [
  {
    n: '01',
    title: 'Brand Intelligence Layer',
    body: 'A shared intelligence spine that briefs every engagement, so context compounds instead of resetting with each new hire.',
  },
  {
    n: '02',
    title: 'Human Pods',
    body: 'Small, senior teams assembled around a mandate — the judgment the machine cannot supply, in front of the work rather than behind it.',
  },
  {
    n: '03',
    title: 'Distributed Delivery',
    body: 'A vetted network of specialists deployed on demand, scaling capacity up and down without carrying the overhead of a fixed firm.',
  },
];

// JSON-LD Person node — stable @id reused across every page.
export const personId = `${site.domain}/#person`;

export function personSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': personId,
    name: site.name,
    url: site.domain,
    jobTitle: 'Operator and founder — AI-native growth services',
    description:
      'Virat Mohan builds the operating layer between capital and execution. Two decades across finance, hospitality and technology: LSE, KPMG London, Pita Pit, CloudKitchens®, Daryaganj and Foodlink, now ClarityHQ.',
    alumniOf: [
      { '@type': 'EducationalOrganization', name: 'Don Bosco School' },
      { '@type': 'EducationalOrganization', name: 'The Shri Ram School' },
      { '@type': 'CollegeOrUniversity', name: 'London School of Economics and Political Science' },
      { '@type': 'CollegeOrUniversity', name: 'Bayes Business School (formerly Cass Business School), City, University of London' },
      { '@type': 'EducationalOrganization', name: 'ICAEW' },
    ],
    worksFor: {
      '@type': 'Organization',
      name: 'Opportunities Unlocked LLP',
    },
    knowsAbout: [
      'cloud kitchens',
      'QSR franchising',
      'F&B unit economics',
      'commercial due diligence',
      'GCC market entry',
      'IPO readiness',
    ],
    address: {
      '@type': 'PostalAddress',
      addressLocality: site.location.city,
      addressRegion: site.location.region,
      addressCountry: site.location.country,
    },
    sameAs: [site.linkedin, site.clarityhq],
  };
}
