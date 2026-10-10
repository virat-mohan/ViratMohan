// Control Tower: the operating layer above Work Registry.
// Reads from Work Registry; never creates its own ticket records.
// Pure contract — no framework, no network.

import type { Actor, Priority, WorkItem, WorkState, WorkType } from '../work/types';

export const CONTROL_TOWER_STAGES = [
  'detect',
  'classify',
  'prioritise',
  'assign',
  'escalate',
  'track',
  'verify',
  'learn',
] as const;
export type ControlTowerStage = (typeof CONTROL_TOWER_STAGES)[number];

export interface WorkSummary {
  id: string;
  ref: string;
  title: string;
  type: WorkType;
  state: WorkState;
  priority: Priority | null;
  brand: string | null;
  owner: Actor | null;
  created_at: string;
  updated_at: string;
  stage: ControlTowerStage;
}

export interface ControlTowerView {
  total: number;
  byStage: Record<ControlTowerStage, WorkSummary[]>;
  byPriority: Record<Priority, WorkSummary[]>;
  byBrand: Record<string, WorkSummary[]>;
  unassigned: WorkSummary[];
  blocked: WorkSummary[];
  pendingApproval: WorkSummary[];
  critical: WorkSummary[];
}
