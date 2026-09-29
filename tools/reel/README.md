# Reels

Vertical 1080×1920 videos in the viratmohan.com look, rendered frame by frame from an HTML page.

```
FFMPEG=/path/to/ffmpeg node tools/reel/render.mjs                                  # full MP4
node tools/reel/render.mjs tools/reel/devshop-retail-os.html out/x.mp4 --stills 3,12  # PNG checks
```

The page exposes `window.seek(t)` and `window.DURATION`, so every frame is exact. No ffmpeg on the box: `pip install imageio-ffmpeg` and point `FFMPEG` at its binary.

## devshop-retail-os.html → public/retail-os/social/devshop-retail-os-reel.mp4

57 s (paced for reading), homepage poster colours (one colour block per scene, circle wipes, bouncy type, confetti on the proof point). The last frame matches the first, so it loops cleanly. Scene start times live in `SCENES` at the top of the script, so the cuts can be moved onto the beats of a music track.

Music: `soundtrack.py` (Salamander Grand Piano, CC BY 3.0, Alexander Holm; Karoryfer electric bass). Credit "Piano: Salamander Grand Piano by Alexander Holm (CC BY 3.0)" in the post or first comment. Any other track can be added with
`ffmpeg -i reel.mp4 -i track.wav -map 0:v -map 1:a -c:v copy -af "afade=t=out:st=41:d=3,loudnorm=I=-14:TP=-1.5" -c:a aac -b:a 192k -shortest out.mp4`.
The earlier synthesised soundtracks were rejected as sounding like MIDI and are removed.

| Scene | Claim | Source |
|---|---|---|
| Hook, "I run it" | "I run the whole online business: store, ads, content, WhatsApp, shipping." | `src/pages/devshop.astro` Retail OS feature |
| Three shapes | D2C e-commerce, marketplace, subscription commerce | `/retail-os` "Pick the shape your business already has" |
| 3–7 days | Live 3–7 days after signing; stages catalog → go-live; the caveat | FAQ "How long until the store is live?" and "How do I follow progress?" |
| Features | Shopify import, one photo in, WhatsApp to checkout, cart recovery, ads that draft themselves, Pay with a Post™ | `/retail-os` "What you actually get" |
| Proof | A D2C brand (not named on screen, at Virat's request): Meta ROAS 1.28× → 2.65× (2×; 2.65× as Virat reports it, 2.66× from the database); cost per purchase ₹1,917 → ₹1,066 | ceremony-os Supabase `meta_ad_insights`, pulled 28 Sep 2026. Takeover 26 Sep (`brands.retail_os_since`). After 26–28 Sep: ₹3,198 spend, 3 purchases, ₹8,498. Before 27 Aug–25 Sep: ₹53,686, 28 purchases, ₹68,571. |
| Monday | Settled every Monday, visible every day | `/retail-os` "How you get paid" |
| Brands | Status per brand (plain text) | FAQ "Which brands use it today?"; India Contemporary live, 5+ launching this week and Ceremony ops/finance from Virat, 28 Sep 2026; Travaholic Stays and The Feeling Co from the DevShop proof list |
| Refer | "Bring a brand. Earn 25%. For as long as it stays." | `/partners` and FAQ "Can I earn by referring brands?" |
| End | "Let's talk." WhatsApp +91 99992 77240; Virat's desk photo (Instagram, 27 Sep) | `src/data/site.ts`; `case-study/photos/shoot-desk.jpg`; homepage photo `src/assets/vm1.png` on the "I run it" scene |

Re-pull the proof numbers before each re-post; a 3-day window moves.

Instagram upload: `devshop-retail-os-reel-ig.mp4` is rendered from PNG frames (`REEL_PNG=1 REEL_CRF=10`), then the cover card is added at CRF 13: 1080×1920, 30 fps, about 3.8 Mbps, under 30 MB (Instagram recommends 3.5 Mbps or more).

Cover: `public/retail-os/social/reel-cover.jpg`, rendered from `cover.html` ("You bring the product. I run the whole online business.", inside the 3:4 grid crop). Frame 0 is plain terracotta so the reel loops, so always set a cover: upload this file in Instagram (Edit cover), or pass `thumbnailOffset: 2200` when posting through Buffer.
