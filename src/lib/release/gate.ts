// Production-readiness gate: pure evaluator. READY only if no blocking check has failed or is still pending.
export type CheckStatus = 'pass' | 'fail' | 'pending';

export interface GateCheck {
  id: string;
  area: 'build' | 'typecheck' | 'tests' | 'security' | 'health' | 'live';
  /** Blocking checks decide READY/BLOCKED. Non-blocking are reported only. */
  blocking: boolean;
  status: CheckStatus;
  evidence: string;
}

export interface GateReport {
  verdict: 'READY' | 'BLOCKED';
  blockers: GateCheck[];
  nonBlocking: GateCheck[];
  passed: GateCheck[];
}

export function evaluateGate(checks: GateCheck[]): GateReport {
  const blockers = checks.filter((c) => c.blocking && c.status !== 'pass');
  return {
    verdict: blockers.length === 0 ? 'READY' : 'BLOCKED',
    blockers,
    nonBlocking: checks.filter((c) => !c.blocking && c.status !== 'pass'),
    passed: checks.filter((c) => c.status === 'pass'),
  };
}

/** Typecheck lines in these paths are on the production path and block; all other errors are reported as documented debt. */
export const PRODUCTION_PATH = /^src\/(lib\/(work|ceo|intelligence|improvement|control-tower|release)|pages\/retail-os\/api\/(health|admin))\//;

export function splitTypeErrors(output: string): { production: string[]; other: string[] } {
  const lines = output.split('\n').filter((l) => /^\S.*\(\d+,\d+\): error TS\d+/.test(l));
  return { production: lines.filter((l) => PRODUCTION_PATH.test(l)), other: lines.filter((l) => !PRODUCTION_PATH.test(l)) };
}
