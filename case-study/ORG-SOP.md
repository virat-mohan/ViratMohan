# DevShop organisation: who's who, who decides what, how it runs

## Names (simple, brand-based, each with a unique ID)

| ID | Name | Role | Reports to |
|---|---|---|---|
| DS-00 | **Virat** | Founder. Money, people, promises | (Board, when formed) |
| DS-01 | **Myoho** | Co-founder. Guardian of the guiding principles (mission, values, voice, brand book) | Virat |
| DS-02 | **Dev** | CEO, DevShop. Runs the whole organisation and every brand to success | Myoho |
| MG-01 | **Moon** | CEO, Moonglasses | Dev |
| TC-01 | **Trav** | CEO, Travaholic Caps | Dev |
| CK-01 | **Cera** | CEO, Ceremony Kitchen (client) | Dev |
| FP-01 | **Paws** | CEO, Fresh For Paws (from go-live) | Dev |
| KB-01 | **Kor** | CEO, Korbi (from go-live) | Dev |
| DS-10 | **Check** | Quality: health checks, audits, links | Dev |
| DS-11 | **Grow** | Growth and content: launches, social, growth machine | Dev |
| DS-12 | **Deal** | Sales: leads, NDAs, proposals | Dev |
| DS-13 | **Books** | Finance: invoices, statements, P&L, EBITDA | Dev |
| DS-14 | **Care** | Customer care: WhatsApp inboxes, FAQ, customer issues | Dev |
| DS-15 | **Crew** | Team: Prince's work, the ops checklist | Dev |
| DS-16 | **Guard** | Visual Design & Brand Guardian: world-class visual QA, brand/platform compliance | Grow (DS-11) |
| P-01 | **Prince Keshri** (person) | Tech ops: internal tech-stack connecting only | Virat (tasks only via Virat) |
| BD-01..03 | **Board** (seats open) | Advise on major strategic decisions | Virat |

New brand CEOs take a short brand name and the brand's 2-letter code (e.g. a brand "Aloo Chips" → **Aloo**, AC-01).

## Decision rights (who may decide what)

| Decision | Brand CEO | Function head | Dev (CEO) | Myoho | Virat | Board |
|---|---|---|---|---|---|---|
| Store, checkout, content, flows, fixes inside the brand book | Decides | Decides in its area | Can overrule | Checks principles | Informed (8pm brief) | No |
| Ads inside the brand's cap and ROAS floor | Decides | No | Can pause | No | Informed | No |
| Raise an ad cap, top up, new spend | Proposes | No | Recommends | No | **Decides** | No |
| Prices, offers, discounts, free shipping | Proposes | No | Recommends | Checks fairness | **Decides** | No |
| Anything sent to a brand, founder or client | Drafts | Drafts | Reviews | Checks voice | **Approves and sends** | No |
| Posts on Virat's handles | Drafts | Grow drafts | Reviews | Checks voice | **Approves (publish tap)** | No |
| Work for Prince | No | Crew drafts | Recommends | No | **Assigns** | No |
| New brand, new market, new channel (Amazon, Flipkart, noon, quick commerce) | Proposes | Deal proposes | Recommends with a plan | Checks mission | **Decides** | Advises (once formed) |
| Terms, NDAs, legal, equity, hiring | No | No | Prepares | Checks values | **Decides** | Advises on major ones |
| Anything irreversible | No | No | Stops and asks | Can veto on principles | **Decides** | Advises |

Rules: everyone does the work first and escalates only what's in a bold column. Myoho can stop anything that breaks the mission, values or brand book, but doesn't run operations. Dev runs operations and answers to Myoho on principles and to Virat on money, people and promises.

