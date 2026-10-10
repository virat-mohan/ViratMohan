// Supabase-backed persistence stores for CEO operating tables (migration 0057).
// Follows the same Sb interface pattern as work/db-store.ts. Server-side only.

import type { TrainingStore, AgentPassport, AssessmentResult, CertLevel } from './agent-training';
import type { PeopleStore, HumanWorker } from './people';

type DbResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
type Sb = {
  from(table: string): {
    select: (cols?: string) => DbResult<Record<string, unknown>> & { eq?: (col: string, val: unknown) => DbResult<Record<string, unknown>>; order?: (col: string, opts?: { ascending?: boolean }) => DbResult<Record<string, unknown>> };
    upsert: (rows: unknown[], opts?: { onConflict: string }) => PromiseLike<{ error: { message: string } | null }>;
    insert: (rows: unknown[]) => PromiseLike<{ error: { message: string } | null }>;
  };
};

const must = async <T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> => {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return (data ?? []) as T;
};

// ── Training Store ──────────────────────────────────────────────────────────

interface PassportRow {
  agent_id: string; agent_name: string; role: string; reports_to: string;
  mandate: string; kras: string[]; kpis: string[]; capabilities: string[];
  brand_permissions: string[]; certification: CertLevel;
  training_modules: unknown[]; gaps: string[];
  version: string; created_at: string; updated_at: string;
}

interface AssessmentRow {
  id: string; agent_id: string; scenario_id: string; module_id: string;
  passed: boolean; evidence: string; assessed_by: string; assessed_at: string;
}

