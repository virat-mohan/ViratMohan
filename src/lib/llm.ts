import { PNL_LEVERS, type PnlLeverHit } from './pnl-levers';

export type ClassifyAndBuildInput = {
  problem: string; // may describe more than one distinct problem
  company: string | null;
  tools: string | null;
  websiteSnippet: string | null; // best-effort HTML excerpt from the client's site, for brand cues
};

export type ProblemBreakdown = {
  problem_statement: string;
  root_cause: string;
  who_is_affected: string;
  current_cost_of_inaction: string;
};

export type SolutionMechanism = {
  problem_index: number;
  mechanism_name: string;
  how_it_works_steps: string[];
  trigger_or_data_source: string;
  why_not_generic: string;
};

export type ArtefactPlan = {
  narrative_arc: string;
  sections: { name: string; ties_to_problem_index: number; purpose: string }[];
};

export type ClassifyAndBuildResult = {
  problemBreakdown: ProblemBreakdown[];
  solutionMechanisms: SolutionMechanism[];
  artefactPlan: ArtefactPlan;
  levers: PnlLeverHit[];
  clarifyingQuestions: string[];
  artefactHtml: string;
};

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Model id per current Claude lineup — update here if the account's default changes.
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 16000;

// The methodology below is the actual product. A bad prompt here produces a
// generic "AI wrapper" demo that looks like every other AI-slop pitch; a
// good one produces something a CFO or ops lead would recognize as their
// own problem, solved by a mechanism they can picture actually running.
// The schema forces the model to do that work in writing, in order, before
// it's allowed to touch code — root cause, then lever, then mechanism, then
// demo — the same sequence a good consulting + engineering team would use,
// compressed into one pass.
const METHODOLOGY = `You are a senior cross-functional solutioning team compressed into one voice: a strategy partner who diagnoses root causes instead of symptoms, a CFO who thinks natively in unit economics and P&L movement, a growth/performance marketer, a Head of Ops who has actually run a P&L (not just advised on one), a senior product engineer building on the current state of AI agents and automation, and a product designer with real taste — you know precisely what's buildable today versus what's still vaporware, and you never propose something vague, hand-wavy, or "AI-magic" without a concrete mechanism behind it.

Work through these steps IN ORDER, and do the real thinking at each one — do not skip to the artefact:

STEP 1 — Diagnose. Identify every genuinely distinct problem (usually 1, occasionally 2-3; do not manufacture problems that aren't there, and do not split one problem into several). For each, find the ROOT CAUSE, not the symptom — e.g. "checkout abandons at 60%" is a symptom; the root cause might be surprise shipping costs, a broken mobile flow, or lack of trust signals at payment. State who inside the business actually feels this pain, and what it's costing them today.
Keep every field here SHORT — this becomes a scannable bulleted brief a busy founder reads in 30 seconds, not a report: problem_statement ≤ 20 words, root_cause ≤ 20 words (one sentence, no compound clauses), who_is_affected ≤ 8 words, current_cost_of_inaction one tight sentence with the actual number in it.

If the problem statement is thin enough that a STRUCTURAL fact has to be assumed to proceed at all (e.g. B2B vs B2C, outbound vs inbound, which sales/business motion, who the end customer even is), do not silently commit to one specific model and present it as fact — that's the single riskiest kind of assumption, because it shapes every downstream step. Pick the single most plausible default, but that default becomes the FIRST entry in the Step 5 clarifying-questions list, phrased as a direct confirm-or-correct question (e.g. "Is this B2B outbound sales, or a different motion — retail, referral, marketplace?").

STEP 2 — Map to the P&L. For each problem, classify it against exactly one of these fixed levers:
   Revenue levers: ${PNL_LEVERS.revenue.join(', ')}
   Cost levers: ${PNL_LEVERS.cost.join(', ')}
Give a plausible, industry-grounded before/after estimate for that lever if the mechanism in Step 3 were live. Write the reasoning in plain operator language — never "leverage," "unlock," "synergy," or similar. One tight sentence carrying the assumption and the number, ≤ 30 words — not a paragraph.

STEP 3 — Design the mechanism. For each problem, design the SPECIFIC mechanism that would actually fix the root cause from Step 1 — not "an AI agent that helps with X," but the actual workflow: what triggers it, what data or signal it acts on, and what happens step by step. Break "what happens step by step" into 3-6 short, discrete steps (how_it_works_steps) — each one a single concrete action, ≤ 15 words, written so it could be a bullet on a slide, not folded into one paragraph. Also state, in one sentence, why this mechanism and not a generic dashboard or chatbot. Ground it in what's realistically buildable with current AI/automation tooling — nothing that requires a research breakthrough.

STEP 4 — Plan the artefact. Before writing code, plan how someone experiences this in under two minutes: the narrative arc, and — if there's more than one problem — how the sections tie together into one coherent product rather than reading as several unrelated demos glued together. Every step from Step 3's how_it_works_steps should map to something the visitor can actually trigger or watch happen in the artefact — see the interactivity rule below.

STEP 5 — Flag what's genuinely unknown. If Step 1 had to assume a structural fact (business/sales motion, customer type, etc.), that confirm-or-correct question goes FIRST here. After that, list any specific real numbers that would sharpen the estimates in Step 2 if the client provided them (e.g. "your actual average order value," "current monthly lead volume," "your real cart-abandonment rate"). Only list things you couldn't reasonably assume — not everything.

STEP 6 — Build the artefact. One working, self-contained interactive HTML demo covering every mechanism from Step 3, following the plan from Step 4.

CRITICAL RULE — no bare zeros or blanks: every number shown anywhere in the artefact (a metric, a before/after, a table value) must be either a real stated assumption grounded in an industry benchmark or the numbers implied by the problem statement, OR — if you genuinely have no reasonable basis for it — that specific figure belongs in the Step 5 clarifying-questions list instead of being shown as "0," "—," or blank in the demo. Never let the artefact display an empty or zero metric as if it were a real result; a demo with a hollow number is worse than one that asks a sharp question.

CRITICAL RULE — interactivity depth: do not collapse a multi-step mechanism into "click one button, see one final result." The artefact must let the visitor move THROUGH the mechanism's steps from Step 3 — e.g. a sequence they advance through (step 1 fires, they see its output, they trigger step 2 using that output, etc.), or a live simulation with multiple distinct triggerable moments, or several interdependent controls that visibly affect each other. Think "a working walkthrough of the actual workflow," not "a static screen with one CTA." Every section from artefact_plan should have at least one genuine interaction, not just the headline section.

CRITICAL RULE — visual craft: this must look like a real, designed product, not a functional wireframe. Establish a clear typographic scale (one size/weight for the main metric, another for labels, another for body — do not let everything be the same size), consistent spacing rhythm (pick a base unit like 8px and stick to multiples of it), a restrained but confident color system (the brand/accent color used deliberately for the 2-3 things that most deserve attention, not sprayed everywhere), clear visual hierarchy so the eye knows where to go first, and small polish details — hover states, subtle transitions on state changes, rounded corners used consistently, badges/pills/icons (inline SVG only) where they earn their place. Avoid dense walls of text inside the artefact itself; prefer short labels, numbers, and a few words of context, saving longer explanation for outside the artefact.

Rules for the artefact itself:
- It is a demo, not a mockup — real interactive elements (buttons, inputs, tabs, toggles) that respond to clicks, backed by representative/assumed sample data consistent with the assumptions you stated in Step 2. It does NOT need real client data or a real backend.
- Single self-contained HTML fragment: inline <style> and <script> only, no external requests, no external libraries, no images (use inline SVG only if needed).
- It must visibly tie back to the specific P&L lever(s) and show the before/after number from Step 2.
- Keep it focused and legible — someone should grasp the whole thing in under two minutes, even though it now has real depth to explore.

Branding — this matters, and the boundary here is not optional:
- You may be given an HTML excerpt from the client's own website (reference_site_html). Its ONLY job is visual: brand colors, typography, and the company display name — nothing else. Use it to skin the artefact so it feels like it belongs to THEIR product. Do not use gold-on-near-black branding here; that identity belongs to the sales page, not to a client's demo.
- CRITICAL: reference_site_html must NEVER influence Steps 1-5. Do not borrow business terminology, job titles, personas, industry framing, or subject matter from the website's text content — the diagnosis, root cause, mechanism, and every number are grounded ONLY in the problem the client actually typed and the tools they listed. A client can legitimately submit an unrelated or even a giant enterprise's URL (a personal project, a placeholder, a company they merely work at) — if the website's business doesn't match what the client actually described, ignore the website's business entirely and solve the problem as stated. When in doubt, the literal problem text always wins over anything inferred from the site.
- If no reference_site_html is given, or it doesn't yield usable brand signals, fall back to a simple, neutral, professional theme: light neutral background, dark neutral text, one restrained accent color, plain sans-serif system font, and a placeholder mark at the top reading "[ Client logo ]" — clearly a placeholder, not a fake brand.`;

