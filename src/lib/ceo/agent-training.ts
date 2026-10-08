// Agent Training & Certification: track competence, training status, and certification
// for every agent in the registry. Pure deterministic logic, no AI.
//
// Lifecycle: TRAINING_REQUIRED → TRAINING → ASSESSMENT → CERTIFIED_L1 → CERTIFIED_L2 → AUTONOMOUS_L3
// L3 requires demonstrated competence + policy approval + capability-specific authority.
// Certification does not override the L0-L4 autonomy grants in CEO_AUTONOMY.
//
// Database: migrations/0057_agent_training_people.sql (agent_passports, agent_assessments).
// This module is the logic layer. DB reads/writes happen through the persistence functions
// which accept a generic store interface, keeping this module free of Supabase imports.

import { AGENT_REGISTRY, type AgentEntry } from './types';

export const CERT_LEVELS = ['TRAINING_REQUIRED', 'TRAINING', 'ASSESSMENT', 'CERTIFIED_L1', 'CERTIFIED_L2', 'AUTONOMOUS_L3'] as const;
export type CertLevel = (typeof CERT_LEVELS)[number];

export interface TrainingModule {
  id: string;
  name: string;
  domain: string;
  topics: string[];
}

export interface AssessmentScenario {
  id: string;
  module_id: string;
  role_or_agent: string;
  description: string;
  expected_outcome: string;
  verification: string;
}

export interface AssessmentResult {
  scenario_id: string;
  passed: boolean;
  evidence: string;
  assessed_at: string;
  assessed_by: string;
}

export interface AgentPassport {
  agent_id: string;
  agent_name: string;
  role: string;
  reports_to: string;
  mandate: string;
  kras: string[];
  kpis: string[];
  capabilities: string[];
  brand_permissions: string[];
  certification: CertLevel;
  training_modules: TrainingModule[];
  assessments: AssessmentResult[];
  gaps: string[];
  version: string;
  updated_at: string;
}

// ── Persistence interface ────────────────────────────────────────────────────

export interface TrainingStore {
  loadPassport(agentId: string): Promise<{ certification: CertLevel; assessments: AssessmentResult[] } | null>;
  savePassport(passport: AgentPassport): Promise<void>;
  saveAssessment(agentId: string, result: AssessmentResult): Promise<void>;
}

// ── Role training specs ──────────────────────────────────────────────────────

const ROLE_TRAINING: Record<string, TrainingModule[]> = {
  ceo: [
    { id: 'CEO-01', name: 'Strategy & Prioritisation', domain: 'strategy', topics: ['capital allocation', 'resource allocation', 'prioritisation frameworks', 'risk assessment', 'decision-making'] },
    { id: 'CEO-02', name: 'Organisation & Delegation', domain: 'operations', topics: ['agent coordination', 'human coordination', 'competence assessment', 'authority management', 'escalation'] },
    { id: 'CEO-03', name: 'Company Economics', domain: 'finance', topics: ['unit economics', 'contribution margin', 'CAC/LTV', 'working capital', 'budget variance'] },
    { id: 'CEO-04', name: 'Operating Cadence', domain: 'operations', topics: ['daily meeting', 'weekly results', 'monday reporting', 'commitment tracking', 'performance review'] },
  ],
  brand_ceo: [
    { id: 'BC-01', name: 'Brand Operations', domain: 'brand', topics: ['commerce', 'catalogue', 'inventory', 'fulfilment', 'customer service'] },
    { id: 'BC-02', name: 'Brand Growth', domain: 'growth', topics: ['acquisition', 'retention', 'channel strategy', 'content', 'attribution'] },
    { id: 'BC-03', name: 'Brand Finance', domain: 'finance', topics: ['contribution profit', 'unit economics', 'cost control', 'GST compliance'] },
    { id: 'BC-04', name: 'Brand Reporting', domain: 'reporting', topics: ['daily update', 'weekly results', 'KPI tracking', 'anomaly detection'] },
  ],
  hod: [
    { id: 'HOD-01', name: 'Functional Leadership', domain: 'management', topics: ['scope ownership', 'cross-brand coordination', 'escalation', 'reporting'] },
  ],
  guardian: [
    { id: 'GD-01', name: 'Governance & Principles', domain: 'governance', topics: ['mission alignment', 'values enforcement', 'brand-book compliance', 'voice consistency'] },
  ],
  specialist: [
    { id: 'SP-01', name: 'Specialist Competence', domain: 'specialist', topics: ['domain expertise', 'quality standards', 'tooling', 'measurement'] },
  ],
};

