// Server side of the lead audit: Supabase reads/writes, running connectors, generating the plan.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './env';
import { SOURCES, type Snapshot, type Source } from './lead-metrics';
import { pullGa4, pullGsc, pullMeta, pullShopify, safeMetrics, googleAccessToken, normalizeShop, isValidShopDomain } from './lead-connectors';
import { metricsFromCsv } from './lead-csv';
import { computeAudit } from './lead-audit';
import { generatePlan, type LeadPlan } from './lead-plan';
import { accessRequestDraft, accessReminderDraft, isStalled, planCoverDraft, stageAfterAccess, type AccessRow, type AccessStatus, type LeadStage } from './lead-access';
import { signLeadToken, encryptSecret, decryptSecret } from './lead-token';
import { dbApproval, type LeadApprovalPort } from './lead-approval';
import { fetchClaude } from './brain/claude';
import { serverBrain } from './brain';

export const SITE = 'https://viratmohan.com';
export type Lead = { id: string; brand_name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; stage: LeadStage; access_requested_at: string | null; access_reminded_at: string | null };
type AccessDbRow = AccessRow & { secret_enc: string | null };

export function leadSb(env: Env): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Backend not configured');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
export const accessLink = (env: Env, id: string) => `${SITE}/retail-os/access/${signLeadToken(id, 'access', env.LEAD_TOKEN_SECRET)}`;
export const planLink = (env: Env, id: string) => `${SITE}/retail-os/plan/${signLeadToken(id, 'plan', env.LEAD_TOKEN_SECRET)}`;

const LEAD_COLS = 'id, brand_name, contact_name, contact_email, contact_phone, stage, access_requested_at, access_reminded_at';

