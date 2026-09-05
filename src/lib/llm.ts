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
import { RESOURCE_CATEGORIES, type AmcSolutionProfile, type AmcResourceEstimate } from './amc';
import { IMPLEMENTATION_ROLES, type ImplementationEstimate } from './implementation';
import type { PastFrameworkUsage } from './industry';

export type FrameworkLibraryEntry = {
  name: string;
  source: string;
  business_function: string;
  when_to_use: string;
  link?: string | null;
};

export type AgentLibraryEntry = {
  name: string;
  capability_category: string;
  description: string;
  typical_trigger: string;
  typical_output: string;
};

export type ClassifyAndBuildInput = {
  problem: string; // may describe more than one distinct problem
  company: string | null;
  industry: string | null; // captured at intake — feeds framework selection and the industry_relevance fit dimension
  tools: string | null;
  websiteSnippet: string | null; // best-effort HTML excerpt from the client's site, for brand cues
  frameworkLibrary: FrameworkLibraryEntry[]; // admin-curated — preferred set the model should draw from
  agentLibrary: AgentLibraryEntry[]; // admin-curated, fixed vocabulary of reusable agent roles — same anti-hallucination pattern as frameworkLibrary
  preferredFramework: string | null; // client named a specific framework/approach themselves — overrides library selection
  pastFrameworkUsage: PastFrameworkUsage[]; // internal: how frameworks have actually been applied before for this industry within FTDS — a frequency signal, not a success rate (see src/lib/industry.ts)
};

