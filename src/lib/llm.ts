import {
  PNL_LEVERS,
  BUSINESS_FUNCTIONS,
  CONFIDENCE_LEVELS,
  VALIDATION_STATUSES,
  EPISTEMIC_STATUSES,
  type PnlLeverHit,
  type ConfidenceLevel,
  type ValidationStatus,
} from './pnl-levers';

export type FrameworkLibraryEntry = {
  name: string;
  source: string;
  business_function: string;
  when_to_use: string;
  link?: string | null;
};

export type ClassifyAndBuildInput = {
  problem: string; // may describe more than one distinct problem
  company: string | null;
  tools: string | null;
  websiteSnippet: string | null; // best-effort HTML excerpt from the client's site, for brand cues
  frameworkLibrary: FrameworkLibraryEntry[]; // admin-curated — preferred set the model should draw from
  preferredFramework: string | null; // client named a specific framework/approach themselves — overrides library selection
};

export type ProblemBreakdown = {
  problem_statement: string;
  business_function: string;
  root_cause: string;
  who_is_affected: string;
  current_cost_of_inaction: string;
  // Epistemic status of the diagnosis itself — a root cause is a
  // hypothesis until evidence says otherwise, never presented as proven.
  confidence_level: ConfidenceLevel;
  supporting_evidence: string; // what in the problem statement actually supports this root cause
  evidence_gaps: string; // what's missing/assumed that, if wrong, would change the diagnosis
};

export type SolutionValidation = {
  problem_index: number;
  validation_type: 'root_cause_evidence' | 'framework_fit' | 'pnl_causal_chain' | 'economic_plausibility';
  status: ValidationStatus;
  severity: 'low' | 'medium' | 'high';
  explanation: string;
  recommended_action: string;
};

// The model only ever names frameworks (by exact library name) — every
// factual detail (source, description, link) is resolved from OUR curated
// data afterward (see resolveFrameworkSelections), never trusted from the
// model's own citation text. This is what makes the links safe to show.
export type RawFrameworkSelection = {
  problem_index: number;
  framework_name: string;
  why_selected: string; // ties the choice to this specific root cause, incl. what makes it a proven/world-class fit
  in_library: boolean; // false = model is suggesting something real but not yet in the curated set
  suggested_source?: string; // only used when in_library is false — the model's own citation, unverified
  runner_up_names: string[]; // 3-7 other library framework names genuinely considered for this problem
};

export type ResolvedFrameworkRef = {
  name: string;
  source: string;
  when_to_use: string;
  link: string | null;
};

