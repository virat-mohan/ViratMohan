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
const MAX_TOKENS = 14000;
export const DESIGN_DIRECTION_PROMPT_VERSION = '2026-09-23.2-three-options';
const CLAUDE_TIMEOUT_MS = 240_000;

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

const DESIGN_TOOL = {
  name: 'design_directions',
  description: 'Three distinct, grounded design directions for a D2C brand storefront, each anchored on a different real reference site.',
  input_schema: {
    type: 'object',
    properties: {
      hasExistingSite: { type: 'boolean', description: 'True if the brand has a live website/Shopify store/Instagram with an established look to build from' },
      options: { type: 'array', minItems: 3, maxItems: 3, description: 'Exactly three genuinely different directions', items: OPTION },
    },
    required: ['hasExistingSite', 'options'],
  },
} as const;

const SYSTEM_PROMPT = `You are a senior brand strategist and UI/UX designer proposing design directions for a D2C brand's storefront on DevShop Retail OS.

You have a native web search tool. Use it to find real, named, currently-successful brand websites in and around the brand's category — sites that genuinely work commercially, not generic inspiration. Cite what you find.

Give exactly THREE directions the founder can choose between. They must be genuinely different from each other (different reference brand, different palette logic, different typographic feel, different layout emphasis), not three shades of one idea.

Hard rules:
- If the brand has its own live website, Shopify store or Instagram with an established look, search for it first. Option 1 must elevate that existing identity toward a world-class execution and keep its recognisable colours. Options 2 and 3 may explore bolder alternatives, and should say what they change.
- If the brand has no live site and no design system, anchor each option on a specific, famous, commercially successful brand in or near the category whose website is worth adopting directly as the starting template, and say plainly why it works.
- Every reference must be a real, named brand/site you can point to — never a made-up or generic placeholder.
- UX principles must be specific and actionable ("sticky add-to-cart bar on mobile PDP", not "good mobile experience").
- Keep each option concise: a founder should grasp it in under a minute.
- Output only through the design_directions tool.`;

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

Research category-leading brand websites and propose three distinct design directions.`;
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
      throw new Error('Model did not call design_directions — it may have stopped mid-research. Try again.');
    }
    const out = toolUse.input as unknown as DesignDirectionOutput;
    if (!Array.isArray(out.options) || out.options.length === 0) throw new Error('No design options returned. Try again.');
    return out;
  } finally {
    clearTimeout(timeout);
  }
}
