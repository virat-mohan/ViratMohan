# The growth machine: sales that don't depend on Meta ads

Every live brand on DevShop Retail OS™ runs this. Meta ads are one channel with a hard cap, not the engine. The machine earns orders from content that already exists (the brand's posts, the founder's reels, customers' photos) and from owned channels the brand controls, so a dip in Meta ROAS never stops revenue.

Retail OS classification: **core Retail OS** capability under **Marketing** and **Acquisition / Middle-of-Funnel**. It is configuration per brand (channels on/off, keywords, templates), not a bespoke build. First laboratory: Travaholic Caps.

## The number that matters: a defined cost per order
- **Overall cost per order** = all acquisition spend (ads ex-GST + creator product cost + paid templates) ÷ all orders. This is the CAC we manage to.
- **Ads cost per order** = ad spend ex-GST ÷ orders from ad clicks. Watched, never the whole story.
- **Share of orders not from ads** is the health metric. Target: most orders from owned and earned channels once a brand is past launch. Set per brand from its own history; never invented.
- All three show on the founder console, Live brands → "Where orders came from", for any period and compared with the period before, last month or last year.

## Channels, in the order to switch them on

| # | Channel | What the machine does | Cost | Tag |
|---|---|---|---|---|
| 1 | **Comment-to-DM** on every reel and post | A keyword comment ("CAP", "LINK", the product name) gets an automatic reply and a DM with the product link, inside Meta's 24-hour messaging window. Every caption and pinned comment says "Comment CAP for the link". | Free | `utm_source=reel` |
| 2 | **Reel-matched landing** | Each reel links to the exact product shown, with the offer above the fold. Orders are tracked per reel, so we learn which content sells. | Free | `utm_source=reel&utm_campaign=<reel>` |
| 3 | **Founder content** | The founder's reels and talks drive traffic. Collab posts and partnership ads are proposed in the daily report; nothing goes on the founder's personal handles without his email approval. | Free | `utm_source=instagram&utm_campaign=founder_<id>` |
| 4 | **WhatsApp to past buyers** | New drops and reels sent to opted-in past customers with an approved marketing template, paced, opt-outs respected. Abandoned-cart reminders within 15 minutes. | Template fee per message | `utm_source=whatsapp` |
| 5 | **Referrals** | After delivery, every buyer gets a code: their friend gets the brand's standard referral benefit, they earn points. | Only the benefit on sales made | `utm_source=referral` |
| 6 | **Email** | Win-back and new-drop emails from an authenticated sender domain (SPF, DKIM, DMARC checked first), resends to non-openers. | Free up to the plan limit | `utm_source=email` |
| 7 | **Google free listings and SEO** | Product feed in Merchant Center free listings; product pages with proper titles, descriptions and structured data. | Free | `utm_source=google_merchant` |
| 8 | **Pay with a Post™ and creators** | Customers who post get rewarded; 10 to 20 creators with real, relevant followings seeded with product, each with a tracked link, ASCI disclosure (#gifted). UGC comes back as content. | Product cost | `utm_source=creator_<handle>` / `pwap` |
| 9 | **Partnerships and cross-sell** | The founder's other businesses and aligned partners (e.g. Travaholic Villas welcome kits with a QR). The CEO agent proposes; the founder decides. | Product cost | `utm_source=<partner>` |
| 10 | **B2B and gifting** | A gifting page and one-page offer for corporate and festival orders (10+ units, custom packaging). | Free | `utm_source=b2b` |
| 11 | **Meta ads** | Retargeting and proven audiences only, inside the brand's daily cap and ROAS floor (ex-GST), paced to the real balance. | Capped | set automatically (`ab=`) |

UTM values must be exactly these (lower case) so the console classifies them. Links are built by the store, never typed by hand.

## How it runs
- The brand's **CEO agent** (see the brand repo's CLAUDE.md charter) runs every channel alone within the guardrails and reports once a day at 8pm IST to founder@viratmohan.com: orders by channel, overall and ads cost per order, what shipped, what changed, at most one decision.
- **Weekly:** drop the weakest channel's effort into the strongest; repost the best-selling content; refresh the WhatsApp and email sends from what sold.
- **Honesty:** only real numbers from the store and the ad account; a channel with too few orders to judge says so.
- **Never:** fake reviews, bought followers, spam DMs outside the 24-hour window, discount claims in ads, posting on the founder's personal handles without email approval.
- **Launching a reel:** work the first hour by `REEL-LAUNCH-SOP.md` — the keyword, the three self-comments, the replies and the comment-to-DM lead magnet that feed channels 1 and 2.