export async function getLead(sb: SupabaseClient, id: string): Promise<Lead | null> {
  const { data, error } = await sb.from('leads').select(LEAD_COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Lead | null;
}
export async function listAccess(sb: SupabaseClient, leadId: string): Promise<AccessDbRow[]> {
  const { data, error } = await sb.from('lead_access').select('source, status, config, secret_enc, last_error, granted_at, verified_at, updated_at').eq('lead_id', leadId);
  if (error) throw new Error(error.message);
  return (data ?? []) as AccessDbRow[];
}
export async function listSnapshots(sb: SupabaseClient, leadId: string): Promise<Snapshot[]> {
  const { data, error } = await sb.from('lead_data_snapshots').select('id, source, period, metrics, via, pulled_at').eq('lead_id', leadId).order('pulled_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as Snapshot[];
}
export async function latestPlan(sb: SupabaseClient, leadId: string): Promise<{ plan: LeadPlan; created_at: string } | null> {
  const { data } = await sb.from('lead_plans').select('plan, created_at').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as { plan: LeadPlan; created_at: string } | null) ?? null;
}

export async function logNote(sb: SupabaseClient, leadId: string, body: string, createdBy = 'lead-audit') {
  await sb.from('lead_messages').insert({ lead_id: leadId, direction: 'internal', channel: 'note', status: 'logged', body, created_by: createdBy });
}

async function setStage(sb: SupabaseClient, lead: Lead, stage: LeadStage, extra: Record<string, unknown> = {}) {
  if (stage === lead.stage && !Object.keys(extra).length) return;
  await sb.from('leads').update({ stage, updated_at: new Date().toISOString(), ...extra }).eq('id', lead.id);
  if (stage !== lead.stage) await logNote(sb, lead.id, `Stage: ${lead.stage} -> ${stage}`);
  lead.stage = stage;
}

async function saveAccess(sb: SupabaseClient, leadId: string, source: Source, patch: Record<string, unknown>) {
  const { error } = await sb.from('lead_access').upsert({ lead_id: leadId, source, updated_at: new Date().toISOString(), ...patch }, { onConflict: 'lead_id,source' });
  if (error) throw new Error(error.message);
}

export async function insertSnapshot(sb: SupabaseClient, leadId: string, source: Source, period: string, metrics: unknown, via: 'connector' | 'csv') {
  const clean = safeMetrics(source, metrics); // throws if anything PII-like survives
  const { error } = await sb.from('lead_data_snapshots').insert({ lead_id: leadId, source, period, metrics: clean, via });
  if (error) throw new Error(error.message);
}

async function afterAccessChange(sb: SupabaseClient, lead: Lead) {
  const next = stageAfterAccess(lead.stage, await listAccess(sb, lead.id));
  if (next !== lead.stage) await setStage(sb, lead, next);
}

// ---------------------------------------------------------------------------------------------------
// Lead actions (from the access page)
// ---------------------------------------------------------------------------------------------------

export async function markStatus(sb: SupabaseClient, lead: Lead, source: Source, status: AccessStatus) {
  await saveAccess(sb, lead.id, source, { status, granted_at: status === 'granted' ? new Date().toISOString() : null });
  await logNote(sb, lead.id, `Lead marked ${source} as ${status.replace('_', ' ')}.`, 'lead');
}

/** Saves ids (and an encrypted Shopify token), then tries the connector. Verified only on success. */
export async function connectSource(env: Env, sb: SupabaseClient, lead: Lead, source: Source, fields: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  const rows = await listAccess(sb, lead.id);
  const prev = rows.find((r) => r.source === source);
  const config: Record<string, string> = { ...(prev?.config ?? {}) };
  let secret = prev?.secret_enc ?? null;
  const v = (k: string) => (fields[k] ?? '').trim().slice(0, 300);
  if (source === 'shopify') {
    if (v('shop')) { const s = normalizeShop(v('shop')); if (!isValidShopDomain(s)) return { ok: false, error: 'Store address should end in .myshopify.com' }; config.shop = s; }
    if (v('token')) secret = encryptSecret(v('token'), env.LEAD_TOKEN_SECRET);
  }
  if (source === 'meta' && v('ad_account_id')) config.ad_account_id = v('ad_account_id');
  if (source === 'ga4' && v('property_id')) config.property_id = v('property_id');
  if (source === 'gsc' && v('site_url')) config.site_url = v('site_url');
  await saveAccess(sb, lead.id, source, { config, secret_enc: secret, status: prev?.status === 'verified' ? 'verified' : 'granted', granted_at: prev?.granted_at ?? new Date().toISOString() });
  return pullSource(env, sb, lead, source);
}

export async function pullSource(env: Env, sb: SupabaseClient, lead: Lead, source: Source): Promise<{ ok: boolean; error?: string }> {
  const row = (await listAccess(sb, lead.id)).find((r) => r.source === source);
  if (!row) return { ok: false, error: 'Nothing saved for this source yet.' };
  try {
    let res: { period: string; metrics: unknown };
    if (source === 'shopify') {
      if (!row.config.shop || !row.secret_enc) throw new Error('Store address and token are both needed.');
      res = await pullShopify(row.config.shop, decryptSecret(row.secret_enc, env.LEAD_TOKEN_SECRET));
    } else if (source === 'meta') {
      if (!row.config.ad_account_id) throw new Error('Ad account ID is needed.');
      res = await pullMeta(row.config.ad_account_id, env);
    } else if (source === 'ga4') {
      if (!row.config.property_id) throw new Error('Property ID is needed.');
      res = await pullGa4(row.config.property_id, env, { token: await googleAccessToken(env) });
    } else if (source === 'gsc') {
      if (!row.config.site_url) throw new Error('Property is needed.');
      res = await pullGsc(row.config.site_url, env, { token: await googleAccessToken(env) });
    } else {
      throw new Error('This source is by CSV upload.');
    }
    await insertSnapshot(sb, lead.id, source, res.period, res.metrics, 'connector');
    await saveAccess(sb, lead.id, source, { status: 'verified', verified_at: new Date().toISOString(), last_error: null });
    await logNote(sb, lead.id, `Connector verified: ${source}, ${res.period}. Aggregates stored.`);
    await afterAccessChange(sb, lead);
    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message.slice(0, 300);
    await saveAccess(sb, lead.id, source, { last_error: msg });
    await logNote(sb, lead.id, `Connector failed: ${source}: ${msg}`);
    return { ok: false, error: msg };
  }
}

export async function uploadCsv(sb: SupabaseClient, lead: Lead, source: Source, text: string): Promise<{ ok: boolean; error?: string; period?: string }> {
  try {
    const { period, metrics } = metricsFromCsv(source, text);
    await insertSnapshot(sb, lead.id, source, period, metrics, 'csv');
    await saveAccess(sb, lead.id, source, { status: 'verified', verified_at: new Date().toISOString(), last_error: null });
    await logNote(sb, lead.id, `CSV verified: ${source}, ${period}. Totals stored, file discarded.`);
    await afterAccessChange(sb, lead);
    return { ok: true, period };
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 300) };
  }
}

