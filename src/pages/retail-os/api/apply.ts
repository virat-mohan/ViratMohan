export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../lib/retail-os-db';
import { getEnv } from '../../../lib/env';
import { sendEmail } from '../../../lib/email';
import { getOrigin } from '../../../lib/http';
import { renderRetailOsEmail } from '../../../lib/retail-os-email';
import { mailConfigured } from '../../../lib/mail/send';

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

  // "Caps, Bucket hats" → ["Caps", "Bucket hats"]
  const storeCategories = (str(body.storeCategories) ?? '')
    .split(',').map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 20);
  // "Size: S, M, L\nColour: Black, Olive" → [{name:"Size", options:["S","M","L"]}, ...]
  const skuAttributes = (str(body.skuAttributes) ?? '')
    .split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 10)
    .map((line) => {
      const i = line.indexOf(':');
      const name = (i === -1 ? line : line.slice(0, i)).trim().slice(0, 40);
      const options = i === -1 ? [] : line.slice(i + 1).split(',').map((o) => o.trim().slice(0, 40)).filter(Boolean).slice(0, 50);
      return { name, options };
    })
    .filter((a) => a.name);

  // Brand-named programmes. Only answered parts are kept; null if none answered.
  const num = (v: unknown) => {
    const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const loyalty = {
    name: str(body.loyaltyName)?.slice(0, 40) ?? null,
    pointsPerUnit: num(body.loyaltyPointsPerUnit),
    redeemEveryPoints: num(body.loyaltyRedeemEvery),
    redeemValueInr: num(body.loyaltyRedeemValue),
  };
  const referral = {
    friendDiscountInr: num(body.referralFriendDiscount),
    referrerRewardPoints: num(body.referralRewardPoints),
  };
  const hasAny = (o: Record<string, unknown>) => Object.values(o).some((v) => v != null);
  const programmesRaw = {
    loyalty: hasAny(loyalty) ? loyalty : null,
    referral: hasAny(referral) ? referral : null,
    dropsName: str(body.dropsName)?.slice(0, 40) ?? null,
    storiesName: str(body.storiesName)?.slice(0, 40) ?? null,
  };
  const programmes = hasAny(programmesRaw) ? programmesRaw : null;

  const brandStatusRaw = str(body.brandStatus);
  const brandStatus = brandStatusRaw === 'existing' || brandStatusRaw === 'new_sub_brand' || brandStatusRaw === 'from_zero' ? brandStatusRaw : null;

  // Marketplace / subscription specifics, kept only for the matching format.
  const format = str(body.format);
  const MODEL_KEYS: Record<string, string[]> = {
    Marketplace: ['mpListingType', 'mpSellerCount', 'mpCommission', 'mpWhoShips', 'mpSellerJoin'],
    Subscription: ['subWhat', 'subFrequencies', 'subDurations', 'subArea', 'subDelivery'],
  };
  const modelDetailsRaw: Record<string, string> = {};
  for (const k of MODEL_KEYS[format ?? ''] ?? []) {
    const v = str(body[k]);
    if (v) modelDetailsRaw[k] = v.slice(0, 300);
  }
  const modelDetails = Object.keys(modelDetailsRaw).length ? modelDetailsRaw : null;

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
      format,
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
      store_categories: storeCategories.length ? storeCategories : null,
      product_noun_singular: str(body.productNounSingular),
      product_noun_plural: str(body.productNounPlural),
      sku_attributes: skuAttributes.length ? skuAttributes : null,
      programmes,
      brand_status: brandStatus,
      model_details: modelDetails,
    });

    // Best-effort notifications — a failure here must never block the
    // application that was already saved (same pattern as generations/
    // stage_transitions logging elsewhere in this codebase).
    const trackUrl = `${origin}/retail-os/track/${id}`;
    const brandLabel = brandStatus === 'existing' ? 'Existing brand' : brandStatus === 'new_sub_brand' ? 'New sub-brand' : brandStatus === 'from_zero' ? 'Starting from zero' : '—';
    if (mailConfigured(env) && env.ADMIN_NOTIFY_EMAIL) {
      sendEmail(
        {
          to: env.ADMIN_NOTIFY_EMAIL,
          subject: `New application: ${brandName}`,
          replyTo: founderEmail,
          html: renderRetailOsEmail({
            preheader: `${brandName} applied to Retail OS.`,
            eyebrow: 'New application',
            heading: brandName,
            lines: ['Its forecast and design direction generate when the founder opens their page. Review, then send terms.'],
            rows: [
              { label: 'Founder', value: `${founderName} · ${founderEmail}${body.founderPhone ? ` · ${String(body.founderPhone)}` : ''}` },
              { label: 'Brand', value: `${brandLabel} · ${str(body.category) || '—'} · ${format || '—'}` },
              { label: 'Revenue today', value: hasRevenue === 'yes' ? (str(body.revenueRange) || 'Yes') : 'None (AI-Enabler track)' },
            ],
            cta: { label: 'Review in admin', url: `${origin}/retail-os/admin` },
          }),
        },
        env
      ).catch((err) => console.error('retail-os apply admin notification email failed', err));
    }
    // Founder's own confirmation — the track link doubles as their "login":
    // no password, the URL itself is the bearer token.
    if (mailConfigured(env)) {
      sendEmail(
        {
          to: founderEmail,
          subject: `${brandName}: your forecast is being prepared`,
          html: renderRetailOsEmail({
            preheader: 'Your forecast and store design will be ready in a few minutes.',
            eyebrow: 'Application received',
            heading: `Thanks, ${founderName.split(' ')[0]}`,
            lines: [
              `In a few minutes your page shows a first forecast for ${brandName} and a proposed look for your store.`,
              'I review every application myself. Your terms will appear on the same page, usually within the week.',
            ],
            cta: { label: 'See your forecast and design', url: trackUrl },
            note: 'Bookmark this link. It is your private page, no login needed.',
          }),
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
