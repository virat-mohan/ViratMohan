-- Org board: members (from case-study/ORG-SOP.md), their status updates, and stored health runs.
-- Service role only: RLS on, no policies.
create table if not exists org_members (
  id text primary key,
  name text not null,
  role text not null,
  kind text not null check (kind in ('founder','cofounder','ceo','brand_ceo','function','person','board_seat')),
  reports_to text references org_members(id),
  owns text[] not null default '{}',
  may_decide text,
  must_escalate text,
  brand_key text,
  active boolean not null default true,
  sort int not null default 0
);
create table if not exists org_updates (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references org_members(id),
  at timestamptz not null default now(),
  status text check (status in ('on_track','blocked','needs_help','done')), -- null = not reported yet
  summary text not null,
  pending text[] not null default '{}',
  stuck_on text,
  help_needed text,
  next_step text,
  links text[] not null default '{}'
);
create index if not exists org_updates_member_at on org_updates (member_id, at desc);
create table if not exists health_runs (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  failed int not null default 0,
  report jsonb not null
);
create index if not exists health_runs_at on health_runs (at desc);
alter table org_members enable row level security;
alter table org_updates enable row level security;
alter table health_runs enable row level security;

insert into org_members (id,name,role,kind,reports_to,owns,may_decide,must_escalate,brand_key,active,sort) values
('DS-00','Virat','Founder. Money, people, promises','founder',null,'{money,people,promises}','Ad caps and new spend; prices and offers; anything sent to a brand, founder or client; posts on his handles; work for Prince; new brands, markets and channels; terms, NDAs, legal, equity, hiring; anything irreversible','The Board advises once formed',null,true,0),
('DS-01','Myoho','Co-founder. Guardian of the guiding principles (mission, values, voice, brand book)','cofounder','DS-00','{mission,values,voice,"brand book","8pm daily brief"}','Can stop anything that breaks the mission, values or brand book; checks principles, fairness, voice, mission and values; can veto irreversible steps on principles','Money, people, promises, his handles, customer issues, irreversible steps, decisions only Virat can make: in the 8pm brief, urgent ones at once',null,true,1),
('DS-02','Dev','CEO, DevShop. Runs the whole organisation and every brand to success','ceo','DS-01','{operations,"every brand","the org board"}','Can overrule brand CEOs on store, checkout, content, flows and fixes; can pause ads; reviews anything sent; recommends spend, prices, Prince work and new channels; prepares terms and legal','To Myoho on principles; to Virat on money, people and promises. Stops and asks before anything irreversible',null,true,2),
('MG-01','Moon','CEO, Moonglasses','brand_ceo','DS-02','{Moonglasses}','Store, checkout, content, flows, fixes inside the brand book; ads inside the cap and ROAS floor','Proposes cap raises, top-ups, prices, offers, new channels; drafts anything sent to the founder','moonglasses',true,10),
('TC-01','Trav','CEO, Travaholic Caps','brand_ceo','DS-02','{"Travaholic Caps"}','Store, checkout, content, flows, fixes inside the brand book; ads inside the cap and ROAS floor','Proposes cap raises, top-ups, prices, offers, new channels; drafts anything sent to the founder','travaholic',true,11),
('CK-01','Cera','CEO, Ceremony Kitchen (client)','brand_ceo','DS-02','{"Ceremony Kitchen"}','Store, checkout, content, flows, fixes inside the brand book; ads inside the cap and ROAS floor','Proposes cap raises, top-ups, prices, offers, new channels; drafts anything sent to the client','ceremony',true,12),
('FP-01','Paws','CEO, Fresh For Paws (from go-live)','brand_ceo','DS-02','{"Fresh For Paws"}','From go-live: store, checkout, content, flows, fixes inside the brand book; ads inside the cap and ROAS floor','Proposes cap raises, top-ups, prices, offers, new channels','freshforpaws',true,13),
('KB-01','Kor','CEO, Korbi (from go-live)','brand_ceo','DS-02','{Korbi}','From go-live: store, checkout, content, flows, fixes inside the brand book; ads inside the cap and ROAS floor','Proposes cap raises, top-ups, prices, offers, new channels','korbi',true,14),
('DS-10','Check','Quality: health checks, audits, links','function','DS-02','{"health checks",audits,links}','Fixes in its area inside the brand book','Anything in a bold column of the decision rights',null,true,20),
('DS-11','Grow','Growth and content: launches, social, growth machine','function','DS-02','{launches,social,"growth machine"}','Fixes in its area; drafts posts for Virat''s handles','Posts on Virat''s handles (he approves), new channels',null,true,21),
('DS-12','Deal','Sales: leads, NDAs, proposals','function','DS-02','{leads,NDAs,proposals}','Fixes in its area; drafts replies and proposals; proposes new brands','Anything sent to a lead; terms, NDAs, new brands',null,true,22),
('DS-13','Books','Finance: invoices, statements, P&L, EBITDA','function','DS-02','{invoices,statements,"P&L",EBITDA}','Fixes in its area; drafts invoices and statements','Invoices to send, money decisions',null,true,23),
('DS-14','Care','Customer care: WhatsApp inboxes, FAQ, customer issues','function','DS-02','{"WhatsApp inboxes",FAQ,"customer issues"}','Answers what the FAQ or Brain already covers','Every customer issue to founder@ by email',null,true,24),
('DS-15','Crew','Team: Prince''s work, the ops checklist','function','DS-02','{"Prince''s work","ops checklist"}','Drafts work for Prince','Every new task for Prince (Virat assigns)',null,true,25),
('P-01','Prince Keshri','Tech ops: internal tech-stack connecting only','person','DS-00','{accounts,integrations,webhooks,templates,DNS,deploys}','His own tech steps inside tasks Virat assigned','Tasks only via Virat; no client contact',null,true,30),
('BD-01','Board seat 1 (open)','Advise on major strategic decisions','board_seat','DS-00','{}','Advises on new brands, markets, channels, terms and irreversible steps once formed','Not formed yet',null,false,40),
('BD-02','Board seat 2 (open)','Advise on major strategic decisions','board_seat','DS-00','{}','Advises on new brands, markets, channels, terms and irreversible steps once formed','Not formed yet',null,false,41),
('BD-03','Board seat 3 (open)','Advise on major strategic decisions','board_seat','DS-00','{}','Advises on new brands, markets, channels, terms and irreversible steps once formed','Not formed yet',null,false,42)
on conflict (id) do nothing;

