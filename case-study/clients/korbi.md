# Korbi (Ankay Holdings)

Contacts: Tushar Chaudhary (tusharchaudhary@gmail.com), Shyam Gupta (shyam4wd@gmail.com). Product: H4 LED headlight bulb, korbi.in.

## Status
- 2026-09-30: Proposal sent (Virat). Deposit ₹5,000 paid by Shyam Gupta at 4:58 PM, UPI txn 165838015703. Welcome and access email sent with the NDA attached again.
- NDA: not yet signed by either side. Countersign the same day it comes back, after checking every signature line and date.
- Goal: new korbi.in live and social content going out by Wed 7 Oct 2026. Meta ads come later, not at launch (Virat, 30 Sep).
- No forecast yet; it's a new D2C start.

## Access requested (all to tech@viratmohan.com)
Domain, current site/hosting, Razorpay (Admin or Manager), Shiprocket, Meta Business (Page, Instagram, Pixel, ad account), GA4 and Search Console.
Still owed from me: the DevShop Meta Business ID.

Granted:
- 2026-09-30: Razorpay: tech@viratmohan.com can log in (Virat confirmed). Next: API keys and webhook, set directly in the environment, never pasted in chat or email.

## Question log
Every question Tushar or Shyam asks goes here with the date, the question, my written answer and the date I answered.

| Date | Asked by | Question | Answer | Answered |
|---|---|---|---|---|
| 2026-09-30 | Shyam | Is the 40% negotiable? (25-40% mentioned on the call) | Draft awaiting Virat's decision | |
| 2026-09-30 | Shyam | Can the split be reviewed after 3 months? | Draft: 90-day review with real numbers, changes in writing (Virat to confirm) | |
| 2026-09-30 | Shyam | How is product cost agreed transparently? | Draft: signed landed cost per unit from supplier invoices; Monday statement itemised by source | |
| 2026-09-30 | Shyam | Fixed margin per unit (e.g. Rs 1,000) instead? | Draft awaiting Virat's decision | |
| 2026-09-30 | Shyam | Offline vs online margins; moving to online only | Draft: share applies only to korbi.in online sales; offline stays theirs | |
| 2026-09-30 | Shyam | Brainstorm a sales strategy that protects offline partners | Draft: 45-min session this week; same price everywhere, fitter locator, online-only bundles | |
| 2026-09-30 | Shyam | Do you take over social accounts? | Draft: run via Meta partner access; accounts stay theirs | |
| 2026-09-30 | Shyam | Approvals, and keeping the Japanese brand identity | Draft: brand guide first, 3-month direction, monthly calendar approved, every post approved at start | |
| 2026-09-30 | Shyam | Who answers comments and DMs in real time? | Draft: DevShop 9 AM-8 PM Mon-Sat with agreed answers; escalations to Korbi | |

Design references (Shyam, 30 Sep): whitekailash.com, wheaty.in, muji.com/jp/ja/store. "Straightforward, product first, no noise." Korbi wants to be involved in brand identity, design and creatives at first.

## Decisions
- 2026-09-30: Store stays on Shopify (Virat). The Retail OS dashboard reads from Shopify, Razorpay, Shiprocket and Meta. Classification: brand configuration.
- 2026-09-30: Korbi gets its own Supabase project (Virat). create_project timed out twice via the connector, and no project exists yet: create "korbi" in ap-south-1 from the Supabase dashboard, or retry.
- 2026-09-30: Three design directions drafted (A Shoji, B Night Road, C Craft) for Korbi to choose from.

## Commercial terms (confirmed by Virat, email to Shyam 1 Oct 2026)
- DevShop earns a fixed minimum of ₹1,000 per product sold on the online channel. This replaces the 40% profit share proposed earlier.
- Based on the current listed price of ₹11,500. If the price goes up, the fixed fee is discussed case by case.
- Offline sales are not included.
- NDA: Tushar replied on 30 Sep "NDA Signed" with a Google Docs link. Check every signature line and date before countersigning. Note the NCNDA rule: the non-compete must never bind DevShop.

## Onboarding page
- Application ebe48d68-2afe-410e-ba71-019fba090411, tracker https://www.viratmohan.com/retail-os/track/ebe48d68-2afe-410e-ba71-019fba090411
- hide_forecast = true (new D2C start). Three design directions (A Shoji, B Night Road, C Craft) loaded for them to choose on the page.
- Terms not yet sent on the page: the standard "Payments" line says customer payments collect into DevShop's account first, but Korbi uses its own Razorpay. Virat to confirm the payment flow, then send terms with perUnitFeeInr = 1000.

