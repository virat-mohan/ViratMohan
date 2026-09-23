// Design-direction generator for DevShop Retail OS applications — same
// architecture as retail-os-business-plan.ts:
// 1. Deterministic: if the brand has a live Shopify store, fetch its
//    homepage HTML directly first (ground truth for existing look/colors).
// 2. Claude does its own research via native web search — category-leading
//    global brand websites — then calls a structured tool.
// 3. If the brand has no live site/catalog yet, the model is instructed to
//    name ONE proven, famous, successful global brand in the same category
//    and recommend directly adopting its website's design language as the
//    starting template, not inventing something from scratch.
//
// See retail-os-business-plan.ts for the native web_search tool caveat —
// same MODEL/ANTHROPIC_VERSION/WEB_SEARCH_TOOL_TYPE apply here.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const WEB_SEARCH_TOOL_TYPE = 'web_search_20250305';
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 6000;
export const DESIGN_DIRECTION_PROMPT_VERSION = '2026-09-23.1-native-search';
const CLAUDE_TIMEOUT_MS = 170_000;

export type DesignReference = { name: string; url: string; note: string };
export type DesignColorPalette = { primaryHex: string; secondaryHex: string; accentHex: string; backgroundHex: string; textHex: string; rationale: string };
export type DesignTypography = { headingFont: string; bodyFont: string; rationale: string };

export type DesignDirectionOutput = {
  hasExistingSite: boolean;
  primaryReference: DesignReference;
  additionalReferences: DesignReference[];
  colorPalette: DesignColorPalette;
  typography: DesignTypography;
  uxPrinciples: string[];
  toneOfVoice: string;
};

const DESIGN_TOOL = {
  name: 'design_direction',
  description: 'A grounded design direction for a D2C brand storefront: reference sites, color palette, typography, and UX principles, with a rationale for each.',
  input_schema: {
    type: 'object',
    properties: {
      hasExistingSite: { type: 'boolean', description: 'True if the brand has a live website/Shopify store/Instagram with an established look to build from' },
      primaryReference: {
        type: 'object',
        description: 'The single most important reference. If the brand has an existing site, this can be its own direction pushed toward a world-class execution. If it does NOT have an existing site or design system, this MUST be one specific, famous, commercially successful global brand in the exact same category, whose website is worth directly adopting as the starting template.',
        properties: { name: { type: 'string' }, url: { type: 'string' }, note: { type: 'string', description: 'Why this is the right template to copy from, specifically' } },
        required: ['name', 'url', 'note'],
      },
      additionalReferences: {
        type: 'array',
        description: '2-4 secondary references for variety, each a real, named, successful site in a related category',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, url: { type: 'string' }, note: { type: 'string' } },
          required: ['name', 'url', 'note'],
        },
      },
      colorPalette: {
        type: 'object',
        properties: {
          primaryHex: { type: 'string' }, secondaryHex: { type: 'string' }, accentHex: { type: 'string' },
          backgroundHex: { type: 'string' }, textHex: { type: 'string' },
          rationale: { type: 'string', description: 'Ground this in the brand\'s existing colors if found, otherwise in the primary reference and category' },
        },
        required: ['primaryHex', 'secondaryHex', 'accentHex', 'backgroundHex', 'textHex', 'rationale'],
      },
      typography: {
        type: 'object',
        properties: { headingFont: { type: 'string' }, bodyFont: { type: 'string' }, rationale: { type: 'string' } },
        required: ['headingFont', 'bodyFont', 'rationale'],
      },
      uxPrinciples: {
        type: 'array',
        description: '4-6 concrete layout/UX patterns to adopt, each grounded in what the references actually do (e.g. "full-bleed hero product video, not a static banner — see [reference]")',
        items: { type: 'string' },
      },
      toneOfVoice: { type: 'string', description: 'One paragraph: the brand voice for copy across the site, grounded in the brand\'s existing content if any, otherwise proposed from category and positioning' },
    },
    required: ['hasExistingSite', 'primaryReference', 'additionalReferences', 'colorPalette', 'typography', 'uxPrinciples', 'toneOfVoice'],
  },
} as const;

const SYSTEM_PROMPT = `You are a senior brand strategist and UI/UX designer building a design direction for a D2C brand's storefront on DevShop Retail OS.

You have a native web search tool. Use it to find real, named, currently-successful global brand websites in the brand's exact category — sites that genuinely work commercially, not generic inspiration. Cite what you find.

Hard rules:
- If the brand supplies its own live website, Shopify store, or Instagram with an established look, fetch/search for it and ground the color palette and tone of voice in what's ACTUALLY there — your job is to elevate that toward a world-class execution, not replace their identity.
- If the brand has NO live site and no existing design system, do not invent a generic palette. Instead, search for and name ONE specific, famous, commercially successful global brand in the exact same category, and recommend directly adopting its website's design language (layout patterns, color logic, typographic feel) as the starting template. Say plainly why that brand's site works and is the right one to copy from. Set hasExistingSite to false.
- Every reference must be a real, named brand/site you can point to — never a made-up or generic placeholder.
- UX principles must be specific and actionable ("sticky add-to-cart bar on mobile PDP", not "good mobile experience").
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
Instagram / handle: ${app.handle ?? 'not provided'}
Shopify/live store: ${app.shopifyUrl ?? 'not provided — this brand has no live site or design system yet'}

${homepageSignal ? `HOMEPAGE SIGNAL (fetched directly, heuristic — verify visually before treating as final)\n${homepageSignal}\n` : ''}
${app.shopifyUrl ? 'Search for the brand\'s live site and/or Instagram to see its actual current look before proposing a direction.' : 'This brand has no live website or design system. Find and name one famous, successful global brand in this exact category whose website is worth directly adopting as the starting template.'}

Research category-leading global brand websites and build the design direction.`;
}

export async function generateDesignDirection(app: DesignBrandContext, apiKey: string): Promise<DesignDirectionOutput> {
  const homepageSignal = app.shopifyUrl ? await fetchHomepageSignal(app.shopifyUrl) : null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(app, homepageSignal) }],
        tools: [{ type: WEB_SEARCH_TOOL_TYPE, name: 'web_search' }, DESIGN_TOOL],
        tool_choice: { type: 'auto' },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as { content: Array<{ type: string; name?: string; input?: Record<string, unknown> }> };
    const toolUse = data.content.find((b) => b.type === 'tool_use' && b.name === DESIGN_TOOL.name);
    if (!toolUse?.input) {
      throw new Error('Model did not call design_direction — it may have stopped mid-research. Try again.');
    }
    return toolUse.input as unknown as DesignDirectionOutput;
  } finally {
    clearTimeout(timeout);
  }
}