export type FrameworkSelection = {
  problem_index: number;
  framework_name: string;
  framework_source: string;
  framework_link: string | null;
  why_selected: string;
  in_library: boolean;
  runner_ups: ResolvedFrameworkRef[];
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
  frameworkSelections: RawFrameworkSelection[]; // resolve with resolveFrameworkSelections() before persisting
  solutionMechanisms: SolutionMechanism[];
  artefactPlan: ArtefactPlan;
  levers: PnlLeverHit[];
  validations: SolutionValidation[];
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
function buildMethodology(frameworkLibrary: FrameworkLibraryEntry[], preferredFramework: string | null): string {
  const libraryText =
    frameworkLibrary.length > 0
      ? frameworkLibrary
          .map((f) => `- ${f.name} (${f.source}) — ${f.business_function} — use when: ${f.when_to_use}`)
          .join('\n')
      : '(library is currently empty)';

  return `You are a senior cross-functional solutioning team compressed into one voice: a strategy partner who diagnoses root causes instead of symptoms, a CFO who thinks natively in unit economics and P&L movement, a growth/performance marketer, a Head of Ops who has actually run a P&L (not just advised on one), a senior product engineer building on the current state of AI agents and automation, and a product designer with real taste — you know precisely what's buildable today versus what's still vaporware, and you never propose something vague, hand-wavy, or "AI-magic" without a concrete mechanism behind it.

Work through these steps IN ORDER, and do the real thinking at each one — do not skip to the artefact:

STEP 1 — Diagnose. Identify every genuinely distinct problem (usually 1, occasionally 2-3; do not manufacture problems that aren't there, and do not split one problem into several). For each:
(a) First classify which BUSINESS FUNCTION actually owns this problem — exactly one of: ${BUSINESS_FUNCTIONS.join(', ')}. This is the CFO's first question, before anything else: whose budget and whose workflow is this.
(b) Then find the ROOT CAUSE, not the symptom — e.g. "checkout abandons at 60%" is a symptom; the root cause might be surprise shipping costs, a broken mobile flow, or lack of trust signals at payment.
(c) State who inside that function actually feels this pain, and what it's costing them today.
(d) Rate your own confidence in this root cause — confidence_level, one of: strongly_supported (the problem statement directly states or clearly implies this cause), reasonably_supported (a reasonable inference, some gap), preliminary_hypothesis (plausible but thin evidence), insufficient_evidence (you're largely guessing). Never inflate this to sound more certain than the evidence justifies — a root cause is a hypothesis until evidence says otherwise, not a proven fact. State supporting_evidence (what in the problem statement actually supports this) and evidence_gaps (what's missing or assumed that, if wrong, would change the diagnosis).
Keep every field here SHORT — this becomes a scannable bulleted brief a busy founder reads in 30 seconds, not a report: problem_statement ≤ 20 words, business_function is just the function name, root_cause ≤ 20 words (one sentence, no compound clauses), who_is_affected ≤ 8 words, current_cost_of_inaction one tight sentence with the actual number in it, supporting_evidence and evidence_gaps ≤ 25 words each.

If the problem statement is thin enough that a STRUCTURAL fact has to be assumed to proceed at all (e.g. B2B vs B2C, outbound vs inbound, which sales/business motion, who the end customer even is), do not silently commit to one specific model and present it as fact — that's the single riskiest kind of assumption, because it shapes every downstream step. Pick the single most plausible default, but that default becomes the FIRST entry in the Step 7 clarifying-questions list, phrased as a direct confirm-or-correct question (e.g. "Is this B2B outbound sales, or a different motion — retail, referral, marketplace?"). This kind of gap should also pull confidence_level down to preliminary_hypothesis or insufficient_evidence — do not mark something strongly_supported while simultaneously flagging that you had to guess the business model.

STEP 2 — Select the framework. For EACH problem, before designing anything, name the ONE established methodology whose lens you'll diagnose the P&L impact and design the mechanism through — the same way a senior consultant opens an engagement with "we're applying Framework X here." This is what makes the output feel like real expertise, not a generic AI guess, and it is the single most important step for credibility.

${
  preferredFramework
    ? `The client has explicitly asked for a specific framework/approach: "${preferredFramework}". Honor this — use it as the framework for every problem unless it plainly cannot apply to a given problem (explain briefly if so and fall back to the library below only for that problem).`
    : ''
}
Preferred framework library (curated, reviewed by the team running this — draw from here first):
${libraryText}

Rules for this step:
- Name the framework EXACTLY as it appears in the library above — verbatim, no paraphrasing — so it can be looked up. Set in_library: true.
- Also name up to 3-7 OTHER frameworks from the library (exact names) that were GENUINELY plausible alternatives for THIS specific root cause, in runner_up_names — this is what proves the choice was deliberate, not decorative. Quality over count: a framework only belongs in this list if a real consultant would have actually weighed it for this problem, regardless of what function it's tagged under. Do not reach into unrelated functions or unrelated root-cause types just to pad the count — 1-2 honest runner-ups (or even zero) is far better than 7 that include something like a budgeting framework for a compliance-tracking problem. When in doubt, leave it out.
- If nothing in the library fits the root cause well, you MAY name a different framework — but ONLY if it is real, globally documented, and has a genuine track record at scale (originated or popularized by a recognized authority: McKinsey, BCG, Bain, Korn Ferry, Gartner, Deloitte, a named academic/practitioner, a standards body, etc.). Set in_library: false and fill suggested_source with the citation. Never invent a framework name, never misattribute a real framework to the wrong originator.
- If truly no established framework applies, say so plainly (framework_name: "No established framework directly applies", explain why in why_selected) rather than force-fitting one for the sake of citing something.
- why_selected must explain both why this fits THIS root cause specifically, and briefly what makes it a proven, world-class choice (scale of adoption, who relies on it) — this is the credibility moment, make it substantive, not decorative.

STEP 3 — Map to the P&L. This is a drill-down, not a jump: business function (from Step 1a) → the SPECIFIC P&L line item that function's activity actually moves (e.g. Growth owning a problem usually moves a revenue line or CAC within sales & marketing spend; Efficiency/Operations usually moves a COGS or opex line; Legal/Compliance usually moves risk-provision or overhead cost; HR usually moves labor cost or attrition-driven cost; Tech usually moves either a cost line (infra/eng time) or unblocks a revenue line) → THEN classify against exactly one of these fixed levers:
   Revenue levers: ${PNL_LEVERS.revenue.join(', ')}
   Cost levers: ${PNL_LEVERS.cost.join(', ')}
Name the specific P&L line item explicitly inside the reasoning (not just the lever category) — e.g. not just "labor cost" but "support team headcount cost." Give a plausible, industry-grounded before/after estimate for that line if the mechanism in Step 4 were live, informed by the framework selected in Step 2. Write the reasoning in plain operator language — never "leverage," "unlock," "synergy," or similar. One tight sentence carrying the assumption and the number, ≤ 30 words — not a paragraph. Tag value_status: "known" only if the client's own text gave you this number; "assumed" if you're using an industry-grounded placeholder; "needs_confirmation" if you're not confident even the assumption is a reasonable placeholder for this specific business. Do not mark a number "known" unless the client actually stated it.

STEP 4 — Design the mechanism. For each problem, design the SPECIFIC mechanism that would actually fix the root cause from Step 1, SHAPED by the framework selected in Step 2 — not "an AI agent that helps with X," but the actual workflow: what triggers it, what data or signal it acts on, and what happens step by step. Break "what happens step by step" into 3-6 short, discrete steps (how_it_works_steps) — each one a single concrete action, ≤ 15 words, written so it could be a bullet on a slide, not folded into one paragraph. Also state, in one sentence, why this mechanism and not a generic dashboard or chatbot. Ground it in what's realistically buildable with current AI/automation tooling — nothing that requires a research breakthrough.

STEP 5 — Validate the solution so far. A valid schema is NOT evidence the solution is correct — this step is where you check your own work before it goes any further, the same way a second reviewer would. For each problem, produce validation entries covering AT LEAST:
- root_cause_evidence: does Step 1's confidence_level genuinely match the evidence quality, or did you overstate it? status "block" if a root cause with insufficient_evidence is being treated downstream as if it were solid; "warning" if there's a real but non-fatal gap; "pass" if the confidence level is honest and the mechanism doesn't overreach beyond what's supported.
- pnl_causal_chain: does the mechanism in Step 4 actually plausibly move the P&L line named in Step 3, or is the causal link hand-wavy? status "block" if the mechanism doesn't clearly connect to the claimed line item; "warning" if the connection is plausible but stretched; "pass" if the causal chain is direct and clear.
- framework_fit: does the framework selected in Step 2 genuinely fit this root cause, or was it force-fit? status "block" only for a genuine mismatch; otherwise "pass" or "warning."
- economic_plausibility: are the before/after numbers in Step 3 within a believable range for a business of this apparent size, or do they strain credulity? status "warning" or "block" if a number looks inflated to make the pitch sound better rather than because it's actually plausible.
For each: explanation (one sentence, specific — not "looks fine") and recommended_action (what a human reviewer should do about it, or "none" if status is pass). Be genuinely willing to flag "warning" or "block" — a validation step that always says "pass" is not doing its job. If everything genuinely checks out, say so plainly rather than inventing a problem.

STEP 6 — Plan the artefact. Before writing code, plan how someone experiences this in under two minutes: the narrative arc, and — if there's more than one problem — how the sections tie together into one coherent product rather than reading as several unrelated demos glued together. Every step from Step 4's how_it_works_steps should map to something the visitor can actually trigger or watch happen in the artefact — see the interactivity rule below.

STEP 7 — Flag what's genuinely unknown. Order matters here:
1. If Step 1 had to assume a structural fact (business/sales motion, customer type, etc.), that confirm-or-correct question goes FIRST.
2. Next, for EACH problem, ask directly for the actual number on the specific P&L line item you named in Step 3 — not a vague "tell us more," a precise ask naming that line (e.g. "What is your current actual monthly support-team labor cost?" or "What is your actual average order value today?"). This is what turns an assumed estimate into an exact one, and it should almost always be present — skip it only if the client's problem statement already gave you that exact figure.
3. Then any other specific real numbers that would sharpen the estimates (e.g. "current monthly lead volume," "your real cart-abandonment rate"). Only list things you couldn't reasonably assume — not everything.

STEP 8 — Build the artefact. One working, self-contained interactive HTML demo covering every mechanism from Step 4, following the plan from Step 6.

CRITICAL RULE — no bare zeros or blanks: every number shown anywhere in the artefact (a metric, a before/after, a table value) must be either a real stated assumption grounded in an industry benchmark or the numbers implied by the problem statement, OR — if you genuinely have no reasonable basis for it — that specific figure belongs in the Step 7 clarifying-questions list instead of being shown as "0," "—," or blank in the demo. Never let the artefact display an empty or zero metric as if it were a real result; a demo with a hollow number is worse than one that asks a sharp question.

CRITICAL RULE — interactivity depth: do not collapse a multi-step mechanism into "click one button, see one final result." The artefact must let the visitor move THROUGH the mechanism's steps from Step 4 — e.g. a sequence they advance through (step 1 fires, they see its output, they trigger step 2 using that output, etc.), or a live simulation with multiple distinct triggerable moments, or several interdependent controls that visibly affect each other. Think "a working walkthrough of the actual workflow," not "a static screen with one CTA." Every section from artefact_plan should have at least one genuine interaction, not just the headline section.

CRITICAL RULE — the artefact must visibly run on the selected framework: label sections, stages, or metrics using that framework's OWN vocabulary and structure wherever it has one — e.g. Korn Ferry's actual competency categories, DMAIC's Define/Measure/Analyze/Improve/Control phases, AARRR's actual funnel stage names, a Nine-Box's actual grid — not generic labels like "Step 1, Step 2" or "Phase A." If the client can tell which named framework produced this by reading the artefact itself, you've done this right. If the selected framework has no natural structural vocabulary to borrow, at minimum name-check it visibly in the artefact (e.g. a small "Built on [Framework]" mark) rather than leaving no trace of Step 2's work in the thing the client actually interacts with.

CRITICAL RULE — visual craft: this must look like a real, designed product, not a functional wireframe. Establish a clear typographic scale (one size/weight for the main metric, another for labels, another for body — do not let everything be the same size), consistent spacing rhythm (pick a base unit like 8px and stick to multiples of it), a restrained but confident color system (the brand/accent color used deliberately for the 2-3 things that most deserve attention, not sprayed everywhere), clear visual hierarchy so the eye knows where to go first, and small polish details — hover states, subtle transitions on state changes, rounded corners used consistently, badges/pills/icons (inline SVG only) where they earn their place. Avoid dense walls of text inside the artefact itself; prefer short labels, numbers, and a few words of context, saving longer explanation for outside the artefact.

Rules for the artefact itself:
- It is a demo, not a mockup — real interactive elements (buttons, inputs, tabs, toggles) that respond to clicks, backed by representative/assumed sample data consistent with the assumptions you stated in Step 3. It does NOT need real client data or a real backend.
- Single self-contained HTML fragment: inline <style> and <script> only, no external requests, no external libraries, no images (use inline SVG only if needed).
- It must visibly tie back to the specific P&L lever(s) and show the before/after number from Step 3.
- Keep it focused and legible — someone should grasp the whole thing in under two minutes, even though it now has real depth to explore.

Branding — this matters, and the boundary here is not optional:
- You may be given an HTML excerpt from the client's own website (reference_site_html). Its ONLY job is visual: brand colors, typography, and the company display name — nothing else. Use it to skin the artefact so it feels like it belongs to THEIR product. Do not use gold-on-near-black branding here; that identity belongs to the sales page, not to a client's demo.
- CRITICAL: reference_site_html must NEVER influence Steps 1-7. Do not borrow business terminology, job titles, personas, industry framing, or subject matter from the website's text content — the diagnosis, root cause, framework choice, mechanism, and every number are grounded ONLY in the problem the client actually typed and the tools they listed. A client can legitimately submit an unrelated or even a giant enterprise's URL (a personal project, a placeholder, a company they merely work at) — if the website's business doesn't match what the client actually described, ignore the website's business entirely and solve the problem as stated. When in doubt, the literal problem text always wins over anything inferred from the site.
- If no reference_site_html is given, or it doesn't yield usable brand signals, fall back to a simple, neutral, professional theme: light neutral background, dark neutral text, one restrained accent color, plain sans-serif system font, and a placeholder mark at the top reading "[ Client logo ]" — clearly a placeholder, not a fake brand.`;
}

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
            business_function: {
              type: 'string',
              enum: BUSINESS_FUNCTIONS as unknown as string[],
              description: 'Exactly one of the fixed business functions — which function owns this problem.',
            },
            root_cause: { type: 'string', description: 'One sentence, ≤ 20 words.' },
            who_is_affected: { type: 'string', description: '≤ 8 words.' },
            current_cost_of_inaction: { type: 'string', description: 'One sentence with the actual number in it.' },
            confidence_level: {
              type: 'string',
              enum: CONFIDENCE_LEVELS as unknown as string[],
              description: 'Honest categorical confidence in this root cause — never inflated.',
            },
            supporting_evidence: { type: 'string', description: '≤ 25 words — what in the problem statement actually supports this.' },
            evidence_gaps: { type: 'string', description: '≤ 25 words — what is missing or assumed.' },
          },
          required: [
            'problem_statement',
            'business_function',
            'root_cause',
            'who_is_affected',
            'current_cost_of_inaction',
            'confidence_level',
            'supporting_evidence',
            'evidence_gaps',
          ],
        },
      },
      framework_selections: {
        type: 'array',
        description:
          'Step 2 output — one entry per problem, in the same order as problem_breakdown. Name frameworks EXACTLY as given in the library — do not paraphrase names, they are looked up verbatim.',
        items: {
          type: 'object',
          properties: {
            problem_index: { type: 'integer', description: '0-based index into problem_breakdown.' },
            framework_name: { type: 'string', description: 'Exact name from the library, or a new real framework name if in_library is false.' },
            why_selected: {
              type: 'string',
              description: 'One to two sentences: why this framework fits THIS root cause, and what makes it a proven, world-class choice rather than an arbitrary one.',
            },
            in_library: { type: 'boolean', description: 'true if the name matches the provided library exactly, false if suggesting something real but not yet in it.' },
            suggested_source: {
              type: 'string',
              description: 'ONLY set when in_library is false — who originated/popularized this suggested framework.',
            },
            runner_up_names: {
              type: 'array',
              description: '3-7 OTHER framework names from the provided library that were genuinely considered for this problem — exact names, for lookup. Empty if the library has too few relevant entries.',
              items: { type: 'string' },
            },
          },
          required: ['problem_index', 'framework_name', 'why_selected', 'in_library', 'runner_up_names'],
        },
      },
      levers: {
        type: 'array',
        description: 'Step 3 output — one entry per problem, in the same order as problem_breakdown.',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: ['revenue', 'cost'] },
            lever: { type: 'string', description: 'One of the fixed lever names, verbatim.' },
            reasoning: {
              type: 'string',
              description: 'One tight sentence with the stated assumption and the before/after estimate, ≤ 30 words.',
            },
            value_status: {
              type: 'string',
              enum: EPISTEMIC_STATUSES as unknown as string[],
              description: '"known" only if the client stated this number themselves; "assumed" for an industry-grounded placeholder; "needs_confirmation" if even the assumption is shaky.',
            },
          },
          required: ['category', 'lever', 'reasoning', 'value_status'],
        },
      },
      solution_mechanisms: {
        type: 'array',
        description: 'Step 4 output — one entry per problem.',
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
      validations: {
        type: 'array',
        description:
          'Step 5 output — self-review of the work so far, at least one entry per validation_type per problem. Be genuinely willing to report "warning" or "block" — do not rubber-stamp everything as "pass."',
        items: {
          type: 'object',
          properties: {
            problem_index: { type: 'integer' },
            validation_type: {
              type: 'string',
              enum: ['root_cause_evidence', 'framework_fit', 'pnl_causal_chain', 'economic_plausibility'],
            },
            status: { type: 'string', enum: VALIDATION_STATUSES as unknown as string[] },
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            explanation: { type: 'string', description: 'One specific sentence — not "looks fine."' },
            recommended_action: { type: 'string', description: 'What a human reviewer should do, or "none" if status is pass.' },
          },
          required: ['problem_index', 'validation_type', 'status', 'severity', 'explanation', 'recommended_action'],
        },
      },
      artefact_plan: {
        type: 'object',
        description: 'Step 6 output.',
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
          'Step 7 output — specific real numbers/facts that would sharpen the estimates if the client provided them. Empty array if genuinely nothing material is missing.',
        items: { type: 'string' },
      },
      artefact_html: {
        type: 'string',
        description:
          'Step 8 output — self-contained HTML fragment implementing artefact_plan. No bare zeros. Must let the visitor move through the mechanism\'s steps, not just click once for a final result. Real visual craft — typographic scale, spacing rhythm, restrained color, hover/transition polish.',
      },
    },
    required: [
      'problem_breakdown',
      'framework_selections',
      'levers',
      'solution_mechanisms',
      'validations',
      'artefact_plan',
      'clarifying_questions',
      'artefact_html',
    ],
  },
} as const;

