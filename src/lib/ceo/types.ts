// DevShop CEO operating layer — types.
// The CEO is the company operating coordinator, not a chatbot.
// Pure contract: no framework, no network, no AI invocations.

import type { Actor, Authority, HumanCoverage, Priority, WorkItem, WorkState, WorkType, Scope, SourceChannel } from '../work/types';
import type { ControlTowerView } from '../control-tower/types';
import { ROLE_BINDINGS, holdersOf, type RoleBindings } from './roles';

// ── Agent registry ────────────────────────────────────────────────────────

export const CEO_ID = 'DS-02';
export const CEO: Actor = { kind: 'agent', id: CEO_ID };

export type AgentRole = 'ceo' | 'brand_ceo' | 'hod' | 'specialist' | 'guardian';

export interface AgentEntry {
  id: string;
  name: string;
  role: AgentRole;
  reports_to: string;
  scope: Scope | null;
  capabilities: string[];
}

export const AGENT_REGISTRY: AgentEntry[] = [
  { id: 'DS-00', name: 'Virat', role: 'ceo', reports_to: '', scope: null, capabilities: ['money', 'people', 'promises'] },
  { id: 'DS-01', name: 'Myoho', role: 'guardian', reports_to: 'DS-00', scope: null, capabilities: ['mission', 'values', 'voice', 'brand-book'] },
  { id: 'DS-02', name: 'Dev', role: 'ceo', reports_to: 'DS-01', scope: null, capabilities: ['operations', 'coordination', 'delegation', 'monitoring'] },
  { id: 'MG-01', name: 'Moon', role: 'brand_ceo', reports_to: 'DS-02', scope: { kind: 'brand', brand: 'moonglasses', founder: null, system: null, extension: null }, capabilities: ['brand-operations'] },
  { id: 'TC-01', name: 'Trav', role: 'brand_ceo', reports_to: 'DS-02', scope: { kind: 'brand', brand: 'caps', founder: null, system: null, extension: null }, capabilities: ['brand-operations'] },
  { id: 'CK-01', name: 'Cera', role: 'brand_ceo', reports_to: 'DS-02', scope: { kind: 'brand', brand: 'ceremony', founder: null, system: null, extension: null }, capabilities: ['brand-operations'] },
  { id: 'FP-01', name: 'Paws', role: 'brand_ceo', reports_to: 'DS-02', scope: { kind: 'brand', brand: 'freshforpaws', founder: null, system: null, extension: null }, capabilities: ['brand-operations'] },
  { id: 'KB-01', name: 'Kor', role: 'brand_ceo', reports_to: 'DS-02', scope: { kind: 'brand', brand: 'korbi', founder: null, system: null, extension: null }, capabilities: ['brand-operations'] },
  { id: 'DS-10', name: 'Check', role: 'hod', reports_to: 'DS-02', scope: null, capabilities: ['quality', 'health-checks', 'audits'] },
  { id: 'DS-11', name: 'Grow', role: 'hod', reports_to: 'DS-02', scope: null, capabilities: ['growth', 'content', 'launches', 'social'] },
  { id: 'DS-12', name: 'Deal', role: 'hod', reports_to: 'DS-02', scope: null, capabilities: ['sales', 'leads', 'NDAs', 'proposals'] },
  { id: 'DS-13', name: 'Books', role: 'hod', reports_to: 'DS-02', scope: null, capabilities: ['finance', 'invoices', 'statements', 'P&L'] },
  { id: 'DS-14', name: 'Care', role: 'hod', reports_to: 'DS-02', scope: null, capabilities: ['customer-care', 'whatsapp-inbox', 'FAQ'] },
  { id: 'DS-15', name: 'Crew', role: 'hod', reports_to: 'DS-02', scope: null, capabilities: ['team', 'ops-checklist'] },
];

export function findAgent(id: string): AgentEntry | undefined {
  return AGENT_REGISTRY.find((a) => a.id === id);
}

export function brandCeoFor(brandKey: string): AgentEntry | undefined {
  return AGENT_REGISTRY.find((a) => a.role === 'brand_ceo' && a.scope?.brand === brandKey);
}

export function directReports(managerId: string): AgentEntry[] {
  return AGENT_REGISTRY.filter((a) => a.reports_to === managerId);
}

// ── Autonomy model ────────────────────────────────────────────────────────

export type AutonomyLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export interface AutonomyGrant {
  capability: string;
  level: AutonomyLevel;
  limits?: Record<string, unknown>;
  holder: string;
}

export const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  L0: 'Observe',
  L1: 'Recommend',
  L2: 'Bounded execution',
  L3: 'Autonomous',
  L4: 'Human decision',
};

