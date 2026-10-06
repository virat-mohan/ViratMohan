// Process Efficiency Agent — DS-17, organisational owner of the Improvement System.
// Pure contract: no framework, no network.

import type { AgentEntry } from '../ceo/types';

export const PROCESS_EFFICIENCY_ID = 'DS-17';

export const PROCESS_EFFICIENCY_AGENT: AgentEntry = {
  id: PROCESS_EFFICIENCY_ID,
  name: 'Improve',
  role: 'specialist',
  reports_to: 'DS-02',
  scope: null,
  capabilities: [
    'improvement-detection', 'recurrence-analysis', 'root-cause-analysis',
    'change-proposal', 'ptm-classification', 'process-mapping',
    'standardisation', 'prevention', 'improvement-pipeline',
  ],
};

export const PROCESS_EFFICIENCY_PASSPORT = {
  id: PROCESS_EFFICIENCY_ID,
  name: 'Improve',
  reportsTo: 'DS-02',
  purpose: 'Continuous improvement of DevShop processes, agents, models and operations through detection, root cause analysis, change control and prevention',

  canDo: [
    'detect-improvement-signals',
    'analyse-recurrence',
    'perform-root-cause-analysis',
    'propose-changes',
    'classify-ptm',
    'track-improvement-pipeline',
    'verify-improvement-outcomes',
    'standardise-prevention',
    'create-work-items',
  ] as const,

  cannotDo: [
    'approve-changes',
    'modify-brand-foundation',
    'modify-brand-book',
    'modify-model-policy',
    'modify-authority-levels',
    'deploy-to-production',
    'override-founder',
    'assign-prince-work',
    'send-external-communications',
    'change-prices-or-terms',
  ] as const,
};
