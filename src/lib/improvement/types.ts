// Improvement System — canonical types.
// Pure contract: no framework, no network, no AI invocations.
// Extends the Work Registry (does NOT replace it). An Improvement references a Work item,
// it is not a second ticket system.

import type { Actor, Priority, WorkType, Learning } from '../work/types';
import type { AutomationLevel } from '../amc';

// ── Organisational hierarchy ────────────────────────────────────────────

export const FUNCTIONS = ['operations', 'growth', 'finance', 'sales', 'quality', 'customer_care', 'team', 'visual', 'brand'] as const;
export type Function = (typeof FUNCTIONS)[number];

export interface Process {
  id: string;
  function: Function;
  name: string;
  description: string;
  owner: Actor;
  tasks: Task[];
}

export interface Task {
  id: string;
  process_id: string;
  name: string;
  automationLevel: AutomationLevel;
  frequency: 'continuous' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'ad_hoc';
  currentActorKind: 'agent' | 'human' | 'mixed';
}

// ── PTM classification ──────────────────────────────────────────────────

export interface PtmClassification {
  process: string;
  training: string | null;
  mapping: {
    actor: 'agent' | 'human' | 'mixed';
    techRole: string | null;
    humanRole: string | null;
  };
  automationLevel: AutomationLevel;
  complexity: 'low' | 'medium' | 'high';
}

// ── Improvement types ───────────────────────────────────────────────────

export const IMPROVEMENT_CATEGORIES = [
  'process', 'agent', 'model', 'human', 'brand', 'visual', 'platform', 'integration', 'security',
] as const;
export type ImprovementCategory = (typeof IMPROVEMENT_CATEGORIES)[number];

export const IMPROVEMENT_STATUSES = [
  'detected', 'analysed', 'root_caused', 'proposed', 'approved', 'implementing', 'verifying', 'standardised', 'closed',
] as const;
export type ImprovementStatus = (typeof IMPROVEMENT_STATUSES)[number];

export const IMPROVEMENT_SIGNAL_SOURCES = [
  'incident', 'recurring_incident', 'health_check', 'audit', 'agent_detection',
  'human_observation', 'metrics_drift', 'brand_review', 'visual_review', 'customer_feedback',
] as const;
export type ImprovementSignalSource = (typeof IMPROVEMENT_SIGNAL_SOURCES)[number];

// ── Root cause ──────────────────────────────────────────────────────────

export interface RootCause {
  summary: string;
  method: 'five_whys' | 'fishbone' | 'fault_tree' | 'direct' | 'other';
  depth: number;
  evidence_ids: string[];
  contributing_factors: string[];
}

// ── Recurrence ──────────────────────────────────────────────────────────

export interface RecurrenceRecord {
  pattern: string;
  occurrences: number;
  first_seen: string;
  last_seen: string;
  work_ids: string[];
  interval_days_avg: number | null;
}

// ── Change proposal ─────────────────────────────────────────────────────

export interface ChangeProposal {
  id: string;
  improvement_id: string;
  title: string;
  description: string;
  category: ImprovementCategory;
  before: string;
  after: string;
  risk: 'low' | 'medium' | 'high';
  reversible: boolean;
  affected_systems: string[];
  affected_agents: string[];
  affected_brands: string[];
  proposed_by: Actor;
  proposed_at: string;
  approval: {
    required_from: 'ceo' | 'myoho' | 'founder';
    decision: 'pending' | 'approved' | 'rejected';
    decided_by: Actor | null;
    decided_at: string | null;
    reason: string | null;
  };
}

// ── Benefit / economics ─────────────────────────────────────────────────

export interface ImprovementBenefit {
  type: 'time_saved' | 'error_reduction' | 'cost_reduction' | 'quality_improvement' | 'risk_reduction' | 'revenue_impact';
  description: string;
  estimated_value: string | null;
  measured_value: string | null;
  measurement_method: string | null;
}

// ── Before / after ──────────────────────────────────────────────────────

export interface BeforeAfter {
  dimension: string;
  before: string;
  after: string;
  measured: boolean;
}

// ── The canonical Improvement object ────────────────────────────────────

export interface Improvement {
  id: string;
  ref: string;
  work_id: string;
  category: ImprovementCategory;
  status: ImprovementStatus;
  signal_source: ImprovementSignalSource;

  title: string;
  description: string;
  priority: Priority;
  owner: Actor;
  brand: string | null;

  root_cause: RootCause | null;
  recurrence: RecurrenceRecord | null;
  change_proposal: ChangeProposal | null;
  benefits: ImprovementBenefit[];
  before_after: BeforeAfter[];
  ptm: PtmClassification | null;
  learning: Learning | null;

  prevention: { action: string; standardised: boolean; work_id: string | null }[];
  verification: { method: string; evidence_ids: string[]; verified_by: Actor; verified_at: string } | null;

  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

// ── Governance thresholds ───────────────────────────────────────────────

export interface ImprovementGovernance {
  requiresCeoReview: boolean;
  requiresMyohoReview: boolean;
  requiresFounderApproval: boolean;
  reason: string;
}