type ToolOutput = {
  problem_breakdown: ProblemBreakdown[];
  framework_selections: RawFrameworkSelection[];
  levers: PnlLeverHit[];
  solution_mechanisms: SolutionMechanism[];
  validations: SolutionValidation[];
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
    frameworkSelections: out.framework_selections,
    levers: out.levers,
    solutionMechanisms: out.solution_mechanisms,
    validations: out.validations,
    artefactPlan: out.artefact_plan,
    clarifyingQuestions: out.clarifying_questions,
    artefactHtml: out.artefact_html,
  };
}

export async function classifyAndBuild(
  input: ClassifyAndBuildInput,
  apiKey: string
): Promise<ClassifyAndBuildResult> {
  const methodology = buildMethodology(input.frameworkLibrary, input.preferredFramework);
  const system = `${methodology}\n\nReturn your answer using the classify_and_build tool, with every step's output filled in — do not include any text outside the tool call.`;

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
  previousFrameworkSelections: FrameworkSelection[];
  previousLevers: PnlLeverHit[];
  previousSolutionMechanisms: SolutionMechanism[];
  previousArtefactHtml: string;
  feedbackText: string;
};

export async function reviseArtefact(
  input: ReviseArtefactInput,
  apiKey: string
): Promise<ClassifyAndBuildResult> {
  const methodology = buildMethodology(input.frameworkLibrary, input.preferredFramework);
  const system = `${methodology}

You are REVISING a demo you already built, based on the client's actual reply. This is the one and only revision round — make it count, and do not ask further clarifying questions unless the client's feedback itself raises a genuinely new unknown.

Re-run the same eight steps, but:
- Keep everything from the previous version that the feedback doesn't touch — do not regenerate from scratch or change things that were already working and weren't criticized. This includes the framework selected in Step 2, unless the feedback itself reveals it was the wrong lens.
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
    `Previous framework selections: ${JSON.stringify(input.previousFrameworkSelections)}`,
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
// Turns the model's raw framework picks (names only) into fully-resolved
// selections, pulling source/description/link from OUR curated library —
// never from the model's own claims. A name that doesn't match the library
// (in_library: false) keeps only what the model said, with no link, and is
// flagged for admin review rather than trusted.
export function resolveFrameworkSelections(
  raw: RawFrameworkSelection[],
  library: FrameworkLibraryEntry[]
): FrameworkSelection[] {
  const byName = new Map(library.map((f) => [f.name.toLowerCase().trim(), f]));

  return raw.map((r) => {
    const matched = byName.get(r.framework_name.toLowerCase().trim());
    const runnerUps: ResolvedFrameworkRef[] = r.runner_up_names
      .map((name) => byName.get(name.toLowerCase().trim()))
      .filter((f): f is FrameworkLibraryEntry => !!f)
      .map((f) => ({ name: f.name, source: f.source, when_to_use: f.when_to_use, link: f.link ?? null }));

    return {
      problem_index: r.problem_index,
      framework_name: matched?.name ?? r.framework_name,
      framework_source: matched?.source ?? r.suggested_source ?? 'Unverified — model-suggested',
      framework_link: matched?.link ?? null,
      why_selected: r.why_selected,
      in_library: !!matched,
      runner_ups: runnerUps,
    };
  });
}

export type SuggestedFrameworkDetails = {
  source: string;
  business_function: string;
  when_to_use: string;
  link: string | null;
  confidence: 'high' | 'medium' | 'low';
  note: string; // e.g. "link unverified — confirm before publishing" when confidence isn't high
};

// Admin utility: given just a framework name (and an optional hint), draft
// the library fields for review — NEVER auto-saved, the admin sees and can
// edit every field before it's added. This is the one place in the product
// where an unverified model claim about a framework is allowed to surface
// at all, precisely because a human reviews it before it becomes part of
// the trusted library everything else resolves facts from.
export async function suggestFrameworkDetails(
  name: string,
  hint: string | null,
  apiKey: string
): Promise<SuggestedFrameworkDetails> {
  const system = `You help maintain a curated library of real, globally documented, proven-at-scale business/consulting frameworks. Given a framework name, draft its library entry.

Rules:
- Only proceed if this is a REAL, documented framework/methodology you're genuinely aware of — actually used in business, consulting, engineering, or a standards body. If you don't recognize it as real, or you're not confident it's a genuine established framework (not something you're constructing to sound plausible), say so plainly: set confidence to "low" and explain in note why you're unsure, rather than inventing plausible-sounding details.
- source: who originated or popularized it (a real person, firm, or standards body).
- business_function: exactly one of ${BUSINESS_FUNCTIONS.join(', ')} — whichever one this framework is most naturally applied within.
- when_to_use: one or two sentences — what kind of root cause or problem pattern this framework fits.
- link: a study link ONLY if you are confident it's a real, correct URL (e.g. a well-known Wikipedia article title you're sure exists) — otherwise null. A wrong link is worse than no link.
- confidence: "high" if you're confident in all fields including the link, "medium" if fields are right but the link is uncertain/omitted, "low" if you're not sure this is a real framework at all.
- note: one short sentence flagging anything the admin should double-check, or empty string if nothing to flag.`;

  const userMessage = `Framework name: ${name}${hint ? `\nAdditional context from admin: ${hint}` : ''}`;

  const tool = {
    name: 'suggest_framework',
    description: 'Draft a framework library entry for admin review.',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string' },
        business_function: { type: 'string', enum: BUSINESS_FUNCTIONS as unknown as string[] },
        when_to_use: { type: 'string' },
        link: { type: 'string', description: 'A real URL, or omit/empty if not confident.' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        note: { type: 'string' },
      },
      required: ['source', 'business_function', 'when_to_use', 'confidence', 'note'],
    },
  } as const;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userMessage }],
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as { content: Array<{ type: string; input?: Record<string, unknown> }> };
  const toolUse = data.content.find((b) => b.type === 'tool_use');
  if (!toolUse?.input) throw new Error('Anthropic response did not include a tool_use block');

  const out = toolUse.input as {
    source: string;
    business_function: string;
    when_to_use: string;
    link?: string;
    confidence: 'high' | 'medium' | 'low';
    note: string;
  };

  return {
    source: out.source,
    business_function: out.business_function,
    when_to_use: out.when_to_use,
    link: out.link?.trim() || null,
    confidence: out.confidence,
    note: out.note,
  };
}

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
