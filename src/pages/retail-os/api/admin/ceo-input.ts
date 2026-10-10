export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { json, readJson } from '../../../../lib/retail-os-http';
import { serviceDb } from '../../../../lib/ledger';
import { createSupabaseWorkStore } from '../../../../lib/work/db-store';
import { handleFounderInput, type FounderRequestBody, type FounderDeps } from '../../../../lib/ceo/founder-service';
import { fetchBrainContext, emptyBrainContext } from '../../../../lib/ceo/brain-context';
import { SupabaseStore } from '../../../../lib/brain/store';
import {
  createSupabaseDecisionStore,
  createSupabaseTrainingStore,
  createSupabaseOnboardingStore,
  createSupabaseDashboardConfigStore,
} from '../../../../lib/ceo/db-stores';
import { AGENT_REGISTRY } from '../../../../lib/ceo/types';
import type { AssessmentResult } from '../../../../lib/ceo/agent-training';

// Founder Command Centre → CEO runtime. Admin password gate (middleware and again inside the handler).
// Service-role access stays on the server. Nothing here sends, deploys, spends or contacts anyone.
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const hasDb = !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const sb = hasDb ? serviceDb(env) : null;
  const store = sb ? createSupabaseWorkStore(sb) : null;

  const deps: FounderDeps = { store, adminPassword: env.ADMIN_PASSWORD };

  if (sb) {
    // Parse brand from body for Brain context scoping (read body once, keep ref)
    const body = await readJson<FounderRequestBody>(request);
    const brand = typeof body?.brand === 'string' && body.brand ? body.brand : null;

    // Brain context — requires brain_search RPC; degrade gracefully if not deployed yet
    try {
      const brainStore = new SupabaseStore(sb);
      deps.brainContext = await fetchBrainContext(brainStore, { brand });
    } catch {
      deps.brainContext = emptyBrainContext();
    }

    // Org decisions
    try {
      const decisionStore = createSupabaseDecisionStore(sb);
      deps.decisions = await decisionStore.loadDecisions();
    } catch { /* table may not exist yet */ }

    // Onboarding state
    try {
      const onboardingStore = createSupabaseOnboardingStore(sb);
      deps.onboarding = await onboardingStore.loadAll();
    } catch { /* table may not exist yet */ }

    // Dashboard configs
    try {
      const dashboardStore = createSupabaseDashboardConfigStore(sb);
      deps.dashboards = await dashboardStore.loadAllConfigs();
    } catch { /* table may not exist yet */ }

    // Agent training assessments — build the storedAssessments map
    try {
      const trainingStore = createSupabaseTrainingStore(sb);
      const assessmentMap = new Map<string, AssessmentResult[]>();
      await Promise.all(
        AGENT_REGISTRY.map(async (agent) => {
          const passport = await trainingStore.loadPassport(agent.id);
          if (passport?.assessments?.length) {
            assessmentMap.set(agent.id, passport.assessments);
          }
        }),
      );
      if (assessmentMap.size > 0) deps.storedAssessments = assessmentMap;
    } catch { /* table may not exist yet */ }

    try {
      const r = await handleFounderInput(request.headers.get('authorization'), body, deps);
      return json(r.body, r.status);
    } catch (err) {
      console.error('ceo-input', err);
      return json({ error: 'The CEO runtime could not complete this request' }, 500);
    }
  }

  // No Supabase: pass body normally
  const body = await readJson<FounderRequestBody>(request);
  try {
    const r = await handleFounderInput(request.headers.get('authorization'), body, deps);
    return json(r.body, r.status);
  } catch (err) {
    console.error('ceo-input', err);
    return json({ error: 'The CEO runtime could not complete this request' }, 500);
  }
};
