# viratmohan.com

Personal site for Virat Mohan. Astro + Tailwind, deployed on Vercel. Every
page except `/devshop/api/*` and `/devshop/admin/*` still prerenders to
static HTML (no client-side JS beyond a reveal-on-scroll observer, a stat
count-up, and the theme toggle); those two route groups are the one part of
the site that runs as real server functions — see `/devshop` below.

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output → dist/
npm run preview  # serve the build locally
```

## Deploy — Vercel

Uses `@astrojs/vercel` (build output is Vercel-specific, not a plain static
`dist/`). Point the Vercel project at this repo — it auto-detects Astro, no
custom build/output settings needed — and set the domain to `viratmohan.com`.

Required environment variables (Vercel project → Settings → Environment
Variables), used only by `/devshop/api/*` and `/devshop/admin/*`:

| Variable | Where to get it |
| --- | --- |
| `SUPABASE_URL` | Supabase project → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API → `service_role` secret (never expose client-side) |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `RESEND_API_KEY` | resend.com |
| `RESEND_FROM_EMAIL` | e.g. `Fast Tech Dev Shop <devshop@mail.clarityhq.ai>` — domain must be verified in Resend |
| `ADMIN_NOTIFY_EMAIL` | `virat@clarityhq.ai` |

Before this is live, also run `migrations/0001_init.sql` once against the
Supabase project (SQL editor) and put some form of access control in front
of `/devshop/admin/*` (Vercel Password Protection, or a similar gate) — it
has no app-level auth of its own.

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
