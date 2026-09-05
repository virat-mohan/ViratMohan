import type { ClassifyAndBuildInput } from '../../src/lib/llm';

// A minimal, real subset of the framework library — enough to exercise
// framework selection and fit scoring without a live Supabase call. Not
// the full curated set; benchmark cases don't need it to be.
export const MINI_LIBRARY: ClassifyAndBuildInput['frameworkLibrary'] = [
  { name: 'AARRR (Pirate Metrics)', source: 'Dave McClure / 500 Startups', business_function: 'Growth (sales & marketing)', when_to_use: 'Funnel-stage-specific drop-off — acquisition, activation, retention, referral, or revenue conversion breakage.', link: 'https://en.wikipedia.org/wiki/Pirate_funnel' },
  { name: 'Theory of Constraints', source: 'Eliyahu Goldratt', business_function: 'Efficiency / Operations', when_to_use: 'Throughput or a single bottleneck backing up the rest of a process.', link: 'https://en.wikipedia.org/wiki/Theory_of_constraints' },
  { name: 'Six Sigma DMAIC', source: 'Motorola / General Electric', business_function: 'Efficiency / Operations', when_to_use: 'Variance or error-rate driven problems needing a measured root cause.', link: 'https://en.wikipedia.org/wiki/Six_Sigma' },
  { name: 'COSO Risk Management Framework', source: 'Committee of Sponsoring Organizations', business_function: 'Legal / Compliance', when_to_use: 'Exposure or a control gap — something could go wrong undetected.', link: null },
  { name: 'Zero-Based Budgeting', source: 'Peter Pyhrr / Texas Instruments', business_function: 'Finance', when_to_use: 'Cost creep with no clear per-line-item ownership or justification.', link: null },
];

export type BenchmarkCase = {
  name: string;
  // What actually happened live, and when — so a future reader can tell
  // this apart from a hypothetical case. These are the real regressions
  // this session caught by hand; a starter set (5), not the 20-30 the
  // brief calls for eventually.
  provenance: string;
  input: Omit<ClassifyAndBuildInput, 'frameworkLibrary' | 'pastFrameworkUsage'>;
};

export const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    name: 'checkout-abandonment-baseline',
    provenance: 'Repeated live test throughout the session (e.g. commit 64176fb verification) — the most basic, well-formed case; a regression here means something fundamental broke.',
    input: {
      problem: 'Our checkout abandons at 60%.',
      company: 'Benchmark Checkout Co',
      industry: 'E-commerce / D2C',
      tools: 'Shopify',
      websiteSnippet: null,
      preferredFramework: null,
    },
  },
  {
    name: 'website-contamination-guard',
    provenance: 'Live regression found and fixed mid-session: a submission with website=aon.com (a huge insurance brokerage) produced a diagnosis full of "producers"/"brokers"/insurance framing the client never mentioned. Fixed with an explicit prompt boundary; this case exists to catch it coming back.',
    input: {
      problem: 'Finding prospects for my business.',
      company: null,
      industry: null,
      tools: null,
      websiteSnippet: '<html><body><h1>Aon plc</h1><p>Aon is a leading global professional services firm providing a broad range of risk, retirement and health solutions to insurance producers and brokers worldwide.</p></body></html>',
      preferredFramework: null,
    },
  },
  {
    name: 'sparse-input-structural-assumption',
    provenance: 'Live regression found and fixed mid-session: the model silently assumed B2B outbound sales for a sparse input without flagging it. Fixed by requiring the assumed structural fact to become the first clarifying question.',
    input: {
      problem: 'Finding prospects for my business.',
      company: null,
      industry: null,
      tools: null,
      websiteSnippet: null,
      preferredFramework: null,
    },
  },
  {
    name: 'legal-compliance-runner-up-padding-guard',
    provenance: 'Live regression found and fixed mid-session: a Legal/Compliance case padded runner-ups with irrelevant frameworks (e.g. Zero-Based Budgeting) to hit a count. Fixed by tightening the prompt to "quality over count."',
    input: {
      problem: 'We keep missing regulatory filing deadlines and have no way to track which compliance obligations are coming due across our different licenses.',
      company: 'Benchmark Compliance Co',
      industry: 'Financial services',
      tools: 'Spreadsheets, Email',
      websiteSnippet: null,
      preferredFramework: null,
    },
  },
  {
    name: 'support-ticket-overload',
    provenance: 'Live-tested during the AMC/industry-relevance work (this session) — a genuine ops/support-deflection problem, useful as a case where AARRR should NOT be the top pick.',
    input: {
      problem: 'Our customer support inbox is overflowing with the same repeat questions about order status and returns, and my two support staff cannot keep up.',
      company: 'Benchmark Support Co',
      industry: 'E-commerce / D2C',
      tools: 'Zendesk, Shopify',
      websiteSnippet: null,
      preferredFramework: null,
    },
  },
];
