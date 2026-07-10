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
  // TODO: confirm public-facing WhatsApp number (E.164, no +/spaces for wa.me)
  whatsapp: '910000000000',
  linkedin: 'https://www.linkedin.com/in/viratmohan/', // TODO: confirm exact handle
  clarityhq: 'https://clarityhq.ai',
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
    context: '100+ enterprise F&B brands onboarded',
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

// THE ARC — five prose blocks, no timeline component.
export const arc: ArcBlock[] = [
  {
    range: '2008–2015',
    title: 'The Discipline',
    body: 'KPMG London and HSBC statutory audits, qualifying as an ICAEW chartered accountant. Financial-services rigour became the foundation for everything that followed — the habit of tying every claim back to a number.',
  },
  {
    range: '2015–2020',
    title: 'The Operator',
    body: 'Pita Pit, from regional director to CEO across India, the UK, the UAE, KSA and Singapore. Grew the estate from 6 to 21 units and quadrupled revenue. The move from auditing operators to being one.',
  },
  {
    range: '2020–2022',
    title: 'The Scale',
    body: 'CloudKitchens®. Built 122 kitchens across three cities in under 24 months and ran APAC customer success for 1,000+ brands. Learned how throughput, not intuition, decides whether a food business survives.',
  },
  {
    range: '2022–2025',
    title: 'The Capital',
    body: 'Daryaganj CFBO — a $2M raise, Shark Tank India, a ₹150 Cr valuation. Then Chief of Staff at Foodlink through an ₹80 Cr pre-IPO round and DRHP. Sat on both sides of the term sheet.',
  },
  {
    range: '2024–now',
    title: 'The Layer',
    body: 'Opportunities Unlocked LLP and ClarityHQ. AI-native growth services delivered by a distributed human network — the operating layer between capital and execution, built for a market where judgment is the scarce input.',
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
    jobTitle: 'Operator, CFO and founder — AI-native growth services',
    description:
      'Virat Mohan builds the operating layer between capital and execution. Two decades across finance, hospitality and technology: LSE, KPMG London, Pita Pit, CloudKitchens®, Daryaganj and Foodlink, now ClarityHQ.',
    alumniOf: [
      { '@type': 'CollegeOrUniversity', name: 'London School of Economics and Political Science' },
      { '@type': 'CollegeOrUniversity', name: 'Cass Business School, City University London' },
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