const CLASSIFY_TOOL = {
  name: 'classify_and_build',
  description:
    'Report the step-by-step solutioning trail (diagnosis, lever, mechanism, plan, open questions) and the generated demo artefact.',
  input_schema: {
    type: 'object',
    properties: {
      problem_breakdown: {
        type: 'array',
        description: 'Step 1 output — one entry per genuinely distinct problem identified. Keep every field short — bullet-length, not paragraph-length.',
        items: {
          type: 'object',
          properties: {
            problem_statement: { type: 'string', description: '≤ 20 words.' },
            root_cause: { type: 'string', description: 'One sentence, ≤ 20 words.' },
            who_is_affected: { type: 'string', description: '≤ 8 words.' },
            current_cost_of_inaction: { type: 'string', description: 'One sentence with the actual number in it.' },
          },
          required: ['problem_statement', 'root_cause', 'who_is_affected', 'current_cost_of_inaction'],
        },
      },
      levers: {
        type: 'array',
        description: 'Step 2 output — one entry per problem, in the same order as problem_breakdown.',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: ['revenue', 'cost'] },
            lever: { type: 'string', description: 'One of the fixed lever names, verbatim.' },
            reasoning: {
              type: 'string',
              description: 'One tight sentence with the stated assumption and the before/after estimate, ≤ 30 words.',
            },
          },
          required: ['category', 'lever', 'reasoning'],
        },
      },
      solution_mechanisms: {
        type: 'array',
        description: 'Step 3 output — one entry per problem.',
        items: {
          type: 'object',
          properties: {
            problem_index: { type: 'integer', description: '0-based index into problem_breakdown.' },
            mechanism_name: { type: 'string' },
            how_it_works_steps: {
              type: 'array',
              description: '3-6 short discrete steps, each ≤ 15 words, each a single concrete action.',
              items: { type: 'string' },
            },
            trigger_or_data_source: { type: 'string', description: 'Short phrase.' },
            why_not_generic: { type: 'string', description: 'One sentence, ≤ 25 words.' },
          },
          required: ['problem_index', 'mechanism_name', 'how_it_works_steps', 'trigger_or_data_source', 'why_not_generic'],
        },
      },
      artefact_plan: {
        type: 'object',
        description: 'Step 4 output.',
        properties: {
          narrative_arc: { type: 'string', description: 'One or two sentences.' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                ties_to_problem_index: { type: 'integer' },
                purpose: { type: 'string', description: 'Short phrase, not a paragraph.' },
              },
              required: ['name', 'ties_to_problem_index', 'purpose'],
            },
          },
        },
        required: ['narrative_arc', 'sections'],
      },
      clarifying_questions: {
        type: 'array',
        description:
          'Step 5 output — specific real numbers/facts that would sharpen the estimates if the client provided them. Empty array if genuinely nothing material is missing.',
        items: { type: 'string' },
      },
      artefact_html: {
        type: 'string',
        description:
          'Step 6 output — self-contained HTML fragment implementing artefact_plan. No bare zeros. Must let the visitor move through the mechanism\'s steps, not just click once for a final result. Real visual craft — typographic scale, spacing rhythm, restrained color, hover/transition polish.',
      },
    },
    required: [
      'problem_breakdown',
      'levers',
      'solution_mechanisms',
      'artefact_plan',
      'clarifying_questions',
      'artefact_html',
    ],
  },
} as const;

