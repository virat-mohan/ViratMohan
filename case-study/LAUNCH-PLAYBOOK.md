# Every brand launch: the same eight steps

When a brand goes live on DevShop Retail OS, the launch runs in this order. The first launch done this way was Moonglasses, on 2 Oct 2026.

1. **Audit before go-live.** The brand's CEO agent and master control audit every money path (price trusted only on the server, payment amount checked, stock, discounts, COD off, Meta Purchase counted once), and every link and page loads. Blockers are fixed and tested before anything is announced.
2. **Founder told first.** The brand founder gets a "we're live" email (cc founder@) before any public post.
3. **Brand launch post** on the brand's own Instagram, in the brand's voice (it passes the brand's checkVoice). The brand's founders are tagged on slide 1.
4. **Joint announcement on @viratmohan_devshop.** It's in my brand: paper, ink, gold and terracotta, Anton / Instrument Serif / Inter, the four-colour stripe, a "DEVSHOP RETAIL OS™ × <BRAND>™" eyebrow, the brand's own photo and logo inside the frame, and "Let's talk." The caption is founder-facing and discloses my connection ("a brand I co-own" / "a brand I work with"). Pure clients appear by name only with their written OK; otherwise the post is anonymised.
5. **Story on @viratemn** tagging @viratmohan_devshop and linking to that post, so people tap through to the post and the page.
6. **Launch page on viratmohan.com.** Add `src/content/launches/<brand>.md`: headline, standfirst, date, store, relationship, image and post link. It appears at /launches/<brand>, on /launches, and as the homepage "Just launched" banner for 30 days. Update the brand's /work entry so it says the same things.
7. **Add the brand to the health check** (scripts/health/check.mjs BRANDS), so it's tested every 2 hours from day one.
8. **Check and report.** Load every link (200), then send me one report with all the live links: store, brand post, DevShop post, story and launch page.

Rules that always apply: nothing goes on my handles without my approval; no rupee figures, only percentages; images are cropped to the frame's exact proportions, never stretched; and every image is shown to me before it's posted.

## Announcement SOP (for each brand tie-up)
1. **Carousel on @viratmohan_devshop**, 4 slides: the hook, why the category exists, the brand, then why I said yes and what DevShop runs. Tag @viratemn.
2. **Tag @<brand>** in the caption and on slide 1, so people tap through to the brand's Instagram page and its website. Captions aren't clickable, so the tag is the click-through. Never send the brand a collaborator invite.
3. **Story on @viratemn** that shares the DevShop post, kicker "NEW BRAND TIE-UP", so a tap leads to the DevShop post, not the brand's site.
4. **LinkedIn document post** (the PDF of the carousel).
5. **Launch page** at /launches/<brand>, with the 30-day homepage "Just launched" banner, plus the /work entry. No splash page and no money terms anywhere.
6. **Assets** hosted at public/launches/<brand>/ and posted through Buffer from those URLs. Every link must load (200) before anything is posted. The look is the viratmohan.com poster (paper, Anton, the 4-colour band), with the brand's colour as an accent only. The reference build is ~/Desktop/freshforpaws-os/launch/source.
