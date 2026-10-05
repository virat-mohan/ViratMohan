// CEO context pack: deterministic, bounded context assembly for CEO reasoning.
// Assembles only the relevant context for a given founder input — not everything.
// Pure deterministic logic. No AI invocations.

import type { InMemoryWorkRegistry } from '../work/registry';
import type { WorkItem, Priority, Scope, Actor } from '../work/types';
import type { MorningBoard } from './types';
import { CEO_ID, brandCeoFor, findAgent, directReports, type AgentEntry } from './types';
import type { AuditFinding } from './coordinator';
import { runAuditLoop, findExistingWork } from './coordinator';
import { buildMorningBoard } from './morning-board';
import type { FounderInput } from './founder-input';

export interface ContextPack {
  input: FounderInput;
  morningBoard: MorningBoard | null;
  relatedWork: WorkItem[];
  brandOwner: AgentEntry | null;
  auditFindings: AuditFinding[];
  pendingApprovals: WorkItem[];
  recentDecisions: WorkItem[];
  activeLocks: string[];
  brandSummary: BrandWorkSummary | null;
}

export interface BrandWorkSummary {
  brand: string;
  openCount: number;
  criticalCount: number;
  blockedCount: number;
  oldestOpenDays: number;
}

const MAX_RELATED_WORK = 10;
const MAX_RECENT_DECISIONS = 5;
const MAX_AUDIT_FINDINGS = 20;

export function buildContextPack(
  input: FounderInput,
  registry: InMemoryWorkRegistry,
  now: Date = new Date(),
): ContextPack {
  const needsMorningBoard = input.kind === 'question' &&
    /\b(morning|status|attention|overview|what.*(need|going|happening))\b/i.test(input.text);

  const morningBoard = needsMorningBoard ? buildMorningBoard(registry, now) : null;

  const relatedWork = findRelatedWork(input, registry);

  const brandOwner = input.brand ? (brandCeoFor(input.brand) ?? null) : null;

  const needsAudit = input.kind === 'question' || input.kind === 'instruction' || input.kind === 'work_request';
  const auditFindings = needsAudit ? runAuditLoop(registry, now).slice(0, MAX_AUDIT_FINDINGS) : [];

  const pendingApprovals = input.kind === 'approval'
    ? registry.list().filter((i) => i.state === 'pending_approval' && i.approval !== null)
    : [];

  const recentDecisions = input.kind === 'decision' || input.kind === 'question'
    ? registry.list()
        .filter((i) => i.approval != null && i.approval.decision != null)
        .sort((a, b) => (b.approval!.decision!.at > a.approval!.decision!.at ? 1 : -1))
        .slice(0, MAX_RECENT_DECISIONS)
    : [];

  const activeLocks = input.brand
    ? registry.list()
        .filter((i) => i.repo_scope?.material && i.state !== 'closed' && i.scope.brand === input.brand)
        .map((i) => `${i.repo_scope!.repository}:${i.ref}`)
    : [];

  const brandSummary = input.brand ? buildBrandSummary(input.brand, registry, now) : null;

  return {
    input,
    morningBoard,
    relatedWork,
    brandOwner,
    auditFindings,
    pendingApprovals,
    recentDecisions,
    activeLocks,
    brandSummary,
  };
}

function findRelatedWork(input: FounderInput, registry: InMemoryWorkRegistry): WorkItem[] {
  const results: WorkItem[] = [];

  if (input.work_id) {
    const item = registry.list().find((i) => i.id === input.work_id);
    if (item) results.push(item);
  }

  if (input.text && input.scope) {
    const existing = findExistingWork(registry, input.text, input.scope);
    if (existing && !results.some((r) => r.id === existing.id)) {
      results.push(existing);
    }
  }

  if (input.brand) {
    const brandWork = registry.list()
      .filter((i) => i.scope.brand === input.brand && i.state !== 'closed' && !results.some((r) => r.id === i.id))
      .sort((a, b) => {
        const pOrd: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
        return (pOrd[a.priority ?? 'P4'] ?? 4) - (pOrd[b.priority ?? 'P4'] ?? 4);
      })
      .slice(0, MAX_RELATED_WORK - results.length);
    results.push(...brandWork);
  }

  return results.slice(0, MAX_RELATED_WORK);
}

function buildBrandSummary(brand: string, registry: InMemoryWorkRegistry, now: Date): BrandWorkSummary {
  const brandItems = registry.list().filter((i) => i.scope.brand === brand && i.state !== 'closed');
  const criticalCount = brandItems.filter((i) => i.priority === 'P0' || i.priority === 'P1').length;
  const blockedCount = brandItems.filter((i) => i.state === 'blocked').length;

  let oldestOpenDays = 0;
  for (const item of brandItems) {
    const days = Math.floor((now.getTime() - new Date(item.created_at).getTime()) / 86_400_000);
    if (days > oldestOpenDays) oldestOpenDays = days;
  }

  return { brand, openCount: brandItems.length, criticalCount, blockedCount, oldestOpenDays };
}
