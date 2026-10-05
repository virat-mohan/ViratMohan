// Structured CEO response model.
// The CEO produces operating decisions and recommendations, not chat replies.
// Pure deterministic logic. No AI invocations.

import type { Actor, Priority, Scope } from '../work/types';
import type { AutonomyLevel } from './types';
import type { FounderInput } from './founder-input';
import type { ContextPack } from './context-pack';
import type { AuthorityVerdict } from './authority';
import { checkAuthority, requiredCapabilityForInput, canCeoAssign } from './authority';
import { CEO, CEO_ID, brandCeoFor } from './types';
import { Scopes } from '../work/scope';
import { suggestOwner, findExistingWork } from './coordinator';

export type CeoResponseKind =
  | 'act'             // CEO can and will act within authority
  | 'recommend'       // CEO recommends, needs approval
  | 'escalate'        // Needs human decision
  | 'answer'          // Answering a question
  | 'acknowledge'     // Context/relationship — noted, no action
  | 'delegate'        // Route to brand CEO or HOD
  | 'attach_to_work'; // Evidence/context attached to existing work

export interface CeoResponse {
  kind: CeoResponseKind;
  input: FounderInput;
  authority: AuthorityVerdict;
  summary: string;
  recommendedAction: string | null;
  selectedOwner: Actor | null;
  requiredApproval: { authority: string; from: string } | null;
  relatedWorkIds: string[];
  delegateTo: Actor | null;
  evidenceNeeded: string | null;
  nextStep: string;
}

export function buildCeoResponse(context: ContextPack): CeoResponse {
  const { input } = context;
  const capability = requiredCapabilityForInput(input);
  const authority = checkAuthority(capability);

  switch (input.kind) {
    case 'relationship':
      return acknowledge(input, authority, 'Noted');

    case 'context':
      return acknowledge(input, authority, 'Context received');

    case 'evidence':
      return attachToWork(input, authority, context);

    case 'question':
      return answerQuestion(input, authority, context);

    case 'approval':
      return handleApproval(input, authority, context);

    case 'decision':
      return handleDecision(input, authority, context);

    case 'work_request':
      return handleWorkRequest(input, authority, context);

    case 'instruction':
      return handleInstruction(input, authority, context);
  }
}

function acknowledge(input: FounderInput, authority: AuthorityVerdict, summary: string): CeoResponse {
  return {
    kind: 'acknowledge',
    input,
    authority,
    summary,
    recommendedAction: null,
    selectedOwner: null,
    requiredApproval: null,
    relatedWorkIds: [],
    delegateTo: null,
    evidenceNeeded: null,
    nextStep: 'No action required',
  };
}

function attachToWork(input: FounderInput, authority: AuthorityVerdict, context: ContextPack): CeoResponse {
  const workId = input.work_id ?? (context.relatedWork[0]?.id ?? null);
  return {
    kind: 'attach_to_work',
    input,
    authority,
    summary: workId ? `Evidence for ${workId}` : 'Evidence received — no matching work found',
    recommendedAction: workId ? `Attach evidence to ${workId}` : 'Create work item for this evidence',
    selectedOwner: null,
    requiredApproval: null,
    relatedWorkIds: workId ? [workId] : [],
    delegateTo: null,
    evidenceNeeded: null,
    nextStep: workId ? 'Attach to work item' : 'Clarify which work this relates to',
  };
}

function answerQuestion(input: FounderInput, authority: AuthorityVerdict, context: ContextPack): CeoResponse {
  const hasBoard = context.morningBoard !== null;
  const summary = hasBoard
    ? `Morning board: ${context.morningBoard!.items.length} items, ${context.morningBoard!.critical_count} critical`
    : `${context.relatedWork.length} related items found`;

  return {
    kind: 'answer',
    input,
    authority,
    summary,
    recommendedAction: null,
    selectedOwner: null,
    requiredApproval: null,
    relatedWorkIds: context.relatedWork.map((w) => w.id),
    delegateTo: null,
    evidenceNeeded: null,
    nextStep: hasBoard ? 'Present morning board' : 'Present findings',
  };
}

function handleApproval(input: FounderInput, authority: AuthorityVerdict, context: ContextPack): CeoResponse {
  const pending = context.pendingApprovals;
  if (pending.length === 0) {
    return {
      kind: 'acknowledge',
      input,
      authority,
      summary: 'No pending approvals found',
      recommendedAction: null,
      selectedOwner: null,
      requiredApproval: null,
      relatedWorkIds: [],
      delegateTo: null,
      evidenceNeeded: null,
      nextStep: 'Clarify which approval this refers to',
    };
  }

  const match = input.work_id
    ? pending.find((p) => p.id === input.work_id)
    : pending[0];

  return {
    kind: 'escalate',
    input,
    authority,
    summary: match ? `Approval for: ${match.title}` : 'Approval received — matching to pending item',
    recommendedAction: match ? `Record approval decision on ${match.ref}` : null,
    selectedOwner: null,
    requiredApproval: null,
    relatedWorkIds: match ? [match.id] : [],
    delegateTo: null,
    evidenceNeeded: null,
    nextStep: 'Record the founder decision',
  };
}