export const CEO_AUTONOMY: AutonomyGrant[] = [
  { capability: 'create-work', level: 'L2', holder: CEO_ID },
  { capability: 'assign-work', level: 'L2', holder: CEO_ID, limits: { restrictedRoles: ['technical_deployment_officer'] } },
  { capability: 'triage-work', level: 'L2', holder: CEO_ID },
  { capability: 'prioritise-work', level: 'L1', holder: CEO_ID },
  { capability: 'apply-priority-rules', level: 'L3', holder: CEO_ID },
  { capability: 'escalate-work', level: 'L2', holder: CEO_ID },
  { capability: 'monitor-work', level: 'L3', holder: CEO_ID },
  { capability: 'detect-exceptions', level: 'L3', holder: CEO_ID },
  { capability: 'coordinate-agents', level: 'L2', holder: CEO_ID },
  { capability: 'report-to-founder', level: 'L2', holder: CEO_ID },
  { capability: 'approve-spend', level: 'L4', holder: 'DS-00' },
  { capability: 'approve-pricing', level: 'L4', holder: 'DS-00' },
  { capability: 'approve-outbound-comms', level: 'L4', holder: 'DS-00' },
  { capability: 'approve-restricted-assignment', level: 'L4', holder: 'DS-00' },
  { capability: 'approve-terms-legal', level: 'L4', holder: 'DS-00' },
  { capability: 'approve-irreversible', level: 'L4', holder: 'DS-00' },
];

export function autonomyFor(capability: string): AutonomyGrant | undefined {
  return CEO_AUTONOMY.find((g) => g.capability === capability);
}

export function canActAutonomously(capability: string): boolean {
  const grant = autonomyFor(capability);
  return !!grant && (grant.level === 'L2' || grant.level === 'L3');
}

// ── Communication context ─────────────────────────────────────────────────

export type CommType =
  | 'context'
  | 'question'
  | 'instruction'
  | 'approval'
  | 'decision'
  | 'work_request'
  | 'incident_evidence'
  | 'relationship'
  | 'other';

export type CommChannel = 'email' | 'whatsapp' | 'command_centre' | 'slack' | 'internal';

export interface CommMessage {
  id: string;
  channel: CommChannel;
  from: Actor;
  to: Actor | null;
  at: string;
  type: CommType;
  brand: string | null;
  work_id: string | null;
  thread_id: string | null;
  summary: string;
  raw_ref: string | null;
}

// ── Question/clarification model (within Work) ────────────────────────────

export type QuestionStatus = 'open' | 'answered' | 'superseded';

export type QuestionRouting = 'technical' | 'brand' | 'financial' | 'strategic' | 'technical_deployment' | 'legal';

export interface WorkQuestion {
  id: string;
  work_id: string;
  asked_by: Actor;
  asked_at: string;
  question: string;
  routing: QuestionRouting;
  routed_to: Actor | null;
  status: QuestionStatus;
  answer: string | null;
  answered_by: Actor | null;
  answered_at: string | null;
}

export function routeQuestion(routing: QuestionRouting, bindings: RoleBindings = ROLE_BINDINGS): string {
  switch (routing) {
    case 'technical': return 'DS-02';
    case 'brand': return 'DS-02';
    case 'financial': return 'DS-13';
    case 'strategic': return 'DS-00';
    case 'technical_deployment': return holdersOf('technical_deployment_officer', bindings)[0]?.actor.id ?? 'DS-00';
    case 'legal': return 'DS-00';
  }
}

// ── Morning Board ─────────────────────────────────────────────────────────

export interface MorningBoardItem {
  category: 'decision_required' | 'critical_incident' | 'blocked_work' | 'overdue_work' |
    'unresolved_approval' | 'cost_anomaly' | 'brand_risk' | 'opportunity' | 'proof_result';
  priority: Priority | null;
  brand: string | null;
  title: string;
  summary: string;
  work_id: string | null;
  action_required: string | null;
  evidence_ref: string | null;
}

export interface MorningBoard {
  date: string;
  items: MorningBoardItem[];
  total_open_work: number;
  critical_count: number;
  blocked_count: number;
  pending_approval_count: number;
  brands_with_issues: string[];
}

// ── CEO audit categories ──────────────────────────────────────────────────

export type AuditCategory =
  | 'open_work'
  | 'overdue_work'
  | 'blocked_work'
  | 'waiting_work'
  | 'unassigned_work'
  | 'recurring_incidents'
  | 'unresolved_approvals'
  | 'unclear_ownership'
  | 'customer_revenue_risk'
  | 'security_risk'
  | 'cross_brand_patterns'
  | 'cost_anomalies';

// ── Responsible technology economics ──────────────────────────────────────

export interface TechCostGuardrail {
  rule: string;
  check: string;
}

export const TECH_COST_GUARDRAILS: TechCostGuardrail[] = [
  { rule: 'deterministic-first', check: 'Use lookup/formula/template before invoking an LLM' },
  { rule: 'least-expensive-model', check: 'Haiku for classification, Sonnet for generation, Opus for reasoning' },
  { rule: 'no-unnecessary-invocation', check: 'Batch, cache, skip where redundant' },
  { rule: 'bounded-retries', check: 'Every automated action has a retry limit and circuit breaker' },
  { rule: 'attributable-usage', check: 'Every API call tagged to brand + task + agent' },
  { rule: 'prevent-runaway', check: 'No uncontrolled loops, no duplicate tool/API calls' },
];
