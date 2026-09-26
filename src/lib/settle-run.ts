// Monday settlement run (I/O side). Safe to run any number of times:
//   draft → reconcile → auto-approve if clean → payout (idempotency key per brand-week)
// A settlement that is already approved or paid is never recomputed; a payout
// row is unique per settlement and RazorpayX dedupes on X-Payout-Idempotency.
// PAYOUTS_ENABLED !== 'true' is dry-run: statements are built and Virat gets
// one "would pay" email; brands get nothing and no money moves.
import type { Env } from './env';
import { rowToEntry, serviceDb, termsFromRow, type BrandTermsRow } from './ledger';
import { liveDeps, notify } from './notify';
import { createPayout } from './payouts/razorpayx';
import { renderRetailOsEmail } from './retail-os-email';
import { escapeHtml } from './retail-os-http';
import {
  decidePayouts, HOLD_REASON_TEXT, inrFromPaise, payoutIdempotencyKey, previousWeekIST, settleWeek,
  type PayoutGate, type SettlementResult,
} from './settlement';

type Db = ReturnType<typeof serviceDb>;

export function gateFromEnv(env: Pick<Env, 'PAYOUTS_ENABLED' | 'PAYOUT_CAP_PER_PAYOUT_INR' | 'PAYOUT_CAP_WEEKLY_INR'>): PayoutGate {
  const inr = (v: string) => (v && /^\d+$/.test(v.trim()) ? Number(v.trim()) * 100 : null);
  return { enabled: env.PAYOUTS_ENABLED === 'true', perPayoutCapPaise: inr(env.PAYOUT_CAP_PER_PAYOUT_INR), weeklyCapPaise: inr(env.PAYOUT_CAP_WEEKLY_INR) };
}

const fmtWeek = (a: string, b: string) => {
  const f = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${f(a)} – ${f(b)}`;
};

export function renderStatementEmail(brandName: string, r: SettlementResult, viewToken?: string): string {
  const held = r.holdReasons.length > 0;
  return renderRetailOsEmail({
    preheader: `Your statement for ${fmtWeek(r.weekStart, r.weekEnd)}: ${inrFromPaise(r.payoutPaise)}`,
    eyebrow: 'Monday statement',
    heading: `${brandName}, ${fmtWeek(r.weekStart, r.weekEnd)}`,
    lines: [
      held
        ? `This week's payout is on hold while I check: ${r.holdReasons.map((h) => HOLD_REASON_TEXT[h].toLowerCase()).join('; ')}. I will write as soon as it is cleared.`
        : r.payoutPaise > 0 ? `Your payout of ${inrFromPaise(r.payoutPaise)} is on its way to your bank account today.` : 'There is no payout this week.',
      ...(r.reviewEntryIds.length ? [`${r.reviewEntryIds.length} WhatsApp entries are still being checked and are not in this statement. They will appear once confirmed.`] : []),
      ...(r.deferredEntryIds.length ? ['Some orders are waiting for the courier or payment gateway to send the money. They move to a later statement.'] : []),
    ],
    rows: r.lines.map((l) => ({ label: l.label + (l.count ? ` (${l.count})` : ''), value: inrFromPaise(l.amountPaise) })),
    ...(viewToken ? { cta: { label: 'See it on your dashboard', url: `https://www.viratmohan.com/dashboard?s=${viewToken}#money` } } : {}),
    note: 'Every line comes from your orders, the payment gateway, the courier and the ad account. Reply to this email with any question and I will show you the receipts.',
  });
}

function statementTable(name: string, r: SettlementResult): string {
  const td = 'padding:6px 0;border-top:1px solid #D9CDB4;font-family:Arial,sans-serif;font-size:13px;color:#4A4038;';
  return `<p style="margin:18px 0 6px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#1A1410;">${escapeHtml(name)}</p><table role="presentation" width="100%" style="border-collapse:collapse;">${r.lines
    .map((l) => `<tr><td style="${td}">${escapeHtml(l.label)}</td><td style="${td}text-align:right;">${escapeHtml(inrFromPaise(l.amountPaise))}</td></tr>`).join('')}</table>`;
}