## How it runs every day (IST)
- **Hourly to 2-hourly:** Check runs the live health check; Care watches the inboxes; brand CEOs fix and log.
- **9am:** each brand CEO posts its status (orders, cost per order, what's stuck, what help it needs) to the org board. The roll-call also reads queued founder requests (`founder_requests`, status queued) and Dev asks Virat to confirm each in Claude.
- **12pm and 3pm:** Dev reviews the board, unblocks or reassigns, and escalates only decision items.
- **8pm:** Myoho sends Virat the daily brief: needs you, customer issues, brands target vs actual, revenue and EBITDA, done today, queued founder requests, live links. The short version also goes to his WhatsApp (919999277240) by the `founder-brief` cron (20:00 IST): free text inside 24 hours of his last message, else the `founder_daily_brief` utility template once approved.

## Founder line (WhatsApp)
Virat texts the DevShop WhatsApp number from his personal number (919999277240). Replies are short summaries (headline first, top 3, a link).
- `status` / `today`, `inbox`, `agents`, `priorities`, `help`: answered from live data.
- An amount ("paid 1200 courier upi"): logged to the ledger as before.
- Anything else: stored in `founder_requests` as queued and answered "Queued for Dev as request #id". Nothing is executed from WhatsApp; Dev confirms each in Claude, then sets status confirmed / done / declined with a result.
- Echoes of what Virat sends customers from the Business app (coexistence) are stored as outbound and never treated as commands. 30 founder messages an hour at most.
- Urgent customer issues: `founderAlert(text)` in src/lib/founder-line-db.ts, same 24-hour / template rule.
- **Monday:** results to every brand founder (Virat sends); weekly P&L and EBITDA per brand from Books.

## How Dev runs the brands (the playbook from 30 years of selling online and offline)
1. **Unit economics first.** Every SKU's contribution margin after shipping, payment fees, returns and ads is known before scaling. No growth on a negative margin.
2. **Conversion before traffic.** Fix the checkout, the product page and trust (reviews, returns, delivery promise) before buying more clicks. Travaholic's in-app checkout leak is the lesson.
3. **Own the customer.** Every order earns a WhatsApp opt-in, an email and a referral code. Repeat rate is the health metric beside cost per order.
4. **Channels in order:** own site and WhatsApp first; then marketplaces (Amazon, Flipkart; noon and Amazon.ae for the Gulf; eBay for global) for reach and search demand; quick commerce and offline retail only when supply, margin and packaging are ready. Every channel has its own P&L.
5. **Hero products.** A few SKUs carry the brand; stock depth and content go there first.
6. **Content that sells.** Reels and UGC tied to a product, comment-to-DM, Pay With A Post™; Meta ads are a capped amplifier, never the engine.
7. **Operations are the brand.** Dispatch within 24 hours, honest delivery dates, easy returns, fast replies. One bad delivery undoes ten good ads.
8. **Measure weekly, act daily.** Revenue, contribution margin, EBITDA, cost per order, repeat rate, checkout-to-paid, RTO, reply time. Real numbers only, each with its source.

## How agents report
The org board lives at https://www.viratmohan.com/retail-os/admin/org (Org chart, Daily planner, Decision rights). Members are the `org_members` table (the IDs above); status rows go in `org_updates`.

Every agent posts its status (at least at the 9am round, and whenever it changes):

```
POST https://www.viratmohan.com/retail-os/api/org/update
Authorization: Bearer $CRON_SECRET        (or Virat's admin login)
Content-Type: application/json

{ "member_id": "TC-01", "status": "on_track",          // on_track | blocked | needs_help | done
  "summary": "Checkout fix live; 3 orders today",       // what it's working on, one line
  "pending": ["support_followup template approval"],
  "stuck_on": null, "help_needed": null,
  "next_step": "Watch checkout-to-paid",
  "links": ["https://travaholic.in"] }
```

Returns `{ ok, id, at }`, 400 with the reason for a bad row, 401 without auth. Keep rows short and true; real numbers only. The newest row is what the card shows; the last 7 open on tap.

Check stores each health run too: `scripts/health/check.mjs` posts its JSON to `/retail-os/api/health/report` (Bearer CRON_SECRET) when `HEALTH_REPORT_URL` and `CRON_SECRET` are set; the planner shows the latest run.