function handleDecision(input: FounderInput, authority: AuthorityVerdict, context: ContextPack): CeoResponse {
  return {
    kind: 'acknowledge',
    input,
    authority,
    summary: 'Founder decision recorded',
    recommendedAction: 'Record decision and propagate to affected work',
    selectedOwner: null,
    requiredApproval: null,
    relatedWorkIds: context.relatedWork.map((w) => w.id),
    delegateTo: null,
    evidenceNeeded: null,
    nextStep: 'Record and propagate the decision',
  };
}

function handleWorkRequest(input: FounderInput, authority: AuthorityVerdict, context: ContextPack): CeoResponse {
  if (context.relatedWork.length > 0) {
    const existing = context.relatedWork[0];
    return {
      kind: 'act',
      input,
      authority,
      summary: `Existing work found: ${existing.ref} "${existing.title}" (${existing.state})`,
      recommendedAction: `Attach to ${existing.ref} rather than creating duplicate`,
      selectedOwner: existing.owner ?? null,
      requiredApproval: null,
      relatedWorkIds: [existing.id],
      delegateTo: null,
      evidenceNeeded: null,
      nextStep: `Update ${existing.ref}`,
    };
  }

  const scope = input.scope ?? Scopes.devshop();
  const owner = input.brand ? brandCeoFor(input.brand) : null;
  const selectedOwner = owner ? { kind: 'agent' as const, id: owner.id } : CEO;

  if (!authority.allowed) {
    return {
      kind: 'recommend',
      input,
      authority,
      summary: `New work requested: "${input.text}"`,
      recommendedAction: `Create work item and assign to ${selectedOwner.id}`,
      selectedOwner,
      requiredApproval: { authority: authority.capability, from: (authority as any).holder },
      relatedWorkIds: [],
      delegateTo: null,
      evidenceNeeded: null,
      nextStep: `Await approval from ${(authority as any).holder}`,
    };
  }

  return {
    kind: 'act',
    input,
    authority,
    summary: `Creating work: "${input.text}"`,
    recommendedAction: `Create work item, assign to ${selectedOwner.id}`,
    selectedOwner,
    requiredApproval: null,
    relatedWorkIds: [],
    delegateTo: null,
    evidenceNeeded: null,
    nextStep: `Create and assign to ${selectedOwner.id}`,
  };
}

function handleInstruction(input: FounderInput, authority: AuthorityVerdict, context: ContextPack): CeoResponse {
  if (context.relatedWork.length > 0) {
    const existing = context.relatedWork[0];
    const owner = existing.owner;
    return {
      kind: owner ? 'delegate' : 'act',
      input,
      authority,
      summary: `Related work: ${existing.ref} "${existing.title}"`,
      recommendedAction: owner ? `Route instruction to ${owner.id}` : `Handle via ${existing.ref}`,
      selectedOwner: owner ?? null,
      requiredApproval: null,
      relatedWorkIds: [existing.id],
      delegateTo: owner ?? null,
      evidenceNeeded: null,
      nextStep: owner ? `Delegate to ${owner.id}` : 'Execute instruction',
    };
  }

  if (input.brand) {
    const brandCeo = brandCeoFor(input.brand);
    if (brandCeo) {
      return {
        kind: 'delegate',
        input,
        authority,
        summary: `Brand instruction for ${input.brand}`,
        recommendedAction: `Delegate to brand CEO ${brandCeo.id} (${brandCeo.name})`,
        selectedOwner: { kind: 'agent', id: brandCeo.id },
        requiredApproval: null,
        relatedWorkIds: [],
        delegateTo: { kind: 'agent', id: brandCeo.id },
        evidenceNeeded: null,
        nextStep: `Delegate to ${brandCeo.id}`,
      };
    }
  }

  return {
    kind: authority.allowed ? 'act' : 'recommend',
    input,
    authority,
    summary: `Instruction: "${input.text}"`,
    recommendedAction: 'Create work item for this instruction',
    selectedOwner: CEO,
    requiredApproval: authority.allowed ? null : { authority: authority.capability, from: (authority as any).holder },
    relatedWorkIds: [],
    delegateTo: null,
    evidenceNeeded: null,
    nextStep: authority.allowed ? 'Execute instruction' : `Await approval from ${(authority as any).holder}`,
  };
}
