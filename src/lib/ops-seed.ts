// When a brand's deposit is confirmed, its build becomes tasks on the ops tracker for the
// operations consultant, in the order the Brand Setup KRA (~/.retail-os/BRAND_SETUP.md) says
// they actually happen. Each task says why, so nobody has to ask. Idempotent per brand.
import type { SupabaseClient } from '@supabase/supabase-js';

type Seed = { stage: number; stage_label: string; task: string; owner: 'team' | 'founder' | 'brand'; note: string; day: number };

export const BRAND_SETUP_TASKS: Seed[] = [
  { stage: 0, stage_label: 'Prerequisites', task: 'Confirm the founder\'s setup answers are in (domain, GST, pickup address, WhatsApp number, Meta access)', owner: 'team', note: 'Why: every stage below waits on one of these. Chase the same day.', day: 0 },
  { stage: 1, stage_label: 'Foundations', task: 'Domain nameservers pointed at Cloudflare', owner: 'brand', note: 'Why: lets DNS for Resend, WhatsApp and the store be added programmatically instead of per registrar.', day: 0 },
  { stage: 1, stage_label: 'Foundations', task: 'Supabase project created; GitHub repo created; Vercel project linked; ADMIN_PASSWORD set', owner: 'team', note: 'Why: the white-labelled store deploys from these three.', day: 0 },
  { stage: 2, stage_label: 'Payments', task: 'Payment method chosen (UPI QR now; Razorpay KYC started in parallel if wanted)', owner: 'founder', note: 'Why: Razorpay KYC can take days; UPI QR needs nothing and lets the store take money on day 1.', day: 1 },
  { stage: 2, stage_label: 'Payments', task: 'Gateway keys in /admin/settings; webhook URL + secret set in the gateway dashboard', owner: 'team', note: 'Why: a payment that succeeds without a browser response is still recorded.', day: 2 },
  { stage: 3, stage_label: 'Shipping', task: 'Shiprocket account created and wallet funded; pickup address added', owner: 'brand', note: 'Why: couriers are not assigned without a balance.', day: 1 },
  { stage: 3, stage_label: 'Shipping', task: 'Shiprocket API user (separate email) created; pickup nickname, pincode, warehouse email in /admin/settings; real package weight and dimensions set', owner: 'team', note: 'Why: the default assumes a 0.2 kg small box; wrong weights mean wrong rates and RTOs.', day: 2 },
  { stage: 4, stage_label: 'Email', task: 'Domain added in Resend; DNS records added via Cloudflare; domain shows Verified; RESEND_API_KEY in /admin/settings', owner: 'team', note: 'Why: order and shipping emails come from the brand\'s own domain.', day: 2 },
  { stage: 4, stage_label: 'Email', task: 'One real order placed and confirmed end to end; every internal alert address checked to have a working inbox', owner: 'team', note: 'Why: a wrong alert address fails silently.', day: 5 },
  { stage: 5, stage_label: 'WhatsApp', task: 'Meta Business Verification submitted (start on day 0; it can take weeks and blocks nothing else)', owner: 'brand', note: 'Why: template creation by API and higher messaging tiers stay blocked until it clears.', day: 0 },
  { stage: 5, stage_label: 'WhatsApp', task: 'Meta app with WhatsApp use case; permanent System User token in /admin/settings; number registered on the Cloud API', owner: 'team', note: 'Why: order confirmations and shipping updates go on WhatsApp.', day: 3 },
  { stage: 5, stage_label: 'WhatsApp', task: 'Message templates created and approved (order confirmation, shipping notification at minimum); check the WABA id in the template URL matches the connected account', owner: 'team', note: 'Why: templates are per brand and per WABA; a template in the wrong WABA is invisible to the app (Moonglasses, 24 Sep).', day: 3 },
  { stage: 5, stage_label: 'WhatsApp', task: 'Webhook configured (callback URL + verify token from /admin/social); subscribed to messages, mentions, comments', owner: 'team', note: 'Why: replies and comments land in the shared inbox.', day: 4 },
  { stage: 6, stage_label: 'Instagram', task: 'Instagram is a Professional account; Instagram use case + permissions on the Meta app; OAuth redirect set; Connect Instagram clicked and shows the handle with counts', owner: 'team', note: 'Why: content scheduling and comment replies need a connected professional account.', day: 4 },
  { stage: 7, stage_label: 'Ads', task: 'Facebook Page linked to Instagram; Marketing API use case + permissions; ad account ID and Pixel ID in /admin/settings', owner: 'team', note: 'Why: needed only when paid ads start; do it before go-live so day 8 can be an ads day.', day: 5 },
  { stage: 8, stage_label: 'Admin', task: 'First admin login with the one-time setup code; password set inside the admin (never typed in chat)', owner: 'founder', note: 'Why: the founder owns their admin from day one.', day: 5 },
  { stage: 9, stage_label: 'Handover', task: 'Go-live review: catalog, checkout, one real order, shipping label, WhatsApp confirmation, email, Instagram connected; then flip the storefront public', owner: 'team', note: 'Why: the promise is live in 7 days; this is the check that it works, not just exists.', day: 6 },
  { stage: 9, stage_label: 'Handover', task: 'Send the founder the go-live note with their admin link and what happens every Monday', owner: 'founder', note: 'Why: results every Monday is the second promise.', day: 7 },
];