export type ProblemBreakdown = {
  problem_statement: string;
  business_function: string;
  root_cause: string;
  plain_summary: string; // one everyday sentence: what's wrong and why, no jargon — the customer-facing headline for this problem
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

// Step 9 — validates the ACTUAL generated HTML/JS artefact, not the
// reasoning that led to it (that's SolutionValidation/Step 5). Admin-only,
// same as Step 5's validations — this is a QA signal, not customer copy.
export const ARTEFACT_VALIDATION_TYPES = [
  'has_run_control',
  'before_after_integrity',
  'uses_real_tools',
  'framework_vocabulary_present',
  'no_bare_zeros',
] as const;
export type ArtefactValidationType = (typeof ARTEFACT_VALIDATION_TYPES)[number];

export type ArtefactValidation = {
  validation_type: ArtefactValidationType;
  status: ValidationStatus;
  severity: 'low' | 'medium' | 'high';
  explanation: string;
  recommended_action: string;
};

// The model only ever names frameworks (by exact library name) — every
// factual detail (source, description, link) is resolved from OUR curated
// data afterward (see resolveFrameworkSelections), never trusted from the
// model's own citation text. This is what makes the links safe to show.
// Shown to the customer (see /devshop/demo/[id].astro's comparison table)
// as well as admin — lets the system substantiate "why framework A over
// framework B" with more than a prose sentence, and surfaces genuine
// mismatches (negative evidence) rather than only ever justifying the pick
// that was already made. Precisely because it's now customer-facing, this
// must be an honest audit and never a rubber stamp for the pick already made.
export const FIT_DIMENSIONS = [
  'problem_pattern_fit',
  'root_cause_fit',
  'business_function_fit',
  'evidence_sufficiency',
  'intervention_compatibility',
  'pnl_relevance',
  'framework_specificity',
  'contraindication_risk', // 5 = no contraindication, 0 = actively risky/mismatched — same "higher is better" direction as every other dimension
  'industry_relevance', // 5 = strong track record (internal FTDS history and/or documented external adoption) for THIS industry specifically, 0 = no evidence it transfers to this industry at all
] as const;
export type FitDimension = (typeof FIT_DIMENSIONS)[number];

export type FrameworkFitScore = {
  dimension: FitDimension;
  score: number; // 0-5, 5 = excellent fit on this dimension
};

export type FrameworkFitCandidate = {
  framework_name: string;
  is_selected: boolean;
  dimension_scores: FrameworkFitScore[];
  total_score: number; // sum of dimension_scores, 0-45
  positive_evidence: string; // concrete reasons this framework fits
  negative_evidence: string; // concrete reasons it doesn't, or "none material" — a candidate with no negative_evidence at all is suspect
};

export type RawFrameworkSelection = {
  problem_index: number;
  framework_name: string;
  why_selected: string; // ties the choice to this specific root cause, incl. what makes it a proven/world-class fit
  plain_explanation: string; // one everyday sentence: what this approach actually does for the customer, no jargon
  in_library: boolean; // false = model is suggesting something real but not yet in the curated set
  suggested_source?: string; // only used when in_library is false — the model's own citation, unverified
  runner_up_names: string[]; // 3-7 other library framework names genuinely considered for this problem
  fit_candidates: FrameworkFitCandidate[]; // scored: the selected framework + each runner-up
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
  plain_explanation: string;
  in_library: boolean;
  runner_ups: ResolvedFrameworkRef[];
  fitCandidates: FrameworkFitCandidate[];
};

// One entry per how_it_works_steps index — which curated agent powers that
// step. Same anti-hallucination pattern as framework citation: the model
// only ever names an agent, resolved from curated data afterward.
export type RawAgentStep = {
  step_index: number; // matches the index into how_it_works_steps
  agent_name: string;
  in_library: boolean;
  suggested_description?: string; // only when in_library is false — model's own claim, unverified
};

export type ResolvedAgentStep = {
  step_index: number;
  agent_name: string;
  capability_category: string | null;
  description: string | null;
  in_library: boolean;
};

export type SolutionMechanism = {
  problem_index: number;
  mechanism_name: string;
  how_it_works_steps: string[];
  agent_sequence: RawAgentStep[]; // resolve with resolveAgentSequence() before persisting — one entry per how_it_works_steps index
  plain_explanation: string; // one or two everyday sentences: what the tool actually does for the customer, no jargon
  trigger_or_data_source: string;
  why_not_generic: string;
};

export type ArtefactPlan = {
  narrative_arc: string;
  sections: { name: string; ties_to_problem_index: number; purpose: string }[];
};

// Step 7 output, structured (brief §11) — each question carries enough for
// the reader (admin or customer) to judge whether it's worth answering,
// rather than a bare string with no context.
export const EXPECTED_ANSWER_TYPES = ['number', 'yes_no', 'text', 'choice'] as const;
export type ExpectedAnswerType = (typeof EXPECTED_ANSWER_TYPES)[number];

export type ClarifyingQuestion = {
  question: string;
  why_it_matters: string; // one short phrase — what changes if answered differently
  affected_step: string; // e.g. "Step 1 diagnosis", "Step 3 P&L mapping"
  blocking: boolean; // true = materially changes the diagnosis/mechanism if unanswered, not just sharpens a number
  expected_answer_type: ExpectedAnswerType;
};

export type ClassifyAndBuildResult = {
  problemBreakdown: ProblemBreakdown[];
  frameworkSelections: RawFrameworkSelection[]; // resolve with resolveFrameworkSelections() before persisting
  solutionMechanisms: SolutionMechanism[];
  artefactPlan: ArtefactPlan;
  levers: PnlLeverHit[];
  validations: SolutionValidation[];
  artefactValidations: ArtefactValidation[];
  clarifyingQuestions: ClarifyingQuestion[];
  artefactHtml: string;
  generationMeta: GenerationMeta;
};

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Model id per current Claude lineup — update here if the account's default changes.
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 16000;
// Bump this string whenever buildMethodology's prompt or CLASSIFY_TOOL's
// schema changes meaningfully — it's stamped on every generation row so a
// bad output can be traced back to the exact prompt version that produced
// it (brief §23-24). Plain "YYYY-MM-DD.N" is enough; no need for real semver.
const PROMPT_VERSION = '2026-09-05.1';
// Just under astro.config.mjs's maxDuration (300s) so a hung request fails
// with a clear timeout status instead of the platform silently killing the
// function with no diagnostic.
const CLAUDE_TIMEOUT_MS = 280_000;

export type GenerationMeta = {
  generationId: string;
  model: string;
  promptVersion: string;
  status: 'success' | 'error' | 'timeout';
  attempts: number;
  durationMs: number;
  errorMessage: string | null;
};

// The methodology below is the actual product. A bad prompt here produces a
// generic "AI wrapper" demo that looks like every other AI-slop pitch; a
// good one produces something a CFO or ops lead would recognize as their
// own problem, solved by a mechanism they can picture actually running.
// The schema forces the model to do that work in writing, in order, before
// it's allowed to touch code — root cause, then lever, then mechanism, then
// demo — the same sequence a good consulting + engineering team would use,
// compressed into one pass.
function buildMethodology(
  frameworkLibrary: FrameworkLibraryEntry[],
  agentLibrary: AgentLibraryEntry[],
  preferredFramework: string | null,
  industry: string | null,
  pastFrameworkUsage: PastFrameworkUsage[]
): string {
  const libraryText =
    frameworkLibrary.length > 0
      ? frameworkLibrary
          .map((f) => `- ${f.name} (${f.source}) — ${f.business_function} — use when: ${f.when_to_use}`)
          .join('\n')
      : '(library is currently empty)';

  const agentLibraryText =
    agentLibrary.length > 0
      ? agentLibrary
          .map((a) => `- ${a.name} [${a.capability_category}] — ${a.description} Triggers on: ${a.typical_trigger} Outputs: ${a.typical_output}`)
          .join('\n')
      : '(agent library is currently empty)';

  const pastUsageText =
    industry && pastFrameworkUsage.length > 0
      ? pastFrameworkUsage
          .map((u) => `- ${u.framework_name}: applied ${u.times_applied}x before for this industry within FTDS, ${u.times_progressed}x reached a paid build (not a proven success rate — just a frequency/progression signal)`)
          .join('\n')
      : null;

  return `You are a senior cross-functional solutioning team compressed into one voice: a strategy partner who diagnoses root causes instead of symptoms, a CFO who thinks natively in unit economics and P&L movement, a growth/performance marketer, a Head of Ops who has actually run a P&L (not just advised on one), a senior product engineer building on the current state of AI agents and automation, and a product designer with real taste — you know precisely what's buildable today versus what's still vaporware, and you never propose something vague, hand-wavy, or "AI-magic" without a concrete mechanism behind it.

Work through these steps IN ORDER, and do the real thinking at each one — do not skip to the artefact:

PLAIN-LANGUAGE RULE — applies to every plain_summary/plain_explanation field below: write it the way you'd explain this out loud to a smart small-business owner who has never read a consulting deck — everyday words, no jargon (no "leverage," "synergy," "funnel," "unlock," framework-internal terminology, or finance terms like "COGS"/"opex" unless you also say what that means in the same breath), one or two short sentences, active voice. It must be a PLAIN RESTATEMENT of what you already established in the corresponding technical field (root_cause, why_selected, how_it_works_steps, reasoning) — never a new claim, a new number, or added flavor text that isn't already grounded there. If you can't restate it plainly without adding something new, the technical version was probably too vague to begin with — fix that instead of padding the plain version.

STEP 1 — Diagnose. Identify every genuinely distinct problem (usually 1, occasionally 2-3; do not manufacture problems that aren't there, and do not split one problem into several). For each:
(a) First classify which BUSINESS FUNCTION actually owns this problem — exactly one of: ${BUSINESS_FUNCTIONS.join(', ')}. This is the CFO's first question, before anything else: whose budget and whose workflow is this.
(b) Then find the ROOT CAUSE, not the symptom — e.g. "checkout abandons at 60%" is a symptom; the root cause might be surprise shipping costs, a broken mobile flow, or lack of trust signals at payment.
(c) State who inside that function actually feels this pain, and what it's costing them today.
(d) Rate your own confidence in this root cause — confidence_level, one of: strongly_supported (the problem statement directly states or clearly implies this cause), reasonably_supported (a reasonable inference, some gap), preliminary_hypothesis (plausible but thin evidence), insufficient_evidence (you're largely guessing). Never inflate this to sound more certain than the evidence justifies — a root cause is a hypothesis until evidence says otherwise, not a proven fact. State supporting_evidence (what in the problem statement actually supports this) and evidence_gaps (what's missing or assumed that, if wrong, would change the diagnosis).
(e) Write plain_summary — per the PLAIN-LANGUAGE RULE above, one everyday sentence covering what's actually wrong and, in the same breath, roughly what it's costing (in the customer's own terms, not a finance term). This is the sentence a non-technical founder reads first; root_cause stays as the precise technical version underneath it, for the appendix.
Keep every field here SHORT — this becomes a scannable bulleted brief a busy founder reads in 30 seconds, not a report: problem_statement ≤ 20 words, business_function is just the function name, root_cause ≤ 20 words (one sentence, no compound clauses), plain_summary ≤ 25 words, who_is_affected ≤ 8 words, current_cost_of_inaction one tight sentence with the actual number in it, supporting_evidence and evidence_gaps ≤ 25 words each.

If the problem statement is thin enough that a STRUCTURAL fact has to be assumed to proceed at all (e.g. B2B vs B2C, outbound vs inbound, which sales/business motion, who the end customer even is), do not silently commit to one specific model and present it as fact — that's the single riskiest kind of assumption, because it shapes every downstream step. Pick the single most plausible default, but that default becomes the FIRST entry in the Step 7 clarifying-questions list, phrased as a direct confirm-or-correct question (e.g. "Is this B2B outbound sales, or a different motion — retail, referral, marketplace?"). This kind of gap should also pull confidence_level down to preliminary_hypothesis or insufficient_evidence — do not mark something strongly_supported while simultaneously flagging that you had to guess the business model.

STEP 2 — Select the framework. For EACH problem, before designing anything, name the ONE established methodology whose lens you'll diagnose the P&L impact and design the mechanism through — the same way a senior consultant opens an engagement with "we're applying Framework X here." This is what makes the output feel like real expertise, not a generic AI guess, and it is the single most important step for credibility.

${
  preferredFramework
    ? `The client has explicitly asked for a specific framework/approach: "${preferredFramework}". Honor this — use it as the framework for every problem unless it plainly cannot apply to a given problem (explain briefly if so and fall back to the library below only for that problem).`
    : ''
}
Preferred framework library (curated, reviewed by the team running this — draw from here first):
${libraryText}

${
  industry
    ? `Client's industry: ${industry}.${
        pastUsageText
          ? ` Internal FTDS history of frameworks applied to this industry before (a frequency/progression signal, NOT a proven success rate — do not overstate it):\n${pastUsageText}`
          : ' No internal FTDS history exists yet for this industry — score industry_relevance on external/documented track record alone, and say so plainly rather than implying internal data exists.'
      }`
    : 'No industry was provided — score industry_relevance based only on how industry-agnostic or industry-specific the framework itself typically is, and note the missing industry as a gap.'
}

Rules for this step:
- Name the framework EXACTLY as it appears in the library above — verbatim, no paraphrasing — so it can be looked up. Set in_library: true.
- Also name up to 3-7 OTHER frameworks from the library (exact names) that were GENUINELY plausible alternatives for THIS specific root cause, in runner_up_names — this is what proves the choice was deliberate, not decorative. Quality over count: a framework only belongs in this list if a real consultant would have actually weighed it for this problem, regardless of what function it's tagged under. Do not reach into unrelated functions or unrelated root-cause types just to pad the count — 1-2 honest runner-ups (or even zero) is far better than 7 that include something like a budgeting framework for a compliance-tracking problem. When in doubt, leave it out.
- If nothing in the library fits the root cause well, you MAY name a different framework — but ONLY if it is real, globally documented, and has a genuine track record at scale (originated or popularized by a recognized authority: McKinsey, BCG, Bain, Korn Ferry, Gartner, Deloitte, a named academic/practitioner, a standards body, etc.). Set in_library: false and fill suggested_source with the citation. Never invent a framework name, never misattribute a real framework to the wrong originator.
- If truly no established framework applies, say so plainly (framework_name: "No established framework directly applies", explain why in why_selected) rather than force-fitting one for the sake of citing something.
- why_selected must explain both why this fits THIS root cause specifically, and briefly what makes it a proven, world-class choice (scale of adoption, who relies on it) — this is the credibility moment, make it substantive, not decorative.
- plain_explanation: per the PLAIN-LANGUAGE RULE, one everyday sentence on what this approach actually does for the customer — you may still NAME the framework (that's part of the credibility, not jargon), but explain what it does, not what it's called or who invented it, e.g. "We're using a method built for exactly this kind of drop-off — it looks at each step a customer takes and fixes the one losing the most people," not a sentence about the framework's pedigree.
- Internally score EVERY candidate you named (the selected framework AND each runner-up) as a fit_candidates entry, across these 9 dimensions, each 0-5 where 5 is an excellent fit and 0 is a poor one: problem_pattern_fit (does the general shape of this problem match what the framework was designed for), root_cause_fit (does it address THIS specific root cause, not just the general topic), business_function_fit (does it fit the function from Step 1a), evidence_sufficiency (is there enough evidence in the diagnosis to apply this framework with confidence), intervention_compatibility (does the mechanism you're about to design in Step 4 actually fit how this framework is normally operationalized), pnl_relevance (does applying this framework plausibly move the P&L line you'll name in Step 3), framework_specificity (does the framework have real structural vocabulary/steps to apply here, vs. being generic enough to fit anything), contraindication_risk (5 = no reason this framework would mislead or mismatch here, 0 = there's a genuine reason it's the wrong lens), industry_relevance (5 = strong evidence this framework works for THIS industry specifically, 0 = no evidence it transfers here at all). Score industry_relevance from TWO combined signals and say which drove the score in the evidence text: (1) the internal FTDS history given above, if any, and (2) your own knowledge of where this framework is actually documented as successfully implemented at scale versus where it's rarely or never applied — e.g. AARRR is heavily proven in e-commerce/SaaS/consumer-app funnels but has little track record in heavy manufacturing; Lean/TPS is proven at massive scale in manufacturing/logistics but is a stretch for a pure knowledge-work service business. Do not inflate this score just because a framework is generally famous — famous and industry-relevant are different things. This is an honest internal audit, not a rubber stamp for whichever framework you already picked — a runner-up can legitimately score close to or above the selected framework on some dimensions; state that plainly in positive_evidence/negative_evidence rather than always making the winner look strictly best. For each candidate, give positive_evidence (concrete reasons it fits) and negative_evidence (concrete reasons it doesn't — write "none material" only if genuinely true, not as a default). This table is shown directly to the customer, so write positive_evidence and negative_evidence in the same plain, jargon-free language as the PLAIN-LANGUAGE RULE — concrete and specific, but readable without a business background.

STEP 3 — Map to the P&L. This is a drill-down, not a jump: business function (from Step 1a) → the SPECIFIC P&L line item that function's activity actually moves (e.g. Growth owning a problem usually moves a revenue line or CAC within sales & marketing spend; Efficiency/Operations usually moves a COGS or opex line; Legal/Compliance usually moves risk-provision or overhead cost; HR usually moves labor cost or attrition-driven cost; Tech usually moves either a cost line (infra/eng time) or unblocks a revenue line) → THEN classify against exactly one of these fixed levers:
   Revenue levers: ${PNL_LEVERS.revenue.join(', ')}
   Cost levers: ${PNL_LEVERS.cost.join(', ')}
Name the specific P&L line item explicitly — not just the lever category — in its own field, pnl_line_item (e.g. not just "labor cost" but "support team headcount cost"). Then fill baseline_value (that line's value TODAY, e.g. "60% checkout abandonment" or "24hr average first-contact time") and target_value (the projected value if the mechanism in Step 4 were live, e.g. "~55% abandonment" or "under 5min first-contact time") — these are the decomposed before/after, not folded into prose. Fill causal_mechanism with one short phrase naming HOW the Step 4 mechanism actually moves baseline to target (e.g. "automated recovery nudge triggers before the customer fully disengages") — this is what Step 5's pnl_causal_chain check will hold you to. Then write reasoning as before: one tight sentence carrying the assumption and the number, ≤ 30 words, in plain operator language — never "leverage," "unlock," "synergy," or similar — informed by the framework selected in Step 2. Tag value_status: "known" only if the client's own text gave you this number; "assumed" if you're using an industry-grounded placeholder; "needs_confirmation" if you're not confident even the assumption is a reasonable placeholder for this specific business. Do not mark a number "known" unless the client actually stated it. Then write plain_explanation, per the PLAIN-LANGUAGE RULE — the same number, in everyday terms a founder feels immediately, e.g. "That's roughly 40 more completed orders a month, without spending more on ads," not "a projected uplift in the conversion-rate lever."

Then build the "calculation" field — a simple 2-4 row hypothesis table making the arithmetic behind plain_explanation's headline number visible, not just asserted. Every row must use ONLY numbers already implied by "reasoning" above — this is the same math shown as a table, never a new figure invented for the table. Typical shape: one row per input (each figure tagged inline as "known" if the client stated it or "assumed" if it's an industry placeholder), then a final row with the resulting number. E.g. for "cutting first-contact time lifts close rate from 15% to 21% on 500 leads/month": row 1 "Inbound leads / month" → "~500 (assumed)"; row 2 "Close rate today" → "15% (assumed)"; row 3 "Close rate after the fix" → "21% (assumed)"; row 4 "Extra sales / month" → "≈30". Keep every label and value short — this is a simple math table a founder can check in their head, not a financial model.

STEP 4 — Design the mechanism. For each problem, design the SPECIFIC mechanism that would actually fix the root cause from Step 1, SHAPED by the framework selected in Step 2 — not "an AI agent that helps with X," but the actual workflow: what triggers it, what data or signal it acts on, and what happens step by step. Break "what happens step by step" into 3-6 short, discrete steps (how_it_works_steps) — each one a single concrete action, ≤ 15 words, written so it could be a bullet on a slide, not folded into one paragraph. Also state, in one sentence, why this mechanism and not a generic dashboard or chatbot. Ground it in what's realistically buildable with current AI/automation tooling — nothing that requires a research breakthrough. Then write plain_explanation, per the PLAIN-LANGUAGE RULE — one or two everyday sentences on what the tool actually does for the customer day to day, e.g. "When someone starts checking out and stalls, it waits a few minutes, then sends a short reminder with their exact cart — no manual follow-up needed," not a restatement of how_it_works_steps in engineering language.

Then build agent_sequence — for EACH entry in how_it_works_steps, name exactly ONE agent from the fixed agent library below that actually performs that step. This is what keeps the backend vocabulary consistent across every different client build instead of a fresh made-up "agent" name each time.

Curated agent library (draw from here first — name EXACTLY as it appears, verbatim):
${agentLibraryText}

Rules for this step:
- One agent_sequence entry per how_it_works_steps index, same order, same length — step_index must match.
- Name the agent EXACTLY as it appears in the library above. Set in_library: true.
- If truly nothing in the library fits a step's actual function, you MAY name a new agent role — but only a genuinely distinct functional role (not a rename of an existing one), and only if it's the kind of thing that would recur across other builds too, not a one-off. Set in_library: false and fill suggested_description with what it would do. This is flagged for admin review, the same way an out-of-library framework is — never silently treated as part of the standard catalog.
- It's completely normal for the same agent to appear more than once across different steps, or across different mechanisms — that repetition is the point; it's what "consistent vocabulary" means.

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
For each question, also fill in: why_it_matters (one short phrase — what changes if this is answered differently, e.g. "changes whether the mechanism needs a self-serve path"), affected_step (which step's output would change — e.g. "Step 1 diagnosis", "Step 3 P&L mapping"), blocking (true only for the structural-assumption question from point 1, or anything else that would materially change the diagnosis/mechanism itself, not just sharpen a number — most P&L-number questions are non-blocking, since you already gave a reasonable placeholder), and expected_answer_type (one of: number, yes_no, text, choice).

STEP 8 — Build the artefact. One working, self-contained interactive HTML demo covering every mechanism from Step 4, following the plan from Step 6.

CRITICAL RULE — no bare zeros or blanks: every number shown anywhere in the artefact (a metric, a before/after, a table value) must be either a real stated assumption grounded in an industry benchmark or the numbers implied by the problem statement, OR — if you genuinely have no reasonable basis for it — that specific figure belongs in the Step 7 clarifying-questions list instead of being shown as "0," "—," or blank in the demo. Never let the artefact display an empty or zero metric as if it were a real result; a demo with a hollow number is worse than one that asks a sharp question.

CRITICAL RULE — the before/after numbers in the artefact must be the SAME numbers as Step 3's calculation, not independently re-authored: copy the exact before value, after value, and resulting delta from the levers/calculation you already computed in Step 3 directly into the artefact's HTML/JS — never invent a second, different set of numbers when writing the demo, and never let BEFORE and AFTER render as the identical value (a demo where running the mechanism changes nothing is a bug, not a feature). If the artefact uses a live counter/animation that updates the AFTER value when the "Run" sequence completes, that update code must actually assign the real computed after-value at that point — test the logic in your head before finalizing: does the number on screen actually change once the animation finishes? If you can't make it change correctly, show the before/after as a static comparison instead of a broken live counter.

CRITICAL RULE — interactivity depth: do not collapse a multi-step mechanism into "click one button, see one final result," and do NOT make the visitor manually click "next" through each step either — that reads as a slideshow, not a working system. Instead, build a single "▶ Run the mechanism" (or similarly named) play control that, once pressed, AUTOPLAYS through Step 4's how_it_works_steps on its own timer (roughly 900ms-1.8s per step) with no further clicks needed, visually dramatizing what's actually happening at each one: show the specific tool/system from trigger_or_data_source "connecting" (e.g. a small node/badge for the actual tool named — HubSpot, Shopify, Zendesk, whatever the client's own tools were — lighting up or getting a checkmark), an "agent" or process indicator actively "thinking"/"working" (a pulsing dot, a short animated status line like "Checking order status…" → "Matched: Order #4471" → "Reply sent"), and the step's real output appearing as it completes — not a static diagram, an animated sequence that looks like something is genuinely executing. Let the visitor replay it (a "Run again" control after it finishes) rather than only manual step-by-step navigation. A manual click-through control is acceptable ONLY as a secondary/inspect affordance (e.g. pausing to look closer at one step) — the primary, default way to experience the mechanism must be pressing play and watching it run. Every section from artefact_plan should have at least one genuine interaction, not just the headline section.

CRITICAL RULE — agent status bar: the "agent" or process indicator required above must name the ACTUAL agent from Step 4's agent_sequence for whichever step is currently firing — not a generic "AI is thinking" line. Render it as a small, persistent status bar/strip (not just inline text buried in one card) that updates as the run progresses, e.g. "Agent: Data Extraction Agent — reading invoice fields…" then "Agent: Reconciliation/Matching Agent — checking against PO #4471…". Use the agent's exact curated name every time — this is what makes the vocabulary consistent for a reader who sees more than one FTDS build.

CRITICAL RULE — the artefact must visibly run on the selected framework: label sections, stages, or metrics using that framework's OWN vocabulary and structure wherever it has one — e.g. Korn Ferry's actual competency categories, DMAIC's Define/Measure/Analyze/Improve/Control phases, AARRR's actual funnel stage names, a Nine-Box's actual grid — not generic labels like "Step 1, Step 2" or "Phase A." If the client can tell which named framework produced this by reading the artefact itself, you've done this right. If the selected framework has no natural structural vocabulary to borrow, at minimum name-check it visibly in the artefact (e.g. a small "Built on [Framework]" mark) rather than leaving no trace of Step 2's work in the thing the client actually interacts with.

CRITICAL RULE — visual craft: this must look like a real, designed product, not a functional wireframe. Establish a clear typographic scale (one size/weight for the main metric, another for labels, another for body — do not let everything be the same size), consistent spacing rhythm (pick a base unit like 8px and stick to multiples of it), a restrained but confident color system (the brand/accent color used deliberately for the 2-3 things that most deserve attention, not sprayed everywhere), clear visual hierarchy so the eye knows where to go first, and small polish details — hover states, subtle transitions on state changes, rounded corners used consistently, badges/pills/icons (inline SVG only) where they earn their place. Avoid dense walls of text inside the artefact itself; prefer short labels, numbers, and a few words of context, saving longer explanation for outside the artefact. Any copy inside the artefact (labels, microcopy, tooltips) follows the same PLAIN-LANGUAGE RULE as everything else — a framework's own stage/phase names (Step 2's vocabulary rule) are the one exception, since naming those is deliberate; everything else should read like something you'd say out loud, not a slide from a strategy deck.

Rules for the artefact itself:
- It is a demo, not a mockup — real interactive elements (buttons, inputs, tabs, toggles) that respond to clicks, backed by representative/assumed sample data consistent with the assumptions you stated in Step 3. It does NOT need real client data or a real backend.
- Single self-contained HTML fragment: inline <style> and <script> only, no external requests, no external libraries, no images (use inline SVG only if needed).
- It must visibly tie back to the specific P&L lever(s) and show the before/after number from Step 3.
- Keep it focused and legible — someone should grasp the whole thing in under two minutes, even though it now has real depth to explore.

Branding — this matters, and the boundary here is not optional:
- You may be given an HTML excerpt from the client's own website (reference_site_html). Its ONLY job is visual: brand colors, typography, and the company display name — nothing else. Use it to skin the artefact so it feels like it belongs to THEIR product. Do not use gold-on-near-black branding here; that identity belongs to the sales page, not to a client's demo.
- CRITICAL: reference_site_html must NEVER influence Steps 1-7. Do not borrow business terminology, job titles, personas, industry framing, or subject matter from the website's text content — the diagnosis, root cause, framework choice, mechanism, and every number are grounded ONLY in the problem the client actually typed and the tools they listed. A client can legitimately submit an unrelated or even a giant enterprise's URL (a personal project, a placeholder, a company they merely work at) — if the website's business doesn't match what the client actually described, ignore the website's business entirely and solve the problem as stated. When in doubt, the literal problem text always wins over anything inferred from the site.
- If no reference_site_html is given, or it doesn't yield usable brand signals, fall back to a simple, neutral, professional theme: light neutral background, dark neutral text, one restrained accent color, plain sans-serif system font, and a placeholder mark at the top reading "[ Client logo ]" — clearly a placeholder, not a fake brand.

STEP 9 — Validate the artefact you just built. Step 5 checked your reasoning; this checks the actual HTML/JS/CSS you wrote in Step 8, since a valid reasoning trail doesn't guarantee the artefact faithfully implements it. Re-read the artefact_html you just produced and honestly report on:
- has_run_control: does it have a single primary "Run"/play-style control that autoplays through the mechanism's steps on its own (per the interactivity-depth rule), rather than requiring manual click-through for every step? "block" if it's still a manual-click-only slideshow.
- before_after_integrity: do the BEFORE and AFTER numbers shown actually differ, and do they match Step 3's calculation exactly (not a second, independently-invented set of numbers)? "block" if before equals after, or if a live counter's after-value never actually updates when the run sequence completes.
- uses_real_tools: does the artefact reference the ACTUAL tool names the client listed (or a sensible default if none were given), not generic placeholders like "Tool A" or "the CRM"? "warning" if genuinely no tools were given and it had to stay generic.
- framework_vocabulary_present: does the artefact visibly use the selected framework's own vocabulary/structure per Step 2's rule, or at minimum name-check it? "block" if there's no trace of the selected framework anywhere in the artefact.
- no_bare_zeros: does every number shown have a real basis (per the no-bare-zeros rule), with nothing rendering as "0", "—", "NaN", or blank where a real result should be?
For each: explanation (one specific sentence — quote or describe what you actually see, not "looks fine") and recommended_action ("none" only if status is pass). This is a real self-audit — if you find a genuine problem, fix the artefact_html itself before finalizing your answer rather than just reporting the defect and shipping it anyway; only report a "block" you couldn't fix within this pass.`;
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
            plain_summary: { type: 'string', description: '≤ 25 words — everyday restatement of root_cause + cost, no jargon. This is the customer-facing headline; see the PLAIN-LANGUAGE RULE.' },
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
            'plain_summary',
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
            plain_explanation: { type: 'string', description: '≤ 25 words — everyday restatement of what this approach actually does for the customer, no jargon. See the PLAIN-LANGUAGE RULE.' },
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
            fit_candidates: {
              type: 'array',
              description:
                'Scoring shown to the customer as a comparison table, and to admin — one entry for the selected framework and one for each runner-up. An honest audit, not a justification for whichever one was picked; a runner-up scoring close to or above the pick on some columns is expected and fine.',
              items: {
                type: 'object',
                properties: {
                  framework_name: { type: 'string', description: 'Exact name, matching framework_name or one of runner_up_names.' },
                  is_selected: { type: 'boolean' },
                  dimension_scores: {
                    type: 'array',
                    description: 'Exactly 9 entries, one per fixed dimension.',
                    items: {
                      type: 'object',
                      properties: {
                        dimension: {
                          type: 'string',
                          enum: FIT_DIMENSIONS as unknown as string[],
                        },
                        score: { type: 'integer', description: '0-5, 5 = excellent fit on this dimension.' },
                      },
                      required: ['dimension', 'score'],
                    },
                  },
                  total_score: { type: 'integer', description: 'Sum of the 9 dimension scores, 0-45.' },
                  positive_evidence: { type: 'string', description: 'Concrete reasons this framework fits. ≤ 30 words.' },
                  negative_evidence: { type: 'string', description: 'Concrete reasons it does not, or "none material" if genuinely true. ≤ 30 words.' },
                },
                required: ['framework_name', 'is_selected', 'dimension_scores', 'total_score', 'positive_evidence', 'negative_evidence'],
              },
            },
          },
          required: ['problem_index', 'framework_name', 'why_selected', 'plain_explanation', 'in_library', 'runner_up_names', 'fit_candidates'],
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
            pnl_line_item: { type: 'string', description: 'The specific line, not just the lever category — e.g. "support team headcount cost".' },
            baseline_value: { type: 'string', description: 'That line\'s value today, e.g. "60% checkout abandonment".' },
            target_value: { type: 'string', description: 'The projected value if the Step 4 mechanism were live, e.g. "~55% abandonment".' },
            causal_mechanism: { type: 'string', description: 'One short phrase: how the Step 4 mechanism actually moves baseline to target.' },
            reasoning: {
              type: 'string',
              description: 'One tight sentence with the stated assumption and the before/after estimate, ≤ 30 words.',
            },
            plain_explanation: { type: 'string', description: '≤ 20 words — the same number in everyday terms, no finance jargon. See the PLAIN-LANGUAGE RULE.' },
            calculation: {
              type: 'array',
              description: '2-4 rows making the arithmetic behind plain_explanation visible — inputs then a result row. Only numbers already implied by "reasoning" above, never a new figure.',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: 'Short plain label, e.g. "Inbound leads / month".' },
                  value: { type: 'string', description: 'Short value, e.g. "~500 (assumed)" or "≈30".' },
                },
                required: ['label', 'value'],
              },
            },
            value_status: {
              type: 'string',
              enum: EPISTEMIC_STATUSES as unknown as string[],
              description: '"known" only if the client stated this number themselves; "assumed" for an industry-grounded placeholder; "needs_confirmation" if even the assumption is shaky.',
            },
          },
          required: ['category', 'lever', 'pnl_line_item', 'baseline_value', 'target_value', 'causal_mechanism', 'reasoning', 'plain_explanation', 'calculation', 'value_status'],
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
            agent_sequence: {
              type: 'array',
              description: 'One entry per how_it_works_steps index, same order/length — which curated agent performs that step.',
              items: {
                type: 'object',
                properties: {
                  step_index: { type: 'integer', description: 'Matches the index into how_it_works_steps.' },
                  agent_name: { type: 'string', description: 'Exact name from the agent library, or a new genuinely-distinct role if in_library is false.' },
                  in_library: { type: 'boolean' },
                  suggested_description: { type: 'string', description: 'ONLY set when in_library is false — what this new agent role would do.' },
                },
                required: ['step_index', 'agent_name', 'in_library'],
              },
            },
            plain_explanation: { type: 'string', description: '≤ 35 words, one or two sentences — what the tool actually does day to day, no engineering language. See the PLAIN-LANGUAGE RULE.' },
            trigger_or_data_source: { type: 'string', description: 'Short phrase.' },
            why_not_generic: { type: 'string', description: 'One sentence, ≤ 25 words.' },
          },
          required: ['problem_index', 'mechanism_name', 'how_it_works_steps', 'agent_sequence', 'plain_explanation', 'trigger_or_data_source', 'why_not_generic'],
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
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            why_it_matters: { type: 'string', description: 'One short phrase — what changes if this is answered differently.' },
            affected_step: { type: 'string', description: 'e.g. "Step 1 diagnosis", "Step 3 P&L mapping".' },
            blocking: { type: 'boolean', description: 'true only if unanswered, it materially changes the diagnosis/mechanism — not just sharpens a number.' },
            expected_answer_type: { type: 'string', enum: EXPECTED_ANSWER_TYPES as unknown as string[] },
          },
          required: ['question', 'why_it_matters', 'affected_step', 'blocking', 'expected_answer_type'],
        },
      },
      artefact_html: {
        type: 'string',
        description:
          'Step 8 output — self-contained HTML fragment implementing artefact_plan. No bare zeros. Must have a single primary Run control that autoplays through the mechanism, not manual click-through. Real visual craft — typographic scale, spacing rhythm, restrained color, hover/transition polish.',
      },
      artefact_validations: {
        type: 'array',
        description:
          'Step 9 output — self-audit of the artefact_html you just wrote, exactly the 5 fixed checks: has_run_control, before_after_integrity, uses_real_tools, framework_vocabulary_present, no_bare_zeros. Fix the artefact_html itself if you find a real problem, rather than reporting a defect you could have fixed.',
        items: {
          type: 'object',
          properties: {
            validation_type: { type: 'string', enum: ARTEFACT_VALIDATION_TYPES as unknown as string[] },
            status: { type: 'string', enum: VALIDATION_STATUSES as unknown as string[] },
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            explanation: { type: 'string', description: 'One specific sentence describing what you actually see.' },
            recommended_action: { type: 'string', description: 'What to fix, or "none" if status is pass.' },
          },
          required: ['validation_type', 'status', 'severity', 'explanation', 'recommended_action'],
        },
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
      'artefact_validations',
    ],
  },
} as const;

