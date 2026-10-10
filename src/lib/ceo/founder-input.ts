// Canonical founder → CEO input representation.
// Not every message creates a Work Item. This classifies and structures
// what the founder said so the CEO can decide what to do with it.
// Pure deterministic logic. No AI invocations.

import type { Actor, Scope } from '../work/types';
import type { CommType, CommChannel } from './types';
import { isIncidentReport } from './priority-policy';

export type FounderInputKind =
  | 'context'        // FYI, background, no action needed
  | 'question'       // Needs an answer, not work
  | 'instruction'    // Do this (may create work)
  | 'approval'       // Yes/no on a pending decision
  | 'decision'       // A strategic/policy decision
  | 'work_request'   // Explicitly asks for work to be created
  | 'evidence'       // Proof, data, or a result for existing work
  | 'relationship';  // Conversation, rapport — no operating action

export interface FounderInput {
  id: string;
  kind: FounderInputKind;
  from: Actor;
  channel: CommChannel;
  at: string;
  text: string;
  brand: string | null;
  work_id: string | null;
  thread_id: string | null;
  urgency: 'normal' | 'urgent' | 'critical';
  scope: Scope | null;
}

const APPROVAL_PATTERNS = /\b(approved?|yes\s+go\s+ahead|go\s+ahead|yes\b.*\bdo\s+it|green\s+light|ok\s+proceed)\b/i;
const QUESTION_PATTERNS = /^(what|where|when|who|why|how|is\s+there|can\s+you|could\s+you|do\s+we|are\s+we|have\s+we|did\s+we|any\s+update)\b|\?\s*$/i;
const WORK_PATTERNS = /\b(handle|fix|resolve|improve|enhance|polish|tidy|refactor|redesign|set\s+up|build|create|deploy|launch|migrate|ship|implement|add|remove|change|update|send|post|schedule)\b/i;
const EVIDENCE_PATTERNS = /\b(here\s+is|attached|screenshot|proof|result|numbers|data|report|metric|outcome)\b/i;
const INVESTIGATION_PATTERNS = /\b(check\s+why|investigate|look\s+into|find\s+out|debug|diagnose|what\s+happened|why\s+is)\b/i;
const CONTEXT_PATTERNS = /\b(fyi|for\s+your\s+info|just\s+so\s+you\s+know|heads\s+up|noting\s+that|btw|by\s+the\s+way)\b/i;
const DECISION_PATTERNS = /\b(we\s+will|we're\s+going\s+to|i\s+decided|decision|policy|from\s+now\s+on|going\s+forward|new\s+rule|stop\s+doing|start\s+doing)\b/i;
const RELATIONSHIP_PATTERNS = /^(thanks|thank\s+you|good\s+morning|hi|hey|nice|great\s+work|well\s+done|good\s+job|ok|okay|got\s+it|noted|cool|cheers)\s*[.!]?\s*$/i;

const URGENCY_CRITICAL = /\b(urgent|asap|immediately|right\s+now|emergency|critical|down|broken|p0)\b/i;
const URGENCY_HIGH = /\b(today|quickly|soon|priority|important|p1)\b/i;

export function classifyFounderInput(text: string, from: Actor, opts: {
  channel?: CommChannel;
  brand?: string | null;
  work_id?: string | null;
  thread_id?: string | null;
  now?: Date;
} = {}): FounderInput {
  const now = opts.now ?? new Date();
  const trimmed = text.trim();
  const kind = inferKind(trimmed, opts.work_id ?? null);
  const urgency = URGENCY_CRITICAL.test(trimmed) ? 'critical' as const
    : URGENCY_HIGH.test(trimmed) ? 'urgent' as const
    : 'normal' as const;

  return {
    id: `fi-${now.getTime()}`,
    kind,
    from,
    channel: opts.channel ?? 'internal',
    at: now.toISOString(),
    text: trimmed,
    brand: opts.brand ?? null,
    work_id: opts.work_id ?? null,
    thread_id: opts.thread_id ?? null,
    urgency,
    scope: opts.brand ? { kind: 'brand', brand: opts.brand, founder: null, system: null, extension: null } : null,
  };
}

function inferKind(text: string, workId: string | null): FounderInputKind {
  if (RELATIONSHIP_PATTERNS.test(text)) return 'relationship';
  if (APPROVAL_PATTERNS.test(text)) return 'approval';
  if (DECISION_PATTERNS.test(text)) return 'decision';
  if (workId && EVIDENCE_PATTERNS.test(text)) return 'evidence';
  if (isIncidentReport(text) && !QUESTION_PATTERNS.test(text) && !INVESTIGATION_PATTERNS.test(text)) return 'work_request';
  if (CONTEXT_PATTERNS.test(text)) return 'context';
  if (QUESTION_PATTERNS.test(text)) return 'question';
  if (INVESTIGATION_PATTERNS.test(text)) return 'instruction';
  if (WORK_PATTERNS.test(text)) return 'work_request';
  return 'context';
}

export function founderInputToCommType(kind: FounderInputKind): CommType {
  const map: Record<FounderInputKind, CommType> = {
    context: 'context',
    question: 'question',
    instruction: 'instruction',
    approval: 'approval',
    decision: 'decision',
    work_request: 'work_request',
    evidence: 'incident_evidence',
    relationship: 'relationship',
  };
  return map[kind];
}
