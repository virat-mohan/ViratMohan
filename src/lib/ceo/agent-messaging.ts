// Phase 7: Connect through CEO — inter-agent message bus.
// Every message between agents routes through CEO (DS-02) for logging, hierarchy
// enforcement and audit. No direct agent-to-agent messaging outside the chain.
// Pure data — no network, no database, no framework imports.

import { AGENT_REGISTRY, type AgentEntry, findAgent, CEO_ID } from './types';

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  routedThrough: string;
  allowed: boolean;
  reason: string;
}

export interface MessageResult {
  ok: boolean;
  message: AgentMessage;
  blocked: boolean;
  blockReason: string | null;
}

let messageCounter = 0;

function nextId(): string {
  return `MSG-${++messageCounter}`;
}

function chainBetween(fromId: string, toId: string): string[] {
  const from = findAgent(fromId);
  const to = findAgent(toId);
  if (!from || !to) return [];

  const fromChain = agentChain(fromId);
  const toChain = agentChain(toId);

  const commonAncestor = fromChain.find(id => toChain.includes(id));
  return commonAncestor ? [commonAncestor] : [];
}

function agentChain(id: string): string[] {
  const chain: string[] = [id];
  let current = findAgent(id);
  while (current && current.reports_to) {
    chain.push(current.reports_to);
    current = findAgent(current.reports_to);
  }
  return chain;
}

function isDirectReport(managerId: string, reportId: string): boolean {
  const report = findAgent(reportId);
  return !!report && report.reports_to === managerId;
}

function isInChain(senderId: string, receiverId: string): boolean {
  const senderChain = agentChain(senderId);
  const receiverChain = agentChain(receiverId);
  return senderChain.includes(receiverId) || receiverChain.includes(senderId);
}

export function routeAgentMessage(
  fromId: string,
  toId: string,
  content: string,
  timestamp: string,
): MessageResult {
  const from = findAgent(fromId);
  const to = findAgent(toId);
  const msg: AgentMessage = {
    id: nextId(),
    from: fromId,
    to: toId,
    content,
    timestamp,
    routedThrough: CEO_ID,
    allowed: false,
    reason: '',
  };

  if (!from) {
    msg.reason = `Unknown sender: ${fromId}`;
    return { ok: false, message: msg, blocked: true, blockReason: msg.reason };
  }
  if (!to) {
    msg.reason = `Unknown receiver: ${toId}`;
    return { ok: false, message: msg, blocked: true, blockReason: msg.reason };
  }

  // Virat (DS-00) and Myoho (DS-01) can message anyone
  if (fromId === 'DS-00' || fromId === 'DS-01') {
    msg.allowed = true;
    msg.reason = 'Founder/guardian can message any agent';
    msg.routedThrough = fromId;
    return { ok: true, message: msg, blocked: false, blockReason: null };
  }

  // CEO (DS-02) can message any direct report or any agent
  if (fromId === CEO_ID) {
    msg.allowed = true;
    msg.reason = 'CEO routes directly';
    msg.routedThrough = CEO_ID;
    return { ok: true, message: msg, blocked: false, blockReason: null };
  }

  // Direct manager-report communication is allowed
  if (isDirectReport(fromId, toId) || isDirectReport(toId, fromId)) {
    msg.allowed = true;
    msg.reason = 'Direct reporting line';
    msg.routedThrough = CEO_ID;
    return { ok: true, message: msg, blocked: false, blockReason: null };
  }

  // Brand CEO to brand CEO (peer) is blocked — must go through CEO
  if (from.role === 'brand_ceo' && to.role === 'brand_ceo') {
    msg.reason = 'Brand CEOs cannot message each other directly; route through CEO (DS-02)';
    return { ok: false, message: msg, blocked: true, blockReason: msg.reason };
  }

  // Any agent in the same chain can communicate
  if (isInChain(fromId, toId)) {
    msg.allowed = true;
    msg.reason = 'Same reporting chain';
    msg.routedThrough = CEO_ID;
    return { ok: true, message: msg, blocked: false, blockReason: null };
  }

  // Cross-branch communication blocked — must escalate through CEO
  msg.reason = `Cross-branch message from ${fromId} to ${toId} must route through CEO (DS-02)`;
  return { ok: false, message: msg, blocked: true, blockReason: msg.reason };
}

export type EscalationStep = { agentId: string; agentName: string; role: string };

export function escalationChain(fromId: string): EscalationStep[] {
  const chain: EscalationStep[] = [];
  let current = findAgent(fromId);
  while (current && current.reports_to) {
    const manager = findAgent(current.reports_to);
    if (manager) {
      chain.push({ agentId: manager.id, agentName: manager.name, role: manager.role });
    }
    current = manager ?? null;
  }
  return chain;
}

export function validateEscalationPath(fromId: string, toId: string): {
  valid: boolean;
  path: EscalationStep[];
  reason: string;
} {
  const chain = escalationChain(fromId);
  const targetIdx = chain.findIndex(s => s.agentId === toId);

  if (targetIdx === -1) {
    return { valid: false, path: chain, reason: `${toId} is not in the escalation chain of ${fromId}` };
  }

  return {
    valid: true,
    path: chain.slice(0, targetIdx + 1),
    reason: `Escalation from ${fromId} to ${toId} follows the reporting chain`,
  };
}

export function resetMessageCounter(): void {
  messageCounter = 0;
}