- 2026-10-01: Shyam chose Direction A (Shoji) "with our original Korbi motifs". Marked chosen in the DB. Full homepage preview at /retail-os/korbi/home/ with fit check, Our Story and FAQ; motifs, logo, photos and founder note are placeholders until Korbi sends them. Fitment list is from the Carsfy H4 guide; Korbi to confirm.
- Shopify: no collaborator access confirmed yet (request with code 7054 pending on our side). Korbi Supabase project: create_project timed out 3 times.

- 2026-10-01: Shyam: "Korbi is the name of the Samurai who researched into LED tech for RHD market"; the original page, communication and packaging carry this story. They will fish out the original creatives. Added a "Legend of Korbi" section to the homepage draft (placeholder art until their originals arrive).

- 2026-10-01: Korbi collaterals received (Drive "Korbi · Brand collaterals"): logo (KORBI, red sun O, "THE LIGHT SAMURAI"), packaging sleeve with the samurai artwork and copy, a 7-second brand film, fonts Gilroy and Helvetica Neue, a 99 MB background TIF and a QR code. Homepage rebuilt with the film as the opening, their logo, artwork, packaging copy word for word and the Indian-scripts motif. Gilroy web licence to confirm (Outfit stands in). The "WhatsApp us" button points to Virat until Korbi gives its own number.

- 2026-10-01: Media assets module built (core Retail OS): /retail-os/admin/media/korbi. Prince connects Shopify there once (store .myshopify.com + custom-app token with read_products), every product image imports into the library, and any image link can be copied for the site and posts.

## Retail OS backend (1 Oct 2026)
- Supabase project `korbi`, ref dajglwnvrhrxryzjkjka, region ap-southeast-1 (Singapore; Mumbai was intended, fine for now). Tables created: integrations, media_assets, products, orders (RLS on, server-only).
- Waiting on GitHub repo virat-mohan/korbi (Virat creates; my access returns 403) to build the admin and link Vercel.

## Product facts (from korbi.in screenshots Virat shared, 2 Oct 2026)
- Two products: Road LED Bulbs 4300K (Warm White) and Road LED Bulbs 6000K (Cool White), ₹11,500 each, taxes included.
- Holder types for both: H1, H4, H7, H8, H11, HB3, HIR2, 9005, 9012. (The homepage said H4 only before; corrected.)
- Claims on the store: class-leading brightness, two-year warranty, IP68 certified. The ballast label reads input 12V, 5.83A, power 70W.
- The store shows 4 reviews on 4300K. These aren't used on the homepage until we have the review text.
- Homepage photos are cropped from those screenshots (bulb-4300k, bulb-6000k, ballast). Replace them with originals once Shopify syncs into Korbi's Media assets.

## Preview store (2 Oct 2026)
- Homepage hero and "Shop the range" show both bulbs side by side. Each bulb has its own product page (/products/warm-white/, /products/cool-white/) with a colour switch, holder-type picker, quantity, a working cart (kept in the browser) and a full spec table. Checkout is held until Korbi approves.
- Specs I still need from Korbi before launch: brightness (lumens), rated life (hours), cooling type, CANBUS/error-free, bulb dimensions, and whether shipping is free.

## Tushar's feedback on the preview (6 Oct 2026)
- Design: Tushar prefers calm and minimal; waiting on Shyam's view. Virat replied that design feedback comes first, and he'll set up a call with Shyam.
- Fixed on 7 Oct:
  - The brand film wasn't showing. If a phone blocks autoplay, the film was skipped. It now stays up with "Tap to play", and a "Watch the film" link in the hero replays it.
  - The beam diagram was mirrored. It now dips on the right (oncoming) side and reaches further on the left (kerb) side.
  - H4 is ₹12,500 the pair; every other holder type is ₹11,500. The price and the cart now follow the holder type.
- Asked for: a ratings/reviews page on the website (to build).
- He attached a technical sheet (4 photos). My Gmail tool can't download attachments, so it needs to go in the Korbi Drive folder.
- To flag to Virat: the fee is ₹1,000 per unit at the ₹11,500 list price. H4 at ₹12,500 falls under "price change, discuss case by case".
