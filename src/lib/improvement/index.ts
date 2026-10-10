// Improvement System — barrel exports.

export { PROCESS_EFFICIENCY_ID, PROCESS_EFFICIENCY_AGENT, PROCESS_EFFICIENCY_PASSPORT } from './agent';

export type {
  Function, Process, Task, PtmClassification,
  ImprovementCategory, ImprovementStatus, ImprovementSignalSource,
  RootCause, RecurrenceRecord, ChangeProposal,
  ImprovementBenefit, BeforeAfter, Improvement, ImprovementGovernance,
} from './types';
export {
  FUNCTIONS, IMPROVEMENT_CATEGORIES, IMPROVEMENT_STATUSES,
  IMPROVEMENT_SIGNAL_SOURCES,
} from './types';

export {
  detectRecurrence, RECURRENCE_THRESHOLD, validateRootCause,
  classifySignalSource, classifyImprovementCategory, shouldCreateImprovement,
} from './detection';

export {
  requiresCeoReview, requiresMyohoReview, requiresFounderApproval,
  resolveGovernance, validateChangeProposal, canTransition, requiresApprovalForTransition,
} from './governance';

export type { ImprovementLearning, LearningState, ProtectedDomain } from './learning';
export {
  LEARNING_STATES, isProtectedDomain, canPromoteToRule,
  requiresApprovalForRule, toLearning, canTransitionLearning,
} from './learning';
