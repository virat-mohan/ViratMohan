// CEO Runtime → Work Registry orchestrator.
// Founder Input → classify → bounded context → authority → existing Work → response → registry mutation.
// Deterministic. No AI invocations, no network, no external execution. Every mutation is a Work Registry
// operation, so it lands in the append-only audit trail. Routing is by role; roles.ts names the holders.

import type { InMemoryWorkRegistry } from '../work/registry';
import type { Actor, Priority, WorkItem, Scope } from '../work/types';
import { isVirat } from '../work/actors';
import { Scopes } from '../work/scope';
import { CEO, autonomyFor, brandCeoFor, type WorkQuestion } from './types';
import type { FounderInput } from './founder-input';
import { buildContextPack, type ContextPack } from './context-pack';
import { checkAuthority, requiredCapabilityForInput, canCeoAssign, type AuthorityVerdict } from './authority';
import { buildCeoResponse, type CeoResponse } from './response';
import { createQuestion } from './coordinator';
import {
  ROLE_BINDINGS, functionForText, roleForFunction, holdersOf,
  type RoleBindings, type RoleDefinition, type WorkFunction,
} from './roles';

export type OrchestratorOutcomeKind =
  | 'work_created'
  | 'work_updated'
  | 'approval_recorded'
  | 'evidence_attached'
  | 'question_answered'
  | 'question_raised'
  | 'acknowledged'
  | 'escalated'
  | 'denied';

/** What the runtime did to the registry. 'read' and 'none' never write. */
export type RegistryOperation =
  | 'none' | 'read' | 'attach_evidence' | 'create_work' | 'update_work'
  | 'create_question' | 'record_approval' | 'record_decision' | 'escalate';

export interface RoutingDecision {
  function: WorkFunction;
  role: string;
  roleLabel: string;
  currentHolders: string[];
  governance: string;
  approval: { authority: string; from: string };
}

export interface OrchestratorOutcome {
  kind: OrchestratorOutcomeKind;
  operation: RegistryOperation;
  input: FounderInput;
  context: ContextPack | null;
  response: CeoResponse | null;
  authority: AuthorityVerdict;
  workItem: WorkItem | null;
  reusedExistingWork: boolean;
  routing: RoutingDecision | null;
  question: WorkQuestion | null;
  summary: string;
  mutationApplied: boolean;
  escalationRequired: boolean;
  nextStep: string;
  trace: string[];
}

export interface OrchestratorOptions {
  now?: Date;
  bindings?: RoleBindings;
}

const PRIORITY_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };

export function processFounderInput(
  input: FounderInput,
  registry: InMemoryWorkRegistry,
  opts: OrchestratorOptions = {},
): OrchestratorOutcome {
  const now = opts.now ?? new Date();
  const bindings = opts.bindings ?? ROLE_BINDINGS;

  if (!isVirat(input.from)) {
    const authority = checkAuthority('unknown-founder-principal');
    return base(input, null, null, authority, {
      kind: 'denied',
      summary: 'Founder input is accepted only from the Founder principal',
      escalationRequired: false,
      nextStep: 'No action taken',
    });
  }

  const context = buildContextPack(input, registry, now);
  const response = buildCeoResponse(context);
  const capability = requiredCapabilityForInput(input);
  const authority = checkAuthority(capability);
  const fn = input.kind === 'work_request' || input.kind === 'instruction' || input.kind === 'question'
    ? functionForText(input.text)
    : null;
  const routing = fn ? routingFor(roleForFunction(fn, bindings)) : null;
  const ctx: Ctx = { input, context, response, authority, registry, now, bindings, routing };

  switch (input.kind) {
    case 'relationship':
    case 'context':
      return done(ctx, { kind: 'acknowledged', summary: response.summary, nextStep: response.nextStep });
    case 'evidence':
      return evidenceFlow(ctx);
    case 'question':
      return questionFlow(ctx);
    case 'approval':
      return approvalFlow(ctx);
    case 'decision':
      return decisionFlow(ctx);
    case 'work_request':
    case 'instruction':
      return workFlow(ctx);
  }
}

