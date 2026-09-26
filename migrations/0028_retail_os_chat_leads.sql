-- Leads qualified by Virat's AI assistant (website chat). One row per chat session, updated as it learns more.
create table if not exists retail_os_chat_leads (
  id uuid primary key default gen_random_uuid(),
  session_id text unique not null,
  page text,
  brand text,
  founder_name text,
  phone text,
  email text,
  category text,
  stage text,            -- idea | pre-revenue | selling
  monthly_revenue text,
  channels text,
  fit text,              -- strong | possible | not_now
  next_step text,        -- apply | whatsapp | faq | not_now
  summary text,
  transcript jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table retail_os_chat_leads enable row level security;
