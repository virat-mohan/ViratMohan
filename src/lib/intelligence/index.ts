// Intelligence module — Model Registry, Router, Governance.
// Pure contract: no provider calls, no network, no framework.
export { MODEL_REGISTRY, findModel, modelsByTier, availableModels, withAvailability } from './models';
export type { ModelEntry, ModelTier } from './models';
export { routeTask, shouldEscalate, agentPolicy, buildAttribution, AGENT_MODEL_DEFAULTS, MAX_ESCALATION_ATTEMPTS, MAX_RETRIES_PER_TIER } from './router';
export type { TaskProfile, TaskComplexity, TaskRisk, RoutingDecision, EscalationRequest, EscalationResult, AgentModelPolicy, CostAttribution } from './router';
export { requiresFableGovernance, validateFableJustification, requiresCeoConsultation, requiresMyohoConsultation, isRoutineRouting, isRoutineForMyoho, isRunaway, RUNAWAY_LIMITS, QUALITY_FLOORS, qualityFloorFor } from './governance';
export type { FableJustification, ConsultationTrigger, MyohoTrigger, RunawayCheck, QualityFloor } from './governance';
export type { AutonomyLevel } from './types';
export { RESPONSIBLE_TECHNOLOGY_POLICY, shouldInvoke } from './responsible-technology';
export type { InvocationGuard, ResponsibleTechnologyRule } from './responsible-technology';
export { gateInvocation } from './invocation-gate';
export type { InvocationRequest, InvocationPermit, RequiredAuthority } from './invocation-gate';
export { summariseModelLearning, MIN_OBSERVATIONS_FOR_RECOMMENDATION } from './model-learning';
export type { ModelObservation, ModelLearning } from './model-learning';