interface Ctx {
  input: FounderInput;
  context: ContextPack;
  response: CeoResponse;
  authority: AuthorityVerdict;
  registry: InMemoryWorkRegistry;
  now: Date;
  bindings: RoleBindings;
  routing: RoutingDecision | null;
}

type Partial_ = Partial<OrchestratorOutcome> & Pick<OrchestratorOutcome, 'kind' | 'summary' | 'nextStep'>;

function base(
  input: FounderInput, context: ContextPack | null, response: CeoResponse | null, authority: AuthorityVerdict, p: Partial_,
): OrchestratorOutcome {
  return {
    input, context, response, authority,
    operation: 'none', workItem: null, reusedExistingWork: false, routing: null, question: null,
    mutationApplied: false, escalationRequired: false, trace: [],
    ...p,
  };
}

function done(c: Ctx, p: Partial_): OrchestratorOutcome {
  return base(c.input, c.context, c.response, c.authority, { routing: c.routing, ...p });
}

function routingFor(role: RoleDefinition): RoutingDecision {
  return {
    function: role.function,
    role: role.id,
    roleLabel: role.label,
    currentHolders: role.holders.map((h) => h.name),
    governance: role.governance,
    approval: { authority: role.assignmentAuthority, from: 'virat' },
  };
}

function traceLine(c: Ctx, matched: WorkItem | null, result: string): string {
  const auth = c.authority.allowed
    ? `${c.authority.capability} ${c.authority.level} allowed`
    : `${c.authority.capability} ${c.authority.level} needs ${c.authority.holder}`;
  const route = c.routing ? `; routing ${c.routing.function} -> ${c.routing.role} (holder: ${c.routing.currentHolders.join(', ') || 'none'})` : '';
  const approval = c.routing ? `; approval ${c.routing.approval.authority} from ${c.routing.approval.from}` : '';
  return `Founder input ${c.input.id} [${c.input.kind}, ${c.input.urgency}]: authority ${auth}; matched work ${matched?.ref ?? 'none'}${route}${approval}; ${result}`;
}

function logTrace(c: Ctx, workId: string, matched: WorkItem | null, result: string): string {
  const line = traceLine(c, matched, result);
  c.registry.logAction(workId, { summary: line }, CEO);
  return line;
}

// ── evidence ───────────────────────────────────────────────────────────────

function evidenceFlow(c: Ctx): OrchestratorOutcome {
  const workId = c.input.work_id ?? c.context.matchedWork?.id ?? null;
  const item = workId ? c.registry.get(workId) ?? null : null;
  if (!item) {
    return done(c, { kind: 'acknowledged', summary: 'Evidence received, but no matching Work was found', nextStep: 'Say which Work this belongs to' });
  }
  const added = c.registry.addEvidence(item.id, { kind: 'note', ref: `founder-input:${c.input.id}`, summary: c.input.text }, c.input.from);
  if (!added.ok) {
    return done(c, { kind: 'escalated', operation: 'escalate', workItem: item, summary: `Could not attach evidence to ${item.ref}: ${added.error.message}`, escalationRequired: true, nextStep: 'Review the item state' });
  }
  const trace = logTrace(c, item.id, item, `evidence ${added.value.id} attached`);
  return done(c, {
    kind: 'evidence_attached', operation: 'attach_evidence', workItem: c.registry.get(item.id)!, reusedExistingWork: true,
    summary: `Evidence attached to ${item.ref}`, mutationApplied: true, nextStep: `Evidence recorded on ${item.ref}`, trace: [trace],
  });
}

// ── questions ──────────────────────────────────────────────────────────────

function questionFlow(c: Ctx): OrchestratorOutcome {
  if (!c.routing) {
    return done(c, {
      kind: 'question_answered', operation: 'read', workItem: c.context.matchedWork,
      summary: c.response.summary, nextStep: c.response.nextStep,
    });
  }
  const matched = c.context.matchedWork;
  const question = createQuestion(matched?.id ?? '', c.input.from, c.input.text, 'technical_deployment', c.now, c.bindings);
  let trace: string[] = [];
  let mutationApplied = false;
  if (matched) {
    trace = [logTrace(c, matched.id, matched, `question ${question.id} routed to ${c.routing.role}`)];
    mutationApplied = true;
  }
  return done(c, {
    kind: 'question_raised', operation: mutationApplied ? 'create_question' : 'none', workItem: matched, reusedExistingWork: !!matched, question,
    summary: `Question for the ${c.routing.roleLabel} (${c.routing.currentHolders.join(', ')})${matched ? `, attached to ${matched.ref}` : ', no Work to attach to yet'}`,
    mutationApplied,
    nextStep: matched ? 'Virat decides whether to pass the question on' : 'Open Work for this, or say which Work it belongs to',
    trace,
  });
}