export function createSupabaseTrainingStore(client: Sb): TrainingStore {
  return {
    async loadPassport(agentId: string): Promise<AgentPassport | null> {
      const rows = await must<PassportRow[]>(
        (client.from('agent_passports').select('*') as any).eq('agent_id', agentId),
        'load passport',
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      const assessments = await must<AssessmentRow[]>(
        (client.from('agent_assessments').select('*') as any).eq('agent_id', agentId),
        'load assessments',
      );
      return {
        agent_id: r.agent_id,
        agent_name: r.agent_name,
        role: r.role,
        reports_to: r.reports_to,
        mandate: r.mandate,
        kras: r.kras,
        kpis: r.kpis ?? [],
        capabilities: r.capabilities,
        brand_permissions: r.brand_permissions,
        certification: r.certification,
        training_modules: r.training_modules as AgentPassport['training_modules'],
        assessments: assessments.map(a => ({
          scenario_id: a.scenario_id,
          passed: a.passed,
          evidence: a.evidence,
          assessed_by: a.assessed_by,
          assessed_at: a.assessed_at,
        })),
        gaps: r.gaps,
        version: r.version,
        updated_at: r.updated_at,
      };
    },

    async savePassport(passport: AgentPassport): Promise<void> {
      const now = new Date().toISOString();
      const { error } = await client.from('agent_passports').upsert([{
        agent_id: passport.agent_id,
        agent_name: passport.agent_name,
        role: passport.role,
        reports_to: passport.reports_to,
        mandate: passport.mandate,
        kras: passport.kras,
        kpis: passport.kpis ?? [],
        capabilities: passport.capabilities,
        brand_permissions: passport.brand_permissions,
        certification: passport.certification,
        training_modules: passport.training_modules,
        gaps: passport.gaps,
        version: passport.version,
        updated_at: now,
      }], { onConflict: 'agent_id' });
      if (error) throw new Error(`save passport: ${error.message}`);
    },

    async saveAssessment(agentId: string, result: AssessmentResult): Promise<void> {
      const { error } = await client.from('agent_assessments').insert([{
        agent_id: agentId,
        scenario_id: result.scenario_id,
        passed: result.passed,
        evidence: result.evidence,
        assessed_by: result.assessed_by,
        assessed_at: result.assessed_at,
      }]);
      if (error) throw new Error(`save assessment: ${error.message}`);
    },
  };
}

// ── People Store ────────────────────────────────────────────────────────────

interface WorkerRow {
  id: string; name: string; email_work: string; email_personal: string | null;
  whatsapp: string; role: string; scope: string; reports_to: string;
  active: boolean; started_at: string; created_at: string; updated_at: string;
}

export function createSupabasePeopleStore(client: Sb): PeopleStore {
  return {
    async loadWorker(id: string): Promise<HumanWorker | null> {
      const rows = await must<WorkerRow[]>(
        (client.from('human_workers').select('*') as any).eq('id', id),
        'load worker',
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id, name: r.name, email_work: r.email_work,
        email_personal: r.email_personal, whatsapp: r.whatsapp,
        role: r.role, scope: r.scope, reports_to: r.reports_to,
        started_at: r.started_at, active: r.active,
      };
    },

    async loadAllWorkers(): Promise<HumanWorker[]> {
      const rows = await must<WorkerRow[]>(
        client.from('human_workers').select('*') as any,
        'load workers',
      );
      return rows.map(r => ({
        id: r.id, name: r.name, email_work: r.email_work,
        email_personal: r.email_personal, whatsapp: r.whatsapp,
        role: r.role, scope: r.scope, reports_to: r.reports_to,
        started_at: r.started_at, active: r.active,
      }));
    },

    async saveWorker(worker: HumanWorker): Promise<void> {
      const { error } = await client.from('human_workers').upsert([{
        id: worker.id, name: worker.name, email_work: worker.email_work,
        email_personal: worker.email_personal, whatsapp: worker.whatsapp,
        role: worker.role, scope: worker.scope, reports_to: worker.reports_to,
        active: worker.active, started_at: worker.started_at,
        updated_at: new Date().toISOString(),
      }], { onConflict: 'id' });
      if (error) throw new Error(`save worker: ${error.message}`);
    },
  };
}

// ── Org Decisions Store ─────────────────────────────────────────────────────

export interface OrgDecision {
  id: string;
  scope: 'company' | 'retail_os' | 'brand';
  brand: string | null;
  category: string;
  decision: string;
  evidence: string;
  decided_by: string;
  decided_at: string;
  superseded_by: string | null;
  created_at: string;
}

export interface OrgDecisionStore {
  loadDecisions(scope?: string, brand?: string | null): Promise<OrgDecision[]>;
  saveDecision(d: Omit<OrgDecision, 'id' | 'created_at'>): Promise<void>;
}

export function createSupabaseDecisionStore(client: Sb): OrgDecisionStore {
  return {
    async loadDecisions(scope?: string, brand?: string | null): Promise<OrgDecision[]> {
      let q: any = client.from('org_decisions').select('*');
      if (scope) q = q.eq('scope', scope);
      if (brand) q = q.eq('brand', brand);
      const rows = await must<OrgDecision[]>(q, 'load decisions');
      return rows.filter(r => !r.superseded_by);
    },

    async saveDecision(d: Omit<OrgDecision, 'id' | 'created_at'>): Promise<void> {
      const { error } = await client.from('org_decisions').insert([d]);
      if (error) throw new Error(`save decision: ${error.message}`);
    },
  };
}

// ── Onboarding State Store ──────────────────────────────────────────────────

export interface OnboardingRecord {
  brand_key: string;
  client_name: string | null;
  stage: string;
  overall: string;
  components: unknown[];
  complete: number;
  total: number;
  next_action: unknown | null;
  blockers: unknown[];
  work_id: string | null;
  updated_at: string;
  created_at: string;
}

export interface OnboardingStore {
  loadAll(): Promise<OnboardingRecord[]>;
  loadByBrand(brandKey: string): Promise<OnboardingRecord | null>;
  save(record: OnboardingRecord): Promise<void>;
}

export function createSupabaseOnboardingStore(client: Sb): OnboardingStore {
  return {
    async loadAll(): Promise<OnboardingRecord[]> {
      return must<OnboardingRecord[]>(client.from('onboarding_state').select('*') as any, 'load onboarding');
    },

    async loadByBrand(brandKey: string): Promise<OnboardingRecord | null> {
      const rows = await must<OnboardingRecord[]>(
        (client.from('onboarding_state').select('*') as any).eq('brand_key', brandKey),
        'load onboarding brand',
      );
      return rows[0] ?? null;
    },

    async save(record: OnboardingRecord): Promise<void> {
      const { error } = await client.from('onboarding_state').upsert([{
        ...record,
        updated_at: new Date().toISOString(),
      }], { onConflict: 'brand_key' });
      if (error) throw new Error(`save onboarding: ${error.message}`);
    },
  };
}

// ── Dashboard Config Store ──────────────────────────────────────────────────

export interface DashboardConfig {
  brand_key: string;
  enabled_modules: string[];
  module_states: Record<string, string>;
  brand_ceo_id: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DashboardConfigStore {
  loadConfig(brandKey: string): Promise<DashboardConfig | null>;
  loadAllConfigs(): Promise<DashboardConfig[]>;
  saveConfig(config: DashboardConfig): Promise<void>;
}

export function createSupabaseDashboardConfigStore(client: Sb): DashboardConfigStore {
  return {
    async loadConfig(brandKey: string): Promise<DashboardConfig | null> {
      const rows = await must<DashboardConfig[]>(
        (client.from('brand_dashboard_config').select('*') as any).eq('brand_key', brandKey),
        'load dashboard config',
      );
      return rows[0] ?? null;
    },

    async loadAllConfigs(): Promise<DashboardConfig[]> {
      return must<DashboardConfig[]>(client.from('brand_dashboard_config').select('*') as any, 'load all configs');
    },

    async saveConfig(config: DashboardConfig): Promise<void> {
      const { error } = await client.from('brand_dashboard_config').upsert([{
        ...config,
        updated_at: new Date().toISOString(),
      }], { onConflict: 'brand_key' });
      if (error) throw new Error(`save dashboard config: ${error.message}`);
    },
  };
}
