// Pulls the Fresh For Paws catalogue from the live WooCommerce Store API (public, read-only) and writes
// public/preview/freshforpaws/catalogue.json for the mockup. Names, sizes, prices and image URLs all come from
// WooCommerce, so the mockup never drifts from the store. Run: node scripts/ffp-catalogue.mjs
import { writeFileSync } from 'node:fs';
const BASE = 'https://freshforpaws.com/wp-json/wc/store/v1/products';
const get = async (u) => { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (DevShop mockup sync)' } }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const txt = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&#8211;/g, '–').replace(/&#8217;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const rupees = (p) => Math.round(Number(p) / 10 ** (p?.minor ?? 0));
const list = await get(`${BASE}?per_page=100`);
const out = [];
for (const p of list) {
  if (/test product/i.test(p.name)) continue;
  const cats = p.categories.map((c) => txt(c.name));
  const name = txt(p.name);
  const sizes = [];
  if (p.type === 'variable') {
    for (const v of p.variations) {
      const d = await get(`${BASE}/${v.id}`);
      sizes.push({ size: v.attributes[0]?.value ?? '', vid: v.id, price: Number(d.prices.price) / 10 ** d.prices.currency_minor_unit });
    }
  } else {
    const label = p.attributes.find((a) => a.name === 'Size')?.terms?.[0]?.name ?? '';
    sizes.push({ size: label, price: Number(p.prices.price) / 10 ** p.prices.currency_minor_unit });
  }
  const species = cats.some((c) => /purr/i.test(c)) ? 'cat' : 'dog';
  const group = /combo/i.test(cats.join(' ')) ? 'combo' : /mini paws/i.test(cats.join(' ')) ? 'puppy' : /liv-love|liverlicious|topper/i.test(name) ? 'topper' : /peanut butter/i.test(name) ? 'treat' : 'meal';
  out.push({ id: p.id, name, species, group, cats, sizes, image: p.images[0]?.src ?? null, images: p.images.slice(0, 5).map((i) => i.src), url: p.permalink, blurb: txt(p.short_description).slice(0, 1400) });
}
writeFileSync(new URL('../public/preview/freshforpaws/catalogue.json', import.meta.url), JSON.stringify({ source: 'freshforpaws.com WooCommerce Store API', readAt: new Date().toISOString(), products: out }, null, 1));
console.log('products', out.length, 'with image', out.filter((x) => x.image).length);
