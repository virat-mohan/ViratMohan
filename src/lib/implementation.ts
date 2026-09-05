// One-time implementation human-service model (hardening brief §33-37) —
// distinct from the AMC (ongoing) model in src/lib/amc.ts. This answers
// "who actually works on the 30-day build, how many people, how many
// hours" — shown to the customer alongside the AMC breakdown so the
// standard build price is backed by a visible team, not a bare number.

export const IMPLEMENTATION_ROLES = [
  'fde_client_lead',
  'solution_architect',
  'software_engineer',
  'ai_automation_engineer',
  'sme',
  'qa_uat',
] as const;
export type ImplementationRole = (typeof IMPLEMENTATION_ROLES)[number];

export const IMPLEMENTATION_ROLE_LABELS: Record<ImplementationRole, string> = {
  fde_client_lead: 'FDE / Client Lead',
  solution_architect: 'Solution Architect',
  software_engineer: 'Software Engineer',
  ai_automation_engineer: 'AI / Automation Engineer',
  sme: 'Subject Matter Expert',
  qa_uat: 'QA / UAT',
};

export type ImplementationHourEstimate = {
  role: ImplementationRole;
  people: number;
  hours: number;
  rationale: string;
};

export type ImplementationEstimate = {
  estimates: ImplementationHourEstimate[];
  overall_confidence_note: string;
};
