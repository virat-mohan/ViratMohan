// Supabase-backed dependencies for handleInbound and the export importer.
import type { Env } from '../env';
import { insertLedgerRows, serviceDb, type LedgerRow } from '../ledger';
import { liveDeps, notify } from '../notify';
import type { BrandIndex, Split } from './brand-detect';
import { norm } from './brand-detect';
import type { InboundDeps } from './inbound';
import { classifyWithClaude } from './whatsapp';

type Db = ReturnType<typeof serviceDb>;

export async function loadBrandIndex(sb: Db): Promise<BrandIndex> {
  const [{ data: terms, error }, { data: aliases }, { data: rules }] = await Promise.all([
    sb.from('brand_terms').select('brand_key, brand_name, whatsapp_group_names, product_keywords').eq('active', true).order('brand_name'),
    sb.from('brand_aliases').select('brand_key, alias'),
    sb.from('vendor_brand_rules').select('match_type, match_value, brand_key, shared, splits'),
  ]);
  if (error) throw error;
  return {
    brands: (terms ?? []).map((t: any) => ({
      brandKey: t.brand_key, name: t.brand_name, groupNames: t.whatsapp_group_names ?? [], keywords: t.product_keywords ?? [],
      aliases: (aliases ?? []).filter((a: any) => a.brand_key === t.brand_key).map((a: any) => a.alias),
    })),
    vendors: (rules ?? []).filter((r: any) => r.match_type === 'vendor').map((r: any) => ({ vendor: r.match_value, brandKey: r.brand_key, shared: r.shared })),
    allocations: (rules ?? []).filter((r: any) => r.shared && r.splits).map((r: any) => ({ matchType: r.match_type, matchValue: r.match_value, splits: r.splits as Split[] })),
  };
}

const IST = 330 * 60_000;
function istMonday(now: Date): string {
  const ist = new Date(now.getTime() + IST);
  const dow = (ist.getUTCDay() + 6) % 7;
  const d = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - dow * 86_400_000;
  return new Date(d - IST).toISOString();
}

export function liveInboundDeps(env: Env, sb: Db = serviceDb(env), now = new Date()): InboundDeps {
  const nd = liveDeps(env, sb, now);
  let index: Promise<BrandIndex> | null = null;
  return {
    markSeen: async (id, phone) => {
      const { data, error } = await sb.from('whatsapp_inbound').upsert({ message_id: id, sender_phone: phone }, { onConflict: 'message_id', ignoreDuplicates: true }).select('message_id');
      if (error) throw error;
      return !!data?.length;
    },
    findSender: async (phone) => {
      const { data } = await sb.from('ledger_senders').select('phone, name, default_product, role').eq('phone', phone).eq('active', true).maybeSingle();
      return data ? { phone: data.phone, name: data.name, defaultBrand: data.default_product, role: data.role } : null;
    },
    loadIndex: () => (index ??= loadBrandIndex(sb)),
    openQuestion: async (phone) => {
      const { data } = await sb.from('ledger_questions').select('id, entry_id, vendor, options').eq('sender_phone', phone).eq('status', 'open').maybeSingle();
      return data ? { id: data.id, entryId: data.entry_id, vendor: data.vendor, options: data.options } : null;
    },
    askQuestion: async (q) => {
      await sb.from('ledger_questions').update({ status: 'expired' }).eq('sender_phone', q.phone).eq('status', 'open');
      const { error } = await sb.from('ledger_questions').insert({ sender_phone: q.phone, entry_id: q.entryId, vendor: q.vendor, options: q.options });
      if (error) throw error;
    },
    closeQuestion: async (id) => { await sb.from('ledger_questions').update({ status: 'answered', answered_at: now.toISOString() }).eq('id', id); },
    saveVendorRule: async (r) => {
      const { error } = await sb.from('vendor_brand_rules').upsert({ match_type: 'vendor', match_value: norm(r.vendor), brand_key: r.brandKey, shared: r.shared, splits: r.splits, created_by: r.by }, { onConflict: 'match_type,match_value' });
      if (error) throw error;
    },
    insertRows: async (rows: LedgerRow[]) => {
      if (!rows.length) return [];
      const { data, error } = await sb.from('ledger_entries').upsert(rows, { onConflict: 'source,source_id', ignoreDuplicates: true }).select('id, source_id');
      if (error) throw error;
      return (data ?? []) as { id: string; source_id: string }[];
    },
    getEntry: async (id) => (await sb.from('ledger_entries').select('*').eq('id', id).maybeSingle()).data as any,
    setEntry: async (id, patch) => { const { error } = await sb.from('ledger_entries').update(patch).eq('id', id); if (error) throw error; },
    lastEntry: async (phone) => {
      const { data } = await sb.from('ledger_entries').select('*, settlement_entries(entry_id)').eq('source', 'whatsapp_api').eq('meta->>sender', phone)
        .neq('review_status', 'rejected').order('created_at', { ascending: false }).limit(5);
      return ((data ?? []).find((e: any) => !e.settlement_entries?.length) as any) ?? null;
    },
    weekSummary: async (brandKey) => {
      const { data } = await sb.from('ledger_entries').select('kind, amount_paise').eq('brand_key', brandKey).eq('review_status', 'posted').gte('occurred_at', istMonday(now));
      let sales = 0, costs = 0;
      for (const e of data ?? []) {
        const a = Number((e as any).amount_paise);
        if ((e as any).kind === 'order_revenue') sales += a;
        else if (['refund', 'rto'].includes((e as any).kind)) sales -= a;
        else if (['shipping', 'ad_spend', 'payment_fee', 'product_cost', 'expense'].includes((e as any).kind)) costs += a;
      }
      return { sales, costs, count: data?.length ?? 0 };
    },
    knownOrders: async (at) => {
      const pad = 2 * 86_400_000;
      const { data } = await sb.from('ledger_entries').select('id, amount_paise, occurred_at').eq('kind', 'order_revenue').in('source', ['shopify', 'razorpay'])
        .gte('occurred_at', new Date(Date.parse(at) - pad).toISOString()).lte('occurred_at', new Date(Date.parse(at) + pad).toISOString());
      return (data ?? []).map((o: any) => ({ id: o.id, amount_paise: Number(o.amount_paise), occurred_at: o.occurred_at }));
    },
    claudeBrand: env.ANTHROPIC_API_KEY
      ? async (text) => {
        const idx = await (index ??= loadBrandIndex(sb));
        const c = await classifyWithClaude(text, { products: idx.brands.map((b) => ({ brandKey: b.brandKey, name: b.name })) }, env.ANTHROPIC_API_KEY);
        return c ? { brandKey: c.brandKey, confidence: c.confidence } : null;
      }
      : undefined,
    reply: async (to, text) => { await notify({ channel: 'whatsapp', to, text }, nd, { replyToInbound: true }); },
    toLead: async (m) => {
      // Existing Retail OS chat-lead table; one row per phone, transcript appended by the lead flow.
      const { error } = await sb.from('retail_os_chat_leads').upsert({
        session_id: `wa:${m.from}`, phone: m.from, page: 'whatsapp', summary: m.text.slice(0, 500),
        transcript: [{ role: 'user', content: m.text.slice(0, 2000), at: m.at }], updated_at: now.toISOString(),
      }, { onConflict: 'session_id' });
      if (error) console.error('lead insert failed', error.message);
    },
  };
}

export { insertLedgerRows };