// ---------------------------------------------------------------------------------------------------
// Admin actions
// ---------------------------------------------------------------------------------------------------

export async function requestAccess(env: Env, sb: SupabaseClient, lead: Lead, approval: LeadApprovalPort = dbApproval(sb), now = new Date()) {
  if (!lead.contact_email) throw new Error('This lead has no email address.');
  const draft = accessRequestDraft(lead, accessLink(env, lead.id), now, env.RETAIL_OS_WHATSAPP_NUMBER);
  const sub = await approval.submit({ ...draft, leadId: lead.id });
  await setStage(sb, lead, 'access_requested', { access_requested_at: now.toISOString() });
  return { ...sub, link: accessLink(env, lead.id) };
}

export async function buildPlan(env: Env, sb: SupabaseClient, lead: Lead, approval: LeadApprovalPort = dbApproval(sb), now = new Date()) {
  const snaps = await listSnapshots(sb, lead.id);
  if (!snaps.length) throw new Error('No data connected yet.');
  const audit = computeAudit(snaps);
  const claude = env.ANTHROPIC_API_KEY ? fetchClaude(env.ANTHROPIC_API_KEY) : undefined;
  const plan = await generatePlan({ brand: lead.brand_name, contactName: lead.contact_name, audit, now, claude });

  // Ground the terms section in the Brain: log what it knows about the standard terms, with citations.
  try {
    const brain = serverBrain(env);
    const a = await brain.answer('What are the standard Retail OS commercial terms?', { audience: { audience: 'staff', authenticated: true, actor: 'lead-audit' } });
    await logNote(sb, lead.id, `Brain on standard terms (${a.known ? 'known' : 'unknown'}): ${a.answer} [${a.citations.map((c) => c.id).join(', ')}]`);
  } catch (err) {
    console.error('brain answer failed', err);
  }

  const { error } = await sb.from('lead_plans').insert({ lead_id: lead.id, audit, plan, model: plan.model });
  if (error) throw new Error(error.message);
  const draft = planCoverDraft(lead, planLink(env, lead.id), plan.goal.statement, now, env.RETAIL_OS_WHATSAPP_NUMBER);
  const sub = await approval.submit({ ...draft, leadId: lead.id });
  await logNote(sb, lead.id, `Plan ready (${plan.writtenBy}). Top gaps: ${plan.gaps.map((g) => `${g.title} ${g.impact}`).join('; ') || 'none found'}. Approval: ${plan.approval.verdict} (${plan.approval.reasons.join(' ')}).`);
  await setStage(sb, lead, 'plan_ready');
  return { plan, messageId: sub.messageId, link: planLink(env, lead.id) };
}

/** Cron: drafts a reminder for each lead whose access has stalled 48h. Drafts only; send_after is in quiet hours. */
export async function remindStalled(env: Env, sb: SupabaseClient, approval: LeadApprovalPort = dbApproval(sb), now = new Date()) {
  const { data, error } = await sb.from('leads').select(LEAD_COLS).eq('stage', 'access_requested');
  if (error) throw new Error(error.message);
  const drafted: string[] = [];
  for (const lead of (data ?? []) as Lead[]) {
    if (!isStalled(lead, await listAccess(sb, lead.id), now)) continue;
    const draft = accessReminderDraft(lead, accessLink(env, lead.id), now, env.RETAIL_OS_WHATSAPP_NUMBER);
    await approval.submit({ ...draft, leadId: lead.id });
    await sb.from('leads').update({ access_reminded_at: now.toISOString() }).eq('id', lead.id);
    drafted.push(lead.id);
  }
  return drafted;
}

/** Cron: refresh verified connectors weekly so the plan uses current numbers. */
export async function refreshConnectors(env: Env, sb: SupabaseClient) {
  const { data } = await sb.from('lead_access').select('lead_id, source').eq('status', 'verified').in('source', ['shopify', 'meta', 'ga4', 'gsc']);
  let n = 0;
  for (const r of (data ?? []) as { lead_id: string; source: Source }[]) {
    const lead = await getLead(sb, r.lead_id);
    if (lead && ['data_connected', 'access_requested'].includes(lead.stage)) { await pullSource(env, sb, lead, r.source); n++; }
  }
  return n;
}

export const isSource = (s: unknown): s is Source => typeof s === 'string' && (SOURCES as string[]).includes(s);
