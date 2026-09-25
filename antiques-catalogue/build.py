import json,html,csv
items=[]
for f in ['part1','part2','part3','part4']: items+=json.load(open(f'research/{f}.json'))
def pages(i):
    s=str(i)
    if s=='14-16': return [13,14,15]
    n=int(s)
    if n<=13: return [n-1]
    if n<=57: return [n-1]
    return {58:[57,58,59],59:[60,61,62],60:[63]}[n]
e=html.escape
cards=[];rows=[]
lo=hi=0
for it in items:
    r=it.get('suggested_retail_usd') or {}
    lo+=r.get('low') or 0; hi+=r.get('high') or 0
    comps=''.join(f"<li>{e(str(c.get('price')) if c.get('price') is not None else 'price not visible')} {e(c.get('currency') or '')} · {e(c.get('status') or '')} · {e(c.get('venue') or '')} · {e(str(c.get('date') or ''))}"+(f" · <a href='{e(c['url'])}' target='_blank' rel='noopener'>source</a>" if c.get('url') else '')+(f"<br><span class=n>{e(c.get('note') or '')}</span>" if c.get('note') else '')+"</li>" for c in it.get('comparables',[]))
    imgs=''.join(f"<img loading=lazy src='img/p{p:02d}.jpg' alt=''>" for p in pages(it['id']))
    conf=it.get('confidence','low')
    price=f"${r.get('low')}–{r.get('high')}" if r else '—'
    cards.append(f"""<article class=card data-conf='{e(conf)}'><div class=imgs>{imgs}</div><div class=body>
<div class=top><span class=id>#{e(str(it['id']))}</span><span class='conf {e(conf)}'>{e(conf)} confidence</span></div>
<h2>{e(it.get('name',''))}</h2><p class=maker>{e(it.get('maker',''))}</p>
<p class=price>{price} <small>suggested retail (USD)</small></p>
<dl><dt>Era</dt><dd>{e(str(it.get('era','')))}</dd><dt>Material</dt><dd>{e(str(it.get('material','')))}</dd><dt>Colour</dt><dd>{e(str(it.get('colour','')))}</dd><dt>Size</dt><dd>{e(str(it.get('size','')))}</dd></dl>
<details><summary>Identification & comparables ({len(it.get('comparables',[]))})</summary><p>{e(it.get('identification_notes',''))}</p><ul>{comps}</ul></details></div></article>""")
    rows.append([it['id'],it.get('name'),it.get('maker'),it.get('era'),it.get('material'),it.get('colour'),it.get('size'),r.get('low'),r.get('high'),conf,' | '.join(f"{c.get('price')} {c.get('currency')} {c.get('status')} {c.get('venue')} {c.get('date')} {c.get('url')}" for c in it.get('comparables',[]))])
with open('catalogue.csv','w',newline='') as f:
    w=csv.writer(f);w.writerow(['id','name','maker','era','material','colour','size','retail_low_usd','retail_high_usd','confidence','comparables']);w.writerows(rows)
page=f"""<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Raghu Antiques Catalogue</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500&display=swap" rel=stylesheet>
<style>
:root{{--bg:#f6f2ea;--card:#fffdf8;--ink:#231d16;--mute:#6f6558;--line:#e3dace;--acc:#8a5a2b;--hi:#2f6b3a;--med:#9a6b12;--lo:#a33b2b}}
@media (prefers-color-scheme:dark){{:root:not([data-theme=light]){{--bg:#15120f;--card:#1f1a15;--ink:#efe7da;--mute:#a79c8c;--line:#352d25;--acc:#d9a46a;--hi:#7cc58a;--med:#e0b35a;--lo:#e98a79}}}}
:root[data-theme=dark]{{--bg:#15120f;--card:#1f1a15;--ink:#efe7da;--mute:#a79c8c;--line:#352d25;--acc:#d9a46a;--hi:#7cc58a;--med:#e0b35a;--lo:#e98a79}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,system-ui,sans-serif}}
header{{max-width:1200px;margin:auto;padding:40px 16px 8px}}h1{{font:600 44px/1.1 'Cormorant Garamond',serif;margin:0 0 8px}}
.lede{{color:var(--mute);max-width:760px}}.stats{{display:flex;gap:24px;flex-wrap:wrap;margin:16px 0}}.stats b{{display:block;font:600 26px 'Cormorant Garamond',serif}}
.note{{border-left:3px solid var(--acc);padding:8px 12px;background:var(--card);color:var(--mute);font-size:13px;max-width:900px}}
.filters{{margin:16px 0;display:flex;gap:8px;flex-wrap:wrap}}.filters button{{border:1px solid var(--line);background:var(--card);color:var(--ink);padding:6px 12px;border-radius:99px;cursor:pointer}}.filters button.on{{background:var(--ink);color:var(--bg)}}
main{{max-width:1200px;margin:auto;padding:0 16px 60px;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}}
.imgs{{display:flex;overflow-x:auto;background:#000}}.imgs img{{width:100%;flex:0 0 100%;aspect-ratio:1;object-fit:cover}}
.body{{padding:14px 16px 16px}}.top{{display:flex;justify-content:space-between;font-size:12px;color:var(--mute)}}
.conf{{text-transform:uppercase;letter-spacing:.05em;font-weight:500}}.conf.high{{color:var(--hi)}}.conf.med{{color:var(--med)}}.conf.low{{color:var(--lo)}}
h2{{font:600 22px/1.2 'Cormorant Garamond',serif;margin:6px 0 2px}}.maker{{margin:0;color:var(--acc)}}.price{{font:600 24px 'Cormorant Garamond',serif;margin:8px 0}}.price small{{font:12px Inter;color:var(--mute)}}
dl{{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;font-size:13px;margin:0 0 8px}}dt{{color:var(--mute)}}dd{{margin:0}}
details{{font-size:13px;border-top:1px solid var(--line);padding-top:8px}}summary{{cursor:pointer;color:var(--acc)}}ul{{padding-left:18px}}li{{margin:6px 0;overflow-wrap:anywhere}}.n{{color:var(--mute)}}a{{color:var(--acc)}}
</style></head><body><header><h1>Raghu Antiques — Draft Catalogue</h1>
<p class=lede>{len(items)} lots from the PDF (the three Kutani teapots are one lot). The makers and sizes come from the PDF. The comparables are real listings and sales found online in September 2026. The suggested retail prices are estimates based on those comparables.</p>
<div class=stats><div><b>{len(items)}</b>lots</div><div><b>${lo:,}–${hi:,}</b>total suggested retail</div><div><b>{sum(1 for i in items if i.get('confidence')=='med')}</b> medium · <b style=display:inline>{sum(1 for i in items if i.get('confidence')=='low')}</b> low confidence</div></div>
<p class=note>Every price here was read from search results, because the listing pages were blocked from this environment. Open the source link to confirm a price before using it. "Asking" is a current listing price, not a sale. Check maker marks on the Lalique, Hermès, Le Verrier, Japy and bronze pieces before listing, since they can change the value by 10×.</p>
<div class=filters><button class=on data-f=all>All</button><button data-f=high>High</button><button data-f=med>Medium</button><button data-f=low>Low</button></div></header>
<main>{''.join(cards)}</main>
<script>document.querySelectorAll('.filters button').forEach(b=>b.onclick=()=>{{document.querySelectorAll('.filters button').forEach(x=>x.classList.toggle('on',x===b));document.querySelectorAll('.card').forEach(c=>c.style.display=(b.dataset.f==='all'||c.dataset.conf===b.dataset.f)?'':'none')}})</script></body></html>"""
open('catalogue.html','w').write(page)
print(lo,hi,len(items))