-- One honest first row per member (2 Oct 2026), from the repos and docs only. null status = not reported yet.
insert into org_updates (member_id,status,summary,pending,stuck_on,help_needed,next_step,links) values
('DS-00',null,'Decides money, people and promises from the 8pm brief.','{}',null,null,null,'{}'),
('DS-01','on_track','Org SOP and agent structure set (names, IDs, decision rights, cadence).','{}',null,null,'Send the 8pm brief from the org board.','{https://www.viratmohan.com/retail-os/admin/org}'),
('DS-02','on_track','Today: Korbi store mobile-first, DevShop WhatsApp welcome auto-reply, Org SOP, org board.','{}',null,null,'Review the board at 12pm and 3pm; unblock Moon.','{https://www.viratmohan.com/retail-os/admin/org}'),
('MG-01','needs_help','Brand WhatsApp 93183 11657 is not on MSG91 yet.','{"Order-alert template approval"}','WhatsApp number not connected to MSG91','Connect 93183 11657 to MSG91 (tech step)','Get the order-alert template approved.','{}'),
('TC-01','on_track','Checkout fix live.','{"Prince: 4 Vercel/Meta steps","support_followup template approval"}',null,null,'Watch checkout-to-paid after the fix.','{https://travaholic.in}'),
('CK-01',null,'Not reporting yet; first status at the 9am round.','{}',null,null,null,'{https://ceremonykitchen.com}'),
('FP-01',null,'Not live yet; brand book v0.1 and three website mockups done.','{}',null,null,null,'{https://www.viratmohan.com/launches}'),
('KB-01',null,'Not live yet; preview store built mobile-first.','{}',null,null,null,'{}'),
('DS-10',null,'Live health check runs every 2 hours; results now post to the board.','{}',null,null,null,'{}'),
('DS-11',null,'Not reporting yet.','{}',null,null,null,'{}'),
('DS-12',null,'Not reporting yet.','{}',null,null,null,'{}'),
('DS-13',null,'Not reporting yet.','{}',null,null,null,'{}'),
('DS-14',null,'Not reporting yet.','{}',null,null,null,'{}'),
('DS-15',null,'Not reporting yet.','{}',null,null,null,'{https://www.viratmohan.com/retail-os/ops/18192551-2bcc-4140-bb2b-6a44abb9c744}'),
('P-01','needs_help','75 open team tasks, 27 past due; from retail_os_ops_tasks.','{"75 open team tasks"}','2 tasks blocked on Virat','Virat: the 2 tasks blocked on you','Work the checklist by due date.','{https://www.viratmohan.com/retail-os/ops/18192551-2bcc-4140-bb2b-6a44abb9c744}'),
('BD-01',null,'Seat open.','{}',null,null,null,'{}'),
('BD-02',null,'Seat open.','{}',null,null,null,'{}'),
('BD-03',null,'Seat open.','{}',null,null,null,'{}');
