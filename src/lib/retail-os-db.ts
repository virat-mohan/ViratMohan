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
  { key: 'agreement', label: 'Commercial agreement signed', note: 'Master Brand Partnership Agreement (or AI-Enabler™ Agreement) sent for signature.' },
  { key: 'catalog', label: 'Catalog connected', note: 'Shopify import or manual catalog build.' },
  { key: 'payments', label: 'Payments configured', note: 'Gateway KYC and settlement account linked.' },
  { key: 'shipping', label: 'Shipping configured', note: 'Carrier account or DevShop aggregator wired in.' },
  { key: 'meta', label: 'Meta linked', note: 'Business Manager, catalog and pixel connected.' },
  { key: 'whatsapp', label: 'WhatsApp provisioned', note: 'Business API number live for orders and catalog checkout.' },
  { key: 'postbarter', label: 'Pay with a Post activated', note: '' },
  { key: 'golive', label: 'Go-live review', note: 'Final checklist before the storefront goes public.' },
  { key: 'live', label: 'Live & selling', note: 'Storefront public, ads running.' },
];

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
  created_at: string;
  updated_at: string;
};

export function buildInitialStages(postAck: boolean): RetailOsStage[] {
  return RETAIL_OS_STAGE_DEFS.map((s) => {
    let note = s.note;
    let status: StageStatus = 'pending';
    if (s.key === 'submitted') { status = 'done'; note = 'Received.'; }
    if (s.key === 'postbarter') {
      note = postAck ? 'Requested — activates once you\'re live.' : 'Not requested for launch.';
      status = postAck ? 'pending' : 'skipped';
    }
    return { key: s.key, label: s.label, note, status };
  });
}

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
    }): Promise<string> {
      const stages = buildInitialStages(row.post_ack);
      const { data, error } = await supabase
        .from('retail_os_applications')
        .insert({ ...row, stages })
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
  };
}