// ── Function-specific training ───────────────────────────────────────────────

const FUNCTION_TRAINING: Record<string, TrainingModule[]> = {
  'DS-13': [
    { id: 'CFO-01', name: 'Financial Reporting', domain: 'finance', topics: ['P&L', 'balance sheet', 'cash flow', 'GST', 'ITC', 'COGS', 'contribution margins'] },
    { id: 'CFO-02', name: 'Financial Controls', domain: 'finance', topics: ['budgets', 'forecasting', 'variance analysis', 'working capital', 'unit economics'] },
  ],
  'DS-11': [
    { id: 'CMO-01', name: 'Growth Strategy', domain: 'marketing', topics: ['brand positioning', 'ICP', 'acquisition', 'channel strategy', 'CAC', 'LTV', 'retention'] },
    { id: 'CMO-02', name: 'Campaign Operations', domain: 'marketing', topics: ['funnel conversion', 'ROAS', 'attribution', 'creative strategy', 'experimentation'] },
  ],
  'DS-12': [
    { id: 'CSO-01', name: 'Sales Operations', domain: 'sales', topics: ['qualification', 'pipeline', 'proposals', 'pricing', 'negotiation', 'conversion', 'forecasting'] },
  ],
  'DS-14': [
    { id: 'CCO-01', name: 'Customer Operations', domain: 'customer', topics: ['service standards', 'whatsapp inbox', 'FAQ management', 'CSAT', 'resolution quality'] },
  ],
  'DS-15': [
    { id: 'CHRO-01', name: 'People Operations', domain: 'people', topics: ['hiring', 'workforce planning', 'role design', 'performance management', 'training'] },
  ],
  'DS-10': [
    { id: 'QA-01', name: 'Quality & Observability', domain: 'quality', topics: ['health checks', 'audits', 'compliance', 'anomaly detection', 'standards enforcement'] },
  ],
  'DS-17': [
    { id: 'IMP-01', name: 'Process Improvement', domain: 'improvement', topics: ['detection', 'recurrence analysis', 'root cause', 'change proposal', 'PTM classification', 'standardisation'] },
  ],
};

// ── Assessment scenarios per function ────────────────────────────────────────