export const brandKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40) || 'brand';

/** Seed the Brand Setup tasks for the operations consultant. Returns how many were added (0 if already seeded or no consultant). */
export async function seedBrandSetupTasks(sb: SupabaseClient, brandName: string, startedAt = new Date()): Promise<number> {
  const key = brandKey(brandName);
  const { data: member } = await sb.from('retail_os_team_members').select('id').eq('active', true).ilike('role', '%operations%').order('started_on').limit(1).maybeSingle();
  if (!member) return 0;
  const { count } = await sb.from('retail_os_ops_tasks').select('id', { count: 'exact', head: true }).eq('member_id', member.id).eq('brand_key', key);
  if (count && count > 0) return 0;
  const due = (day: number) => new Date(startedAt.getTime() + day * 86_400_000).toISOString().slice(0, 10);
  const rows = BRAND_SETUP_TASKS.map((t, i) => ({ member_id: member.id, brand_key: key, brand_name: brandName, stage: t.stage, stage_label: t.stage_label, task: t.task, owner: t.owner, status: 'todo', note: t.note, due_on: due(t.day), sort: i + 1 }));
  const { error } = await sb.from('retail_os_ops_tasks').insert(rows);
  if (error) throw new Error(`ops seed: ${error.message}`);
  return rows.length;
}

// A new team member's own first week, on the same tracker as their brand work, so the
// morning team report shows onboarding progress too. Idempotent per member.
export const EMPLOYEE_ONBOARDING_TASKS: Seed[] = [
  { stage: 0, stage_label: 'Paperwork', task: 'Engagement letter and NDA signed and filed', owner: 'founder', note: 'Why: access to brand data starts only after both are signed.', day: 0 },
  { stage: 0, stage_label: 'Paperwork', task: 'Payment details and invoicing cadence agreed', owner: 'founder', note: 'Why: paying on time is a promise, not a favour.', day: 1 },
  { stage: 1, stage_label: 'Access', task: 'Tracker link bookmarked; first daily update posted from it', owner: 'team', note: 'Why: the tracker is the only place work is reported; the 9:30 report reads it.', day: 0 },
  { stage: 1, stage_label: 'Access', task: 'Access granted to the tools the brand tasks need (GitHub, Vercel, Supabase, Cloudflare, Meta, Shiprocket) and confirmed working', owner: 'founder', note: 'Why: a task blocked on access wastes a day; grant it up front.', day: 1 },
  { stage: 2, stage_label: 'Context', task: 'Read /mission and the Hospitality section of the Playbook', owner: 'team', note: 'Why: every brand touchpoint follows them.', day: 1 },
  { stage: 2, stage_label: 'Context', task: 'Walk through one live brand store and admin end to end with Virat', owner: 'founder', note: 'Why: seeing a finished build makes every setup task make sense.', day: 2 },
  { stage: 3, stage_label: 'First week', task: 'Daily update posted every working day of week 1', owner: 'team', note: 'Why: the habit matters more than the length.', day: 5 },
  { stage: 3, stage_label: 'First week', task: 'Week-1 review with Virat: what went well, what was unclear, what to change', owner: 'founder', note: 'Why: every mistake becomes a rule; the next hire starts from what this one learned.', day: 7 },
];

/** Seed a team member's onboarding checklist. Returns how many were added (0 if already seeded). */
export async function seedEmployeeOnboarding(sb: SupabaseClient, memberId: string, startedOn: string): Promise<number> {
  const { count } = await sb.from('retail_os_ops_tasks').select('id', { count: 'exact', head: true }).eq('member_id', memberId).eq('brand_key', 'onboarding');
  if (count && count > 0) return 0;
  const start = new Date(`${startedOn}T00:00:00Z`).getTime();
  const rows = EMPLOYEE_ONBOARDING_TASKS.map((t, i) => ({ member_id: memberId, brand_key: 'onboarding', brand_name: 'Onboarding', stage: t.stage, stage_label: t.stage_label, task: t.task, owner: t.owner, status: 'todo', note: t.note, due_on: new Date(start + t.day * 86_400_000).toISOString().slice(0, 10), sort: i + 1 }));
  const { error } = await sb.from('retail_os_ops_tasks').insert(rows);
  if (error) throw new Error(`onboarding seed: ${error.message}`);
  return rows.length;
}
