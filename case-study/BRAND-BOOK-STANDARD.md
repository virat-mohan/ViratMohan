# Brand book lock: no drift, any channel, any brand

Every brand on DevShop Retail OS speaks and looks exactly as its own brand book says, everywhere: store pages, product copy, emails, WhatsApp, Instagram and Facebook posts, reels, ads, images, packaging inserts, invoices, chat-bot and support replies, and anything any agent writes. No session, agent or person may write customer-facing copy from memory or invent a look.

Classification: **core Retail OS**. Every live brand has it; every new brand gets it before its first customer-facing word goes out. Reference implementation: Ceremony OS `lib/brand-voice.ts` (built from the Ceremony Brand Book, Marketing 360, 31 Mar 2026).

## 1. One brand book module per brand (the single source)
Each brand repo has `lib/brand-voice.ts` (or the brand's existing equivalent, e.g. `lib/retail-os-brand.ts`), built only from the brand's own brand book and the founder's approved edits, with the source cited at the top:
- name and spelling, positioning line, tagline/motto, voice attributes
- do / don't, banned words and phrases, retired names and taglines
- colours (hex), fonts, logo usage, photo style
- house style per channel: hook, product lines, CTA, hashtags, sign-off, caption length
- current facts that change (prices, order-by dates, offers, sender address, WhatsApp number) with the stale versions listed so they are caught
- `brandVoicePrompt(kind)`: the module turned into the instruction every AI generation includes

If something isn't in the brand book, ask the founder and add it to the module. Never fill a gap with a guess.

## 2. One checker, run before every send and every approval
`checkVoice(text, kind)` returns findings with `block` or `warn`. It runs:
- on every approval screen (posts, emails, WhatsApp, ads): a `block` cannot be approved
- in every send path in code (email, WhatsApp, social publish, ad create): a `block` stops the send and says why
- on AI output before it is shown to anyone
- by hand in any Claude session before it sends through a connector (Gmail, Buffer, WhatsApp): load the module, check the copy, fix every block

Visuals: images and creatives use only the brand book's colours, fonts and logo; check them against the module before approval.

## 3. Audit, always
- A unit test per brand covers its banned phrases, stale facts and CTA rules.
- The brand's CEO agent checks the last 7 days of published copy every week, reports any drift found and fixes it at the source (the module, the template or the prompt), so it can't happen twice.

## 4. New brands
At onboarding, after the NDA and deposit: collect the brand book (or build one with the founder from their existing site and posts) and write the module **before** any store copy, post or email. A brand has no customer-facing output until its module and test exist.

## What stays separate
- DevShop and Virat's own surfaces follow the viratmohan.com look (`/brand/tokens.css`).
- The Retail OS admin uses the viratmohan.com look; brand colours only in the brand's logo there (RETAIL-OS-ADMIN-STANDARD.md).
- Customer-facing brand surfaces use the brand book only, never DevShop's look.