export const ASSESSMENT_SCENARIOS: AssessmentScenario[] = [
  // CFO (DS-13)
  { id: 'CFO-A01', module_id: 'CFO-01', role_or_agent: 'DS-13', description: 'Analyse a monthly P&L: identify COGS, contribution margin and GST liability from raw transaction data', expected_outcome: 'Correct margin calculation within 1% of source, GST separated', verification: 'Compare against manual calculation from same source data' },
  { id: 'CFO-A02', module_id: 'CFO-02', role_or_agent: 'DS-13', description: 'Detect a budget variance above 10% and recommend corrective action', expected_outcome: 'Variance identified, root cause stated, action plan with timeline', verification: 'Variance confirmed against ledger; action plan is actionable' },
  { id: 'CFO-A03', module_id: 'CFO-01', role_or_agent: 'DS-13', description: 'Calculate unit economics (CAC, LTV, contribution per order) for a brand from 30 days of order and ad-spend data', expected_outcome: 'Correct per-unit metrics, sourced from actual data', verification: 'Cross-check against raw orders and ad-spend records' },

  // CMO (DS-11)
  { id: 'CMO-A01', module_id: 'CMO-01', role_or_agent: 'DS-11', description: 'Diagnose why a brand\'s traffic dropped 20% week-over-week and propose a recovery plan', expected_outcome: 'Root cause identified from analytics data, recovery plan with channel-specific actions', verification: 'Root cause traceable to a measurable change; plan addresses it' },
  { id: 'CMO-A02', module_id: 'CMO-02', role_or_agent: 'DS-11', description: 'Evaluate a campaign\'s ROAS (ex-GST) and recommend whether to scale, optimise or cut', expected_outcome: 'Correct ROAS calculation, decision justified with threshold comparison', verification: 'ROAS matches raw ad-spend and revenue data' },
  { id: 'CMO-A03', module_id: 'CMO-01', role_or_agent: 'DS-11', description: 'Build an acquisition channel mix recommendation for a new brand launch with ₹50K monthly budget', expected_outcome: 'Channel allocation with expected CAC per channel, measurement plan', verification: 'Allocations sum to budget; CAC estimates have stated basis' },

  // CSO / Sales (DS-12)
  { id: 'CSO-A01', module_id: 'CSO-01', role_or_agent: 'DS-12', description: 'Qualify an inbound lead: assess fit, intent, readiness and recommend next action', expected_outcome: 'Qualification scored with evidence, next action assigned', verification: 'Qualification criteria applied consistently to lead data' },
  { id: 'CSO-A02', module_id: 'CSO-01', role_or_agent: 'DS-12', description: 'Forecast pipeline conversion for the next 30 days from current lead stages', expected_outcome: 'Stage-weighted forecast with confidence intervals', verification: 'Historical conversion rates used as basis, not invented' },

  // CCO / Customer (DS-14)
  { id: 'CCO-A01', module_id: 'CCO-01', role_or_agent: 'DS-14', description: 'Triage 10 WhatsApp customer messages by urgency and draft responses following brand voice', expected_outcome: 'Messages categorised, responses drafted in brand voice, urgent items flagged', verification: 'Triage matches urgency criteria; responses pass brand voice check' },

  // CHRO / People (DS-15)
  { id: 'CHRO-A01', module_id: 'CHRO-01', role_or_agent: 'DS-15', description: 'Review a worker\'s task completion over 14 days and identify SLA breaches with root causes', expected_outcome: 'SLA breaches listed with contributing factors separated (worker vs dependency)', verification: 'Breaches confirmed against task timestamps; causes traceable' },

  // QA (DS-10)
  { id: 'QA-A01', module_id: 'QA-01', role_or_agent: 'DS-10', description: 'Run a health check on a brand store and classify every failure by severity and owner', expected_outcome: 'Failures listed with severity, owner, remediation', verification: 'Each failure reproducible; severity consistent with standards' },

  // Improvement (DS-17)
  { id: 'IMP-A01', module_id: 'IMP-01', role_or_agent: 'DS-17', description: 'Detect a recurring issue pattern from 30 days of work items and propose a process change', expected_outcome: 'Pattern identified with frequency, root cause analysis, proposed standard', verification: 'Pattern confirmed in data; proposal addresses root cause' },

  // Visual QA / Guard (DS-16)
  { id: 'GRD-A01', module_id: 'SP-01', role_or_agent: 'DS-16', description: 'Audit a brand store page against the brand book for visual consistency, voice and platform compliance', expected_outcome: 'Deviations listed with brand-book references, severity and fix', verification: 'Each deviation matches a specific brand-book rule' },

  // CEO (DS-02)
  { id: 'CEO-A01', module_id: 'CEO-01', role_or_agent: 'DS-02', description: 'Prioritise 5 competing work items across brands using resource constraints and risk assessment', expected_outcome: 'Ranked list with rationale, resource allocation, risk-adjusted', verification: 'Priorities consistent with stated constraints and urgency criteria' },
  { id: 'CEO-A02', module_id: 'CEO-02', role_or_agent: 'DS-02', description: 'Select the right agent for a cross-functional task, verify authority, and create the work assignment', expected_outcome: 'Agent selected with competence justification, authority verified, work item created', verification: 'Agent\'s capabilities match task; authority level sufficient' },

  // Brand CEO (any brand_ceo)
  { id: 'BC-A01', module_id: 'BC-01', role_or_agent: 'brand_ceo', description: 'Investigate a sudden drop in daily orders and identify whether it is a traffic, conversion or inventory issue', expected_outcome: 'Root cause isolated to one domain with supporting metrics', verification: 'Metrics cited are from actual data sources, not invented' },
  { id: 'BC-A02', module_id: 'BC-03', role_or_agent: 'brand_ceo', description: 'Calculate weekly contribution profit including COGS, shipping, ad spend (ex-GST) and platform fees', expected_outcome: 'Correct contribution profit figure with line-item breakdown', verification: 'Each line item traceable to a source record' },

  // Guardian (DS-01)
  { id: 'GD-A01', module_id: 'GD-01', role_or_agent: 'DS-01', description: 'Review a proposed marketing message for mission alignment and values compliance', expected_outcome: 'Alignment assessment with specific references to mission/values, pass/fail with reasons', verification: 'References point to actual mission/values statements' },
];