type ToolOutput = {
  problem_breakdown: ProblemBreakdown[];
  framework_selections: RawFrameworkSelection[];
  levers: PnlLeverHit[];
  solution_mechanisms: SolutionMechanism[];
  validations: SolutionValidation[];
  artefact_validations: ArtefactValidation[];
  artefact_plan: ArtefactPlan;
  clarifying_questions: ClarifyingQuestion[];
  artefact_html: string;
};

// One attempt at the actual HTTP call, with a hard timeout so a hung
// request fails cleanly rather than riding out the platform's own limit.
async function attemptClaudeCall(system: string, userMessage: string, apiKey: string): Promise<ToolOutput> {
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
        system,
        messages: [{ role: 'user', content: userMessage }],
        tools: [CLASSIFY_TOOL],
        tool_choice: { type: 'tool', name: CLASSIFY_TOOL.name },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as { content: Array<{ type: string; input?: Record<string, unknown> }> };
    const toolUse = data.content.find((b) => b.type === 'tool_use');
    if (!toolUse?.input) throw new Error('Anthropic response did not include a tool_use block');
    return toolUse.input as ToolOutput;
  } finally {
    clearTimeout(timeout);
  }
}

// One safe retry on a transient failure (network error, 5xx, or our own
// timeout) — never retries on a 4xx (bad request/auth), since that will
// just fail the same way again. Every call is traceable via GenerationMeta:
// a generation_id, the prompt version, how many attempts it took, and how
// long it took (brief §23-24).
async function callClaudeTool(
  system: string,
  userMessage: string,
  apiKey: string
): Promise<{ output: ToolOutput; meta: GenerationMeta }> {
  const generationId = crypto.randomUUID();
  const startedAt = Date.now();
  let attempts = 0;
  let lastError: unknown = null;

  for (attempts = 1; attempts <= 2; attempts++) {
    try {
      const output = await attemptClaudeCall(system, userMessage, apiKey);
      return {
        output,
        meta: {
          generationId,
          model: MODEL,
          promptVersion: PROMPT_VERSION,
          status: 'success',
          attempts,
          durationMs: Date.now() - startedAt,
          errorMessage: null,
        },
      };
    } catch (err) {
      lastError = err;
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const is4xx = err instanceof Error && /Anthropic API error 4\d\d/.test(err.message);
      if (is4xx || attempts === 2) break;
      // Transient — brief pause before the one retry.
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const isAbort = lastError instanceof Error && lastError.name === 'AbortError';
  const meta: GenerationMeta = {
    generationId,
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    status: isAbort ? 'timeout' : 'error',
    attempts,
    durationMs: Date.now() - startedAt,
    errorMessage: lastError instanceof Error ? lastError.message : String(lastError),
  };
  const err = new Error(meta.errorMessage ?? 'Anthropic call failed') as Error & { generationMeta?: GenerationMeta };
  err.generationMeta = meta;
  throw err;
}

function toResult(out: ToolOutput, meta: GenerationMeta): ClassifyAndBuildResult {
  return {
    problemBreakdown: out.problem_breakdown,
    frameworkSelections: out.framework_selections,
    levers: out.levers,
    solutionMechanisms: out.solution_mechanisms,
    validations: out.validations,
    artefactValidations: out.artefact_validations,
    artefactPlan: out.artefact_plan,
    clarifyingQuestions: out.clarifying_questions,
    artefactHtml: out.artefact_html,
    generationMeta: meta,
  };
}

export async function classifyAndBuild(
  input: ClassifyAndBuildInput,
  apiKey: string
): Promise<ClassifyAndBuildResult> {
  const methodology = buildMethodology(input.frameworkLibrary, input.agentLibrary, input.preferredFramework, input.industry, input.pastFrameworkUsage);
  const system = `${methodology}\n\nReturn your answer using the classify_and_build tool, with every step's output filled in — do not include any text outside the tool call.`;

  const userMessage = [
    `Problem(s): ${input.problem}`,
    input.company ? `Company: ${input.company}` : null,
    input.industry ? `Industry: ${input.industry}` : null,
    input.tools ? `Tools currently in use: ${input.tools}` : null,
    input.websiteSnippet
      ? `reference_site_html (excerpt from the client's own website — use ONLY for colors/fonts/company name; ignore its business content entirely, it is irrelevant to the problem below):\n${input.websiteSnippet}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const { output, meta } = await callClaudeTool(system, userMessage, apiKey);
  return toResult(output, meta);
}

export type ReviseArtefactInput = ClassifyAndBuildInput & {
  previousProblemBreakdown: ProblemBreakdown[];
  previousFrameworkSelections: FrameworkSelection[];
  previousLevers: PnlLeverHit[];
  previousSolutionMechanisms: ResolvedSolutionMechanism[];
  previousArtefactHtml: string;
  feedbackText: string;
};

export async function reviseArtefact(
  input: ReviseArtefactInput,
  apiKey: string
): Promise<ClassifyAndBuildResult> {
  const methodology = buildMethodology(input.frameworkLibrary, input.agentLibrary, input.preferredFramework, input.industry, input.pastFrameworkUsage);
  const system = `${methodology}

You are REVISING a demo you already built, based on the client's actual reply. This is the one and only revision round — make it count, and do not ask further clarifying questions unless the client's feedback itself raises a genuinely new unknown.

Re-run the same nine steps, but:
- Keep everything from the previous version that the feedback doesn't touch — do not regenerate from scratch or change things that were already working and weren't criticized. This includes the framework selected in Step 2, unless the feedback itself reveals it was the wrong lens.
- Directly address every point in the client's feedback. If they gave you a real number, use it in place of your prior assumption and say so.
- If their feedback describes a different or additional problem, incorporate it the same way Step 1 would.

Return your answer using the classify_and_build tool, with every step's output filled in (the complete revised state, not a diff) — do not include any text outside the tool call.`;

  const userMessage = [
    `Original problem(s): ${input.problem}`,
    input.company ? `Company: ${input.company}` : null,
    input.industry ? `Industry: ${input.industry}` : null,
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

  const { output, meta } = await callClaudeTool(system, userMessage, apiKey);
  return toResult(output, meta);
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
      plain_explanation: r.plain_explanation,
      in_library: !!matched,
      runner_ups: runnerUps,
      fitCandidates: r.fit_candidates ?? [],
    };
  });
}

export type ResolvedSolutionMechanism = Omit<SolutionMechanism, 'agent_sequence'> & {
  agentSequence: ResolvedAgentStep[];
};

// Resolves the model's per-step agent names against the curated ai_agents
// library — same anti-hallucination pattern as resolveFrameworkSelections:
// the model only ever names an agent, every factual detail (category,
// description) comes from OUR curated data, never trusted from the
// model's own claim.
export function resolveAgentSequence(raw: RawAgentStep[], library: AgentLibraryEntry[]): ResolvedAgentStep[] {
  const byName = new Map(library.map((a) => [a.name.toLowerCase().trim(), a]));
  return raw.map((r) => {
    const matched = byName.get(r.agent_name.toLowerCase().trim());
    return {
      step_index: r.step_index,
      agent_name: matched?.name ?? r.agent_name,
      capability_category: matched?.capability_category ?? null,
      description: matched?.description ?? r.suggested_description ?? null,
      in_library: !!matched,
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

// Shared helper for the smaller, single-purpose tool calls below (AMC
// hours, implementation hours, framework suggestions) — same generation
// tracking (id, prompt version, duration, status) as the main
// classify_and_build call, just without the timeout/retry wrapper since
// these are quick, low-token calls where a bare failure is fine to surface
// directly to the admin action that triggered it.
async function callNamedTool<T>(
  system: string,
  userMessage: string,
  tool: { name: string; description: string; input_schema: unknown },
  apiKey: string,
  maxTokens: number
): Promise<{ output: T; meta: GenerationMeta }> {
  const generationId = crypto.randomUUID();
  const startedAt = Date.now();
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
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

    return {
      output: toolUse.input as T,
      meta: {
        generationId,
        model: MODEL,
        promptVersion: PROMPT_VERSION,
        status: 'success',
        attempts: 1,
        durationMs: Date.now() - startedAt,
        errorMessage: null,
      },
    };
  } catch (err) {
    const meta: GenerationMeta = {
      generationId,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      status: 'error',
      attempts: 1,
      durationMs: Date.now() - startedAt,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    const wrapped = new Error(meta.errorMessage ?? 'Anthropic call failed') as Error & { generationMeta?: GenerationMeta };
    wrapped.generationMeta = meta;
    throw wrapped;
  }
}

// 4c — AMC resource-hours estimation. Given a delivered solution's profile,
// estimate monthly ongoing-service hours per resource category. This is the
// highest-uncertainty piece of the AMC model — kept as its own isolated call
// (not folded into the main solutioning schema) so it can be re-run and
// live-verified independently, and each estimate is honestly tagged known/
// assumed/needs_confirmation rather than presented as a precise figure.
export async function estimateAmcResourceHours(
  profile: AmcSolutionProfile,
  apiKey: string
): Promise<{ estimate: AmcResourceEstimate; meta: GenerationMeta }> {
  const system = `You estimate ongoing monthly service hours (AMC — Annual Maintenance Contract) for a delivered AI-orchestration solution, across exactly these 4 resource categories: fde_client_engagement (dedicated account management, satisfaction support, domain-expert calls), technical (model/infra updates, monitoring, integration maintenance), sme (domain subject-matter-expert oversight specific to this problem/framework), ai_optimisation (prompt/framework advancement, ongoing data study against the original P&L target).

For each category, estimate realistic monthly hours given the solution's profile (mechanism type, workflow/integration count, automation level, decision criticality — higher automation and higher decision criticality generally mean MORE technical/SME hours, not fewer, because more is riding on it staying correct). Tag each estimate's status: "known" only if the profile itself effectively dictates this number, "assumed" for an industry-grounded default given the profile, "needs_confirmation" if you genuinely don't have enough in the profile to estimate confidently. Give a one-sentence rationale per category tied to the actual profile fields, not generic filler. Never inflate hours to justify a higher price, and never estimate zero hours for a category without saying so plainly in the rationale.

End with one sentence (overall_confidence_note) on how solid this whole estimate is, given what's actually known about the solution.`;

  const userMessage = `Solution profile:
- Business function: ${profile.business_function}
- Domain: ${profile.domain}
- Problem type: ${profile.problem_type}
- Framework applied: ${profile.framework_name}
- Mechanism type: ${profile.mechanism_type}
- Distinct workflows: ${profile.workflow_count}
- Distinct integrations: ${profile.integration_count}
- Automation level: ${profile.automation_level}
- Decision criticality: ${profile.decision_criticality}`;

  const tool = {
    name: 'estimate_amc_hours',
    description: 'Estimate monthly AMC service hours per resource category.',
    input_schema: {
      type: 'object',
      properties: {
        estimates: {
          type: 'array',
          description: 'Exactly 4 entries, one per fixed resource category.',
          items: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: RESOURCE_CATEGORIES as unknown as string[],
              },
              monthly_hours: { type: 'number' },
              status: { type: 'string', enum: EPISTEMIC_STATUSES as unknown as string[] },
              rationale: { type: 'string', description: 'One sentence tied to the actual profile fields.' },
            },
            required: ['category', 'monthly_hours', 'status', 'rationale'],
          },
        },
        overall_confidence_note: { type: 'string' },
      },
      required: ['estimates', 'overall_confidence_note'],
    },
  } as const;

  const { output, meta } = await callNamedTool<AmcResourceEstimate>(system, userMessage, tool, apiKey, 1500);
  return { estimate: output, meta };
}

// One-time implementation human-service model (brief §33-37) — parallel to
// the AMC estimate above, but for the 30-day build itself: which roles,
// how many people, and how many hours. Shown to the customer alongside the
// AMC breakdown so the build price is backed by a visible team, not a bare
// number (brief §57-58).
export async function estimateImplementationHours(
  profile: AmcSolutionProfile,
  apiKey: string
): Promise<{ estimate: ImplementationEstimate; meta: GenerationMeta }> {
  const system = `You estimate one-time implementation hours for building a delivered AI-orchestration solution, across exactly these 6 roles: fde_client_lead (client coordination, delivery ownership, UAT coordination), solution_architect (architecture/design decisions), software_engineer (application build), ai_automation_engineer (the AI/automation mechanism itself), sme (domain/framework review during the build), qa_uat (testing before delivery).

For each role, estimate realistic one-time hours AND people count (almost always 1 person per role for a standard build — only use more than 1 if the workflow/integration count genuinely demands parallel work) given the solution's profile. Do not include a role that genuinely isn't needed for this build — set its hours to 0 and say why in the rationale rather than inventing work to fill a role. Ground hours in actual work implied by the profile (workflow_count, integration_count, mechanism_type, automation_level) — not a generic complexity score. Never inflate hours to justify the standard price; if a role genuinely needs very little time, say so.

End with one sentence (overall_confidence_note) on how solid this estimate is.`;

  const userMessage = `Solution profile:
- Business function: ${profile.business_function}
- Domain: ${profile.domain}
- Problem type: ${profile.problem_type}
- Framework applied: ${profile.framework_name}
- Mechanism type: ${profile.mechanism_type}
- Distinct workflows: ${profile.workflow_count}
- Distinct integrations: ${profile.integration_count}
- Automation level: ${profile.automation_level}
- Decision criticality: ${profile.decision_criticality}`;

  const tool = {
    name: 'estimate_implementation_hours',
    description: 'Estimate one-time implementation hours and people count per role.',
    input_schema: {
      type: 'object',
      properties: {
        estimates: {
          type: 'array',
          description: 'Exactly 6 entries, one per fixed role.',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: IMPLEMENTATION_ROLES as unknown as string[] },
              people: { type: 'integer', description: 'Almost always 1.' },
              hours: { type: 'number' },
              rationale: { type: 'string', description: 'One sentence tied to the actual profile fields, or why this role needs 0 hours.' },
            },
            required: ['role', 'people', 'hours', 'rationale'],
          },
        },
        overall_confidence_note: { type: 'string' },
      },
      required: ['estimates', 'overall_confidence_note'],
    },
  } as const;

  const { output, meta } = await callNamedTool<ImplementationEstimate>(system, userMessage, tool, apiKey, 1500);
  return { estimate: output, meta };
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