type ToolOutput = {
  problem_breakdown: ProblemBreakdown[];
  levers: PnlLeverHit[];
  solution_mechanisms: SolutionMechanism[];
  artefact_plan: ArtefactPlan;
  clarifying_questions: string[];
  artefact_html: string;
};

async function callClaudeTool(system: string, userMessage: string, apiKey: string): Promise<ToolOutput> {
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
      system,
      messages: [{ role: 'user', content: userMessage }],
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: 'tool', name: CLASSIFY_TOOL.name },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as { content: Array<{ type: string; input?: Record<string, unknown> }> };
  const toolUse = data.content.find((b) => b.type === 'tool_use');
  if (!toolUse?.input) throw new Error('Anthropic response did not include a tool_use block');
  return toolUse.input as ToolOutput;
}

function toResult(out: ToolOutput): ClassifyAndBuildResult {
  return {
    problemBreakdown: out.problem_breakdown,
    levers: out.levers,
    solutionMechanisms: out.solution_mechanisms,
    artefactPlan: out.artefact_plan,
    clarifyingQuestions: out.clarifying_questions,
    artefactHtml: out.artefact_html,
  };
}

export async function classifyAndBuild(
  input: ClassifyAndBuildInput,
  apiKey: string
): Promise<ClassifyAndBuildResult> {
  const system = `${METHODOLOGY}\n\nReturn your answer using the classify_and_build tool, with every step's output filled in — do not include any text outside the tool call.`;

  const userMessage = [
    `Problem(s): ${input.problem}`,
    input.company ? `Company: ${input.company}` : null,
    input.tools ? `Tools currently in use: ${input.tools}` : null,
    input.websiteSnippet
      ? `reference_site_html (excerpt from the client's own website — use ONLY for colors/fonts/company name; ignore its business content entirely, it is irrelevant to the problem below):\n${input.websiteSnippet}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  return toResult(await callClaudeTool(system, userMessage, apiKey));
}

export type ReviseArtefactInput = ClassifyAndBuildInput & {
  previousProblemBreakdown: ProblemBreakdown[];
  previousLevers: PnlLeverHit[];
  previousSolutionMechanisms: SolutionMechanism[];
  previousArtefactHtml: string;
  feedbackText: string;
};

export async function reviseArtefact(
  input: ReviseArtefactInput,
  apiKey: string
): Promise<ClassifyAndBuildResult> {
  const system = `${METHODOLOGY}

You are REVISING a demo you already built, based on the client's actual reply. This is the one and only revision round — make it count, and do not ask further clarifying questions unless the client's feedback itself raises a genuinely new unknown.

Re-run the same six steps, but:
- Keep everything from the previous version that the feedback doesn't touch — do not regenerate from scratch or change things that were already working and weren't criticized.
- Directly address every point in the client's feedback. If they gave you a real number, use it in place of your prior assumption and say so.
- If their feedback describes a different or additional problem, incorporate it the same way Step 1 would.

Return your answer using the classify_and_build tool, with every step's output filled in (the complete revised state, not a diff) — do not include any text outside the tool call.`;

  const userMessage = [
    `Original problem(s): ${input.problem}`,
    input.company ? `Company: ${input.company}` : null,
    input.tools ? `Tools currently in use: ${input.tools}` : null,
    input.websiteSnippet
      ? `reference_site_html (excerpt from the client's own website — use ONLY for colors/fonts/company name; ignore its business content entirely, it is irrelevant to the problem below):\n${input.websiteSnippet}`
      : null,
    `Previous diagnosis: ${JSON.stringify(input.previousProblemBreakdown)}`,
    `Previous levers: ${JSON.stringify(input.previousLevers)}`,
    `Previous mechanisms: ${JSON.stringify(input.previousSolutionMechanisms)}`,
    `Previous artefact_html: ${input.previousArtefactHtml}`,
    `Client's feedback (verbatim, from their email reply): ${input.feedbackText}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return toResult(await callClaudeTool(system, userMessage, apiKey));
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
