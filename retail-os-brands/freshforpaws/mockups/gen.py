import os, html
OUT='/home/user/ViratMohan/public/preview/freshforpaws'
# Brand tokens. PROVISIONAL: read from the 24 Sep design research of freshforpaws.com (deep natural green + warm cream).
# Replace with the exact hex codes from freshforpaws.com before Srishti sees this. One file: brand.css.
BRAND_CSS="""@font-face{font-family:'Josefin Sans';font-style:normal;font-weight:600;font-display:swap;src:url(fonts/josefin-sans-600.woff2) format('woff2')}
@font-face{font-family:'Josefin Sans';font-style:normal;font-weight:700;font-display:swap;src:url(fonts/josefin-sans-700.woff2) format('woff2')}
@font-face{font-family:'Questrial';font-style:normal;font-weight:400;font-display:swap;src:url(fonts/questrial-400.woff2) format('woff2')}
:root{
  /* Fresh For Paws brand tokens, measured from freshforpaws.com screenshots (2 Oct 2026).
     Confirm exact hex against the live CSS when the site is reachable. */
  --ffp-teal:#06A6A0;       /* primary: top bar, logo, CTAs */
  --ffp-teal-2:#18AFAA;     /* headings, icons */
  --ffp-mint:#E0F2F0;       /* hero and section wash */
  --ffp-paper:#FBF8F2;      /* warm page background */
  --ffp-white:#FFFFFF;
  --ffp-ink:#333333;        /* headings */
  --ffp-body:#4C4C4C;       /* body text */
  --ffp-line:rgba(6,166,160,.18);
  --ffp-green:var(--ffp-teal); --ffp-cream:var(--ffp-mint); --ffp-accent:var(--ffp-teal);
  --ffp-font-head:'Josefin Sans',system-ui,sans-serif;   /* site: bold geometric caps; closest free match, confirm */
  --ffp-font-body:'Questrial',system-ui,sans-serif;      /* site: light geometric sans; closest free match, confirm */
}"""
NAV=[('index.html','Home'),('shop.html','Shop'),('plan.html','Build a plan'),('recipe.html','Recipes'),('about.html','Our story'),('faq.html','FAQ')]
CATS=[('Dog meals','For adult dogs'),('Fresh For Purrs','For cats'),('Mini Paws','For puppies'),('Treats & toppers','For every bowl'),('Combos','Try a few')]
RECIPES=[('Liv-Love','Liver & Carrot · dogs'),('Liv-Love','Liver & Pumpkin · dogs'),('Purrfect Chicken Delight','Fresh For Purrs · cats'),('Liverlicious','Liver & Carrot · Fresh For Purrs')]
TRUST=['100% natural','Ready to eat','No fillers','No synthetic vitamins or minerals']
FAQ=[('Is it really ready to eat?','Yes. No scooping, no defrosting, no guesswork: open the pack and serve. (Storage and shelf life per recipe: to confirm.)'),
     ('How much should my dog eat?','Build a plan: answer three questions and you get a daily portion for your dog.'),
     ('Where do you deliver?','Delhi NCR, Gurugram and Noida today. (Zones and slots: Srishti to confirm.)'),
     ('Who makes the food?','Srishti Bhatia, a certified canine &amp; feline nutritionist, who created every recipe herself after almost two years of research. She started Fresh For Paws on 13 June 2018, inspired by her dog Vanilla.'),
     ('Can I switch from kibble?','Yes. Mix it in over 7 to 10 days. (Transition guide: Srishti to confirm.)')]
def page(d, slug, title, body):
    nav=''.join(f'<a href="{h}"{" aria-current=page" if h==slug else ""}>{n}</a>' for h,n in NAV)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>{title} · Fresh For Paws · Mockup {d['key'].upper()}</title>
