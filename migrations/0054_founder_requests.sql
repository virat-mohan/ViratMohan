-- Founder line: requests Virat texts from 919999277240 to the DevShop WhatsApp number.
-- Queued only; Dev confirms each one in Claude before anything is done. Service role only.
--
-- WhatsApp template to submit (WhatsApp Manager → Message templates → Create):
--   name: founder_daily_brief   category: Utility   language: English (en)
--   body: "DevShop brief for {{1}}: {{2}}"
--     {{1}} = date, e.g. "2 Oct"   {{2}} = the summary on one line (items joined with " · ")
--   sample: {{1}} "2 Oct"  {{2}} "5 orders, ₹6,400 today · Unread: 2 · https://www.viratmohan.com/retail-os/admin/org?tab=planner"
-- Once Meta approves it, set FOUNDER_BRIEF_TEMPLATE_APPROVED=1 in Vercel. Until then the brief and
-- alerts go only as free text inside 24 hours of Virat's last message, and are logged as
-- skipped_no_template otherwise.
create table if not exists founder_requests (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  text text not null,
  status text not null default 'queued' check (status in ('queued','confirmed','done','declined')),
  result text,
  done_at timestamptz
);
create index if not exists founder_requests_status_at on founder_requests (status, at desc);
alter table founder_requests enable row level security;
