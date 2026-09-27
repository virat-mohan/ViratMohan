# Iredus Aloo Chips: sales-first plan (internal, not for sending)

Based on Raghu's agenda email, 27 Sep 2026, 14:23 IST ("Agenda - Discussion 4PM today ..."), cc Ishaan and Isha.
Mapped against what Retail OS does today (`src/lib/retail-os-terms.ts`, `src/lib/ops-seed.ts`, `case-study/WOW-TARGETS.md`).
Targets are to be tested first; set with the brand after two weeks of measured data.

## What they asked, in one line each
1. **WhatsApp is their main channel, and it leaks.** Their numbers: under 20% of sent messages get delivered, 50% of delivered get seen, 20% of seen get a reply, under 10% of replies order. Under 1% of sent messages become an order. They want it automated, with no extra staff.
2. **Reactivate the old Iredus database** with trial orders.
3. **Reach 25 to 35 year olds**, Lexi's crowd, who buy on impulse.
4. **Custom-label gifting**: birthdays, anniversaries, corporate buyers, wedding planners, boutique hotels and restaurants.
5. **Referrals**: their best channel, but they don't track it yet. Later, lifestyle brand partners reaching their curated base.
6. Also: B2B (bars), lifestyle outlets, and a packaging designer referral.

## What the numbers tell us
- **Under 20% delivered is the first thing to fix.** A normal send should not lose four in five messages. The likely cause is a personal or bulk WhatsApp tool rather than the official Business API, or numbers that never opted in. I need to see their setup to confirm. Fix delivery and every later step multiplies.
- After delivery, the order is lost at seen → reply → order. That is a message and offer problem, plus the need for a person to reply. Order-on-WhatsApp (catalog and pay link inside the chat) removes the person.

## What Retail OS already covers
| Their ask | Today in Retail OS | Gap |
|---|---|---|
| WhatsApp delivery and automation | Official Cloud API number, approved templates, webhook inbox, order and shipping messages (ops stages 5) | Broadcast to a segment with opt-in tracking: build per brand |
| Old database campaign | Win-back flow proven on Travaholic (566 past buyers, LOYAL15 code; WOW-TARGETS #3) | Their list is prospects, not past buyers; consent must be checked first |
| Order without a person | Store, checkout, payments, shipping, WhatsApp confirmations | Order-from-chat: catalog and pay link in the reply |
| Failed payments | Failed-payment recovery (WOW-TARGETS #1) | None |
| Referrals | Pay with a Post™ (customer pays with a post; 1% of sales it drives) | A "who sent you" field and per-customer referral codes |
| Gifting and custom labels | Catalog with product variants | Name/message field on the order, occasion date capture, bulk quote form |
| 25 to 35 impulse | Meta ads and creative generator | Marketing: later, per your call |

## Priority (sales first; branding and packaging later)
**Week 1, inside the 7-day build: fix the pipe**
1. Move their WhatsApp to the official Cloud API with Meta Business Verification. Start verification on day 0 because it can take weeks.
2. Store live on aloochips.com with order and pay from WhatsApp: tap, pick a pack, pay by UPI, done. No one needs to reply by hand.
3. Add "Who told you about us?" at checkout, so referral data starts on day one.
- *To test (not a target yet):* delivered/sent from under 20% to 90%+ within 14 days of the number going live, on opted-in contacts.

**Weeks 2 to 3: turn the database into trial orders**
4. Clean and segment the old Iredus list (by avatar, city, past interaction). Only message people who agreed to hear from Iredus. Everyone else gets a one-time opt-in ask through a channel they already used.
5. One trial offer: a small taster pack, priced for trying, with one tap to order. Send in small batches, measure each step, then change one thing at a time.
- *To test (not a target yet):* sent → order from under 1% to 3%+ on the first 500 opted-in contacts. Baseline is their own figure.

**Weeks 3 to 4: gifting, the high-value order**
6. A gifting page: custom label with name and message, occasion date, delivery date. Save birthdays and anniversaries and send a reminder 10 days before, next year too.
7. A bulk and corporate quote form for planners, hotels, restaurants and offices, routed to Raghu for approval.
- *To test (not a target yet):* 10 gifting orders and 3 bulk enquiries in the first 30 days live.

**Month 2: referral programme**
8. Every buyer gets their own code: the friend gets a small discount and the referrer gets credit. Track it in orders.
9. Pay with a Post™ for customers who would rather post than pay full price.
10. Brand partners later, once we have a counted, opted-in base to show them.

**Later (marketing and branding):** the 25 to 35 impulse campaign (Meta ads plus creatives), B2B bars, lifestyle partners, packaging refresh. I'd suggest a designer only once we know which pack sizes sell.

## Offering to suggest
- **Standard Retail OS partnership**: store, WhatsApp automation, payments, shipping, reporting every Monday. 40% profit share, open to 25 to 40. ₹5,000 deposit fully adjusted against setup costs. 30-day break clause, and they keep everything built.
- **Frame it as "Sales first"**: the scope is items 1 to 9 above. Marketing and branding come in as phase two, on the same terms, once weekly orders are steady.
- They keep: making, stock and packing, plus approval of every campaign and ad rupee.
- To confirm before offering: no new pricing or packages are invented here. Any sales-only variant of the terms is your call.

## Open questions for them
1. Which WhatsApp tool do they send with today, and from which number?
2. How big is the old database, and how was each number collected? This decides who we can message.
3. Price and weight of a trial pack; price of a custom-label gift; minimum order for bulk.
4. Current orders per week and average order value. This is the baseline for every Monday report.
5. Who approves campaigns: Raghu, Ishaan or Isha?

## Contacts (now known; from the email header)
Raghu Kanudia, kanudia.raghu@gmail.com · Ishaan, ishaankanudia@gmail.com · Isha, isha182005@gmail.com.
This clears the "no founder contact" blocker on the lead. The lead record is not updated yet; waiting for your go.
