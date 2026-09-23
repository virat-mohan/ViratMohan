// Design-direction generator for DevShop Retail OS applications — same
// architecture as retail-os-business-plan.ts:
// 1. Deterministic: if the brand has a live Shopify store, fetch its
//    homepage HTML directly first (ground truth for existing look/colors).
// 2. Claude does its own research via native web search — category-leading
//    global brand websites — then calls a structured tool.
// 3. It returns THREE genuinely different directions, each anchored on a
//    different real, commercially successful reference site, so the brand
//    chooses rather than being handed one answer. For an existing brand the
//    first option elevates its current identity; for a brand with no site,
//    every option starts from a proven reference worth adopting directly.
//
// See retail-os-business-plan.ts for the native web_search tool caveat —
// same MODEL/ANTHROPIC_VERSION/WEB_SEARCH_TOOL_TYPE apply here.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const WEB_SEARCH_TOOL_TYPE = 'web_search_20250305';
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 5000;
export const DESIGN_DIRECTION_PROMPT_VERSION = '2026-09-24.1-three-angles';
const CLAUDE_TIMEOUT_MS = 200_000;

export type DesignReference = { name: string; url: string; note: string };
export type DesignColorPalette = { primaryHex: string; secondaryHex: string; accentHex: string; backgroundHex: string; textHex: string; rationale: string };
export type DesignTypography = { headingFont: string; bodyFont: string; rationale: string };

export type DesignOption = {
  name: string;
  summary: string;
  primaryReference: DesignReference;
  additionalReferences: DesignReference[];
  colorPalette: DesignColorPalette;
  typography: DesignTypography;
  uxPrinciples: string[];
  toneOfVoice: string;
};

export type DesignDirectionOutput = { hasExistingSite: boolean; options: DesignOption[] };

const REF = {
  type: 'object',
  properties: { name: { type: 'string' }, url: { type: 'string' }, note: { type: 'string' } },
  required: ['name', 'url', 'note'],
} as const;

const OPTION = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'A short, evocative name for this direction, 2-4 words (e.g. "Quiet travel luxury")' },
    summary: { type: 'string', description: 'One sentence a founder can read in five seconds: what this store would feel like' },
    primaryReference: { ...REF, description: 'The real, commercially successful site this direction is anchored on, and why it is the right one to adopt' },
    additionalReferences: { type: 'array', description: '1-3 secondary real references', items: REF },
    colorPalette: {
      type: 'object',
      properties: {
        primaryHex: { type: 'string' }, secondaryHex: { type: 'string' }, accentHex: { type: 'string' },
        backgroundHex: { type: 'string' }, textHex: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['primaryHex', 'secondaryHex', 'accentHex', 'backgroundHex', 'textHex', 'rationale'],
    },
    typography: {
      type: 'object',
      properties: { headingFont: { type: 'string' }, bodyFont: { type: 'string' }, rationale: { type: 'string' } },
      required: ['headingFont', 'bodyFont', 'rationale'],
    },
    uxPrinciples: { type: 'array', description: '3-5 concrete layout/UX patterns grounded in what the references actually do', items: { type: 'string' } },
    toneOfVoice: { type: 'string', description: 'Two or three sentences on the brand voice for this direction' },
  },
  required: ['name', 'summary', 'primaryReference', 'additionalReferences', 'colorPalette', 'typography', 'uxPrinciples', 'toneOfVoice'],
} as const;

// One call per option, run in parallel: a single call asked for all three
// ran past the serverless time limit. Each call gets a different angle so
// the three come back genuinely different.
const DESIGN_TOOL = {
  name: 'design_direction',
  description: 'One grounded design direction for a D2C brand storefront, anchored on a real reference site.',
  input_schema: {
    type: 'object',
    properties: {
      hasExistingSite: { type: 'boolean', description: 'True if the brand has a live website/Shopify store/Instagram with an established look to build from' },
      option: OPTION,
    },
    required: ['hasExistingSite', 'option'],
  },
} as const;

type Angle = { key: string; withSite: string; withoutSite: string };
const ANGLES: Angle[] = [
  {
    key: 'closest',
    withSite: "ELEVATE THE EXISTING BRAND: keep its recognisable colours and feel, and push the execution toward how the best site in its category does it.",
    withoutSite: 'CATEGORY LEADER: anchor on the single most proven, commercially successful brand in this exact category, and adopt its site as the starting template.',
  },
  {
    key: 'premium',
    withSite: 'PREMIUM AND EDITORIAL: a quieter, more elevated alternative (considered typography, generous space, storytelling), anchored on a different successful brand from the one an obvious category search returns first.',
    withoutSite: 'PREMIUM AND EDITORIAL: a quiet-luxury direction (considered typography, generous space, storytelling), anchored on a successful premium brand in or near the category.',
  },
  {
    key: 'bold',
    withSite: 'BOLD AND SOCIAL-FIRST: a louder alternative (strong colour, playful type, customer photos and video up front), anchored on a different successful, youth-led brand.',
    withoutSite: 'BOLD AND SOCIAL-FIRST: strong colour, playful type, customer photos and video up front, anchored on a successful youth-led brand in or near the category.',
  },
];

