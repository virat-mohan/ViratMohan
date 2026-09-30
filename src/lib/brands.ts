// The brand registry (migrations/0042_brands.sql): who DevShop works with, on what terms,
// and who to call. Read by the founder console; edited at /retail-os/admin/brands.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type BrandStatus = 'lead' | 'building' | 'live' | 'paused' | 'ended';
export type BrandModel = 'profit_share' | 'retainer' | 'co_owned' | 'revenue_share' | 'none';
export type Contact = { name: string; role?: string; email?: string; phone?: string };
export type Brand = {
  id: string; key: string; name: string; status: BrandStatus; model: BrandModel | null;
  devshop_pct: number | null; retainer_inr: number | null; terms_note: string | null;
  website: string | null; instagram: string | null; category: string | null;
  contacts: Contact[]; lead_id: string | null; application_id: string | null; live_since: string | null; retail_os_since: string | null; notes: string | null;
  created_at: string; updated_at: string;
};

export const STATUS_LABEL: Record<BrandStatus, string> = { lead: 'Lead', building: 'Building', live: 'Live', paused: 'Paused', ended: 'Ended' };
export const MODEL_LABEL: Record<BrandModel, string> = { profit_share: 'Profit share', retainer: 'Retainer', co_owned: 'Co-owned', revenue_share: 'Revenue share', none: 'Not set' };

/** One line on the money, in plain words. */
export function termsLine(b: Pick<Brand, 'model' | 'devshop_pct' | 'retainer_inr' | 'terms_note'>): string {
  if (b.terms_note) return b.terms_note;
  switch (b.model) {
    case 'profit_share': return b.devshop_pct != null ? `Profit share: DevShop ${b.devshop_pct}%, brand ${100 - Number(b.devshop_pct)}%.` : 'Profit share.';
    case 'retainer': return b.retainer_inr ? `Retainer ₹${b.retainer_inr.toLocaleString('en-IN')} a month.` : 'Retainer.';
    case 'co_owned': return b.devshop_pct != null ? `Co-owned: DevShop ${b.devshop_pct}%.` : 'Co-owned.';
    case 'revenue_share': return b.devshop_pct != null ? `Revenue share ${b.devshop_pct}%.` : 'Revenue share.';
    default: return 'Terms not set.';
  }
}

export const brandKeyOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);

export function brandsDb(env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }, sb?: SupabaseClient) {
  const client = sb ?? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  return {
    async list(): Promise<Brand[]> {
      const { data, error } = await client.from('brands').select('*').order('status').order('name');
      if (error) throw new Error(`brands list: ${error.message}`);
      return (data ?? []).map((b) => ({ ...b, contacts: Array.isArray(b.contacts) ? b.contacts : [] })) as Brand[];
    },
    async get(id: string): Promise<Brand | null> {
      const { data, error } = await client.from('brands').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(`brands get: ${error.message}`);
      return data as Brand | null;
    },
    async upsert(b: Partial<Brand> & { key: string; name: string }): Promise<Brand> {
      const row = { ...b, contacts: b.contacts ?? [], updated_at: new Date().toISOString() };
      const { data, error } = await client.from('brands').upsert(row, { onConflict: 'key' }).select('*').single();
      if (error) throw new Error(`brands upsert: ${error.message}`);
      return data as Brand;
    },
    async remove(id: string) {
      const { error } = await client.from('brands').delete().eq('id', id);
      if (error) throw new Error(`brands delete: ${error.message}`);
    },
  };
}
