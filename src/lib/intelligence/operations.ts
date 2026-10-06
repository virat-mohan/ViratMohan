// Operation registry: every production model call has one named operation with its owning agent and task profile.
// The router, not the call site, chooses the model from this profile. Profiles describe the task as it runs today.
import type { TaskProfile } from './router';
import type { RequiredAuthority } from './invocation-gate';

export type OperationId =
  | 'llm.classify_and_build'
  | 'llm.suggest_framework'
  | 'llm.estimate_hours'
  | 'brain.routine'
  | 'brain.high_stakes'
  | 'chat.public_lead'
  | 'ledger.classify_message'
  | 'faq.reword_answer'
  | 'plan.business_plan'
  | 'design.direction';

export interface OperationSpec {
  agentId: string;
  profile: Omit<TaskProfile, 'agentId'>;
  /** Per-call ceiling on registry cost factor. */
  costCeilingFactor: number;
  /** Authorities whose approval is recorded in this registry for a recurring, pre-existing use. Virat reviews it here. */
  standingApproval?: RequiredAuthority[];
  basis: string;
}

const base = { dependentSteps: 0, systemsAffected: 1, reversible: true, autonomyLevel: 'L1' as const };

export const OPERATIONS: Record<OperationId, OperationSpec> = {
  'llm.classify_and_build': {
    agentId: 'DS-12', costCeilingFactor: 8,
    profile: { ...base, dependentSteps: 4, complexity: 'complex', risk: 'low', materiality: 'moderate', qualityRequirement: 'high', humanReview: true },
    basis: 'Nine-step demo build; artefact checked deterministically and reviewed by an admin before a client sees it (src/lib/llm.ts).',
  },
  'llm.suggest_framework': {
    agentId: 'DS-12', costCeilingFactor: 8,
    profile: { ...base, complexity: 'simple', risk: 'low', materiality: 'low', qualityRequirement: 'standard', humanReview: true, minimumTier: 'standard' },
    basis: 'Drafts a library entry; never auto-saved, admin edits every field. SONNET FLOOR: it needs factual recall, and a reviewer cannot easily see a plausible invented source or link. Rare call, so Haiku would save almost nothing.',
  },
  'llm.estimate_hours': {
    agentId: 'DS-13', costCeilingFactor: 8,
    profile: { ...base, complexity: 'moderate', risk: 'low', materiality: 'moderate', qualityRequirement: 'standard', humanReview: true, minimumTier: 'standard' },
    basis: 'AMC and implementation hour estimates behind a proposal price; each estimate is tagged known/assumed and shown to an admin. SONNET FLOOR: money-affecting reasoning, and a rare call.',
  },
  'brain.routine': {
    agentId: 'DS-14', costCeilingFactor: 8,
    profile: { ...base, complexity: 'simple', risk: 'low', materiality: 'low', qualityRequirement: 'standard', humanReview: false, minimumTier: 'standard' },
    basis: 'Routine Brain answer grounded in the knowledge store. SONNET FLOOR: partner- and customer-facing text that must hold a brand voice, with no human reading each answer.',
  },
  'brain.high_stakes': {
    agentId: 'DS-02', costCeilingFactor: 50, standingApproval: ['DS-02'],
    profile: { ...base, complexity: 'complex', risk: 'high', materiality: 'high', qualityRequirement: 'high', humanReview: true, minimumTier: 'elite' },
    basis: 'Pre-existing behaviour: high-stakes Brain questions run on Opus 5.5. Kept as is; Virat to confirm or lower the floor here.',
  },
  'chat.public_lead': {
    agentId: 'DS-12', costCeilingFactor: 8,
    profile: { ...base, complexity: 'simple', risk: 'medium', materiality: 'low', qualityRequirement: 'standard', humanReview: false },
    basis: 'Public lead chat. No human reads each reply, so risk is medium. Up to three rounds per message.',
  },
  'ledger.classify_message': {
    agentId: 'DS-13', costCeilingFactor: 8,
    profile: { ...base, complexity: 'simple', risk: 'low', materiality: 'moderate', qualityRequirement: 'standard', humanReview: true },
    basis: 'Fallback after rules fail; confidence capped at 0.85 and low confidence goes to a review queue (src/lib/ingest/whatsapp.ts). HAIKU SUFFICIENT: structured extraction from a short message, high volume, low cost of a miss. Routes to Haiku once Haiku is configured.',
  },
  'faq.reword_answer': {
    agentId: 'DS-14', costCeilingFactor: 8,
    profile: { ...base, complexity: 'simple', risk: 'low', materiality: 'low', qualityRequirement: 'standard', humanReview: true, minimumTier: 'standard' },
    basis: "Rewords Virat's own reply for the FAQ; shown to the admin before it is published. SONNET FLOOR: it must keep commercial terms off a public page; a miss costs Virat's review time, and the call is rare.",
  },
  'plan.business_plan': {
    agentId: 'DS-12', costCeilingFactor: 8,
    profile: { ...base, dependentSteps: 1, complexity: 'moderate', risk: 'low', materiality: 'moderate', qualityRequirement: 'high', humanReview: false },
    basis: 'Single structured pass with web search; drivers are clamped by applyStrategy afterwards. No human review assumed.',
  },
  'design.direction': {
    agentId: 'DS-11', costCeilingFactor: 8,
    profile: { ...base, complexity: 'moderate', risk: 'low', materiality: 'low', qualityRequirement: 'high', humanReview: false },
    basis: 'One design direction per call, three angles in parallel; hex values and URLs are sanitised after.',
  },
};