// ── approvals ──────────────────────────────────────────────────────────────

function approvalFlow(c: Ctx): OrchestratorOutcome {
  const pending = c.context.pendingApprovals;
  if (pending.length === 0) {
    return done(c, { kind: 'acknowledged', summary: 'No pending approvals found', nextStep: 'Clarify which approval this refers to' });
  }
  const match = c.input.work_id ? pending.find((p) => p.id === c.input.work_id) : pending.length === 1 ? pending[0] : undefined;
  if (!match) {
    const refs = pending.map((p) => `${p.ref} "${p.title}"`).join('; ');
    return done(c, {
      kind: 'escalated', operation: 'escalate', summary: `${pending.length} approvals are pending: ${refs}. Not guessing which one you mean`,
      escalationRequired: true, nextStep: 'Reply with the Work reference to approve',
    });
  }

  const approval = match.approval!;
  const decided = c.registry.decideApproval(match.id, 'approved', c.input.from, `Founder approval: ${c.input.text}`);
  if (!decided.ok) {
    return done(c, { kind: 'escalated', operation: 'escalate', workItem: match, summary: `Approval not recorded on ${match.ref}: ${decided.error.message}`, escalationRequired: true, nextStep: 'Review the approval request' });
  }

  const trace: string[] = [];
  let result = `approval ${approval.id} (${approval.authority}) approved by ${c.input.from.id}`;
  const role = Object.values(c.bindings).find((r) => r.assignmentAuthority === approval.authority);
  if (role) {
    const holder = holdersOf(role.id, c.bindings)[0];
    if (holder) {
      const re = c.registry.reassign(match.id, holder.actor, c.input.from, `Approved by Virat (${approval.id}): assign to ${role.label}`, { keepPreviousAsSupporting: true });
      result += re.ok ? `; assigned to ${role.id} (${holder.name})` : `; assignment to ${role.id} failed: ${re.error.message}`;
    }
  }
  trace.push(logTrace(c, match.id, match, result));
  return done(c, {
    kind: 'approval_recorded', operation: 'record_approval', workItem: c.registry.get(match.id)!, reusedExistingWork: true,
    summary: `Approved on ${match.ref}: ${result}`, mutationApplied: true, nextStep: 'Work resumes with its owner', trace,
  });
}

// ── decisions ──────────────────────────────────────────────────────────────

function decisionFlow(c: Ctx): OrchestratorOutcome {
  const matched = c.context.matchedWork;
  if (!matched) {
    return done(c, {
      kind: 'acknowledged', summary: 'Decision noted but not recorded: there is no Work for it to attach to',
      nextStep: 'Say which Work it applies to, or ask me to open Work for it',
    });
  }
  const trace = logTrace(c, matched.id, matched, `founder decision recorded: "${c.input.text}"`);
  return done(c, {
    kind: 'acknowledged', operation: 'record_decision', workItem: c.registry.get(matched.id)!, reusedExistingWork: true,
    summary: `Decision recorded on ${matched.ref}`, mutationApplied: true, nextStep: 'Propagate to the Work owner', trace: [trace],
  });
}

// ── work ───────────────────────────────────────────────────────────────────