export type RunSummary = { week: { weekStart: string; weekEnd: string }; dryRun: boolean; brands: { brandKey: string; status: string; payoutPaise: number; action?: string; reasons?: string[]; error?: string }[] };

export async function runSettlement(env: Env, now = new Date(), sb: Db = serviceDb(env)): Promise<RunSummary> {
  const week = previousWeekIST(now);
  const gate = gateFromEnv(env);
  const summary: RunSummary = { week, dryRun: !gate.enabled, brands: [] };
  const deps = liveDeps(env, sb, now);

  const { data: termsRows, error: tErr } = await sb.from('brand_terms').select('*').eq('active', true);
  if (tErr) throw tErr;

  const computed: { row: BrandTermsRow; settlementId: string; viewToken: string; result: SettlementResult }[] = [];
  for (const row of (termsRows ?? []) as BrandTermsRow[]) {
    const terms = termsFromRow(row);
    // 1. Draft (or find this week's existing settlement).
    const { data: existing } = await sb.from('settlements').select('*').eq('brand_key', row.brand_key).eq('week_start', week.weekStart).maybeSingle();
    if (existing && ['approved', 'paid'].includes(existing.status)) {
      summary.brands.push({ brandKey: row.brand_key, status: existing.status, payoutPaise: Number(existing.payout_paise) });
      continue;
    }
    // Entries not yet consumed by another week's settlement.
    const { data: others } = await sb.from('settlements').select('id, week_start, carry_forward_paise').eq('brand_key', row.brand_key).neq('week_start', week.weekStart).order('week_start', { ascending: false });
    const otherIds = (others ?? []).map((o: any) => o.id);
    const settled = new Set<string>();
    if (otherIds.length) {
      const { data: links } = await sb.from('settlement_entries').select('entry_id').in('settlement_id', otherIds);
      for (const l of links ?? []) settled.add((l as any).entry_id);
    }
    const { data: entryRows, error: eErr } = await sb.from('ledger_entries').select('*').eq('brand_key', row.brand_key);
    if (eErr) throw eErr;
    const entries = (entryRows ?? []).filter((e: any) => !settled.has(e.id)).map((e: any) => rowToEntry(e));
    const prev = (others ?? []).find((o: any) => o.week_start < week.weekStart);
    const carryIn = prev ? Number(prev.carry_forward_paise) : 0;

    // 2. Reconcile + statement (pure).
    const result = settleWeek({ terms, entries, weekStart: week.weekStart, weekEnd: week.weekEnd, carryInPaise: carryIn, now });
    const rec = {
      brand_key: row.brand_key, week_start: week.weekStart, week_end: week.weekEnd, status: result.status, hold_reasons: result.holdReasons,
      terms_snapshot: terms, lines: result.lines, mismatches: result.mismatches, gross_revenue_paise: result.grossRevenuePaise,
      costs_paise: result.costsPaise, profit_pool_paise: result.profitPoolPaise, platform_share_paise: result.platformSharePaise,
      carry_in_paise: result.carryInPaise, payout_paise: result.payoutPaise, carry_forward_paise: result.carryForwardPaise,
      entries_hash: result.entriesHash, entry_count: result.includedEntryIds.length, updated_at: now.toISOString(),
    };
    const { data: saved, error: sErr } = await sb.from('settlements').upsert(rec, { onConflict: 'brand_key,week_start' }).select('id, view_token').single();
    if (sErr) throw sErr;
    await sb.from('settlement_entries').delete().eq('settlement_id', saved.id);
    if (result.includedEntryIds.length) {
      const { error: lErr } = await sb.from('settlement_entries').insert(result.includedEntryIds.map((entry_id) => ({ settlement_id: saved.id, entry_id })));
      if (lErr) throw lErr;
    }
    computed.push({ row, settlementId: saved.id, viewToken: saved.view_token, result });
  }

  // 3. Gate across brands (caps), then approve + pay.
  const { data: paidThisWeek } = await sb.from('payouts').select('amount_paise, settlements!inner(week_start)').eq('settlements.week_start', week.weekStart);
  const alreadyPaid = (paidThisWeek ?? []).reduce((a: number, p: any) => a + Number(p.amount_paise), 0);
  const gateLeft = { ...gate, weeklyCapPaise: gate.weeklyCapPaise == null ? null : Math.max(0, gate.weeklyCapPaise - alreadyPaid) };
  const decisions = decidePayouts(computed.map((c) => c.result), gateLeft);
  const wouldPay: string[] = [];

  for (const d of decisions) {
    const c = computed.find((x) => x.result.brandKey === d.brandKey)!;
    const name = c.row.brand_name;
    try {
      if (d.action === 'hold') {
        await sb.from('settlements').update({ status: 'held', hold_reasons: d.reasons }).eq('id', c.settlementId);
      } else if (d.action === 'nothing' || d.action === 'pay') {
        await sb.from('settlements').update({ status: 'approved', approved_by: 'auto', approved_at: now.toISOString() }).eq('id', c.settlementId);
      }
      if (d.action === 'pay') {
        const key = payoutIdempotencyKey(d.brandKey, week.weekStart);
        await sb.from('payouts').upsert({ settlement_id: c.settlementId, brand_key: d.brandKey, idempotency_key: key, fund_account_id: c.row.payout_fund_account_id, amount_paise: d.payoutPaise }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
        const p = await createPayout(
          { keyId: env.RAZORPAYX_KEY_ID, keySecret: env.RAZORPAYX_KEY_SECRET, accountNumber: env.RAZORPAYX_ACCOUNT_NUMBER },
          { fundAccountId: c.row.payout_fund_account_id!, amountPaise: d.payoutPaise, idempotencyKey: key, referenceId: c.settlementId, narration: `DevShop ${name} ${week.weekStart}` },
        );
        await sb.from('payouts').update({ provider_payout_id: p.id, status: p.status, utr: p.utr, raw: p.raw, updated_at: now.toISOString() }).eq('idempotency_key', key);
      }
      if (gate.enabled && c.row.statement_email) {
        await notify({ channel: 'email', to: c.row.statement_email, subject: `${name}: your Monday statement`, html: renderStatementEmail(name, { ...c.result, holdReasons: d.action === 'hold' ? d.reasons : [] }, c.viewToken), dedupeKey: `statement:${c.settlementId}` }, deps);
        await sb.from('settlements').update({ notified_at: now.toISOString() }).eq('id', c.settlementId);
      }
      if (d.action === 'would_pay' || !gate.enabled) {
        wouldPay.push(`${name}: ${d.action === 'would_pay' ? 'would pay ' + inrFromPaise(d.payoutPaise) : d.action === 'hold' ? 'hold, ' + d.reasons.map((r) => HOLD_REASON_TEXT[r]).join('; ') : 'nothing to pay'}`);
      }
      summary.brands.push({ brandKey: d.brandKey, status: d.action === 'hold' ? 'held' : 'approved', payoutPaise: d.payoutPaise, action: d.action, reasons: d.reasons });
    } catch (err) {
      console.error('settlement payout failed', d.brandKey, err);
      await sb.from('settlements').update({ status: 'held', hold_reasons: ['payout_failed'] }).eq('id', c.settlementId);
      summary.brands.push({ brandKey: d.brandKey, status: 'held', payoutPaise: d.payoutPaise, error: String(err) });
    }
  }

  if (!gate.enabled && env.ADMIN_NOTIFY_EMAIL && computed.length) {
    const html = renderRetailOsEmail({
      preheader: `Dry run for ${fmtWeek(week.weekStart, week.weekEnd)}: no money moved`,
      eyebrow: 'Settlement dry run',
      heading: `Would pay, ${fmtWeek(week.weekStart, week.weekEnd)}`,
      lines: ['PAYOUTS_ENABLED is off, so nothing was paid and no brand was emailed. Statements are saved in the settlements table.', ...wouldPay],
      bodyHtml: computed.map((c) => statementTable(c.row.brand_name, c.result)).join(''),
    });
    await notify({ channel: 'email', to: env.ADMIN_NOTIFY_EMAIL, subject: `Settlement dry run: ${fmtWeek(week.weekStart, week.weekEnd)}`, html, dedupeKey: `dryrun:${week.weekStart}:${now.toISOString().slice(0, 13)}` }, deps);
  }
  return summary;
}
