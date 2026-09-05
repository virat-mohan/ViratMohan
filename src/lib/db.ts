import { createClient } from '@supabase/supabase-js';
import type { PnlLeverHit } from './pnl-levers';
import type { ProblemBreakdown, SolutionMechanism, ArtefactPlan, FrameworkSelection, SolutionValidation } from './llm';

export type SolutionNotes = {
  problemBreakdown: ProblemBreakdown[];
  frameworkSelections: FrameworkSelection[];
  solutionMechanisms: SolutionMechanism[];
  validations: SolutionValidation[];
  artefactPlan: ArtefactPlan;
  clarifyingQuestions: string[];
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

    async listAllFrameworks(): Promise<Framework[]> {
      const { data, error } = await supabase
        .from('frameworks')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(`supabase frameworks list-all failed: ${error.message}`);
      return (data ?? []) as Framework[];
    },

    async addFramework(fw: { name: string; source: string; business_function: string; when_to_use: string; link?: string | null }) {
      const { error } = await supabase.from('frameworks').insert(fw);
      if (error) throw new Error(`supabase framework insert failed: ${error.message}`);
    },

    async setFrameworkActive(id: string, active: boolean) {
      const { error } = await supabase.from('frameworks').update({ active }).eq('id', id);
      if (error) throw new Error(`supabase framework update failed: ${error.message}`);
    },
  };
}
