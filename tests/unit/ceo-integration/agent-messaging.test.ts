// Phase 7: Connect through CEO — inter-agent messaging and escalation
import { describe, it, expect, beforeEach } from 'vitest';
import {
  routeAgentMessage,
  escalationChain,
  validateEscalationPath,
  resetMessageCounter,
} from '../../../src/lib/ceo/agent-messaging';

beforeEach(() => resetMessageCounter());

describe('Phase 7: Agent messaging through CEO', () => {
  it('CEO (DS-02) can message any agent', () => {
    const r = routeAgentMessage('DS-02', 'MG-01', 'Update Moon products', '2026-10-10T10:00:00Z');
    expect(r.ok).toBe(true);
    expect(r.message.routedThrough).toBe('DS-02');
  });

  it('Virat (DS-00) can message any agent', () => {
    const r = routeAgentMessage('DS-00', 'DS-13', 'Check invoice', '2026-10-10T10:00:00Z');
    expect(r.ok).toBe(true);
  });

  it('brand CEO can message its manager (CEO)', () => {
    const r = routeAgentMessage('MG-01', 'DS-02', 'Moon status report', '2026-10-10T10:00:00Z');
    expect(r.ok).toBe(true);
    expect(r.message.reason).toContain('reporting');
  });

  it('brand CEO to brand CEO is blocked', () => {
    const r = routeAgentMessage('MG-01', 'TC-01', 'Hey Trav', '2026-10-10T10:00:00Z');
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.blockReason).toContain('route through CEO');
  });

  it('specialist to unrelated branch is blocked', () => {
    // DS-16 (Guard) reports to DS-11 (Grow); DS-13 (Books) is a different branch
    const r = routeAgentMessage('DS-16', 'DS-13', 'Cross-branch request', '2026-10-10T10:00:00Z');
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(true);
  });

  it('direct manager-report communication is allowed', () => {
    // DS-11 (Grow) reports to DS-02; DS-16 (Guard) reports to DS-11
    const r = routeAgentMessage('DS-11', 'DS-16', 'Review the asset', '2026-10-10T10:00:00Z');
    expect(r.ok).toBe(true);
  });

  it('unknown agent is rejected', () => {
    const r = routeAgentMessage('FAKE-01', 'DS-02', 'Hello', '2026-10-10T10:00:00Z');
    expect(r.ok).toBe(false);
    expect(r.blockReason).toContain('Unknown sender');
  });

  it('messages are assigned sequential IDs', () => {
    const r1 = routeAgentMessage('DS-02', 'MG-01', 'First', '2026-10-10T10:00:00Z');
    const r2 = routeAgentMessage('DS-02', 'TC-01', 'Second', '2026-10-10T10:01:00Z');
    expect(r1.message.id).toBe('MSG-1');
    expect(r2.message.id).toBe('MSG-2');
  });
});

describe('Escalation chain', () => {
  it('brand CEO escalates through CEO → Myoho → Virat', () => {
    const chain = escalationChain('MG-01');
    const ids = chain.map(s => s.agentId);
    expect(ids).toEqual(['DS-02', 'DS-01', 'DS-00']);
  });

  it('specialist escalates through HoD → CEO → Myoho → Virat', () => {
    const chain = escalationChain('DS-16');
    const ids = chain.map(s => s.agentId);
    expect(ids).toEqual(['DS-11', 'DS-02', 'DS-01', 'DS-00']);
  });

  it('validates escalation path from brand CEO to Virat', () => {
    const result = validateEscalationPath('TC-01', 'DS-00');
    expect(result.valid).toBe(true);
    expect(result.path.length).toBe(3);
    expect(result.path[result.path.length - 1].agentId).toBe('DS-00');
  });

  it('rejects escalation to an agent not in the chain', () => {
    const result = validateEscalationPath('MG-01', 'TC-01');
    expect(result.valid).toBe(false);
  });

  it('Virat has no escalation chain (top of hierarchy)', () => {
    const chain = escalationChain('DS-00');
    expect(chain.length).toBe(0);
  });
});
