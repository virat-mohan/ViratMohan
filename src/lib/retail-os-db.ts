import { createClient } from '@supabase/supabase-js';

export type StageStatus = 'pending' | 'done' | 'skipped';

export type RetailOsStage = {
  key: string;
  label: string;
  note: string;
  status: StageStatus;
};

export const RETAIL_OS_STAGE_DEFS: { key: string; label: string; note: string }[] = [
  { key: 'submitted', label: 'Application submitted', note: '' },
  { key: 'agreement', label: 'Commercial terms signed', note: 'Your terms appear on this page for signature once DevShop has reviewed your application.' },
  { key: 'deposit', label: 'Deposit received', note: '₹5,000, fully adjusted against your actual onboarding tech costs; DevShop keeps none of it. The 7-day build starts once it is confirmed.' },
  { key: 'identity', label: 'Brand identity set up', note: 'Domain, brand email, Instagram and Meta Business Manager, for brands starting fresh.' },
  { key: 'catalog', label: 'Catalog connected', note: 'Shopify import or manual catalog build.' },
  { key: 'design', label: 'Design direction proposed', note: 'Reference sites, palette, and typography drafted from the brand\'s existing look — or a proven category reference if there isn\'t one yet.' },
  { key: 'payments', label: 'Payments configured', note: 'Gateway KYC and settlement account linked.' },
  { key: 'shipping', label: 'Shipping configured', note: 'Carrier account or DevShop aggregator wired in.' },
  { key: 'meta', label: 'Meta linked', note: 'Business Manager, catalog and pixel connected.' },
  { key: 'whatsapp', label: 'WhatsApp provisioned', note: 'Business API number live for orders and catalog checkout.' },
  { key: 'postbarter', label: 'Pay with a Post activated', note: '' },
  { key: 'golive', label: 'Go-live review', note: 'Final checklist before the storefront goes public.' },
  { key: 'live', label: 'Live & selling', note: 'Storefront public, ads running.' },
];

export type SkuAttribute = { name: string; options: string[] };
export type BrandProgrammes = {
  loyalty: { name: string | null; pointsPerUnit: number | null; redeemEveryPoints: number | null; redeemValueInr: number | null } | null;
  referral: { friendDiscountInr: number | null; referrerRewardPoints: number | null } | null;
  dropsName: string | null;
  storiesName: string | null;
};

export type ReportSchedule = {
  id: string; brand_key: string; frequency: 'daily' | 'weekly' | 'monthly'; channel: 'email' | 'whatsapp';
  recipient: string; active: boolean; last_sent_at: string | null; created_at: string;
};

export type BrandStatus = 'existing' | 'new_sub_brand' | 'from_zero';
export type RetailOsTerms = { splitPct: number | null; aiEnabler: boolean; notes: string | null; sentAt: string };
export type RetailOsAgreement = { signedName: string; signedAt: string; ip: string | null; userAgent: string | null; terms: Record<string, unknown> };
export type RetailOsDeposit = { amountInr: number; utr: string; submittedAt: string; confirmedAt: string | null };

export type RetailOsApplication = {
  id: string;
  brand_name: string;
  founder_name: string;
  founder_email: string;
  founder_phone: string | null;
  category: string | null;
  format: string | null;
  handle: string | null;
  has_revenue: string | null;
  revenue_range: string | null;
  following: string | null;
  catalog_mode: string | null;
  shopify_url: string | null;
  product_count: string | null;
  payment_mode: string | null;
  pincode: string | null;
  carrier: string | null;
  meta_bm: string | null;
  ad_budget: string | null;
  wa_number: string | null;
  post_ack: boolean;
  split_range_lo: number | null;
  split_range_hi: number | null;
  ai_enabler_track: boolean;
  stages: RetailOsStage[];
  payment_methods: string | null;
  shipping_charge_model: string | null;
  free_shipping_threshold: string | null;
  same_day_delivery: string | null;
  same_day_cities: string | null;
  return_window: string | null;
  loyalty_methodology: string | null;
  referral_methodology: string | null;
  target_cities: string | null;
  business_registration: string | null;
  store_categories: string[] | null;
  product_noun_singular: string | null;
  product_noun_plural: string | null;
  sku_attributes: SkuAttribute[] | null;
  programmes: BrandProgrammes | null;
  brand_status: BrandStatus | null;
  model_details: Record<string, string> | null;
  prep_started_at: string | null;
  prep_error: string | null;
  terms: RetailOsTerms | null;
  agreement: RetailOsAgreement | null;
  deposit: RetailOsDeposit | null;
  build_started_at: string | null;
  setup_answers: Record<string, { answers: Record<string, string>; savedAt: string }> | null;
  created_at: string;
  updated_at: string;
};

