import { createClient } from '@supabase/supabase-js';
import type { PnlLeverHit } from './pnl-levers';
import type { ProblemBreakdown, SolutionMechanism, ArtefactPlan, FrameworkSelection, SolutionValidation, ArtefactValidation, ClarifyingQuestion } from './llm';
import type { AmcRateBenchmark, AmcSolutionProfile, AmcResourceEstimate, AmcPricingRecommendation, ResourceCategory } from './amc';
import type { ImplementationEstimate } from './implementation';
import { summarizeFrameworkUsage, type PastFrameworkUsage } from './industry';

export type AmcPricingDecision = {
  mode: 'approved' | 'adjusted' | 'custom';
  monthly_amount_inr: number;
  rationale: string;
  decided_at: string;
};

export type SolutionNotes = {
  problemBreakdown: ProblemBreakdown[];
  frameworkSelections: FrameworkSelection[];
  solutionMechanisms: SolutionMechanism[];
  validations: SolutionValidation[];
  artefactValidations: ArtefactValidation[];
  artefactPlan: ArtefactPlan;
  clarifyingQuestions: ClarifyingQuestion[];
};

// Admin-curated framework library — the solutioning engine may only cite
// frameworks that are `active` here. Reviewed/expanded at
// /devshop/admin/frameworks, never invented by the model itself.
export type Framework = {
  id: string;
  name: string;
  source: string;
  business_function: string;
  when_to_use: string;
  link: string | null;
  active: boolean;
  created_at: string;
  framework_version: number;
  source_verified_at: string | null;
  reviewed_by: string | null;
  problem_archetypes: string[];
  ideal_use_cases: string[];
  required_conditions: string[];
  required_evidence: string[];
  contraindications: string[];
  expected_intervention_types: string[];
  applicable_business_functions: string[];
  applicable_pnl_levers: string[];
  expert_notes: string | null;
};

export type StageTransition = {
  id: string;
  submission_id: string;
  previous_status: string | null;
  new_status: string;
  actor: 'admin' | 'client' | 'system';
  reason: string | null;
  created_at: string;
};

export type GenerationKind = 'classify' | 'revise' | 'amc_estimate' | 'implementation_estimate' | 'framework_suggest';

export type Generation = {
  id: string;
  submission_id: string | null;
  kind: GenerationKind;
  model: string;
  prompt_version: string;
  status: 'success' | 'error' | 'timeout';
  attempts: number;
  duration_ms: number;
  error_message: string | null;
  artefact_blocked: boolean;
  created_at: string;
};

export type ReviewAction = {
  id: string;
  submission_id: string;
  reviewer_name: string;
  action: 'approved' | 'approved_with_edits' | 'diagnosis_changed' | 'framework_changed' | 'pnl_changed' | 'mechanism_changed' | 'blocked';
  note: string | null;
  created_at: string;
};

// The full pipeline, demo through AMC — see the Demo-to-Delivery Pipeline
// design doc. `status` is a plain text column (no DB-level enum) so this
// list is the actual source of truth for valid values and their order.
export const PIPELINE_STAGES = [
  'received',
  'demo_ready',
  'revising',
  'sent',
  'interested',
  'scoping_scheduled',
  'scoping_complete',
  'proposal_sent',
  'deposit_paid',
  'build_scheduled',
  'in_build',
  'uat',
  'delivered',
  'feedback_requested',
  'amc_active',
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number] | 'failed' | 'refunded';

export type WeeklyUpdate = {
  date: string; // ISO
  summary: string;
  blocker: 'none' | 'client' | 'internal';
  blocker_detail: string | null;
};

export type Submission = {
  id: string;
  problem: string;
  company: string | null;
  industry: string | null;
  website: string | null;
  tools: string | null;
  email: string;
  status: PipelineStage;
  pnl_levers: PnlLeverHit[] | null;
  solution_notes: SolutionNotes | null;
  artefact_html: string | null;
  feedback_text: string | null;
  feedback_round: number;
  complexity_tier: 'standard' | 'complex' | null;
  price_recommendation: string | null;
  deposit_paid_at: string | null;
  delivery_deadline: string | null;
  weekly_updates: WeeklyUpdate[];
  handoff_markdown: string | null;
  amc_solution_profile: AmcSolutionProfile | null;
  amc_resource_estimate: AmcResourceEstimate | null;
  amc_pricing_recommendation: AmcPricingRecommendation | null;
  amc_pricing_decision: AmcPricingDecision | null;
  implementation_estimate: ImplementationEstimate | null;
  error: string | null;
  created_at: string;
};

