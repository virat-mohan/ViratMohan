#!/usr/bin/env node
// Seed the Brain from the repo's own truth. Every fact carries its source path, and every
// fact with a number is checked to appear verbatim in that source (no unsourced numbers).
//
//   node scripts/brain-seed.mjs                 print JSON {entities, facts, warnings}
//   node scripts/brain-seed.mjs --out seed.json write JSON to a file
//   node scripts/brain-seed.mjs --apply         upsert into Supabase (needs migrations/0033 applied,
//                                               SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => (existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), 'utf8') : null);
const entities = [], facts = [], warnings = [];

function fact(source, topic, statement, { quote, visibility = 'public', entity } = {}) {
  const text = read(source);
  if (text == null) { warnings.push(`missing source ${source}`); return; }
  const q = quote ?? statement;
  // Numbers must be traceable: the quote (or statement) has to be in the source file.
  if (/\d/.test(statement) && !text.includes(q)) { warnings.push(`skipped unsourced number (${source}): ${statement.slice(0, 80)}`); return; }
  facts.push({ topic, statement, source, source_quote: quote ?? null, confidence: 1, confirmed_by: 'seed', visibility, entity });
}
function entity(kind, name, source, { aliases = [], attributes = {}, visibility = 'public' } = {}) {
  if (kind === 'customer') visibility = 'staff';
  entities.push({ kind, name, aliases, attributes, source, visibility });
}

// ---- Mission (case-study/MISSION.md)
{
  const src = 'case-study/MISSION.md', t = read(src);
  if (t) {
    for (const m of t.matchAll(/^\*\*(Mission|Vision)\.\*\*\s+(.+)$/gm)) fact(src, m[1].toLowerCase(), m[2].trim());
    for (const m of t.matchAll(/^\d+\.\s+\*\*(.+?)\.\*\*\s+(.+)$/gm)) {
      entity('value', m[1], src, { attributes: { fundamental: m[2].trim() } });
      fact(src, `fundamental: ${m[1]}`, `${m[1]}: ${m[2].trim()}`, { quote: m[2].trim(), entity: m[1] });
    }
  } else warnings.push(`missing source ${src}`);
}

// ---- /mission page (src/pages/mission.astro): passion, ambition, values
{
  const src = 'src/pages/mission.astro', t = read(src);
  if (t) {
    for (const m of t.matchAll(/\['([^']+)',\s*'([^']+)'\]/g)) {
      entity('value', m[1], src, { attributes: { meaning: m[2] } });
      fact(src, `value: ${m[1]}`, `${m[1]}: ${m[2]}`, { quote: m[2], entity: m[1] });
    }
    for (const m of t.matchAll(/<p class="mv-k">(\w+)<\/p>\s*<h[12][^>]*>([^<]+)<\/h[12]>/g)) fact(src, m[1].toLowerCase(), m[2].trim());
  } else warnings.push(`missing source ${src}`);
}