export type BusinessPlanAssumption = { label: string; value: string; rationale: string; basis: string };
export type BusinessPlanDriverRationale = {
  orders: string; aov: string; cogsPct: string; cacPct: string; adminTechPct: string;
  payments: string; logistics: string; postBarter: string; platformTools: string;
};
export type BusinessPlanDrivers = {
  ordersM1: number; ordersM2: number; ordersM3: number;
  aovInr: number; cogsPct: number; cacPct: number; adminTechPct: number;
  codOrderSharePct: number; paymentGatewayFeePct: number; codHandlingFeePct: number; postBarterFeePct: number;
  rtoRatePct: number; rtoCostPerOrderInr: number; shippingCostPerOrderInr: number; packagingCostPerOrderInr: number;
  platformToolsFixedInrPerMonth: number;
  rationale: BusinessPlanDriverRationale;
};
export type BusinessPlanMonth = {
  label: string; orders: number; revenueInr: number; cogsInr: number; cacInr: number; adminTechInr: number;
  codOrders: number; prepaidOrders: number; gatewayFeeInr: number; codHandlingFeeInr: number; postBarterFeeInr: number;
  rtoOrders: number; rtoCostInr: number; shippingInr: number; packagingInr: number;
  platformToolsInr: number; operatingExpensesInr: number;
  profitPoolInr: number; devshopShareInr: number; founderShareInr: number;
};
export type BusinessPlanCity = { city: string; revenueSharePct: number; rationale: string };
export type RetailOsBusinessPlan = {
  id: string;
  application_id: string;
  model: string;
  prompt_version: string;
  research_notes: string;
  assumptions: BusinessPlanAssumption[];
  drivers: BusinessPlanDrivers;
  months: BusinessPlanMonth[];
  city_breakdown: BusinessPlanCity[];
  risks: string[];
  sources_cited: string[];
  quarter_totals: Record<string, number>;
  created_at: string;
};

export type DesignReference = { name: string; url: string; note: string };
export type DesignColorPalette = { primaryHex: string; secondaryHex: string; accentHex: string; backgroundHex: string; textHex: string; rationale: string };
export type DesignTypography = { headingFont: string; bodyFont: string; rationale: string };
export type RetailOsDesignDirection = {
  id: string;
  application_id: string;
  model: string;
  prompt_version: string;
  has_existing_site: boolean;
  primary_reference: DesignReference;
  additional_references: DesignReference[];
  color_palette: DesignColorPalette;
  typography: DesignTypography;
  ux_principles: string[];
  tone_of_voice: string;
  created_at: string;
};

export type RetailOsActual = {
  id: string;
  application_id: string;
  month: string;
  revenue_inr: number;
  cogs_inr: number;
  cac_inr: number;
  admin_tech_inr: number;
  entered_at: string;
};

export function buildInitialStages(postAck: boolean, brandStatus: BrandStatus | null = null): RetailOsStage[] {
  const newBrand = brandStatus === 'new_sub_brand' || brandStatus === 'from_zero';
  return RETAIL_OS_STAGE_DEFS.map((s) => {
    let note = s.note;
    let status: StageStatus = 'pending';
    if (s.key === 'submitted') { status = 'done'; note = 'Received.'; }
    if (s.key === 'postbarter') {
      note = postAck ? 'Requested — activates once you\'re live.' : 'Not requested for launch.';
      status = postAck ? 'pending' : 'skipped';
    }
    if (s.key === 'identity' && !newBrand) {
      note = 'Not needed — your brand already has its own domain and accounts.';
      status = 'skipped';
    }
    return { key: s.key, label: s.label, note, status };
  });
}

