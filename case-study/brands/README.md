# Brand books

One file per DevShop brand. Agents read the brand's file before writing copy or designing anything for it. Every file has the same eight sections: status, sources, name and positioning, voice, visual, channel house style, current facts, gaps.

## Index
| Brand | Status | File | Source of truth |
|---|---|---|---|
| DevShop / Virat Mohan | Own brand | [devshop.md](devshop.md) | CLAUDE.md, /mission, public/brand/tokens.css |
| Moonglasses | Partner, co-owned 50/50, building | [moonglasses.md](moonglasses.md) | moon-glasses-store `lib/brand-voice.ts` |
| Travaholic Caps | Live, partner (profit share) | [travaholic-caps.md](travaholic-caps.md) | Travaholic Caps `lib/brand-voice.ts` |
| Ceremony Kitchen | Live, client (retainer) | [ceremony-kitchen.md](ceremony-kitchen.md) | ceremony-os `lib/brand-voice.ts` (Marketing 360 book, 31 Mar 2026) |
| Fresh For Paws | Client, onboarding | [freshforpaws.md](freshforpaws.md) | This file (no brand book yet) |
| Korbi | Client, building | [korbi.md](korbi.md) | This file + case-study/clients/korbi.md + Korbi collaterals |
| Iredus Aloo Chips | Lead | [aloochips.md](aloochips.md) | This file (website + Supabase) |
| Radico Khaitan | Lead, proposal sent | [radico-khaitan.md](radico-khaitan.md) | This file (website + Supabase) |
| The Party Collective | Lead, NDA sent | [the-party-collective.md](the-party-collective.md) | This file (Supabase only) |
| Blak Sand (spelling unconfirmed) | Lead, NDA sent | [blak-sand.md](blak-sand.md) | This file (Supabase only) |
| Layover Studio LLP | Lead, NCNDA drafted | [layover-studio.md](layover-studio.md) | This file (memory only) |

Not a DevShop brand: `~/Desktop/Ariya Brand Book 2404.pdf` is Ariya HR (an HR advisory brand, Marketing 360, 24 Apr 2026). `ITK Brand Book*.pdf` is In The Know Kitchen, Ceremony's retired name.

## The rule
- For live brands with a brand repo, that repo's `lib/brand-voice.ts` is the enforced source: its `checkVoice()` runs before every approval and send. If a file here disagrees with the module, the module wins and this file is fixed.
- These files are the shared reference for everyone else: master control, shared agents, leads and clients without a repo yet.
- Keep them in sync. When a brand book, a founder's approved edit or a module changes, update the module first (live brands), then this file, the same day. When a lead's brand book arrives, fill its file before any customer-facing word goes out, and build the module when the brand gets a repo.
- Never invent. A field no source covers reads "Not known: ask <founder>" and goes in Gaps. Website values are marked "from website, <date>, confirm with founder".