// Service-role client: full read/write, bypasses RLS. Only ever constructed
// server-side (inside API routes / server-rendered admin pages) — the key
// must never reach the browser.
export function getDb(env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  return {
    async insertSubmission(row: {
      id: string;
      problem: string;
      company: string | null;
      industry: string | null;
      website: string | null;
      tools: string | null;
      email: string;
    }) {
      const { error } = await supabase.from('submissions').insert({ ...row, status: 'received' });
      if (error) throw new Error(`supabase insert failed: ${error.message}`);
    },

    async markDemoReady(id: string, levers: PnlLeverHit[], notes: SolutionNotes, artefactHtml: string) {
      const { error } = await supabase
        .from('submissions')
        .update({
          status: 'demo_ready',
          pnl_levers: levers,
          solution_notes: notes,
          artefact_html: artefactHtml,
          classified_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw new Error(`supabase update (demo_ready) failed: ${error.message}`);
    },

    async markFailed(id: string, message: string) {
      const { error } = await supabase.from('submissions').update({ status: 'failed', error: message }).eq('id', id);
      if (error) console.error('supabase update (failed) also failed:', error.message);
    },

    async markSent(id: string) {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('submissions')
        .update({ status: 'sent', approved_at: now, sent_at: now })
        .eq('id', id);
      if (error) throw new Error(`supabase update (sent) failed: ${error.message}`);
    },

    // Reply-to-email feedback loop — one round, per product rule.
    async startRevision(id: string, feedbackText: string) {
      const { error } = await supabase
        .from('submissions')
        .update({ status: 'revising', feedback_text: feedbackText })
        .eq('id', id);
      if (error) throw new Error(`supabase update (revising) failed: ${error.message}`);
    },

    // A failed revision must not hide the client's still-good original demo
    // behind a generic "failed" status (which demo/[id].astro treats as
    // not-found) — restore whatever status it had before the revision
    // attempt so they keep seeing the working version, with the error
    // logged for admin visibility.
    async revertRevisionFailure(id: string, message: string, restoreStatus: PipelineStage) {
      const { error } = await supabase.from('submissions').update({ status: restoreStatus, error: message }).eq('id', id);
      if (error) console.error('supabase update (revert revision failure) also failed:', error.message);
    },

    async markRevised(id: string, levers: PnlLeverHit[], notes: SolutionNotes, artefactHtml: string) {
      const { error } = await supabase
        .from('submissions')
        .update({
          status: 'demo_ready',
          pnl_levers: levers,
          solution_notes: notes,
          artefact_html: artefactHtml,
          feedback_round: 1,
          classified_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw new Error(`supabase update (revised) failed: ${error.message}`);
    },

    // Post-approval pipeline (see PIPELINE_STAGES). Generic stage advance —
    // used for interested / scoping_scheduled / scoping_complete /
    // proposal_sent / in_build / delivered / feedback_requested /
    // amc_active / refunded. Deposit and complexity have their own setters
    // below because they also write side-fields.
    async setStage(id: string, status: PipelineStage) {
      const { error } = await supabase.from('submissions').update({ status }).eq('id', id);
      if (error) throw new Error(`supabase update (stage: ${status}) failed: ${error.message}`);
    },

    async setComplexity(id: string, tier: 'standard' | 'complex', recommendation: string) {
      const { error } = await supabase
        .from('submissions')
        .update({ complexity_tier: tier, price_recommendation: recommendation })
        .eq('id', id);
      if (error) throw new Error(`supabase update (complexity) failed: ${error.message}`);
    },

    // Starts the 30-day delivery guarantee clock and advances to
    // build_scheduled — this is the "approved for build" moment.
    // handoff_markdown is set separately (see saveHandoff) right after, by
    // the caller.
    async markDepositPaid(id: string) {
      const now = new Date();
      const deadline = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const { error } = await supabase
        .from('submissions')
        .update({
          status: 'build_scheduled',
          deposit_paid_at: now.toISOString(),
          delivery_deadline: deadline.toISOString(),
        })
        .eq('id', id);
      if (error) throw new Error(`supabase update (deposit_paid) failed: ${error.message}`);
    },

    async saveHandoff(id: string, markdown: string) {
      const { error } = await supabase.from('submissions').update({ handoff_markdown: markdown }).eq('id', id);
      if (error) throw new Error(`supabase update (handoff) failed: ${error.message}`);
    },

    async addWeeklyUpdate(id: string, update: WeeklyUpdate) {
      const row = await this.getById(id);
      if (!row) throw new Error('addWeeklyUpdate: submission not found');
      const updates = [...row.weekly_updates, update];
      const { error } = await supabase.from('submissions').update({ weekly_updates: updates }).eq('id', id);
      if (error) throw new Error(`supabase update (weekly_updates) failed: ${error.message}`);
    },

    async getById(id: string): Promise<Submission | null> {
      const { data, error } = await supabase.from('submissions').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(`supabase select failed: ${error.message}`);
      return data as Submission | null;
    },

    async listRecent(limit = 100): Promise<Submission[]> {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(`supabase list failed: ${error.message}`);
      return (data ?? []) as Submission[];
    },

    // Framework library — the ONLY frameworks the solutioning engine may cite.
    async listActiveFrameworks(): Promise<Framework[]> {
      const { data, error } = await supabase
        .from('frameworks')
        .select('*')
        .eq('active', true)
        .order('business_function', { ascending: true });
      if (error) throw new Error(`supabase frameworks list failed: ${error.message}`);
      return (data ?? []) as Framework[];
    },

    // Item 2 (internal half) — how frameworks have actually been applied
    // before for this industry within FTDS. A frequency + pipeline-
    // progression signal (see src/lib/industry.ts), never treated as a
    // proven success rate. Exact case-insensitive industry match only — no
    // fuzzy matching yet, so this is strongest when industry values come
    // from the intake wizard's chip set rather than free text.
    async listPastFrameworkUsageByIndustry(industry: string): Promise<PastFrameworkUsage[]> {
      const trimmed = industry.trim();
      if (!trimmed) return [];
      const { data, error } = await supabase
        .from('submissions')
        .select('status, solution_notes')
        .ilike('industry', trimmed)
        .limit(200);
      if (error) throw new Error(`supabase past framework usage query failed: ${error.message}`);
      const rows = (data ?? []).map((r: any) => ({
        status: r.status as string,
        framework_names: ((r.solution_notes?.frameworkSelections ?? []) as Array<{ framework_name?: string }>)
          .map((f) => f.framework_name)
          .filter((n): n is string => !!n),
      }));
      return summarizeFrameworkUsage(rows);
    },

    async listAllFrameworks(): Promise<Framework[]> {
      const { data, error } = await supabase
        .from('frameworks')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(`supabase frameworks list-all failed: ${error.message}`);
      return (data ?? []) as Framework[];
    },

    async addFramework(fw: {
      name: string;
      source: string;
      business_function: string;
      when_to_use: string;
      link?: string | null;
      problem_archetypes?: string[];
      ideal_use_cases?: string[];
      required_conditions?: string[];
      required_evidence?: string[];
      contraindications?: string[];
      expected_intervention_types?: string[];
      applicable_business_functions?: string[];
      applicable_pnl_levers?: string[];
      expert_notes?: string | null;
    }) {
      const { error } = await supabase.from('frameworks').insert(fw);
      if (error) throw new Error(`supabase framework insert failed: ${error.message}`);
    },

    async markFrameworkReviewed(id: string, reviewedBy: string) {
      const { error } = await supabase
        .from('frameworks')
        .update({ source_verified_at: new Date().toISOString(), reviewed_by: reviewedBy })
        .eq('id', id);
      if (error) throw new Error(`supabase framework review update failed: ${error.message}`);
    },

    async setFrameworkActive(id: string, active: boolean) {
      const { error } = await supabase.from('frameworks').update({ active }).eq('id', id);
      if (error) throw new Error(`supabase framework update failed: ${error.message}`);
    },

    // AMC rate benchmarks (4b) — admin-curated, source-cited market rates.
    // The pricing math in src/lib/amc.ts only ever uses a rate from here,
    // flagged `verified: false` when sourced but not cross-checked.
    async listActiveAmcRates(): Promise<AmcRateBenchmark[]> {
      const { data, error } = await supabase
        .from('amc_rate_benchmarks')
        .select('*')
        .eq('active', true)
        .order('resource_category', { ascending: true });
      if (error) throw new Error(`supabase amc rates list failed: ${error.message}`);
      return (data ?? []) as AmcRateBenchmark[];
    },

    async listAllAmcRates(): Promise<AmcRateBenchmark[]> {
      const { data, error } = await supabase.from('amc_rate_benchmarks').select('*').order('created_at', { ascending: false });
      if (error) throw new Error(`supabase amc rates list-all failed: ${error.message}`);
      return (data ?? []) as AmcRateBenchmark[];
    },

    async addAmcRate(rate: {
      resource_category: ResourceCategory;
      domain: string;
      role_label: string;
      rate_per_hour_inr: number;
      source: string;
      verified: boolean;
      note?: string | null;
    }) {
      const { error } = await supabase.from('amc_rate_benchmarks').insert(rate);
      if (error) throw new Error(`supabase amc rate insert failed: ${error.message}`);
    },

    async setAmcRateActive(id: string, active: boolean) {
      const { error } = await supabase.from('amc_rate_benchmarks').update({ active }).eq('id', id);
      if (error) throw new Error(`supabase amc rate update failed: ${error.message}`);
    },

    // AMC solution profile / estimate / pricing recommendation (4c/4d) —
    // computed once, stored, reviewed by a human in admin (4e) before it
    // ever reaches a customer-facing offer (4f).
    async saveAmcProposal(
      id: string,
      profile: AmcSolutionProfile,
      estimate: AmcResourceEstimate,
      recommendation: AmcPricingRecommendation
    ) {
      const { error } = await supabase
        .from('submissions')
        .update({
          amc_solution_profile: profile,
          amc_resource_estimate: estimate,
          amc_pricing_recommendation: recommendation,
        })
        .eq('id', id);
      if (error) throw new Error(`supabase update (amc proposal) failed: ${error.message}`);
    },

    async saveAmcPricingDecision(id: string, decision: AmcPricingDecision) {
      const { error } = await supabase.from('submissions').update({ amc_pricing_decision: decision }).eq('id', id);
      if (error) throw new Error(`supabase update (amc decision) failed: ${error.message}`);
    },

    // Pipeline transition audit trail — best-effort, logging-only: a
    // failure here must never block the actual stage change it's
    // recording, so errors are caught and swallowed (logged to console).
    async logTransition(
      submissionId: string,
      previousStatus: string | null,
      newStatus: string,
      actor: 'admin' | 'client' | 'system',
      reason: string | null
    ) {
      const { error } = await supabase
        .from('stage_transitions')
        .insert({ submission_id: submissionId, previous_status: previousStatus, new_status: newStatus, actor, reason });
      if (error) console.error('supabase stage_transitions insert failed:', error.message);
    },

    async listTransitions(submissionId: string): Promise<StageTransition[]> {
      const { data, error } = await supabase
        .from('stage_transitions')
        .select('*')
        .eq('submission_id', submissionId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`supabase stage_transitions list failed: ${error.message}`);
      return (data ?? []) as StageTransition[];
    },

    // Request-level observability (brief §23-24) — best-effort, logging
    // only: never let a failure here block the generation it's recording.
    async recordGeneration(entry: {
      submissionId: string | null;
      kind: GenerationKind;
      model: string;
      promptVersion: string;
      status: 'success' | 'error' | 'timeout';
      attempts: number;
      durationMs: number;
      errorMessage: string | null;
      artefactBlocked?: boolean;
    }) {
      const { error } = await supabase.from('generations').insert({
        submission_id: entry.submissionId,
        kind: entry.kind,
        model: entry.model,
        prompt_version: entry.promptVersion,
        status: entry.status,
        attempts: entry.attempts,
        duration_ms: entry.durationMs,
        error_message: entry.errorMessage,
        artefact_blocked: entry.artefactBlocked ?? false,
      });
      if (error) console.error('supabase generations insert failed:', error.message);
    },

    async listGenerations(submissionId: string): Promise<Generation[]> {
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('submission_id', submissionId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`supabase generations list failed: ${error.message}`);
      return (data ?? []) as Generation[];
    },

    // Structured human-reviewer actions (brief §18-19).
    async addReviewAction(entry: { submissionId: string; reviewerName: string; action: ReviewAction['action']; note: string | null }) {
      const { error } = await supabase.from('review_actions').insert({
        submission_id: entry.submissionId,
        reviewer_name: entry.reviewerName,
        action: entry.action,
        note: entry.note,
      });
      if (error) throw new Error(`supabase review_actions insert failed: ${error.message}`);
    },

    async listReviewActions(submissionId: string): Promise<ReviewAction[]> {
      const { data, error } = await supabase
        .from('review_actions')
        .select('*')
        .eq('submission_id', submissionId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`supabase review_actions list failed: ${error.message}`);
      return (data ?? []) as ReviewAction[];
    },

    // One-time implementation human-service model (brief §33-37).
    async saveImplementationEstimate(id: string, estimate: ImplementationEstimate) {
      const { error } = await supabase.from('submissions').update({ implementation_estimate: estimate }).eq('id', id);
      if (error) throw new Error(`supabase update (implementation estimate) failed: ${error.message}`);
    },

    // Duplicate-submission guard (brief §25) — catches the common
    // double-click/resubmit case: same email + same problem text within a
    // short window. Returns the existing row instead of creating a new one.
    async findRecentDuplicateSubmission(email: string, problem: string, windowSeconds: number): Promise<Submission | null> {
      const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('email', email)
        .eq('problem', problem)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`supabase duplicate-check query failed: ${error.message}`);
      return (data as Submission | null) ?? null;
    },
  };
}