<link rel="preload" href="../fonts/questrial-400.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="../brand.css"><link rel="stylesheet" href="style.css"></head>
<body><div class="mock">Mockup {d['key'].upper()} · {d['name']} · sample content, not live</div>
<header class="nav"><a class="logo" href="index.html">Fresh&nbsp;For&nbsp;Paws</a><nav>{nav}</nav><a class="btn small" href="plan.html">{d['cta']}</a></header>
<main>{body}</main>
<footer class="foot"><div><b>Fresh For Paws</b><br>Choose Fresh, Choose Fresh For Paws! With love for our furry friends, since 2018.</div><div class="links">{nav}</div><div class="small">Mockup by DevShop Retail OS for review. Photos, prices and recipes are placeholders until Srishti confirms.</div></footer>
<a class="sticky" href="plan.html">{d['cta']}</a><script>(function(){{var s=document.querySelector(".sticky"),h=document.querySelector("main>section");if(!s||!h||!("IntersectionObserver" in window)){{s&&s.classList.add("show");return}}new IntersectionObserver(function(e){{s.classList.toggle("show",!e[0].isIntersecting)}}).observe(h)}})()</script></body></html>"""
IMG={'Photo: Srishti and Vanilla':'srishti-vanilla','Photo: meal spooned into a bowl, dog mid-bite':'hero-dog','Video: customer reel of a dog eating (from @freshforpaws)':'shihtzu','Photo: one cooked meal in a ceramic bowl, natural light':'hero-dog'}
def ph(label, cls='ph'):
    if label in IMG: return f'<img class="{cls} real" src="../img/{IMG[label]}.webp" alt="{html.escape(label.split(chr(58)+chr(32),1)[-1])}" loading="lazy">'
    return _ph(label, cls)
def _ph(label, cls='ph'): return f'<div class="{cls}" role="img" aria-label="{html.escape(label)}"><span>{html.escape(label)}</span></div>'
def cards(items, cls='card'):
    return ''.join(f'<a class="{cls}" href="recipe.html">{ph("Photo: "+a)}<b>{a}</b><span>{b}</span><span class="price">₹ TBD</span></a>' for a,b in items)
def faqs(): return ''.join(f'<details><summary>{q}</summary><p>{a}</p></details>' for q,a in FAQ)
def quiz(d):
    return f"""<section class="quiz wrap"><p class="kick">Build a plan · 3 questions</p><h1>{d['quiz_h']}</h1>
<form onsubmit="event.preventDefault();this.querySelector('.result').hidden=false">
<label>Your pet<select><option>Dog</option><option>Cat</option><option>Puppy</option></select></label>
<label>Weight (kg)<input type="number" min="1" max="80" value="12"></label>
<label>Activity<select><option>Relaxed</option><option>Active</option><option>Very active</option></select></label>
<button class="btn">See my plan</button>
<div class="result" hidden><b>Your sample plan</b><p>Sample: 2 packs a day of Liv-Love. Portions are worked out by Srishti's feeding guide (to confirm). Price per day: ₹ TBD.</p><a class="btn" href="shop.html">Start with this plan</a></div></form></section>"""
def faq_page(d): return f'<section class="wrap narrow"><p class="kick">Questions</p><h1>Everything pet parents ask</h1>{faqs()}</section>'
def about(d): return f"""<section class="wrap narrow story"><p class="kick">Our story</p><h1>It started with Vanilla</h1>{ph('Photo: Srishti and Vanilla','ph tall')}
<p>Srishti Bhatia, a commerce graduate from Delhi University, started Fresh For Paws on 13 June 2018. Her dog Vanilla was the inspiration. Every recipe is her own, built after almost two years of research on each ingredient and its nutritional value. She is a certified canine &amp; feline nutritionist.</p>
<p>The food is 100% natural and ready to eat: high-quality proteins, vegetables and fruit, with no fillers and no synthetic vitamins or minerals.</p>
<p>Fresh For Paws won Pet Food of the Year at the Indian Pet Industry Awards.</p></section>"""
def recipe(d): return f"""<section class="pdp wrap">{'<img class="ph sq real" src="../img/range-dogs.webp" alt="Fresh For Paws packs">'}
<div><p class="kick">Dog meals</p><h1>Liv-Love</h1><p class="lead">Liver &amp; Carrot. A complete, ready-to-eat meal for dogs. (Ingredients and nutrition: from the product sheet.)</p>
<p class="price big">₹ TBD <small>per pack · pack size TBD</small></p><a class="btn" href="plan.html">Add to my plan</a>
<ul class="chips">{''.join(f'<li>{t}</li>' for t in TRUST)}</ul>
<h3>What's inside</h3><p>Ingredient list and nutrition table: from Srishti's product sheet.</p>{ph('Photo: ingredient flat-lay','ph wide')}</div></section>"""
def shop(d): return f"""<section class="wrap"><p class="kick">Shop</p><h1>Fresh meals for every bowl</h1>
<div class="tabs">{''.join(f'<a href="shop.html">{a}</a>' for a,_ in CATS)}</div><div class="grid">{cards(RECIPES*2)}</div></section>"""