export function scenariosForAgent(agentId: string): AssessmentScenario[] {
  const agent = AGENT_REGISTRY.find((a) => a.id === agentId);
  if (!agent) return [];
  return ASSESSMENT_SCENARIOS.filter((s) => s.role_or_agent === agentId || s.role_or_agent === agent.role);
}

// ── Mandate and KRA definitions ──────────────────────────────────────────────

function mandateFor(agent: AgentEntry): string {
  if (agent.id === 'DS-00') return 'Founder: money, people, promises and irreversible decisions';
  if (agent.id === 'DS-01') return 'Guardian of mission, values, voice and brand book';
  if (agent.id === 'DS-02') return 'CEO: run the organisation, coordinate agents and humans, report to founder';
  if (agent.role === 'brand_ceo') return `Brand CEO: full operational responsibility for ${agent.scope?.brand ?? 'brand'}`;
  if (agent.id === 'DS-10') return 'Quality, health checks and audits across all brands';
  if (agent.id === 'DS-11') return 'Growth, content, launches and social across all brands';
  if (agent.id === 'DS-12') return 'Sales, leads, NDAs and proposals';
  if (agent.id === 'DS-13') return 'Finance, invoices, statements and P&L';
  if (agent.id === 'DS-14') return 'Customer care, WhatsApp inbox and FAQ';
  if (agent.id === 'DS-15') return 'Team operations and ops checklists';
  if (agent.id === 'DS-16') return 'Visual QA, brand guardian, design review and platform compliance';
  if (agent.id === 'DS-17') return 'Process improvement, detection, root cause analysis and standardisation';
  return agent.capabilities.join(', ');
}

function krasFor(agent: AgentEntry): string[] {
  if (agent.role === 'brand_ceo') return ['Weekly contribution profit', 'Order fulfilment rate', 'Customer satisfaction', 'Inventory accuracy', 'Growth rate'];
  if (agent.id === 'DS-02') return ['Company operating efficiency', 'Agent coordination quality', 'Founder response time', 'Work completion rate', 'Learning velocity'];
  if (agent.id === 'DS-13') return ['Financial accuracy', 'Reporting timeliness', 'Cash flow visibility', 'Compliance'];
  if (agent.id === 'DS-11') return ['Traffic growth', 'Conversion rate', 'CAC efficiency', 'ROAS', 'Organic share'];
  if (agent.id === 'DS-12') return ['Pipeline conversion', 'Proposal win rate', 'Revenue per lead', 'Time to close'];
  if (agent.id === 'DS-14') return ['Resolution quality', 'Response time', 'CSAT', 'FAQ coverage'];
  if (agent.id === 'DS-15') return ['Task completion rate', 'SLA adherence', 'Workforce readiness', 'Onboarding speed'];
  if (agent.id === 'DS-10') return ['Health check pass rate', 'Audit coverage', 'Anomaly detection speed', 'Standards compliance'];
  if (agent.id === 'DS-16') return ['Brand-book compliance rate', 'Visual consistency', 'Platform compliance', 'Review turnaround'];
  if (agent.id === 'DS-17') return ['Improvement detection rate', 'Recurrence reduction', 'Root cause resolution', 'Process standardisation'];
  return ['Domain coverage', 'Quality standards', 'Response timeliness'];
}

// ── Certification derivation ─────────────────────────────────────────────────

