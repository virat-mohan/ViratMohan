# New lead to live store: the flow

A founder should feel looked after from the first email, and never wonder what happens next. This page covers the sales and onboarding side. The tech side comes next.

**SMART goal:** every manual lead gets a personalised first email within 1 working day of entry. A lead who signs the NDA and connects data is live within 7 days (the clock in `src/lib/lead-journey.ts`).

## What a founder needs to see before they sign

In this order. Each one answers the question they're silently asking.

1. **"Does he get my brand?"** Their own brand, named, with one or two specific things I noticed on their site. Not a template.
2. **"Has this worked for anyone real?"** One proof point with a source: Travaholic went from ₹880 to ₹1,399 a day in the first 3 days (from `/retail-os`).
3. **"What does it cost me, and what's the catch?"** Zero capex, ₹5,000 deposit adjusted against tech costs, 40% of the profit pool standard, 12 months, 30-day break clause. Up front, never hidden.
4. **"Is my data safe?"** The mutual NDA, signed before they share anything.
5. **"What do I actually get, and when?"** A plan built on their own numbers, and a date.

## The flow

| # | Stage | What happens | Channel | Who | Time |
|---|---|---|---|---|---|
| 1 | **Lead entered** | I add brand name, website, decision maker's name and email (phone if I have it) at `/retail-os/admin/leads`. | Admin page | Virat | 1 min |
| 2 | **Research** | The system reads their website and public socials: category, price range, what they sell, how they sell now. Every fact cited. | Automatic | System | Same hour |
| 3 | **First email drafted** | A branded HTML email in the viratmohan.com look: a personal opening about their brand, what DevShop Retail OS does for them, one proof point, the terms in one line, and a button to sign the NDA. | Email (draft) | System | Same hour |
| 4 | **Approve and send** | I get a one-tap approve link. It sends from my Gmail, 9am to 8pm their time. | Email | Virat | Day 0 |
| 5 | **NDA signed** | They sign the mutual NCNDA on screen. I get told; they get a thank-you with the access checklist. | Email | Founder | Day 0 to 3 |
| 5a | *No signature* | One gentle reminder after 3 days, adding something new (not "just following up"). Then a WhatsApp only if they gave a number. Then stop. | Email, then WhatsApp | System, approved by Virat | Day 3, day 6 |
| 6 | **Data connected** | They connect Shopify, Meta and Google, or upload CSVs. **The 7-day clock starts.** | Their private page | Founder | Day 0 to 2 |
| 7 | **Plan** | The audit runs on their numbers; their plan page shows the gaps, what I'd do, and a forecast labelled as a forecast. | Email + plan page | System, approved by Virat | Day 1 |
| 8 | **Call** | 30 minutes, booked from the plan page. I listen first, then walk the plan. | Video or phone | Virat | Day 2 |
| 9 | **Terms signed** | Standard terms appear on their page; they sign on screen. WhatsApp: "Your terms are ready." | Page + WhatsApp | Founder | Day 2 |
| 10 | **Deposit** | ₹5,000 by UPI on their page. Receipt by email. | Page + email | Founder | Day 3 |
| 11 | **Welcome** | A welcome email: who does what, the go-live date, Prince as their day-to-day contact. A WhatsApp group with me and Prince. | Email + WhatsApp group | Virat, Prince | Day 3 |
| 12 | **Build** | Catalog, payments, shipping, Meta, WhatsApp. Anything needing their login becomes one clear ask with the why. Short progress note on WhatsApp every 2 days. | Ops tracker + WhatsApp | Prince | Days 3 to 7 |
| 13 | **Go-live review** | They see the store before it opens and say yes. | Video call | Virat, founder | Day 6 |
| 14 | **Live** | Store opens. First Monday statement follows. | Email | System | Day 7, then every Monday |

**Channel rule** (from the Playbook): email for first contact and anything formal; WhatsApp only once they've shared a number, one-to-one, short, time-sensitive.

## The first email

Short enough to read on a phone in 60 seconds.

- **Subject:** plain, about them. "An idea for {Brand}" beats anything with "partnership" in it.
- **Opening (2 lines):** what I noticed about their brand.
- **The offer (3 lines):** I run the whole online business for them: store, payments, shipping, ads, WhatsApp. Live in 7 days. Results every Monday.
- **Proof (1 line):** Travaholic, ₹880 to ₹1,399 a day, with a link.
- **Terms (1 line):** zero capex, ₹5,000 deposit, 40% of the profit pool. Link to the full terms.
- **The ask:** "Sign the NDA and I'll build your plan on your own numbers." One button.
- **Close:** "Let's talk." (WhatsApp), my name.

## Two recommendations

1. **Send the NDA as a signing link, not a PDF attachment.** An attachment in a first cold email lands in spam more often, and can't be signed without printing. The online NCNDA at `/retail-os/nda/[token]` already exists, tracks signature and starts the next step on its own. I can add a "Download PDF" link on that page for founders who want a copy.
2. **Hold the full DevShop Retail OS pitch back until after the NDA.** The first email opens the door; the plan built on their own numbers is what closes. Sending everything at once gives them nothing to look forward to.

## Already built vs. still needed

Built (in the repo): the add-a-lead form, the stage list and 7-day clock (`lead-journey.ts`), one-tap approval, the online NDA, the access page, plan and terms pages, deposit, NDA and access reminders.

Needed, for the tech plan next:
- Auto-research on entry (step 2) and the personalised first-email draft (step 3) in the new branded template.
- The welcome email and WhatsApp group handover (step 11).
- Build-progress notes every 2 days (step 12).
- Optional PDF copy of the signed NDA.

## Decisions for Virat

1. NDA as link (recommended) or PDF attachment?
2. Should the first email carry the 40% share, or only "zero capex" with a terms link?
3. Is Prince in the welcome WhatsApp group from day 3?