D={}
# ---------------- A: Fresh, Trusted, Elevated (The Farmer's Dog / Ollie / Butternut Box UX) ----------------
D['a']=dict(key='a',name='Fresh, Trusted, Elevated',cta='Build my plan',quiz_h="Let's find your dog's daily plan",
 fonts='https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@600;700&family=Questrial&display=swap',
 css="""body{font-family:var(--ffp-font-body);color:var(--ffp-body)}h1,h2,h3,.logo{font-family:var(--ffp-font-head);font-weight:700;color:var(--ffp-ink)}
.hero{display:grid;grid-template-columns:1.1fr 1fr;gap:40px;align-items:center;padding:56px 20px}
.hero h1{font-size:clamp(40px,6vw,66px);line-height:1.06;margin:0 0 20px}.hero p{font-size:19px}
.trust{background:var(--ffp-green);color:var(--ffp-cream);display:flex;flex-wrap:wrap;justify-content:center;gap:10px 34px;padding:14px 16px;font-weight:600;font-size:14px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.steps div{background:var(--ffp-cream);border-radius:18px;padding:22px}
.steps b{font-family:var(--ffp-font-head);font-size:36px;color:var(--ffp-accent)}
.btn{border-radius:999px}@media(max-width:760px){.hero{grid-template-columns:1fr;padding:28px 20px}.steps{grid-template-columns:1fr}}""",
 home=lambda d: f"""<section class="hero wrap"><div><p class="kick">Fresh food for dogs and cats</p><h1>Real food.<br>Ready to eat.</h1>
<p>100% natural, ready-to-eat meals, portioned for your pet's calorie intake. Every recipe created by Srishti, a certified canine &amp; feline nutritionist.</p>
<a class="btn" href="plan.html">Build my dog's plan</a> <a class="link" href="shop.html">or shop recipes</a></div>{ph('Photo: meal spooned into a bowl, dog mid-bite','ph tall')}</section>
<div class="trust">{''.join(f'<span>✓ {t}</span>' for t in TRUST)}</div>
<section class="wrap"><h2>How it works</h2><div class="steps"><div><b>1</b><h3>We cook with love</h3><p>Nutritionally balanced, pre-portioned meals made from real food.</p></div><div><b>2</b><h3>Portioned for your pet</h3><p>Three questions, and you get the right amount for your pet's calorie needs.</p></div><div><b>3</b><h3>Open and serve</h3><p>No scooping, no defrosting, no guesswork.</p></div></div></section>
<section class="wrap"><h2>Recipes they finish</h2><div class="grid">{cards(RECIPES)}</div><img class="range" src="../img/range-dogs.webp" alt="The Fresh For Paws range for dogs" loading="lazy"><img class="range" src="../img/range-cats.webp" alt="The Fresh For Purrs range for cats" loading="lazy"></section>
<section class="wrap split">{ph('Photo: Srishti and Vanilla','ph tall')}<div><p class="kick">Since 2018</p><h2>Started for Vanilla. Made for yours.</h2><p>Srishti Bhatia started Fresh For Paws on 13 June 2018, inspired by her dog Vanilla. She spent almost two years researching every ingredient before the first meal. She is a certified canine &amp; feline nutritionist.</p><a class="link" href="about.html">Read our story</a></div></section>
<section class="wrap"><h2>Pet parents say</h2><div class="grid quotes">{''.join(f'<blockquote>“Customer review from the website or Google (to add).”<cite>Name, city</cite></blockquote>' for _ in range(3))}</div></section>
<section class="wrap narrow"><h2>Questions</h2>{faqs()}</section>""")
# ---------------- B: Quiet Kitchen Editorial (Maev / Aesop UX) ----------------
D['b']=dict(key='b',name='Quiet Kitchen Editorial',cta='Find their meal',quiz_h='Three questions, one considered plan',
 fonts='https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@600;700&family=Questrial&display=swap',
 css="""body{font-family:var(--ffp-font-body);color:var(--ffp-body)}h1,h2,h3,.logo{font-family:var(--ffp-font-head);font-weight:700;color:var(--ffp-ink)}
.hero{min-height:78vh;display:grid;place-items:end start;position:relative;padding:0}.hero .ph{position:absolute;inset:0;border-radius:0;min-height:0}
.hero .copy{position:relative;background:var(--ffp-paper);border-radius:6px;margin:0 0 48px 48px;padding:40px 40px 36px;max-width:560px;box-shadow:0 10px 40px rgba(51,51,51,.08)}
@media(max-width:760px){.hero{min-height:0;display:block}.hero .ph{position:relative;inset:auto;height:62vh;width:100%}.hero .copy{margin:-48px 16px 0;padding:28px 22px;max-width:none}}.hero h1{font-size:clamp(40px,6.5vw,76px);line-height:1.06;margin:0 0 20px}
.essay{max-width:640px;margin:0 auto;font-size:19px;line-height:1.75}.essay p{max-width:none}.essay p:first-of-type::first-letter{font-family:var(--ffp-font-head);font-size:64px;float:left;line-height:.8;margin:6px 10px 0 0;color:var(--ffp-green)}
.band{padding:96px 0}.stat{font-family:var(--ffp-font-head);line-height:1.25;font-size:clamp(26px,4vw,40px);text-align:center;max-width:820px;margin:0 auto;color:var(--ffp-green)}
.btn{border-radius:2px;letter-spacing:.08em;text-transform:uppercase;font-size:15px}.grid{grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:40px}
.nav{border-bottom:0}""",
 home=lambda d: f"""<section class="hero">{ph('Photo: one cooked meal in a ceramic bowl, natural light','ph')}<div class="copy"><h1>Cooked like dinner.<br>Served in a bowl.</h1><a class="btn" href="plan.html">Find their meal</a></div></section>
<section class="band wrap"><div class="essay"><p>Every Fresh For Paws meal begins in a kitchen, not a factory line: real proteins, vegetables and fruit, cooked gently and packed ready to serve.</p><p>Srishti Bhatia started it in 2018 for her dog, Vanilla. She is a certified canine &amp; feline nutritionist, and every recipe still passes through her hands.</p></div></section>
<section class="band" style="background:var(--ffp-cream)"><p class="stat wrap">No fillers. No synthetics. Nothing your dog can't pronounce.</p></section>
<section class="band wrap"><h2>The recipes</h2><div class="grid">{cards(RECIPES)}</div></section>
<section class="band wrap split">{ph('Photo: ingredients on a wooden board','ph tall')}<div><p class="kick">The kitchen</p><h2>Ingredients you would cook with</h2><p>Each recipe page tells one ingredient story at a time: the protein, how it is cooked, and the nutritionist's note.</p><a class="link" href="recipe.html">Read a recipe</a></div></section>
<section class="band wrap narrow"><h2>Questions</h2>{faqs()}</section>""")
# ---------------- C: Loud & Pack-Led (BARK UX), kept in FFP's own colours ----------------
D['c']=dict(key='c',name='Pack-Led, Community First',cta="Build my dog's box",quiz_h="Build your dog's box",
 fonts='https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@600;700&family=Questrial&display=swap',
 css="""body{font-family:var(--ffp-font-body);color:var(--ffp-body)}h1,h2,h3,.logo{font-family:var(--ffp-font-head);font-weight:700;color:var(--ffp-ink)}
.hero{display:grid;grid-template-columns:1fr 340px;gap:32px;align-items:center;padding:40px 0}.hero h1{font-size:clamp(44px,7.5vw,88px);line-height:1.02;margin:0 0 20px;color:var(--ffp-green)}
.reel{aspect-ratio:9/16;border-radius:26px;min-height:0}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.tiles a{text-decoration:none;border-radius:22px;padding:30px 22px;font-family:var(--ffp-font-head);font-size:28px;line-height:1.1;font-weight:800;color:var(--ffp-cream);background:var(--ffp-green);min-height:150px;display:flex;align-items:flex-end}
.tiles a:nth-child(2){background:var(--ffp-accent)}.tiles a:nth-child(3){background:var(--ffp-ink)}
.wall{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.wall .ph{aspect-ratio:1;min-height:0;border-radius:14px}
.btn{border-radius:14px;font-weight:700}@media(max-width:760px){.hero{grid-template-columns:1fr}.tiles{grid-template-columns:1fr}.tiles a{min-height:96px;font-size:26px;padding:22px}.wall{grid-template-columns:repeat(2,1fr)}}""",
 home=lambda d: f"""<section class="hero wrap"><div><p class="kick">#ChooseFreshForPaws</p><h1>Bowls licked clean.</h1><p>Real food, ready to eat, made in Delhi NCR. Join the dogs and cats who already switched.</p><a class="btn" href="plan.html">Build my dog's box</a></div>{ph('Video: customer reel of a dog eating (from @freshforpaws)','ph reel')}</section>
<section class="wrap"><div class="tiles"><a href="shop.html">For dogs</a><a href="shop.html">For cats</a><a href="shop.html">For puppies</a></div></section>
<section class="wrap"><h2>Fan favourites</h2><div class="grid">{cards(RECIPES)}</div></section>
<section class="wrap"><h2>#ChooseFreshForPaws</h2><div class="wall">{''.join(ph('Customer photo '+str(i+1)) for i in range(8))}</div></section>
<section class="wrap split">{ph('Photo: Srishti and Vanilla','ph tall')}<div><h2>Started for Vanilla</h2><p>Srishti Bhatia, certified canine &amp; feline nutritionist, has been cooking for dogs since 2018.</p><a class="link" href="about.html">Our story</a></div></section>
<section class="wrap narrow"><h2>Questions</h2>{faqs()}</section>""")

