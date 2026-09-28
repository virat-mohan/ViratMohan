# How to build here

## Design standard (applies to everything built and run)
Every page, dashboard, image and email must look calm, soothing and premium, fitting the concept it serves.
- Use the viratmohan.com palette and fonts (paper background, ink text, gold and terracotta accents; display, serif and sans fonts as in `case-study/brand.py`).
- Plenty of white space, one idea per screen, soft contrast, no clutter, no loud colours or gimmicks.
- Gentle motion only. One authored look, no dark mode, same as the homepage. All surfaces use /brand/tokens.css (https://viratmohan.com/brand/tokens.css). Works at phone width with no sideways scroll.
- If it isn't beautiful and easy on the eyes, it isn't done.

## Voice
Every ask explains why. Every task has a SMART goal and reports target vs actual.
Every report to Virat ends with the live links to what changed.
First person "I", never "we". Plain language. The CTA is "Let's talk." (WhatsApp). Never invent numbers; sample data is labelled as sample.

## Copy alignment
All copy (pages, dashboards, emails, posts, chat replies) must trace back to /mission:
- Passion: taking something good someone made and building the machine that gets it to the world.
- Mission: any founder, a working online business in 7 days, run for them, with results every Monday.
- Vision: a new, more efficient way for the world to do business.
- Ambition: build success stories with brands around the world, the responsible way. (Internal north star, not stated publicly yet: the largest AI company for businesses. Do not say it in any public copy, and never put a number on the ambition.)
Same terms, same numbers, same promises everywhere. If a line contradicts /mission, fix the line. Customer-facing brand stores keep their own brand voice.

## Hospitality
Every customer touchpoint follows the Hospitality section of case-study/PLAYBOOK.md: welcome, anticipate, remember, look after. Nothing is emailed, messaged or posted without Virat's approval.

## Tech beliefs
- Always learning: Every mistake becomes a rule. The same mistake never happens twice.
- Always auditing: The system checks its own work, all the time, not once a quarter.
- Better every time: Each run starts from what the last one learned.
- Ideal state: Know what perfect looks like, measure the gap, close it a little every day.
- Humans decide: Machines do the work. Money, people and promises stay with me.
In practice: read case-study/LEARNINGS.md before work, add to it after. Every fix ends with one lesson.

## Values
Responsible business, fair practice, transparency, collective growth, positive impact, efficiency, plain language, keep promises. See `/mission`. How to decide in any situation: `case-study/PLAYBOOK.md`.

## Content & performance calendar (the standard)
When Virat says "content and performance calendar", build it with `tools/calendar/render.mjs` from a spec JSON (see `tools/calendar/README.md`). It is the Ceremony Kitchen Diwali 2026 format: DevShop Retail OS + brand header, a Mon–Sun grid with the image, caption and a sourced "why" for every post and its ad tag, then the Meta Ads plan with weekly budgets, expected return (labelled as a target) and the rules the system runs by. Real numbers only, each traceable to the account or the store.

## Team: Prince, only when Virat says so
Prince Keshri is Retail OS Operations (brand onboarding and integrations). Email pr.prince.3068@gmail.com · WhatsApp +91 91400 67354. His work page: https://www.viratmohan.com/retail-os/ops/18192551-2bcc-4140-bb2b-6a44abb9c744 (tasks in `retail_os_ops_tasks`, member id `7ccc4990-12b8-424b-93cf-724645fbac69`, Supabase project vszjwgxvqoqyixpfthwl).
- Never assign Prince anything (no new tasks, no messages with work) unless Virat explicitly says so. If something looks like his work, recommend it to Virat with the why and wait for a yes.
- Try to do any technical step yourself first. Never share passwords or keys anywhere: access is by named invitation.
- Virat is customer-facing for every request from brands, founders and customers. Prince (and any other team member) does not contact them unless Virat explicitly allows it; the team prepares, Virat sends.
- Prince's scope is internal tech-stack connecting only, for all brands and for internal use: accounts, integrations, keys (by invitation), webhooks, templates, DNS, deploys, setup records. Not marketing, ads, content, catalog or data entry, commercial terms, or client contact.
- Send every work email to Prince to **tech@viratmohan.com** (cc founder@viratmohan.com), never his personal Gmail. His pr.prince.3068@gmail.com is only for named account invitations (a tool inviting his individual login). And whenever Prince is given a task, add the same task to his checklist (`retail_os_ops_tasks`, member id `7ccc4990-12b8-424b-93cf-724645fbac69`, Supabase project vszjwgxvqoqyixpfthwl) so his work page shows it: owner `team`, a due date, priority, and the objective it serves.
## Master control
The viratmohan.com Claude Code session (repo "Virat Mohan Website", Supabase project vszjwgxvqoqyixpfthwl) is the master control for the whole DevShop Retail OS ecosystem: viratmohan.com, every client/brand backend and every agent. Central features, routines, agents and standards are decided there and must apply here too. If this repo is missing something the master has (a rule in its CLAUDE.md, a shared routine, the content & performance calendar standard, the lead journey, the ops tracker), bring it in line rather than inventing a local variant. Build shared things once centrally and consume them here; copy code only when it must run in this repo.

## Client access
Any access requested from a client to their accounts (Google Analytics, Search Console, Shopify staff, WordPress/WooCommerce, Shiprocket, any tool invite) is always for **tech@viratmohan.com**. Meta access is by the DevShop Business ID. The contact and sending address stays founder@viratmohan.com.
