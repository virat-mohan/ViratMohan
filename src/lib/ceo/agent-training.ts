// Agent Training & Certification: track competence, training status, and certification
// for every agent in the registry. Pure deterministic logic, no AI.
//
// Lifecycle: TRAINING_REQUIRED → TRAINING → ASSESSMENT → CERTIFIED_L1 → CERTIFIED_L2 → AUTONOMOUS_L3
// L3 requires demonstrated competence + policy approval + capability-specific authority.
// Certification does not override the L0-L4 autonomy grants in CEO_AUTONOMY.

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
  description: string;
  expected_outcome: string;
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

// Functional training specifications per role
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

// Role-specific deep training
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
  return ['Domain coverage', 'Quality standards', 'Response timeliness'];
}

export function buildPassport(agent: AgentEntry, now: Date = new Date()): AgentPassport {
  const roleModules = ROLE_TRAINING[agent.role] ?? [];
  const functionModules = FUNCTION_TRAINING[agent.id] ?? [];
  const allModules = [...roleModules, ...functionModules];
  const gaps = allModules.length > 0 ? ['No assessment completed — training required'] : [];

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
    certification: 'TRAINING_REQUIRED',
    training_modules: allModules,
    assessments: [],
    gaps,
    version: '1.0.0',
    updated_at: now.toISOString(),
  };
}

export function buildAllPassports(now: Date = new Date()): AgentPassport[] {
  return AGENT_REGISTRY.map((a) => buildPassport(a, now));
}

export function certificationSummary(now: Date = new Date()): Array<{
  agent_id: string;
  agent_name: string;
  role: string;
  certification: CertLevel;
  training_modules: number;
  assessments_passed: number;
  gaps: number;
}> {
  return AGENT_REGISTRY.map((a) => {
    const p = buildPassport(a, now);
    return {
      agent_id: a.id,
      agent_name: a.name,
      role: a.role,
      certification: p.certification,
      training_modules: p.training_modules.length,
      assessments_passed: p.assessments.filter((r) => r.passed).length,
      gaps: p.gaps.length,
    };
  });
}

export function canExerciseAutonomy(agentId: string, requiredLevel: CertLevel): boolean {
  const agent = AGENT_REGISTRY.find((a) => a.id === agentId);
  if (!agent) return false;
  const passport = buildPassport(agent);
  const currentIdx = CERT_LEVELS.indexOf(passport.certification);
  const requiredIdx = CERT_LEVELS.indexOf(requiredLevel);
  return currentIdx >= requiredIdx;
}