BASE="""*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--ffp-paper);color:var(--ffp-ink);font-size:16px;line-height:1.6;overflow-x:hidden}
a{color:inherit}img{max-width:100%}.wrap{max-width:1160px;margin:0 auto;padding:0 20px}.narrow{max-width:760px}section{margin:0 auto;padding:36px 0}
.mock{background:var(--ffp-ink);color:var(--ffp-cream);font-size:12px;text-align:center;padding:6px 12px}
.nav{display:flex;align-items:center;gap:20px;padding:16px 20px;max-width:1160px;margin:0 auto;border-bottom:1px solid var(--ffp-line)}
.nav nav{display:flex;gap:18px;flex:1;flex-wrap:wrap}.nav nav a{text-decoration:none;font-size:15px;opacity:.8}.nav nav a[aria-current]{opacity:1;font-weight:600}
.logo{font-size:20px;text-decoration:none;color:var(--ffp-teal)!important;text-transform:uppercase;letter-spacing:.02em}
.btn{display:inline-block;background:var(--ffp-accent);color:#fff;border:0;padding:14px 26px;font-weight:600;text-decoration:none;cursor:pointer;font-size:16px;font-family:inherit}
.btn.small{padding:10px 18px;font-size:14px}.link{font-weight:600;color:var(--ffp-green)}
.kick{text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:600;color:var(--ffp-green);margin:0 0 10px}
h1{font-size:clamp(34px,5vw,54px);line-height:1.08;margin:0 0 18px}h2{font-size:clamp(28px,3.6vw,40px);line-height:1.1;margin:0 0 24px}
.ph{background:repeating-linear-gradient(135deg,var(--ffp-cream) 0 14px,rgba(47,82,51,.06) 14px 28px);border-radius:18px;min-height:220px;display:grid;place-items:center;text-align:center;padding:16px;color:var(--ffp-green);font-size:13px;font-weight:600}
.ph.tall{min-height:440px}img.real{width:100%;object-fit:cover;padding:0;display:block;background:none}.ph.sq{aspect-ratio:1;min-height:0}.ph.wide{min-height:200px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:24px}
.card{text-decoration:none;display:flex;flex-direction:column;gap:4px}.card .ph{aspect-ratio:4/5;min-height:0;margin-bottom:8px}.card span{font-size:14px;opacity:.75}.price{font-weight:600;opacity:1!important}
.range{width:100%;margin-top:28px;border-radius:18px;background:#fff}.split{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
details{border-bottom:1px solid var(--ffp-line);padding:16px 0}summary{cursor:pointer;font-weight:600;font-size:17px}
blockquote{margin:0;background:var(--ffp-cream);border-radius:18px;padding:24px;font-size:17px}cite{display:block;margin-top:10px;font-size:14px;font-style:normal;opacity:.7}
.tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px}.tabs a{border:1px solid var(--ffp-line);border-radius:999px;padding:8px 16px;text-decoration:none;font-size:14px}
.pdp{display:grid;grid-template-columns:1fr 1fr;gap:48px;padding-top:40px}.lead{font-size:19px}.price.big{font-size:26px}.price small{font-size:14px;font-weight:400;opacity:.7}
.chips{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}.chips li{background:var(--ffp-cream);border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600}
.quiz form{display:grid;gap:16px;max-width:520px}.quiz label{display:grid;gap:6px;font-weight:600}.quiz select,.quiz input{font:inherit;padding:12px;border:1px solid var(--ffp-line);border-radius:12px;background:#fff}
.result{background:var(--ffp-cream);border-radius:18px;padding:20px}.quiz{padding-top:40px}
.story p{font-size:18px}.foot{border-top:1px solid var(--ffp-line);max-width:1160px;margin:0 auto;padding:40px 20px 100px;display:grid;grid-template-columns:1.2fr 2fr;gap:20px;font-size:14px}
.foot .links{display:flex;gap:14px;flex-wrap:wrap}.foot .small{grid-column:1/-1;opacity:.6}
.sticky{display:none}
@media(max-width:760px){.nav nav{display:none}.split,.pdp{grid-template-columns:1fr}.foot{grid-template-columns:1fr}
.sticky{display:block;position:fixed;left:12px;right:12px;bottom:12px;background:var(--ffp-accent);color:#fff;text-align:center;padding:15px;border-radius:999px;font-weight:700;text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,.18);z-index:9}}
"""
TYPO=r'''
/* ---- Typography and rhythm (shared, overrides direction defaults) ---- */
body{font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
p{margin:0 0 16px;max-width:62ch}
h1{line-height:1.08;letter-spacing:-.01em;margin:0 0 20px}
h2{line-height:1.15;letter-spacing:-.005em;margin:0 0 28px}
h3{line-height:1.3;margin:0 0 8px;font-size:20px}
main>section,main>section.wrap{padding-top:80px;padding-bottom:80px}
main>section.hero{padding-top:56px;padding-bottom:64px}
.trust+section{padding-top:72px}
.grid.quotes{grid-template-columns:repeat(3,1fr)}
.sticky{opacity:0;pointer-events:none;transform:translateY(12px);transition:opacity .25s ease,transform .25s ease}.sticky.show{opacity:1;pointer-events:auto;transform:none}
@media(prefers-reduced-motion:reduce){.sticky{transition:none}}
.kick{font-size:13px;letter-spacing:.14em;line-height:1.5;margin:0 0 14px}
.btn{white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;min-height:48px;font-size:16px;line-height:1.2;padding:12px 26px}
.btn.small{min-height:44px;font-size:15px;padding:10px 18px}
.link{display:inline-flex;align-items:center;min-height:44px;margin-left:16px;text-underline-offset:4px}
.logo{display:inline-flex;align-items:center;min-height:44px}
.nav{gap:24px}.nav nav a{display:inline-flex;align-items:center;min-height:44px}
summary{display:flex;align-items:center;min-height:44px;padding:4px 0}
details p{margin:10px 0 4px}
.tabs a{display:inline-flex;align-items:center;min-height:44px;padding:0 18px}
.card{gap:6px}.card b{font-size:17px;line-height:1.35}.card span{font-size:15px;line-height:1.45}
.chips li{font-size:14px;padding:8px 14px}
blockquote{line-height:1.55}cite{font-size:15px}
.steps div{padding:28px}.steps p{margin:0}
.trust{font-size:15px;line-height:1.5;gap:10px 28px;padding:16px 20px}
.foot{font-size:15px;line-height:1.6}
.hero p{max-width:46ch}
.wrap.narrow{max-width:1160px}main>section.hero.wrap,main>section.band.wrap,main>section.band>.wrap{padding-left:20px;padding-right:20px}.wrap.narrow>*{max-width:760px}.card b{line-height:1.4}
.split p{max-width:52ch}
.quiz form{gap:20px}.quiz select,.quiz input{min-height:48px;font-size:16px}
@media(max-width:760px){
 body{font-size:16px}
 main>section,main>section.wrap{padding-top:52px;padding-bottom:52px}
 main>section.hero{padding-top:32px;padding-bottom:40px}
 .grid{grid-template-columns:1fr 1fr;gap:16px}
 .grid.quotes{grid-template-columns:1fr}
 .card b{font-size:16px}
 h1{font-size:clamp(36px,10vw,44px)}h2{font-size:clamp(28px,7.5vw,34px);margin-bottom:22px}h3{font-size:19px}
 .kick{font-size:16px;letter-spacing:.06em}
 .btn.small{font-size:16px;padding:10px 16px}
 .card span,.chips li,cite,.foot,.trust,.tabs a,.price small,small,.foot .small{font-size:16px}
 .link{margin-left:0;display:flex}
 .hero .btn{width:100%}
 .steps div{padding:22px}
 .foot{padding-bottom:110px}
 .nav .btn.small{display:none}
 .ph span{font-size:16px}
 .result .btn{width:100%}
}
'''
os.makedirs(OUT,exist_ok=True)
open(f'{OUT}/brand.css','w').write(BRAND_CSS)
for k,d in D.items():
    p=f'{OUT}/{k}'; os.makedirs(p,exist_ok=True)
    open(f'{p}/style.css','w').write(BASE+d['css']+TYPO+d.get('typo',''))
    pages={'index.html':('Home',d['home'](d)),'shop.html':('Shop',shop(d)),'plan.html':('Build a plan',quiz(d)),'recipe.html':('Liv-Love',recipe(d)),'about.html':('Our story',about(d)),'faq.html':('FAQ',faq_page(d))}
    for s,(t,b) in pages.items(): open(f'{p}/{s}','w').write(page(d,s,t,b))
print('ok')