// Journey state derived from the record itself, so it's right even for
// applications created before a stage existed in RETAIL_OS_STAGE_DEFS.
export type JourneyStep = 'preparing' | 'review' | 'sign' | 'deposit' | 'confirming' | 'building' | 'live';
export function journeyStep(app: RetailOsApplication, hasPlan: boolean, hasDesign: boolean): JourneyStep {
  if (app.stages?.some((s) => s.key === 'live' && s.status === 'done')) return 'live';
  if (app.deposit?.confirmedAt) return 'building';
  if (app.deposit?.submittedAt) return 'confirming';
  if (app.agreement) return 'deposit';
  if (app.terms) return 'sign';
  if (!hasPlan || !hasDesign) return 'preparing';
  return 'review';
}

export const BUILD_WINDOW_DAYS = 7;
export const DEPOSIT_INR = 5000;

export function getRetailOsDb(env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  return {
    async insert(row: {
      brand_name: string; founder_name: string; founder_email: string; founder_phone: string | null;
      category: string | null; format: string | null; handle: string | null;
      has_revenue: string | null; revenue_range: string | null; following: string | null;
      catalog_mode: string | null; shopify_url: string | null; product_count: string | null;
      payment_mode: string | null; pincode: string | null; carrier: string | null;
      meta_bm: string | null; ad_budget: string | null; wa_number: string | null;
      post_ack: boolean; split_range_lo: number | null; split_range_hi: number | null; ai_enabler_track: boolean;
      payment_methods: string | null; shipping_charge_model: string | null; free_shipping_threshold: string | null;
      same_day_delivery: string | null; same_day_cities: string | null; return_window: string | null;
      loyalty_methodology: string | null; referral_methodology: string | null; target_cities: string | null;
      business_registration: string | null;
      store_categories: string[] | null; product_noun_singular: string | null;
      product_noun_plural: string | null; sku_attributes: SkuAttribute[] | null;
      programmes: BrandProgrammes | null;
      brand_status: BrandStatus | null; model_details: Record<string, string> | null;
    }): Promise<string> {
      const stages = buildInitialStages(row.post_ack, row.brand_status);
      // Leave unanswered optional columns out entirely, so applications that
      // skip these questions still save if migrations 0022–0024 haven't run.
      const clean: Record<string, unknown> = { ...row, stages };
      for (const k of ['store_categories', 'product_noun_singular', 'product_noun_plural', 'sku_attributes', 'programmes', 'brand_status', 'model_details']) {
        if (clean[k] == null) delete clean[k];
      }
      const { data, error } = await supabase
        .from('retail_os_applications')
        .insert(clean)
        .select('id')
        .single();
      if (error) throw new Error(`supabase retail_os_applications insert failed: ${error.message}`);
      return (data as { id: string }).id;
    },

    async getById(id: string): Promise<RetailOsApplication | null> {
      const { data, error } = await supabase.from('retail_os_applications').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(`supabase retail_os_applications select failed: ${error.message}`);
      return data as RetailOsApplication | null;
    },

    async listRecent(limit = 200): Promise<RetailOsApplication[]> {
      const { data, error } = await supabase
        .from('retail_os_applications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(`supabase retail_os_applications list failed: ${error.message}`);
      return (data ?? []) as RetailOsApplication[];
    },

    // Atomically claims the right to run automatic preparation: succeeds only
    // if no run started in the last 10 minutes, so concurrent tracker visits
    // can't double-spend API credits.
    async claimPrep(id: string): Promise<boolean> {
      const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('retail_os_applications')
        .update({ prep_started_at: new Date().toISOString(), prep_error: null })
        .eq('id', id)
        // PostgREST needs values with ':' or '.' double-quoted inside or().
        .or(`prep_started_at.is.null,prep_started_at.lt."${cutoff}"`)
        .select('id');
      if (error) throw new Error(`supabase claimPrep failed: ${error.message}`);
      return (data ?? []).length > 0;
    },

    async countPrepsSince(sinceIso: string): Promise<number> {
      const { count, error } = await supabase
        .from('retail_os_applications')
        .select('id', { count: 'exact', head: true })
        .gte('prep_started_at', sinceIso);
      if (error) throw new Error(`supabase countPrepsSince failed: ${error.message}`);
      return count ?? 0;
    },

    async setPrepError(id: string, message: string | null) {
      const { error } = await supabase.from('retail_os_applications').update({ prep_error: message }).eq('id', id);
      if (error) throw new Error(`supabase setPrepError failed: ${error.message}`);
    },

    async setTerms(id: string, terms: RetailOsTerms) {
      const { error } = await supabase
        .from('retail_os_applications')
        .update({ terms, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`supabase setTerms failed: ${error.message}`);
    },

    // Only records a signature once: a second call on an already-signed
    // application changes nothing and returns false.
    async signAgreement(id: string, agreement: RetailOsAgreement): Promise<boolean> {
      const app = await this.getById(id);
      if (!app || app.agreement || !app.terms) return false;
      const stages = app.stages.map((s) => (s.key === 'agreement' ? { ...s, status: 'done' as StageStatus, note: `Signed by ${agreement.signedName}.` } : s));
      const { data, error } = await supabase
        .from('retail_os_applications')
        .update({ agreement, stages, updated_at: new Date().toISOString() })
        .eq('id', id)
        .is('agreement', null)
        .select('id');
      if (error) throw new Error(`supabase signAgreement failed: ${error.message}`);
      return (data ?? []).length > 0;
    },

    async submitDeposit(id: string, deposit: RetailOsDeposit) {
      const { error } = await supabase
        .from('retail_os_applications')
        .update({ deposit, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`supabase submitDeposit failed: ${error.message}`);
    },

    async confirmDeposit(id: string): Promise<RetailOsApplication | null> {
      const app = await this.getById(id);
      if (!app?.deposit) return null;
      const now = new Date().toISOString();
      const stages = app.stages.some((s) => s.key === 'deposit')
        ? app.stages.map((s) => (s.key === 'deposit' ? { ...s, status: 'done' as StageStatus, note: 'Confirmed. Your 7-day build has started.' } : s))
        : app.stages;
      const { error } = await supabase
        .from('retail_os_applications')
        .update({ deposit: { ...app.deposit, confirmedAt: now }, build_started_at: app.build_started_at ?? now, stages, updated_at: now })
        .eq('id', id);
      if (error) throw new Error(`supabase confirmDeposit failed: ${error.message}`);
      return this.getById(id);
    },

    async saveSetupSection(id: string, sectionKey: string, answers: Record<string, string>) {
      const app = await this.getById(id);
      if (!app) throw new Error('saveSetupSection: application not found');
      const setup_answers = { ...(app.setup_answers ?? {}), [sectionKey]: { answers, savedAt: new Date().toISOString() } };
      const { error } = await supabase
        .from('retail_os_applications')
        .update({ setup_answers, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`supabase saveSetupSection failed: ${error.message}`);
    },

    async listReportSchedules(): Promise<ReportSchedule[]> {
      const { data, error } = await supabase.from('retail_os_report_schedules').select('*').order('created_at', { ascending: true });
      if (error) throw new Error(`supabase listReportSchedules failed: ${error.message}`);
      return (data ?? []) as ReportSchedule[];
    },

    async addReportSchedule(row: { brand_key: string; frequency: string; channel: string; recipient: string }) {
      const { error } = await supabase.from('retail_os_report_schedules').insert(row);
      if (error) throw new Error(`supabase addReportSchedule failed: ${error.message}`);
    },

    async setReportScheduleActive(id: string, active: boolean) {
      const { error } = await supabase.from('retail_os_report_schedules').update({ active }).eq('id', id);
      if (error) throw new Error(`supabase setReportScheduleActive failed: ${error.message}`);
    },

    async markReportScheduleSent(id: string) {
      const { error } = await supabase.from('retail_os_report_schedules').update({ last_sent_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(`supabase markReportScheduleSent failed: ${error.message}`);
    },

    async deleteById(id: string) {
      const { error } = await supabase.from('retail_os_applications').delete().eq('id', id);
      if (error) throw new Error(`supabase retail_os_applications delete failed: ${error.message}`);
    },

    async findLatestByEmail(email: string): Promise<RetailOsApplication | null> {
      const { data, error } = await supabase
        .from('retail_os_applications')
        .select('*')
        .ilike('founder_email', email.trim())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`supabase retail_os_applications email lookup failed: ${error.message}`);
      return (data as RetailOsApplication | null) ?? null;
    },

    async setStageStatus(id: string, stageKey: string, status: StageStatus) {
      const app = await this.getById(id);
      if (!app) throw new Error('setStageStatus: application not found');
      const stages = app.stages.map((s) => (s.key === stageKey ? { ...s, status } : s));
      const { error } = await supabase
        .from('retail_os_applications')
        .update({ stages, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`supabase retail_os_applications stage update failed: ${error.message}`);
    },

    async saveBusinessPlan(row: {
      application_id: string; model: string; prompt_version: string; research_notes: string;
      assumptions: BusinessPlanAssumption[]; drivers: BusinessPlanDrivers; months: BusinessPlanMonth[];
      city_breakdown: BusinessPlanCity[]; risks: string[]; sources_cited: string[]; quarter_totals: Record<string, number>;
    }): Promise<string> {
      const { data, error } = await supabase.from('retail_os_business_plans').insert(row).select('id').single();
      if (error) throw new Error(`supabase retail_os_business_plans insert failed: ${error.message}`);
      return (data as { id: string }).id;
    },

    async updatePlanDrivers(planId: string, drivers: BusinessPlanDrivers, months: BusinessPlanMonth[], quarterTotals: Record<string, number>) {
      const { error } = await supabase
        .from('retail_os_business_plans')
        .update({ drivers, months, quarter_totals: quarterTotals })
        .eq('id', planId);
      if (error) throw new Error(`supabase retail_os_business_plans driver update failed: ${error.message}`);
    },

    async getBusinessPlanById(planId: string): Promise<RetailOsBusinessPlan | null> {
      const { data, error } = await supabase.from('retail_os_business_plans').select('*').eq('id', planId).maybeSingle();
      if (error) throw new Error(`supabase retail_os_business_plans get failed: ${error.message}`);
      return data as RetailOsBusinessPlan | null;
    },

    async getLatestBusinessPlan(applicationId: string): Promise<RetailOsBusinessPlan | null> {
      const { data, error } = await supabase
        .from('retail_os_business_plans')
        .select('*')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`supabase retail_os_business_plans select failed: ${error.message}`);
      return data as RetailOsBusinessPlan | null;
    },

    async saveDesignDirection(row: {
      application_id: string; model: string; prompt_version: string; has_existing_site: boolean;
      primary_reference: DesignReference; additional_references: DesignReference[];
      color_palette: DesignColorPalette; typography: DesignTypography; ux_principles: string[]; tone_of_voice: string;
    }): Promise<string> {
      const { data, error } = await supabase.from('retail_os_design_directions').insert(row).select('id').single();
      if (error) throw new Error(`supabase retail_os_design_directions insert failed: ${error.message}`);
      return (data as { id: string }).id;
    },

    async getLatestDesignDirection(applicationId: string): Promise<RetailOsDesignDirection | null> {
      const { data, error } = await supabase
        .from('retail_os_design_directions')
        .select('*')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`supabase retail_os_design_directions select failed: ${error.message}`);
      return data as RetailOsDesignDirection | null;
    },

    async upsertActual(row: { application_id: string; month: string; revenue_inr: number; cogs_inr: number; cac_inr: number; admin_tech_inr: number }) {
      const { error } = await supabase
        .from('retail_os_actuals')
        .upsert(row, { onConflict: 'application_id,month' });
      if (error) throw new Error(`supabase retail_os_actuals upsert failed: ${error.message}`);
    },

    async listActuals(applicationId: string): Promise<RetailOsActual[]> {
      const { data, error } = await supabase
        .from('retail_os_actuals')
        .select('*')
        .eq('application_id', applicationId)
        .order('month', { ascending: true });
      if (error) throw new Error(`supabase retail_os_actuals list failed: ${error.message}`);
      return (data ?? []) as RetailOsActual[];
    },
  };
}
