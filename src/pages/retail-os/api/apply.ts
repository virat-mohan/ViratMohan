export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../lib/retail-os-db';
import { getEnv } from '../../../lib/env';
import { sendEmail } from '../../../lib/email';
import { getOrigin } from '../../../lib/http';

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const origin = getOrigin(request);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const brandName = str(body.brandName);
  const founderName = str(body.founderName);
  const founderEmail = str(body.founderEmail);

  if (!brandName || !founderName || !founderEmail) {
    return json({ error: 'brandName, founderName and founderEmail are required' }, 400);
  }

  const postAck = body.postAck === true;
  const hasRevenue = str(body.hasRevenue);
  const aiEnablerTrack = hasRevenue === 'no';

  const splitLo = typeof body.splitRangeLo === 'number' ? body.splitRangeLo : null;
  const splitHi = typeof body.splitRangeHi === 'number' ? body.splitRangeHi : null;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Backend not configured yet — email the application instead.' }, 503);
  }

  const db = getRetailOsDb(env);
  try {
    const id = await db.insert({
      brand_name: brandName,
      founder_name: founderName,
      founder_email: founderEmail,
      founder_phone: str(body.founderPhone),
      category: str(body.category),
      format: str(body.format),
      handle: str(body.handle),
      has_revenue: hasRevenue,
      revenue_range: str(body.revenueRange),
      following: str(body.following),
      catalog_mode: str(body.catalogMode),
      shopify_url: str(body.shopifyUrl),
      product_count: str(body.productCount),
      payment_mode: str(body.paymentMode),
      pincode: str(body.pincode),
      carrier: str(body.carrier),
      meta_bm: str(body.metaBm),
      ad_budget: str(body.adBudget),
      wa_number: str(body.waNumber),
      post_ack: postAck,
      split_range_lo: splitLo,
      split_range_hi: splitHi,
      ai_enabler_track: aiEnablerTrack,
      payment_methods: str(body.paymentMethods),
      shipping_charge_model: str(body.shippingChargeModel),
      free_shipping_threshold: str(body.freeShippingThreshold),
      same_day_delivery: str(body.sameDayDelivery),
      same_day_cities: str(body.sameDayCities),
      return_window: str(body.returnWindow),
      loyalty_methodology: str(body.loyaltyMethodology),
      referral_methodology: str(body.referralMethodology),
      target_cities: str(body.targetCities),
      business_registration: str(body.businessRegistration),
    });

    // Best-effort notifications — a failure here must never block the
    // application that was already saved (same pattern as generations/
    // stage_transitions logging elsewhere in this codebase).
    const trackUrl = `${origin}/retail-os/track/${id}`;
    if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL && env.ADMIN_NOTIFY_EMAIL) {
      sendEmail(
        {
          to: env.ADMIN_NOTIFY_EMAIL,
          subject: `Retail OS Application — ${brandName}`,
          replyTo: founderEmail,
          html: `<p><b>${escapeHtml(brandName)}</b> just applied to DevShop Retail OS.</p>
<p>Founder: ${escapeHtml(founderName)} (${escapeHtml(founderEmail)}${body.founderPhone ? `, ${escapeHtml(String(body.founderPhone))}` : ''})</p>
<p>Category: ${escapeHtml(str(body.category) || '—')} · Format: ${escapeHtml(str(body.format) || '—')}</p>
<p>Existing revenue: ${hasRevenue === 'yes' ? escapeHtml(str(body.revenueRange) || 'Yes') : 'No — AI-Enabler track requested'}</p>
<p><a href="${trackUrl}">Founder status page →</a> · <a href="${origin}/retail-os/admin">Admin dashboard →</a></p>`,
        },
        env
      ).catch((err) => console.error('retail-os apply admin notification email failed', err));
    }
    // Founder's own confirmation — the track link doubles as their "login":
    // no password, the URL itself is the bearer token (same pattern as
    // /devshop/demo/[id]).
    if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
      sendEmail(
        {
          to: founderEmail,
          subject: `${brandName} — your DevShop Retail OS application`,
          html: `<p>Hi ${escapeHtml(founderName)},</p>
<p>Got your application for <b>${escapeHtml(brandName)}</b>. I read every one myself and reply within the week.</p>
<p>You can check where things stand any time — bookmark this link, no login needed:</p>
<p><a href="${trackUrl}">${trackUrl}</a></p>
<p>— Virat</p>`,
        },
        env
      ).catch((err) => console.error('retail-os apply founder confirmation email failed', err));
    }

    return json({ id }, 201);
  } catch (err) {
    console.error('retail-os apply insert failed', err);
    return json({ error: 'Could not save the application — try again or email it directly.' }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
