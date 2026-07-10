# viratmohan.com

Personal site for Virat Mohan. Astro + Tailwind, fully static, deployed to
Cloudflare Pages. No client-side JS beyond a reveal-on-scroll observer, a
stat count-up, and the theme toggle.

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output → dist/
npm run preview  # serve the build locally
```

## Deploy — Cloudflare Pages

Static site, no adapter required.

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Node version:** 18+ (built on 24)

Point the Pages project at this repo and set the domain to `viratmohan.com`.

## Before launch — fill these in

A few values are placeholders. Search the repo for `TODO`:

1. **Portrait** — drop the headshot at `public/virat.png` (warm outdoor bokeh,
   3:4-ish). Until then the hero shows a deliberate `VM` monogram block. The
   duotone / grain / gold-hairline treatment is applied automatically in
   `src/components/Portrait.astro`; verify the skin tone visually once the real
   image is in.
2. **WhatsApp number** — `src/data/site.ts` → `whatsapp` (digits only, incl.
   country code, e.g. `919812345678`).
3. **LinkedIn URL** — `src/data/site.ts` → `linkedin` (confirm the exact handle).

## Regenerating the OG image

`public/og.png` (1200×630) is generated from an inline SVG:

```bash
node scripts/make-og.mjs
```

## Structure

- `src/data/site.ts` — single source of truth for all facts (stats, career
  arc, network model, JSON-LD Person node). Edit copy here, not in components.
- `src/layouts/Base.astro` — head/SEO/JSON-LD, theme boot, reveal + count-up.
- `src/components/home/*` — the six homepage movements.
- `src/content/writing/*.md` — essays (content collection).
- `public/{robots.txt,llms.txt,_headers}` — crawler + edge config.

## Content / AEO notes

- Every page emits a JSON-LD `Person` node with a stable `@id`
  (`https://viratmohan.com/#person`); essays add an `Article` node whose
  `author` points at that `@id`.
- `/about` is the fact surface for LLMs — facts live in `<p>` prose.
- `robots.txt` explicitly allows GPTBot, ClaudeBot, PerplexityBot, CCBot and
  Google-Extended. `/llms.txt` mirrors the key facts.
