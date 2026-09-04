import { PNL_LEVERS, type PnlLeverHit } from './pnl-levers';

export type ClassifyAndBuildInput = {
  problem: string; // may describe more than one distinct problem
  company: string | null;
  tools: string | null;
  websiteSnippet: string | null; // best-effort HTML excerpt from the client's site, for brand cues
};

export type ClassifyAndBuildResult = {
  levers: PnlLeverHit[];
  artefactHtml: string;
};

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Model id per current Claude lineup — update here if the account's default changes.
const MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `You are the solutioning engine behind Fast Tech Dev Shop, an AI orchestration studio.
A prospective client has described one or more business problems in plain language. Your job, in order:

1. Identify every distinct problem in their text (there may be just one, or several). For EACH one, classify it against this fixed P&L lever taxonomy (pick exactly one lever per problem):
   Revenue levers: ${PNL_LEVERS.revenue.join(', ')}
   Cost levers: ${PNL_LEVERS.cost.join(', ')}
   Write one or two plain-language sentences per problem explaining why that lever, no "leverage/unlock/synergy" jargon.
2. Build ONE working interactive HTML demo artefact that solves every problem you identified, as a single coherent product experience — not several unrelated demos stitched together. If there are multiple problems, the artefact should read as one tool with a section, tab, or view per problem, sharing one navigation and one visual system.

Rules for the artefact:
- It is a demo, not a mockup — real interactive elements (buttons, inputs, tabs) that respond to clicks, backed by representative/assumed sample data you invent. It does NOT need real client data or a real backend.
- Single self-contained HTML fragment: inline <style> and <script> only, no external requests, no external libraries, no images (use inline SVG only if needed).
- It must visibly tie back to the specific P&L lever(s) and give a plausible before/after number for each.
- Keep it focused and legible: a client should grasp the whole thing in under a couple of minutes.

Branding — this matters:
- You may be given an HTML excerpt from the client's own website (reference_site_html below). If present, read it for their actual brand colors (CSS custom properties, inline styles, common hex/rgb values), typography (font-family declarations), and company name — and skin the artefact to feel like it belongs to THEIR product, not to Fast Tech Dev Shop. Do not use Fast Tech Dev Shop's own gold-on-near-black identity here; that identity belongs to the sales page, not to a client's demo.
- If no reference_site_html is given, or it doesn't yield usable brand signals, fall back to a simple, neutral, professional placeholder: light neutral background, dark neutral text, one restrained accent color, plain sans-serif system font, and a placeholder mark at the top reading "[ Client logo ]" in place of a real logo — clearly a placeholder, not a fake brand.

Return your answer using the classify_and_build tool. Do not include any text outside the tool call.`;

export async function classifyAndBuild(
  input: ClassifyAndBuildInput,
  apiKey: string
): Promise<ClassifyAndBuildResult> {
  const userMessage = [
    `Problem(s): ${input.problem}`,
    input.company ? `Company: ${input.company}` : null,
    input.tools ? `Tools currently in use: ${input.tools}` : null,
    input.websiteSnippet
      ? `reference_site_html (excerpt from the client's own website, for brand cues only):\n${input.websiteSnippet}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      tools: [
        {
          name: 'classify_and_build',
          description: 'Report the P&L lever classification(s) and the generated demo artefact.',
          input_schema: {
            type: 'object',
            properties: {
              levers: {
                type: 'array',
                description: 'One entry per distinct problem identified.',
                items: {
                  type: 'object',
                  properties: {
                    category: { type: 'string', enum: ['revenue', 'cost'] },
                    lever: { type: 'string', description: 'One of the fixed lever names, verbatim.' },
                    reasoning: { type: 'string' },
                  },
                  required: ['category', 'lever', 'reasoning'],
                },
              },
              artefact_html: {
                type: 'string',
                description:
                  'Self-contained HTML fragment for the interactive demo artefact, covering every problem in `levers`.',
              },
            },
            required: ['levers', 'artefact_html'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'classify_and_build' },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; input?: Record<string, unknown> }>;
  };
  const toolUse = data.content.find((b) => b.type === 'tool_use');
  if (!toolUse?.input) throw new Error('Anthropic response did not include a tool_use block');

  const out = toolUse.input as { levers: PnlLeverHit[]; artefact_html: string };

  return {
    levers: out.levers,
    artefactHtml: out.artefact_html,
  };
}

// Best-effort fetch of a client's homepage HTML, trimmed to a size that's
// cheap to pass as context. Never throws — brand cues are a nice-to-have,
// not a dependency the pipeline should fail on.
export async function fetchWebsiteSnippet(url: string): Promise<string | null> {
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(normalized, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; FastTechDevShopBot/1.0)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    // Strip script/style bodies to keep signal density high within the size cap.
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    return stripped.slice(0, 12000);
  } catch {
    return null;
  }
}
