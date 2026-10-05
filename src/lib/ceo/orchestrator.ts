// CEO Runtime → Work Registry orchestrator.
// Deterministic pipeline: Founder Input → classify → context → authority → response → proposed action.
// No AI invocations. No external execution. No network. No side effects beyond Work Registry mutations.

import type { InMemoryWorkRegistry } from '../work/registry';
import type { Actor, WorkItem, Scope } from '../work/types';
import { Scopes } from '../work/scope';
import { CEO, CEO_ID, brandCeoFor } from './types';
import type { FounderInput } from './founder-input';
import { classifyFounderInput } from './founder-input';
import { buildContextPack, type ContextPack } from './context-pack';
import { checkAuthority, requiredCapabilityForInput, canCeoAssign, type AuthorityVerdict } from './authority';
import { buildCeoResponse, type CeoResponse } from './response';
import { findExistingWork, suggestOwner } from './coordinator';

export type OrchestratorOutcomeKind =
  | 'work_created'
  | 'work_updated'
  | 'work_found'
  | 'approval_recorded'
  | 'decision_recorded'
  | 'evidence_attached'
  | 'question_answered'
  | 'delegated'
  | 'acknowledged'
  | 'escalated';

export interface OrchestratorOutcome {
  kind: OrchestratorOutcomeKind;
  input: FounderInput;
  context: ContextPack;
  response: CeoResponse;
  authority: AuthorityVerdict;
  workItem: WorkItem | null;
  summary: string;
  mutationApplied: boolean;
  escalationRequired: boolean;
  nextStep: string;
}

export interface OrchestratorContext {
  now?: Date;
}

export function processFounderInput(
  input: FounderInput,
  registry: InMemoryWorkRegistry,
  opts: OrchestratorContext = {},
): OrchestratorOutcome {
  const now = opts.now ?? new Date();

  const context = buildContextPack(input, registry, now);
  const response = buildCeoResponse(context);
  const capability = requiredCapabilityForInput(input);
  const authority = checkAuthority(capability);

  switch (response.kind) {
    case 'acknowledge':
      return acknowledgeOutcome(input, context, response, authority);

    case 'answer':
      return answerOutcome(input, context, response, authority);

    case 'attach_to_work':
      return attachOutcome(input, context, response, authority, registry, now);

    case 'act':
      return actOutcome(input, context, response, authority, registry, now);

    case 'recommend':
      return recommendOutcome(input, context, response, authority);

    case 'escalate':
      return escalateOutcome(input, context, response, authority, registry, now);

    case 'delegate':
      return delegateOutcome(input, context, response, authority, registry, now);
  }
}

function acknowledgeOutcome(
  input: FounderInput, context: ContextPack, response: CeoResponse, authority: AuthorityVerdict,
): OrchestratorOutcome {
  const kind: OrchestratorOutcomeKind = input.kind === 'decision' ? 'decision_recorded' : 'acknowledged';
  return {
    kind,
    input, context, response, authority,
    workItem: null,
    summary: response.summary,
    mutationApplied: false,
    escalationRequired: false,
    nextStep: response.nextStep,
  };
}

function answerOutcome(
  input: FounderInput, context: ContextPack, response: CeoResponse, authority: AuthorityVerdict,
): OrchestratorOutcome {
  return {
    kind: 'question_answered',
    input, context, response, authority,
    workItem: context.relatedWork[0] ?? null,
    summary: response.summary,
    mutationApplied: false,
    escalationRequired: false,
    nextStep: response.nextStep,
  };
}

function attachOutcome(
  input: FounderInput, context: ContextPack, response: CeoResponse, authority: AuthorityVerdict,
  registry: InMemoryWorkRegistry, now: Date,
): OrchestratorOutcome {
  const workId = input.work_id ?? context.relatedWork[0]?.id ?? null;
  let workItem: WorkItem | null = null;
  let mutationApplied = false;

  if (workId) {
    const result = registry.addEvidence(workId, {
      kind: 'note',
      ref: `founder-input:${input.id}`,
      summary: input.text,
    }, input.from);
    if (result.ok) {
      mutationApplied = true;
    }
    workItem = registry.list().find((i) => i.id === workId) ?? null;
  }

  return {
    kind: 'evidence_attached',
    input, context, response, authority,
    workItem,
    summary: workItem ? `Evidence attached to ${workItem.ref}` : 'No matching work found for evidence',
    mutationApplied,
    escalationRequired: false,
    nextStep: workItem ? `Evidence recorded on ${workItem.ref}` : 'Clarify which work this relates to',
  };
}

