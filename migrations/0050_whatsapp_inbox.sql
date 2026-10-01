-- WhatsApp inbox (Retail OS core: Inbox → WhatsApp). Every message to and from the
-- connected number, one thread per customer phone. Service role only.
create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  brand_key text not null default 'devshop',
  wa_message_id text unique,
  direction text not null check (direction in ('in','out')),
  contact_phone text not null,
  contact_name text,
  body text not null default '',
  media_id text,
  status text,               -- out: sent / delivered / read / failed
  sent_by text,              -- out: 'dashboard' or 'bot'
  at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists whatsapp_messages_thread on whatsapp_messages (brand_key, contact_phone, at desc);
alter table whatsapp_messages enable row level security;
