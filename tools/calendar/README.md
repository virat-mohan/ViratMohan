# Content & performance calendar (the standard)

When Virat says "content and performance calendar", this is what he means: the document
built for Ceremony Kitchen (Diwali 2026), now a template any brand's data drops into.

- **Header:** DevShop Retail OS™ mark + brand name + period, and one line saying who approves it.
- **Pages 1–2, the posting calendar:** a Mon–Sun grid, one row per week (theme and post count
  on the left). Every post shows the image that will go out, its type (Reel / Photo / Carousel /
  Stories / Ad launch), the caption, a one-line **Why** grounded in that brand's own numbers, and
  a bottom bar: Organic, or the ad it also runs as. Boxes below: how often and why, the evidence,
  what leads, reels or tests.
- **Page 3, the performance marketing calendar:** one row per campaign with a thumbnail,
  audience, creative, a budget chip per week, total budget, expected return and why; a totals
  row; then three boxes: what this buys, the rules the system runs by, what the founder must approve.
- **Rules:** real numbers only, each with its source in the spec; targets are labelled as targets;
  nothing is posted or spent until the founder approves; viratmohan.com palette and fonts.

## Use

```bash
node tools/calendar/render.mjs tools/calendar/specs/travaholic-caps-2026-diwali.json --out ~/Desktop/Travaholic-Caps-Content-and-Performance-Calendar.pdf
```

Add `--html` to get the HTML path instead of a PDF (for a quick look in a browser).

## Spec

See `specs/travaholic-caps-2026-diwali.json`. Images may be URLs or `file://` paths. Post types:
`reel`, `photo`, `carousel` (add `count`), `stories`, `video`, `ad`. A day with `storiesOnly: true`
and no post shows "Stories only". Weekly budget chips take a string label or `{label, soft: true}`.