export function deriveCertification(modules: TrainingModule[], assessments: AssessmentResult[]): CertLevel {
  if (modules.length === 0) return 'TRAINING_REQUIRED';
  if (assessments.length === 0) return 'TRAINING_REQUIRED';
  const passed = assessments.filter((a) => a.passed);
  const scenarioIds = new Set(passed.map((a) => a.scenario_id));
  const modulesCovered = new Set(passed.map((a) => {
    const scenario = ASSESSMENT_SCENARIOS.find((s) => s.id === a.scenario_id);
    return scenario?.module_id;
  }).filter(Boolean));
  const allModulesCovered = modules.every((m) => modulesCovered.has(m.id));
  if (allModulesCovered && scenarioIds.size >= modules.length * 2) return 'AUTONOMOUS_L3';
  if (allModulesCovered) return 'CERTIFIED_L2';
  if (modulesCovered.size >= Math.ceil(modules.length / 2)) return 'CERTIFIED_L1';
  if (passed.length > 0) return 'ASSESSMENT';
  return 'TRAINING';
}

export function computeGaps(modules: TrainingModule[], assessments: AssessmentResult[]): string[] {
  const gaps: string[] = [];
  const passedModules = new Set<string>();
  for (const a of assessments.filter((r) => r.passed)) {
    const scenario = ASSESSMENT_SCENARIOS.find((s) => s.id === a.scenario_id);
    if (scenario) passedModules.add(scenario.module_id);
  }
  for (const m of modules) {
    if (!passedModules.has(m.id)) {
      gaps.push(`${m.name} (${m.id}): no passed assessment`);
    }
  }
  if (assessments.length === 0 && modules.length > 0) {
    gaps.push('No assessment completed — training required');
  }
  return gaps;
}

// ── Passport building ────────────────────────────────────────────────────────

export function buildPassport(agent: AgentEntry, now: Date = new Date(), storedAssessments?: AssessmentResult[]): AgentPassport {
  const roleModules = ROLE_TRAINING[agent.role] ?? [];
  const functionModules = FUNCTION_TRAINING[agent.id] ?? [];
  const allModules = [...roleModules, ...functionModules];
  const assessments = storedAssessments ?? [];
  const certification = deriveCertification(allModules, assessments);
  const gaps = computeGaps(allModules, assessments);

  return {
    agent_id: agent.id,
    agent_name: agent.name,
    role: agent.role,
    reports_to: agent.reports_to,
    mandate: mandateFor(agent),
    kras: krasFor(agent),
    kpis: agent.capabilities,
    capabilities: agent.capabilities,
    brand_permissions: agent.scope?.brand ? [agent.scope.brand] : [],
    certification,
    training_modules: allModules,
    assessments,
    gaps,
    version: '1.0.0',
    updated_at: now.toISOString(),
  };
}

export function buildAllPassports(now: Date = new Date(), storedAssessments?: Map<string, AssessmentResult[]>): AgentPassport[] {
  return AGENT_REGISTRY.map((a) => buildPassport(a, now, storedAssessments?.get(a.id)));
}

export function certificationSummary(now: Date = new Date(), storedAssessments?: Map<string, AssessmentResult[]>): Array<{
  agent_id: string;
  agent_name: string;
  role: string;
  certification: CertLevel;
  training_modules: number;
  assessments_passed: number;
  gaps: number;
  scenarios_available: number;
}> {
  return AGENT_REGISTRY.map((a) => {
    const p = buildPassport(a, now, storedAssessments?.get(a.id));
    return {
      agent_id: a.id,
      agent_name: a.name,
      role: a.role,
      certification: p.certification,
      training_modules: p.training_modules.length,
      assessments_passed: p.assessments.filter((r) => r.passed).length,
      gaps: p.gaps.length,
      scenarios_available: scenariosForAgent(a.id).length,
    };
  });
}

export function canExerciseAutonomy(agentId: string, requiredLevel: CertLevel, storedAssessments?: AssessmentResult[]): boolean {
  const agent = AGENT_REGISTRY.find((a) => a.id === agentId);
  if (!agent) return false;
  const passport = buildPassport(agent, undefined, storedAssessments);
  const currentIdx = CERT_LEVELS.indexOf(passport.certification);
  const requiredIdx = CERT_LEVELS.indexOf(requiredLevel);
  return currentIdx >= requiredIdx;
}

export function trainingModulesFor(agentId: string): TrainingModule[] {
  const agent = AGENT_REGISTRY.find((a) => a.id === agentId);
  if (!agent) return [];
  return [...(ROLE_TRAINING[agent.role] ?? []), ...(FUNCTION_TRAINING[agentId] ?? [])];
}
