# Fresh For Paws brand book (v0.2, 2 Oct 2026)

Status: **draft for Srishti to confirm.** Built only from sources listed below. Anything marked GAP is asked of Srishti, never guessed (case-study/BRAND-BOOK-STANDARD.md). No customer-facing word goes out until she signs this off.

Sources: screenshots of freshforpaws.com shared by Virat (2 Oct 2026: home, About, Why Us, How it works, product range); Retail OS application (24 Sep 2026); freshforpaws.com/about-us (via search results); Petz Care India article; LinkedIn company page; design research of freshforpaws.com (24 Sep 2026).

## Name and family
- **Fresh For Paws** (three words, each capitalised; never "FreshForPaws", "Fresh 4 Paws" or "FFP" in customer copy)
- **Fresh For Purrs**: cats. **Mini Paws**: puppies. Sub-brands, written exactly so.
- Handle: @freshforpaws. Site: freshforpaws.com.

## Story (facts that can be used)
- Started **13 June 2018** by **Srishti Bhatia**, a commerce graduate from Delhi University, inspired by her dog **Vanilla**.
- Every recipe is Srishti's own, after almost two years of research on each ingredient and its nutritional value.
- Meals are portioned for the pet's calorie intake, "based on our veterinarian nutritionist's recommendations" (site wording; use only as written).
- No scooping, no defrosting, no guesswork. Convenient, light and easy to carry.
- **No synthetic vitamins or minerals added.**
- Srishti is a **certified canine & feline nutritionist** (wording set by Virat, 3 Oct 2026, because the range covers cats too).
- Food is **100% natural, ready to eat, no fillers**: real proteins, vegetables and fruit.
- **Never say grain-free** (Virat, 3 Oct 2026): rice recipes launch at the end of October 2026 and the puppy food (Mini Paws) already contains rice.
- Won **Pet Food of the Year**, Indian Pet Industry Awards. Srishti: 2nd Runner Up, Pet Entrepreneur of the Year (Female), April 2021.
- Sold online and in pet stores; also on Amazon and Flipkart.

## Tagline and lines from the site
- **Choose Fresh, Choose Fresh For Paws!** (top bar and sign-off)
- Logo line: **With love for our furry friends**
- Hero: "100% Natural and Ready-To-Eat pet food, proportioned for your pet's calorie intake."
- How it works: "We cook with Love", "Meals are perfectly portioned".

## Range (names readable on the site; confirm the full list and prices from the product sheet)
Dogs: Liv-Love (Liver & Carrot), Liv-Love (Liver & Pumpkin), Peanut Butter treat, plus the pack range shown on the site. Cats (Fresh For Purrs): Liverlicious (Liver & Carrot), Liverlicious (Liver & Pumpkin), Purrfect Chicken Delight, plus the rest of the range. Packaging is colour-coded per recipe on a white base with the teal logo.

## Voice
Warm, direct, proud of the food. A knowledgeable friend who cooks for their own dog. Confident about ingredients without sounding clinical. Founder-led: Srishti and Vanilla are the proof.
- Do: real ingredients by name; "ready to eat"; short sentences; the pet as family.
- Don't: medical or cure claims; fear about other foods; claims not on this page.

## Claims never allowed
grain-free (rice recipes; see Story).

## Claims not allowed until Srishti confirms (GAP)
vet-formulated · human-grade · preservative-free · AAFCO · shelf life numbers · "fresh daily" · delivery times · prices · any health outcome.

## Colours (measured from site screenshots, 2 Oct 2026; confirm exact hex from the live CSS)
| Token | Hex | Where on the site |
|---|---|---|
| Teal (primary) | `#06A6A0` | top bar, logo, cart badge |
| Teal 2 | `#18AFAA` | section titles ("WHY US?", "OUR PRODUCT RANGE"), icons |
| Mint wash | `#E0F2F0` | home hero background |
| Paper | `#FBF8F2` | About page background |
| White | `#FFFFFF` | cards, product sections |
| Ink | `#333333` | headings |
| Body | `#4C4C4C` | paragraphs |
No other accent colour is used on the site; CTAs are teal. Packaging colours belong to each recipe pack only.

## Fonts, logo, photo style
- Section titles: bold geometric sans in capitals, teal. Body: light geometric sans. Nav: thin display caps. Mockups use the closest free fonts (Josefin Sans, Questrial). **GAP: exact font names from the site CSS or brand folder.**
- Logo: teal heart with dog silhouette over "FRESH FOR PAWS" in white on teal, line "With love for our furry friends", registered mark. **GAP: master files from the brand folder.**
- Photos: real dogs (Vanilla, Shih Tzus) in soft natural light, pink and pastel props, Srishti with Vanilla outdoors. Illustrated dogs and cats around the packs.

## House style by channel (GAP: Srishti to approve)
- Store CTA: "Build my plan" / "Add to my plan". Store sign-off: none.
- WhatsApp: first name, one line, one link. Sign-off: "Team Fresh For Paws" (GAP).
- Instagram: hashtags #FreshForPaws #ChooseFreshForPaws (GAP: confirm the second).
- Current facts: WhatsApp 97179 70559 (keep or replace: GAP).

## Tell us about your dog (the plan builder)
Added 9 Oct 2026 at Virat's request. Mockup A, `/preview/freshforpaws/a/plan.html`. It is the brand's signature journey: the owner tells us about the dog, we choose the meals and say why, and we price a one-time bundle or a subscription.
- **Heading and voice:** "Tell us about your dog". Warm, plain, no pressure; always explain the reason for a recommendation. Never "grain-free" (rice recipes arrive end Oct 2026).
- **Asks:** name, breed, age, weight, sex, neutered or spayed, body shape (ribs and waist), diet preference (all, vegetarian, vegan), foods never to feed.
- **How the plan is worked out:** resting energy 70 x kg^0.75 (NRC 2006, WSAVA), times a life-stage factor (neutered adult 1.6, intact adult 1.8, puppy under 4 months 3.0, puppy from 4 months 2.0, from Hand et al., Small Animal Clinical Nutrition). Breed size sets the puppy and senior ages. Overweight starts at 1.2, thin at 1.8, senior at 1.4. These are vet starting points, not veterinary advice; the page says so.
- **Menu logic:** three recipes from the live WooCommerce menu in rotation, each with its reason; anything ticked as "never feed" is removed; vegetarian and vegan choices filter the menu. Large and giant breed puppies show a "confirm with Fresh For Paws" flag until the puppy recipe is confirmed for calcium.
- **Prices:** straight from WooCommerce (100 g and 300 g packs). Proposed discounts for Virat to decide: one-time bundle 5%, every week 8%, twice a month 10%, every month 12%. Guardrail: the product share (25% of the sale) must still cover the real cost of the food.
- **Images and data:** every menu item, price and picture comes from the WooCommerce Store API through `scripts/ffp-catalogue.mjs` (writes `public/preview/freshforpaws/catalogue.json`). Re-run it to refresh; the live build reads the same API server-side.
- **Open (ask Srishti):** calories per 100 g and the guaranteed analysis of each recipe (the builder uses a marked "sample" placeholder); complete and balanced for which life stages; shelf life and storage for a week, fortnight and month; cost per pack; delivery slots; cats (Fresh For Purrs) once the same data exists.