function actOutcome(
  input: FounderInput, context: ContextPack, response: CeoResponse, authority: AuthorityVerdict,
  registry: InMemoryWorkRegistry, now: Date,
): OrchestratorOutcome {
  if (!authority.allowed) {
    return recommendOutcome(input, context, response, authority);
  }

  if (context.relatedWork.length > 0) {
    const existing = context.relatedWork[0];
    return {
      kind: 'work_found',
      input, context, response, authority,
      workItem: existing,
      summary: `Existing work: ${existing.ref} "${existing.title}" (${existing.state})`,
      mutationApplied: false,
      escalationRequired: false,
      nextStep: `Update ${existing.ref}`,
    };
  }

  const scope = input.scope ?? Scopes.devshop();
  const owner = resolveWorkOwner(input, scope);

  if (owner) {
    const assignCheck = canCeoAssign(owner);
    if (!assignCheck.allowed) {
      return {
        kind: 'escalated',
        input, context, response, authority,
        workItem: null,
        summary: `Cannot assign to ${owner.id}: ${(assignCheck as any).reason}`,
        mutationApplied: false,
        escalationRequired: true,
        nextStep: `Approval required before assigning to ${owner.id}`,
      };
    }
  }

  const result = registry.createItem({
    title: input.text,
    description: `Founder input: ${input.text}`,
    type: input.kind === 'instruction' ? 'task' : 'request',
    level: 'work_item',
    scope,
    source: { channel: 'founder_request', requester: input.from },
  }, CEO);

  if (!result.ok) {
    return {
      kind: 'escalated',
      input, context, response, authority,
      workItem: null,
      summary: `Failed to create work: ${result.error}`,
      mutationApplied: false,
      escalationRequired: true,
      nextStep: 'Investigate work creation failure',
    };
  }

  return {
    kind: 'work_created',
    input, context, response, authority,
    workItem: result.value,
    summary: `Created: ${result.value.ref} "${input.text}"`,
    mutationApplied: true,
    escalationRequired: false,
    nextStep: owner ? `Assign to ${owner.id}` : 'Triage and assign',
  };
}

function recommendOutcome(
  input: FounderInput, context: ContextPack, response: CeoResponse, authority: AuthorityVerdict,
): OrchestratorOutcome {
  return {
    kind: 'escalated',
    input, context, response, authority,
    workItem: null,
    summary: response.summary,
    mutationApplied: false,
    escalationRequired: true,
    nextStep: response.nextStep,
  };
}

function escalateOutcome(
  input: FounderInput, context: ContextPack, response: CeoResponse, authority: AuthorityVerdict,
  registry: InMemoryWorkRegistry, now: Date,
): OrchestratorOutcome {
  if (input.kind === 'approval' && context.pendingApprovals.length > 0) {
    const match = input.work_id
      ? context.pendingApprovals.find((p) => p.id === input.work_id)
      : context.pendingApprovals[0];

    if (match) {
      return {
        kind: 'approval_recorded',
        input, context, response, authority,
        workItem: match,
        summary: `Approval for: ${match.title}`,
        mutationApplied: false,
        escalationRequired: true,
        nextStep: 'Record the founder decision on this approval',
      };
    }
  }

  return {
    kind: 'escalated',
    input, context, response, authority,
    workItem: null,
    summary: response.summary,
    mutationApplied: false,
    escalationRequired: true,
    nextStep: response.nextStep,
  };
}

function delegateOutcome(
  input: FounderInput, context: ContextPack, response: CeoResponse, authority: AuthorityVerdict,
  registry: InMemoryWorkRegistry, now: Date,
): OrchestratorOutcome {
  const delegateTo = response.delegateTo;
  const existing = context.relatedWork[0] ?? null;

  if (!existing && authority.allowed && input.kind === 'instruction') {
    const scope = input.scope ?? Scopes.devshop();
    const result = registry.createItem({
      title: input.text,
      description: `Founder instruction: ${input.text}`,
      type: 'task',
      level: 'work_item',
      scope,
      source: { channel: 'founder_request', requester: input.from },
    }, CEO);

    if (result.ok) {
      return {
        kind: 'work_created',
        input, context, response, authority,
        workItem: result.value,
        summary: `Created and delegated: ${result.value.ref}`,
        mutationApplied: true,
        escalationRequired: false,
        nextStep: delegateTo ? `Delegate to ${delegateTo.id}` : 'Assign owner',
      };
    }
  }

  return {
    kind: 'delegated',
    input, context, response, authority,
    workItem: existing,
    summary: delegateTo
      ? `Delegated to ${delegateTo.id}${existing ? ` (${existing.ref})` : ''}`
      : response.summary,
    mutationApplied: false,
    escalationRequired: false,
    nextStep: response.nextStep,
  };
}

function resolveWorkOwner(input: FounderInput, scope: Scope): Actor | null {
  if (input.brand) {
    const brandCeo = brandCeoFor(input.brand);
    if (brandCeo) return { kind: 'agent', id: brandCeo.id };
  }
  return null;
}
