# Reels

Vertical 1080×1920 videos in the viratmohan.com look, rendered frame by frame from an HTML page.

```
FFMPEG=/path/to/ffmpeg node tools/reel/render.mjs                                  # full MP4
node tools/reel/render.mjs tools/reel/devshop-retail-os.html out/x.mp4 --stills 3,12  # PNG checks
```

The page exposes `window.seek(t)` and `window.DURATION`, so every frame is exact. No ffmpeg on the box: `pip install imageio-ffmpeg` and point `FFMPEG` at its binary.

## devshop-retail-os.html → public/retail-os/social/devshop-retail-os-reel-{funk,piano}.mp4

Two versions, same picture, 44 s, about −14 LUFS:

- `devshop-retail-os-reel-funk.mp4`: 120 BPM disco-funk around a 16th-note slap bass. Fully synthesised, nothing to license.
- `devshop-retail-os-reel-piano.mp4`: bouncy solo piano on FluidR3 GM grand-piano samples (CC BY 3.0; credit "Piano samples: FluidR3 GM" in the post or first comment).

Both are in `soundtrack.py` with hits timed to the animation. To rebuild:

```
node tools/reel/render.mjs tools/reel/devshop-retail-os.html out/silent.mp4
python3 tools/reel/soundtrack.py funk out/funk.wav
# piano samples: MIDI 28–100 from github.com/gleitz/midi-js-soundfonts (FluidR3_GM/acoustic_grand_piano-mp3) into a folder
python3 tools/reel/soundtrack.py piano out/piano.wav path/to/piano-mp3s
ffmpeg -i out/silent.mp4 -i out/funk.wav -map 0:v -map 1:a -c:v copy -af loudnorm=I=-14:TP=-1.5 -c:a aac -b:a 192k -shortest out/reel-funk.mp4
```

Every claim and its source:

| Scene | Claim | Source |
|---|---|---|
| Hook | "I run the whole online business: store, ads, content, WhatsApp, shipping." | `src/pages/devshop.astro` Retail OS feature |
| 3–7 days | Live 3–7 days after signing; stages catalog → go-live; the caveat | FAQ "How long until the store is live?" and "How do I follow progress?" (`public/retail-os/faq/faq-data.js`) |
| Features | Shopify import, one photo in, WhatsApp checkout, cart recovery, ads that draft themselves, Pay with a Post™ | `/retail-os` "What you actually get" |
| Proof | Ceremony Kitchen Meta ROAS 1.3× → 2.7× (2×); cost per purchase ₹1,917 → ₹1,066 | ceremony-os Supabase `meta_ad_insights`, pulled 28 Sep 2026. Takeover 26 Sep (`brands.retail_os_since`). After 26–28 Sep: ₹3,198 spend, 3 purchases, ₹8,498. Before 27 Aug–25 Sep: ₹53,686, 28 purchases, ₹68,571. 28 Sep is a part day. |
| Monday | Settled every Monday by 1 PM IST, itemised, visible every day | `/retail-os` "How you get paid" |
| Brands | Status per brand; India Contemporary live; 5+ launching this week | FAQ "Which brands use it today?" (the one source); India Contemporary live and "5+ this week" from Virat, 28 Sep 2026; Travaholic Stays and The Feeling Co from the DevShop proof list |
| End | "Let's talk." WhatsApp +91 99992 77240 | `src/data/site.ts` |

Re-pull the proof numbers before each re-post; a 3-day window moves.
