-- Lead email assistant: Gmail ids on lead messages (idempotent re-runs), sync state,
-- and single-use approval tokens. Not applied automatically; apply by hand.
alter table lead_messages add column if not exists gmail_message_id text;
alter table lead_messages add column if not exists gmail_thread_id text;
alter table lead_messages add column if not exists gmail_draft_id text;
alter table lead_messages add column if not exists rfc_message_id text;
alter table lead_messages add column if not exists meta jsonb not null default '{}'::jsonb;
create unique index if not exists lead_messages_gmail_msg_uniq on lead_messages (gmail_message_id) where gmail_message_id is not null;
create index if not exists lead_messages_gmail_thread on lead_messages (gmail_thread_id) where gmail_thread_id is not null;

-- One row per mailbox: the last Gmail history id seen and when the cron last ran.
create table if not exists lead_mail_state (
  mailbox text primary key,
  history_id text,
  last_run_at timestamptz,
  last_result jsonb not null default '{}'::jsonb
);
alter table lead_mail_state enable row level security;

-- Approve & send links. The signature proves who made the link; this row makes it single-use.
create table if not exists lead_approval_tokens (
  nonce text primary key,
  message_id uuid not null references lead_messages(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table lead_approval_tokens enable row level security;

-- Gmail refresh token, sealed with AES-256-GCM under GMAIL_TOKEN_KEY (a Vercel env var).
-- RLS on with no policies: only the service role (server code) can read it.
create table if not exists gmail_credentials (
  mailbox text primary key,
  refresh_token_sealed text not null,
  scopes text not null default '',
  connected_at timestamptz not null default now()
);
alter table gmail_credentials enable row level security;
revoke all on gmail_credentials from anon, authenticated;

-- Daily send counter. Consumer Gmail allows about 500 recipients a day; the site stops at 400
-- and queues the rest in the outbox for the next day.
create table if not exists mail_quota (
  day date primary key,
  recipients integer not null default 0
);
alter table mail_quota enable row level security;
revoke all on mail_quota from anon, authenticated;

-- Atomically reserve p_n recipients for p_day if that keeps the day at or under p_cap.
create or replace function reserve_mail_quota(p_day date, p_n integer, p_cap integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  insert into mail_quota (day, recipients) values (p_day, 0) on conflict (day) do nothing;
  update mail_quota set recipients = recipients + p_n
   where day = p_day and recipients + p_n <= p_cap
   returning true into ok;
  return coalesce(ok, false);
end $$;
revoke all on function reserve_mail_quota(date, integer, integer) from public, anon, authenticated;
