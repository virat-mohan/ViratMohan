# Reels

Vertical 1080×1920 videos in the viratmohan.com look, rendered frame by frame from an HTML page.

```
FFMPEG=/path/to/ffmpeg node tools/reel/render.mjs                                  # full MP4
node tools/reel/render.mjs tools/reel/devshop-retail-os.html out/x.mp4 --stills 3,12  # PNG checks
```

The page exposes `window.seek(t)` and `window.DURATION`, so every frame is exact. No ffmpeg on the box: `pip install imageio-ffmpeg` and point `FFMPEG` at its binary.

## devshop-retail-os.html → public/retail-os/social/devshop-retail-os-reel.mp4

44 s, silent, so trending audio can be added in Instagram. Every claim and its source:

| Scene | Claim | Source |
|---|---|---|
| Hook | "I run the whole online business: store, ads, content, WhatsApp, shipping." | `src/pages/devshop.astro` Retail OS feature |
| 3–7 days | Live 3–7 days after signing; stages catalog → go-live; the caveat | FAQ "How long until the store is live?" and "How do I follow progress?" (`public/retail-os/faq/faq-data.js`) |
| Features | Shopify import, one photo in, WhatsApp checkout, cart recovery, ads that draft themselves, Pay with a Post™ | `/retail-os` "What you actually get" |
| Proof | Ceremony Kitchen Meta ROAS 1.3× → 2.7× (2×); cost per purchase ₹1,917 → ₹1,066 | ceremony-os Supabase `meta_ad_insights`, pulled 28 Sep 2026. Takeover 26 Sep (`brands.retail_os_since`). After 26–28 Sep: ₹3,198 spend, 3 purchases, ₹8,498. Before 27 Aug–25 Sep: ₹53,686, 28 purchases, ₹68,571. 28 Sep is a part day. |
| Monday | Settled every Monday by 1 PM IST, itemised, visible every day | `/retail-os` "How you get paid" |
| Brands | Status per brand | FAQ "Which brands use it today?" (the one source); Travaholic Stays and The Feeling Co from the DevShop proof list |
| End | "Let's talk." WhatsApp +91 99992 77240 | `src/data/site.ts` |

Re-pull the proof numbers before each re-post; a 3-day window moves.