// ---- Playbook (case-study/PLAYBOOK.md)
{
  const src = 'case-study/PLAYBOOK.md', t = read(src);
  if (t) {
    for (const m of t.matchAll(/^(\d)\.\s+(.+)$/gm)) fact(src, 'decision test', `Decision test step ${m[1]}: ${m[2].trim()}`, { quote: m[2].trim() });
    for (const m of t.matchAll(/^(Act alone|Always ask Virat first):\s*(.+)$/gm)) {
      entity('policy', m[1], src, { attributes: { covers: m[2].trim() } });
      fact(src, 'act alone vs ask Virat', `${m[1]}: ${m[2].trim()}`);
    }
    for (const m of t.matchAll(/^- ([^:]+):\s*(.+)$/gm)) fact(src, `situation: ${m[1]}`, `${m[1]}: ${m[2].trim()}`);
    const rhythm = t.match(/## Rhythm\n(.+)/);
    if (rhythm) fact(src, 'rhythm', rhythm[1].trim());
  } else warnings.push(`missing source ${src}`);
}

// ---- Public pricing and terms, exactly as shown on /retail-os (public/retail-os/index.html)
{
  const src = 'public/retail-os/index.html';
  entity('term', 'Retail OS standard terms', src, { aliases: ['terms', 'pricing', 'commercials'] });
  fact(src, 'pricing', 'Zero capex: the only thing paid upfront is a ₹5,000 deposit, fully adjusted against actual onboarding tech costs. DevShop keeps none of it.',
    { quote: 'the only thing you pay upfront is a ₹5,000 deposit, fully adjusted against your actual onboarding tech costs — DevShop keeps none of it', entity: 'Retail OS standard terms' });
  fact(src, 'contract', 'Contract is 12 months, renewable on mutual terms, with a 30-day break clause; the break fee is 5% of revenue to date.',
    { quote: '12 mo, renewable on mutual terms · 30-day break clause, fee 5% of revenue to date', entity: 'Retail OS standard terms' });
}
{
  const src = 'src/pages/retail-os/terms/[id].astro';
  fact(src, 'cost strategy', 'Cost strategy: product ≤25%, marketing ≤25%, admin and all other costs ≤10% of revenue, leaving a profit pool of about 40%.',
    { quote: 'Product ≤25%, marketing ≤25%, admin and all other costs ≤10% of revenue, leaving a profit pool of about 40%.' });
}
{
  const src = 'src/lib/retail-os-terms.ts';
  fact(src, 'settlement', "Every customer payment is collected into DevShop's account first. Each week (Monday to Sunday) is settled the following Monday by 1 PM, with an itemised statement.",
    { quote: 'Each week (Monday to Sunday) is settled the following Monday by 1 PM, with an itemised statement.' });
  fact(src, 'brand IP', 'In the standard model the brand IP stays entirely with the founder. In the AI-Enabler / Co-Founder model DevShop holds 50% of the brand IP.',
    { quote: 'holds 50% of the brand IP' });
}

// ---- Brands, channels, site identity (src/data/site.ts + FAQ)
{
  const src = 'src/data/site.ts', t = read(src);
  if (t) {
    entity('person', 'Virat Mohan', src, { aliases: ['Virat'], attributes: { role: 'founder, builds DevShop and Retail OS' } });
    for (const m of t.matchAll(/value:\s*'([^']+)',\s*label:\s*'([^']+)',\s*context:\s*'([^']+)'/g)) fact(src, 'track record', `${m[2]}: ${m[1]} (${m[3]})`, { quote: `value: '${m[1]}'` });
  }
}
entity('channel', 'WhatsApp', 'CLAUDE.md', { attributes: { use: 'The CTA is "Let\'s talk." (WhatsApp).' } });
entity('channel', 'Email', 'case-study/PLAYBOOK.md', { attributes: { use: 'Formal messages, records, first contact.' } });

// ---- FAQ (public/retail-os/faq/faq-data.js)
{
  const src = 'public/retail-os/faq/faq-data.js', t = read(src);
  if (t) {
    const ctx = { window: {} };
    vm.runInNewContext(t, ctx);
    for (const f of ctx.window.RETAIL_OS_FAQ ?? []) {
      facts.push({ topic: `faq: ${f.topic}`, statement: `Q: ${f.q}\nA: ${f.a}`, source: `${src}#${f.q}`, source_quote: null, confidence: 1, confirmed_by: 'seed', visibility: 'public' });
    }
    const brands = t.match(/Travaholic Caps runs on the full system\. Moonglasses is live and selling offline today, and its online store goes live soon\. Ceremony Kitchen uses it for social and performance marketing\. India Contemporary and Flowerbasket are launching/);
    if (brands) {
      entity('brand', 'Travaholic Caps', src, { aliases: ['Travaholic'], attributes: { status: 'live on the full system' } });
      entity('brand', 'Moonglasses', src, { aliases: ['Moon Glasses', 'moon-glasses'], attributes: { status: 'live, selling offline today; online store going live soon' } });
      entity('brand', 'Ceremony Kitchen', src, { aliases: ['Ceremony'], attributes: { status: 'uses Retail OS for social and performance marketing' } });
      entity('brand', 'India Contemporary', src, { attributes: { status: 'launching' } });
      entity('brand', 'Flowerbasket', src, { aliases: ['Flower Basket'], attributes: { status: 'launching' } });
    } else warnings.push('brand list sentence changed in FAQ; brands not seeded');
  } else warnings.push(`missing source ${src}`);
}

// ---- Voice and values (CLAUDE.md)
{
  const src = 'CLAUDE.md', t = read(src);
  const voice = t?.match(/## Voice\n(.+)/);
  if (voice) fact(src, 'voice', voice[1].trim());
}

// ---- Learnings (case-study/LEARNINGS.md): internal, staff only
{
  const src = 'case-study/LEARNINGS.md', t = read(src);
  if (t) for (const m of t.matchAll(/^- (\d{4}-\d{2}-\d{2}):\s*(.+)$/gm)) fact(src, 'learning', `${m[1]}: ${m[2].trim()}`, { visibility: 'staff' });
  else warnings.push(`missing source ${src} (no learnings seeded)`);
}

// ---- Every other section of the house docs, harvested line by line (source = path#heading).
// A line is one fact. Already-seeded lines are skipped by the (source, statement) upsert key.
// CLAUDE.md holds the internal north star, so it is staff only.
function harvest(src, visibility, skip = []) {
  const t = read(src);
  if (t == null) { warnings.push(`missing source ${src}`); return; }
  let heading = '';
  for (const raw of t.split('\n')) {
    const h = raw.match(/^#{1,3}\s+(.+)/);
    if (h) { heading = h[1].trim(); continue; }
    if (skip.some((s) => heading.startsWith(s))) continue;
    const line = raw.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').replace(/\*\*/g, '').trim();
    if (line.length < 25 || line.startsWith('|') || line.startsWith('```')) continue;
    const topic = `${src.split('/').pop().replace(/\.md$/, '').toLowerCase()}: ${heading || 'intro'}`;
    if (facts.some((f) => f.source === src && f.statement.includes(line))) continue;
    fact(src, topic, line, { visibility });
  }
}
harvest('CLAUDE.md', 'staff');
harvest('case-study/PLAYBOOK.md', 'public', ['The decision test']);
harvest('case-study/README.md', 'staff');

// ---- Proof targets (case-study/WOW-TARGETS.md): one fact per row, staff only until proven in public
{
  const src = 'case-study/WOW-TARGETS.md', t = read(src);
  if (t) for (const m of t.matchAll(/^\|\s*(\d+)\s*\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/gm)) {
    const [, n, cat, comp, target, where, status] = m.map((x) => x.replace(/\*\*/g, '').trim());
    fact(src, `wow target: ${cat}`, `Target ${n}, ${cat}: ${target}. Competitor best: ${comp}. Proven at: ${where}. Status: ${status}.`, { quote: m[0], visibility: 'staff' });
  }
  else warnings.push(`missing source ${src}`);
}

// ---- DevShop industry verticals (src/data/devshop-verticals.ts)
{
  const src = 'src/data/devshop-verticals.ts', t = read(src);
  if (t) for (const m of t.matchAll(/name:\s*'([^']+)',[\s\S]*?slug:\s*'([^']+)',[\s\S]*?status:\s*'(live|soon)',\s*blurb:\s*'([^']+)'/g)) {
    entity('product', `DevShop for ${m[1]}`, src, { attributes: { page: `/devshop/${m[2]}`, status: m[3] } });
    fact(src, 'devshop verticals', `DevShop for ${m[1]} (/devshop/${m[2]}, ${m[3]}): ${m[4]}`, { quote: m[4], entity: `DevShop for ${m[1]}` });
  }
  else warnings.push(`missing source ${src}`);
}

// ---- Self-audit: knowledge files in the repo the Brain does not read yet.
{
  const seeded = new Set([...facts.map((f) => f.source.split('#')[0]), ...entities.map((e) => e.source)]);
  const docs = ['CLAUDE.md', 'README.md', ...readdirSync(resolve(ROOT, 'case-study')).filter((f) => f.endsWith('.md')).map((f) => `case-study/${f}`)];
  const notKnowledge = new Set(['README.md']); // dev setup, not business knowledge
  for (const d of docs) if (!seeded.has(d) && !notKnowledge.has(d)) warnings.push(`gap: ${d} is not read by the Brain`);
}

const out = { generated_at: new Date().toISOString(), counts: { entities: entities.length, facts: facts.length }, entities, facts, warnings };
const args = process.argv.slice(2);

if (args.includes('--apply')) {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('--apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: ents, error: e1 } = await sb.from('brain_entities').upsert(entities, { onConflict: 'kind,name' }).select('id,name');
  if (e1) throw e1;
  const byName = Object.fromEntries(ents.map((e) => [e.name, e.id]));
  const rows = facts.map(({ entity: en, ...f }) => ({ ...f, entity_id: en ? byName[en] ?? null : null }));
  const { error: e2 } = await sb.from('brain_facts').upsert(rows, { onConflict: 'source,statement' });
  if (e2) throw e2;
  await sb.from('brain_events').insert({ type: 'seed', actor: 'scripts/brain-seed.mjs', payload: out.counts });
  console.error(`seeded ${entities.length} entities, ${facts.length} facts; ${warnings.length} warnings`);
} else {
  const i = args.indexOf('--out');
  const json = JSON.stringify(out, null, 2);
  if (i >= 0 && args[i + 1]) writeFileSync(args[i + 1], json); else process.stdout.write(json + '\n');
}