function workFlow(c: Ctx): OrchestratorOutcome {
  if (!c.authority.allowed) {
    return done(c, { kind: 'escalated', operation: 'escalate', summary: c.response.summary, escalationRequired: true, nextStep: c.response.nextStep });
  }

  const matched = c.context.matchedWork;
  if (matched) {
    const trace = logTrace(c, matched.id, matched, 'existing work reused, no new work created');
    return done(c, {
      kind: 'work_updated', operation: 'update_work', workItem: c.registry.get(matched.id)!, reusedExistingWork: true,
      summary: `Existing work: ${matched.ref} "${matched.title}" (${matched.state})`,
      mutationApplied: true, nextStep: `Update ${matched.ref}`, trace: [trace],
    });
  }

  const scope: Scope = c.input.scope ?? Scopes.devshop();
  const owner = c.routing
    ? ({ kind: 'agent', id: c.routing.governance } as Actor)
    : brandOwner(c.input) ?? CEO;
  const assign = canCeoAssign(owner, c.bindings);
  if (!assign.allowed) {
    return done(c, { kind: 'escalated', operation: 'escalate', summary: `Cannot assign to ${owner.id}: ${assign.reason}`, escalationRequired: true, nextStep: `Approval from ${assign.holder} needed first` });
  }

  const created = c.registry.createItem({
    title: c.input.text,
    description: `Founder input ${c.input.id}: ${c.input.text}`,
    type: c.input.kind === 'instruction' ? 'task' : 'request',
    level: 'work_item',
    scope,
    source: { channel: 'founder_request', requester: c.input.from },
  }, CEO);
  if (!created.ok) {
    return done(c, { kind: 'escalated', operation: 'escalate', summary: `Work not created: ${created.error.message}`, escalationRequired: true, nextStep: 'Investigate' });
  }
  const id = created.value.id;
  const steps: string[] = [];

  const { priority, reason } = priorityFor(c.input);
  const triaged = c.registry.transition(id, 'triaged', CEO, { payload: { triage: { type: created.value.type, priority, priority_reason: reason, scope } } });
  steps.push(triaged.ok ? `triaged ${priority}` : `triage failed: ${triaged.error.message}`);
  const assigned = triaged.ok ? c.registry.transition(id, 'assigned', CEO, { payload: { owner } }) : null;
  if (assigned) steps.push(assigned.ok ? `owner ${owner.id}` : `assignment failed: ${assigned.error.message}`);

  let escalationRequired = false;
  let nextStep = `Work with ${owner.id}`;
  if (c.routing && assigned?.ok) {
    const ev = c.registry.addEvidence(id, { kind: 'note', ref: `founder-input:${c.input.id}`, summary: c.input.text }, CEO);
    const req = ev.ok
      ? c.registry.requestApproval(id, {
          requested_from: 'virat',
          authority: roleForFunction(c.routing.function, c.bindings).assignmentAuthority,
          reason: `Technical deployment work needs the ${c.routing.roleLabel}`,
          evidence_ids: [ev.value.id],
          recommendation: `Assign to ${c.routing.role} (current holder: ${c.routing.currentHolders.join(', ')}) once approved`,
        }, CEO)
      : null;
    steps.push(req?.ok ? `approval requested from ${c.routing.approval.from}` : `approval request failed: ${req ? req.error.message : 'evidence not added'}`);
    escalationRequired = true;
    nextStep = `Awaiting Virat's approval before assigning to ${c.routing.roleLabel}`;
  }

  const trace = logTrace(c, id, null, `new work created; ${steps.join('; ')}`);
  return done(c, {
    kind: 'work_created', operation: 'create_work', workItem: c.registry.get(id)!,
    summary: `Created ${created.value.ref} "${c.input.text}"`, mutationApplied: true, escalationRequired, nextStep, trace: [trace],
  });
}

function brandOwner(input: FounderInput): Actor | null {
  const b = input.brand ? brandCeoFor(input.brand) : undefined;
  return b ? { kind: 'agent', id: b.id } : null;
}

/** Founder urgency to priority, capped by the create-work grant (the CEO does not set anything above its cap). */
function priorityFor(input: FounderInput): { priority: Priority; reason: string } {
  const wanted: Priority = input.urgency === 'critical' ? 'P1' : input.urgency === 'urgent' ? 'P2' : 'P3';
  const cap = (autonomyFor('create-work')?.limits?.maxPriority as Priority | undefined) ?? 'P2';
  const capped = PRIORITY_RANK[wanted] < PRIORITY_RANK[cap];
  return {
    priority: capped ? cap : wanted,
    reason: capped
      ? `Founder wording is ${input.urgency}; capped at ${cap} by the CEO create-work grant, Virat may raise it`
      : `Set from founder wording (${input.urgency})`,
  };
}
