// Fresh For Paws brand book module (v0.2, 2 Oct 2026). Source: ../BRAND-BOOK.md, which cites its sources.
// Draft until Srishti signs off. Every gap is a question for her, never a guess.
export type Finding = { level: 'block' | 'warn'; rule: string; match: string };
export type Kind = 'store' | 'email' | 'whatsapp' | 'post' | 'ad';

export const BRAND = {
  name: 'Fresh For Paws',
  subBrands: { cats: 'Fresh For Purrs', puppies: 'Mini Paws' },
  handle: '@freshforpaws',
  site: 'freshforpaws.com',
  founder: 'Srishti Bhatia',
  facts: [
    'Started on 13 June 2018 by Srishti Bhatia, inspired by her dog Vanilla',
    'Every recipe is Srishti\'s own, after almost two years of research',
    'Portioned for the pet\'s calorie intake; no scooping, no defrosting, no guesswork',
    'No synthetic vitamins or minerals added',
    'Srishti is a certified canine & feline nutritionist',
    '100% natural, ready to eat, no fillers',
    'Pet Food of the Year, Indian Pet Industry Awards',
  ],
  voice: 'Warm, direct and proud of the food: a knowledgeable friend who cooks for their own dog. Confident about real ingredients, never clinical. Founder-led.',
  colours: { teal: '#06A6A0', teal2: '#18AFAA', mint: '#E0F2F0', paper: '#FBF8F2', white: '#FFFFFF', ink: '#333333', body: '#4C4C4C' }, // measured from site screenshots 2 Oct 2026; confirm from live CSS
  tagline: 'Choose Fresh, Choose Fresh For Paws!',
  logoLine: 'With love for our furry friends',
  cta: { store: 'Build my plan' },
} as const;

// Claims that need Srishti's confirmation before they can be used.
const UNCONFIRMED: [RegExp, string][] = [
  [/\bgrain[- ]?free\b|\bno grains?\b|\bwithout grains?\b/i, 'never say grain-free: rice recipes and Mini Paws contain rice'],
  [/\bcanine nutritionist\b/i, 'write "canine & feline nutritionist"'],
  [/\bvet[- ]?(formulated|approved|recommended)\b/i, 'vet claim not confirmed'],
  [/\bhuman[- ]grade\b/i, 'human-grade not confirmed'],
  [/\bpreservative[- ]free\b|\bno preservatives\b/i, 'preservative claim not confirmed'],
  [/\baafco\b/i, 'AAFCO not confirmed'],
  [/\bfresh daily\b|\bcooked (fresh )?daily\b/i, 'daily cooking not confirmed'],
  [/\b(cures?|treats?|heals?|prevents?)\b.{0,30}\b(disease|allerg|cancer|kidney|diabet|infection)/i, 'medical claim'],
];
const NAME_ERRORS: [RegExp, string][] = [
  [/\bfreshforpaws\b(?!\.com)/i, 'write "Fresh For Paws" (three words)'],
  [/\bfresh 4 paws\b|\bfresh for paw\b(?!s)/i, 'brand name misspelt'],
  [/\bFresh for Paws\b/, 'capitalise "For": Fresh For Paws'],
  [/\bFFP\b/, 'no "FFP" in customer copy'],
  [/\bfresh for purr\b(?!s)|\bFresh for Purrs\b/, 'write "Fresh For Purrs"'],
  [/\bmini-paws\b|\bMinipaws\b|\bMini paws\b/, 'write "Mini Paws"'],
];
const DEVSHOP_LEAK: [RegExp, string][] = [
  [/\bDevShop\b|\bRetail OS\b|Let's talk\./i, 'DevShop wording in brand copy'],
];

export function checkVoice(text: string, _kind: Kind = 'store'): Finding[] {
  const out: Finding[] = [];
  for (const [re, rule] of [...UNCONFIRMED, ...DEVSHOP_LEAK]) { const m = text.match(re); if (m) out.push({ level: 'block', rule, match: m[0] }); }
  for (const [re, rule] of NAME_ERRORS) { const m = text.match(re); if (m) out.push({ level: 'block', rule, match: m[0] }); }
  if (/₹\s?\d/.test(text)) out.push({ level: 'warn', rule: 'price in copy: check it against the product sheet', match: text.match(/₹\s?\d[\d,]*/)![0] });
  return out;
}

export function brandVoicePrompt(kind: Kind): string {
  return [
    `You are writing ${kind} copy for ${BRAND.name}.`,
    `Voice: ${BRAND.voice}`,
    `Only these facts may be stated: ${BRAND.facts.join('; ')}.`,
    `Sub-brands are written exactly "${BRAND.subBrands.cats}" (cats) and "${BRAND.subBrands.puppies}" (puppies).`,
    'Never claim: grain-free, vet-formulated, human-grade, preservative-free, AAFCO, cooked daily, or any health outcome. No prices unless given.',
    'Never mention DevShop or Retail OS.',
  ].join('\n');
}
