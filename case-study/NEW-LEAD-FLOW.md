# New lead to live store: the flow

A founder should feel looked after from the first email, and never wonder what happens next. This page covers the sales and onboarding side. The tech side comes next.

**SMART goal:** every manual lead gets a personalised first email within 1 working day of entry. A lead who signs the NDA and connects data is live within 7 days (the clock in `src/lib/lead-journey.ts`).

## What a founder needs to see before they sign

In this order. Each one answers the question they're silently asking.

1. **"Does he get my brand?"** Their own brand, named, with one or two specific things I noticed on their site. Not a template.
2. **"Has this worked for anyone real?"** One result, as a percentage only, no brand name and no absolute figures (client data is confidential): +59% sales per day in the first 3 days after Retail OS took over the ads.
3. **"What does it cost me, and what's the catch?"** Zero capex, ₹5,000 deposit adjusted against tech costs, 40% of the profit pool, with a revenue-share model available depending on turnover. 12 months, 30-day break clause. Up front, never hidden.
4. **"Is my data safe?"** The mutual NDA, signed before they share anything.
5. **"What do I actually get, and when?"** A plan built on their own numbers, and a date.

## Who talks to the founder

- **Me (Virat):** every decision, the call, terms, the welcome group.
- **VM AI Assistant:** my assistant on email, website chat and, later, a WhatsApp bot. Answers questions any hour, sends the reminders I've approved, and hands anything needing judgement to me. It never speaks for me on money, terms or promises.
- **Prince:** not client-facing. He does the technical integrations and data connectors behind the scenes, from the ops tracker.

## The flow

### Part 1: before data connects (winning trust)

| # | Stage | What happens | Channel | Who | Time |
|---|---|---|---|---|---|
| 1 | **Lead entered** | I add brand name, website, decision maker's name and email (phone if I have it) on the Leads page, linked from the Clients section of my founder console. | Founder console | Virat | 1 min |
| 2 | **Research** | The system reads their website and public socials: category, price range, how they sell now. Every fact cited. | Automatic | System | Same hour |
| 3 | **First email drafted** | A branded HTML email: a personal opening about their brand, what DevShop Retail OS does, one result in %, the terms, and a button to sign the NDA. | Email (draft) | System | Same hour |
| 4 | **Approve and send** | One-tap approve. It sends from my Gmail, 9am to 8pm their time. | Email | Virat | Day 0 |
| 5 | **Questions** | Anything they ask by reply or on the website goes to VM AI Assistant first; I get what needs me. | Email, website chat | VM AI Assistant | Any time |
| 6 | **NDA signed** | They sign the mutual NCNDA from the link. I'm told; they get a thank-you with the data checklist. | Email | Founder | Day 0 to 3 |
| 6a | *No signature* | One reminder after 3 days with something new. Then a WhatsApp only if they gave a number. Then stop. | Email, then WhatsApp | VM AI Assistant, approved by Virat | Day 3, day 6 |
| 7 | **Data connected** | They connect Shopify, Meta and Google, or upload CSVs. Prince handles any connector trouble in the background. **The 7-day clock starts.** | Their private page | Founder, Prince behind the scenes | Day 0 to 2 |

### Part 2: after data connects (7 days to live)

| # | Stage | What happens | Channel | Who | Time |
|---|---|---|---|---|---|
| 8 | **Plan** | The audit runs on their numbers; their plan page shows gaps, what I'd do, and a forecast labelled as a forecast. | Email + plan page | System, approved by Virat | Day 1 |
| 9 | **Call** | 30 minutes, booked from the plan page. I listen first, then walk the plan. | Video or phone | Virat | Day 2 |
| 10 | **Terms signed** | Standard terms on their page; they sign on screen. | Page + WhatsApp | Founder | Day 2 |
| 11 | **Deposit** | ₹5,000 by UPI on their page. Receipt by email. | Page + email | Founder | Day 3 |
| 12 | **Welcome** | Welcome email with the go-live date and what happens each day. A WhatsApp group with me and the founder only. | Email + WhatsApp | Virat | Day 3 |
| 13 | **Build** | Prince does the integrations from the ops tracker. Anything needing their login comes to them as one clear ask, from me or VM AI Assistant. Progress note every 2 days. | WhatsApp group | Virat, Prince behind the scenes | Days 3 to 7 |
| 14 | **Go-live review** | They see the store before it opens and say yes. | Video call | Virat, founder | Day 6 |
| 15 | **Live** | Store opens. First Monday statement follows. | Email | System | Day 7, then every Monday |

**Channel rule** (from the Playbook): email for first contact and anything formal; WhatsApp only once they've shared a number, one-to-one, short, time-sensitive.

## Where I run it

All of this lives in the **Clients** section of my founder console (`/retail-os/admin/console#crm`). Every client from every system (leads, applications, live stores on their own projects) shows once, grouped into Before data, After data and Live, with the stage, who has the ball, days in stage (red when late) and the next step.

## The first email

Short enough to read on a phone in 60 seconds.

- **Subject:** plain, about them. "An idea for {Brand}" beats anything with "partnership" in it.
- **Opening (2 lines):** what I noticed about their brand.
- **The offer (3 lines):** I run the whole online business for them: store, payments, shipping, ads, WhatsApp. Live in 7 days. Results every Monday.
- **Proof (1 line):** +59% sales per day in the first 3 days. No brand name, no rupee figures.
- **Terms (1 line):** zero capex, ₹5,000 deposit, 40% of the profit pool; a revenue-share model is available depending on turnover. Link to the full terms.
- **The ask:** "Sign the NDA and I'll build your plan on your own numbers." One button.
- **Close:** "Let's talk." (WhatsApp), my name, and a line that VM AI Assistant can answer questions any time on email or the website.

## Decided

- NDA goes as a signing link (`/retail-os/nda/[token]`), not an attachment.
- First email carries the 40% share and mentions the revenue-share option.
- Prince is technical only: not in the welcome group, not client-facing.
- Hold the full pitch until after the NDA; the plan on their own numbers is what closes.

## Still to build

- Auto-research on entry and the personalised first email in the new branded template.
- Welcome email and WhatsApp group handover.
- Build progress notes every 2 days.
- VM AI Assistant on WhatsApp.