const SYSTEM_PROMPT = `You are a senior brand strategist and UI/UX designer proposing ONE design direction for a D2C brand's storefront on DevShop Retail OS. You will be told which angle to take.

You have a native web search tool. Use it to find real, named, currently-successful brand websites in and around the brand's category — sites that genuinely work commercially, not generic inspiration.

Hard rules:
- If the brand has its own live website, Shopify store or Instagram, look at it first so the direction relates to where the brand is today.
- Anchor the direction on one specific, real, commercially successful brand whose website is worth building on, and say plainly why.
- Every reference must be a real, named brand/site — never a made-up or generic placeholder.
- UX principles must be specific and actionable ("sticky add-to-cart bar on mobile PDP", not "good mobile experience").
- Keep it concise: a founder should grasp it in under a minute.
- Output only through the design_direction tool.`;

export type DesignBrandContext = {
  brandName: string;
  category: string | null;
  format: string | null;
  handle: string | null;
  shopifyUrl: string | null;
};

async function fetchHomepageSignal(shopifyUrl: string): Promise<string | null> {
  try {
    const base = shopifyUrl.replace(/\/$/, '');
    const res = await fetch(base, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const html = await res.text();
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
    const hexMatches = Array.from(new Set((html.match(/#[0-9a-fA-F]{6}\b/g) ?? []).slice(0, 20)));
    return `Fetched live from the brand's own homepage (${base}). Title: ${titleMatch?.[1] ?? 'not found'}. Description: ${descMatch?.[1] ?? 'not found'}. Hex colors seen in the raw HTML (heuristic only — real theme colors often live in compiled CSS, verify visually): ${hexMatches.length ? hexMatches.join(', ') : 'none found in raw HTML'}.`;
  } catch {
    return null;
  }
}

function buildUserMessage(app: DesignBrandContext, homepageSignal: string | null): string {
  return `BRAND CONTEXT
Brand: ${app.brandName}
Category: ${app.category ?? 'not specified'}
Format: ${app.format ?? 'not specified'}
Instagram / website: ${app.handle ?? 'not provided'}
Shopify/live store: ${app.shopifyUrl ?? 'not provided'}

${homepageSignal ? `HOMEPAGE SIGNAL (fetched directly, heuristic — verify visually before treating as final)\n${homepageSignal}\n` : ''}
${app.shopifyUrl || app.handle ? "Search for the brand's live site and/or Instagram to see its actual current look before proposing directions." : 'This brand has no live website or design system yet.'}

Research category-leading brand websites and propose this one design direction.`;
}

async function generateOne(app: DesignBrandContext, apiKey: string, homepageSignal: string | null, angle: Angle): Promise<{ hasExistingSite: boolean; option: DesignOption }> {
  const hasSomething = !!(app.shopifyUrl || app.handle);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `${buildUserMessage(app, homepageSignal)}\n\nANGLE FOR THIS DIRECTION: ${hasSomething ? angle.withSite : angle.withoutSite}` }],
        tools: [{ type: WEB_SEARCH_TOOL_TYPE, name: 'web_search' }, DESIGN_TOOL],
        tool_choice: { type: 'auto' },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { content: Array<{ type: string; name?: string; input?: Record<string, unknown> }> };
    const toolUse = data.content.find((b) => b.type === 'tool_use' && b.name === DESIGN_TOOL.name);
    const out = toolUse?.input as { hasExistingSite?: boolean; option?: DesignOption } | undefined;
    if (!out?.option) throw new Error(`No ${angle.key} direction returned`);
    return { hasExistingSite: !!out.hasExistingSite, option: out.option };
  } finally {
    clearTimeout(timeout);
  }
}

// Three directions from three parallel calls; succeeds if at least one does.
export async function generateDesignDirection(app: DesignBrandContext, apiKey: string): Promise<DesignDirectionOutput> {
  const homepageSignal = app.shopifyUrl ? await fetchHomepageSignal(app.shopifyUrl) : null;
  const results = await Promise.allSettled(ANGLES.map((a) => generateOne(app, apiKey, homepageSignal, a)));
  const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (!ok.length) {
    const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    throw new Error(first?.reason instanceof Error ? first.reason.message : 'Design generation failed. Try again.');
  }
  return { hasExistingSite: ok.some((r) => r.hasExistingSite), options: ok.map((r) => r.option) };
}
