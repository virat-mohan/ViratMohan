#!/usr/bin/env node
// Content & performance calendar: the standard document for every brand on Retail OS.
// One JSON spec in → the same 3-page landscape PDF out (what goes out and why, week by
// week, with the images; then the Meta Ads plan with weekly budgets, expected return and
// the rules). Built to match the Ceremony Kitchen Diwali 2026 calendar, which is the default.
//
//   node tools/calendar/render.mjs tools/calendar/specs/<brand>.json [--out ~/Desktop/File.pdf]
//
// Needs Google Chrome on the Mac (headless) and this repo's node_modules (local fonts).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = process.argv.slice(2);
const specPath = args.find((a) => !a.startsWith('--'));
if (!specPath) { console.error('usage: render.mjs <spec.json> [--out file.pdf] [--html]'); process.exit(1); }
const outIdx = args.indexOf('--out');
const spec = JSON.parse(readFileSync(resolve(specPath), 'utf8'));
// --images <dir>: use local copies of the images (same file names) instead of fetching URLs.
const imgIdx = args.indexOf('--images');
const imgDir = imgIdx >= 0 ? resolve(args[imgIdx + 1]) : null;
const localImage = (u) => { if (!u || !imgDir) return u; const f = resolve(imgDir, u.split('/').pop().split('?')[0]); return existsSync(f) ? `file://${f}` : u; };
for (const w of spec.weeks) for (const d of w.days) if (d?.post?.image) d.post.image = localImage(d.post.image);
for (const c of spec.performance?.campaigns ?? []) if (c.image) c.image = localImage(c.image);
const outPdf = outIdx >= 0 ? resolve(args[outIdx + 1]) : resolve(HERE, 'out', `${spec.slug}.pdf`);

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const font = (p) => `file://${resolve(ROOT, 'node_modules', p)}`;
const inr = (n) => (typeof n === 'number' ? `₹${n.toLocaleString('en-IN')}` : esc(n));

// ── Palette and type: viratmohan.com tokens (paper, ink, gold, terracotta) ─────────────
const CSS = `
@font-face{font-family:Anton;src:url(${font('@fontsource/anton/files/anton-latin-400-normal.woff2')}) format('woff2');}
@font-face{font-family:InterV;src:url(${font('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}) format('woff2');font-weight:100 900;}
@font-face{font-family:Instrument;font-style:italic;src:url(${font('@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2')}) format('woff2');}
@page{size:A4 landscape;margin:8mm 9mm 7mm;}
:root{--paper:#F4EAD4;--paper2:#FBF6EA;--ink:#1A1410;--ink2:#4A4038;--dim:#7A6E62;--line:#D9CDB4;--gold:#D4AF37;--terra:#D9714B;--blue:#3E6FA6;--pink:#E91E8C;--brown:#9C7A4A;--sage:#2B8C86;}
*{box-sizing:border-box;}html,body{margin:0;background:#fff;color:var(--ink);font-family:InterV,Inter,Helvetica,Arial,sans-serif;font-size:8.6px;line-height:1.35;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.page{width:279mm;height:194mm;position:relative;page-break-after:always;background:var(--paper);padding:5mm 5mm 4mm;display:flex;flex-direction:column;overflow:hidden;}
.page:last-child{page-break-after:auto;}
.band{position:absolute;left:0;top:0;right:0;height:2.2mm;display:flex;}.band i{flex:1;}.band i:nth-child(1){background:var(--gold)}.band i:nth-child(2){background:var(--blue)}.band i:nth-child(3){background:var(--pink)}.band i:nth-child(4){background:var(--brown)}
.head{display:flex;justify-content:space-between;align-items:flex-end;gap:12mm;margin:2mm 0 2.5mm;}
.brandmark{display:flex;align-items:center;gap:6px;margin-bottom:1.2mm;}.brandmark img{height:6.5mm;width:auto;}.brandmark i{font-family:Instrument;font-style:italic;font-size:9px;color:var(--ink2);}
h1{font-family:Anton;font-weight:400;text-transform:uppercase;font-size:20px;line-height:1;margin:0;letter-spacing:.2px;}
.intro{max-width:110mm;text-align:right;color:var(--ink2);font-size:8.4px;}
.foot{margin-top:auto;padding-top:1.6mm;border-top:1px solid var(--line);display:flex;justify-content:space-between;color:var(--dim);font-size:7.4px;}
/* grid */
table.cal{width:100%;border-collapse:separate;border-spacing:1.2mm 1.2mm;table-layout:fixed;}
table.cal th{background:var(--ink);color:var(--paper);font-family:InterV;font-weight:700;font-size:7.4px;letter-spacing:.12em;text-transform:uppercase;padding:1.2mm 0;}
table.cal th.wk{background:transparent;width:19mm;}
td.wk{background:var(--ink);color:var(--paper);vertical-align:top;padding:1.6mm 1.6mm;width:19mm;font-size:7.6px;}
td.wk b{display:block;font-weight:700;font-size:8.2px;margin-bottom:.8mm;}td.wk .theme{color:var(--gold);font-weight:600;letter-spacing:.06em;text-transform:uppercase;font-size:6.6px;line-height:1.3;}td.wk .n{position:absolute;bottom:1.4mm;left:1.6mm;color:var(--paper);opacity:.85;font-size:7px;}
td.wk{position:relative;}
td.day{background:#fff;border:1px solid var(--line);vertical-align:top;padding:0;height:36mm;position:relative;}
td.day .d{font-weight:700;font-size:7.6px;padding:1mm 1.4mm .4mm;}
td.day.empty{background:var(--paper2);}
.img{position:relative;height:16mm;overflow:hidden;background:var(--paper2);margin:0 1.2mm;}.img img{width:100%;height:100%;object-fit:cover;display:block;}
.tag{position:absolute;left:0;top:0;font-size:6px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#fff;padding:.6mm 1.2mm;}
.tag.reel{background:var(--pink)}.tag.photo{background:var(--blue)}.tag.carousel{background:var(--brown)}.tag.stories{background:#8A5A3C}.tag.ad{background:var(--terra)}.tag.video{background:var(--sage)}
.cap{padding:.9mm 1.4mm 0;font-family:Georgia,'Times New Roman',serif;font-size:7.3px;line-height:1.3;color:var(--ink);}
.why{padding:.5mm 1.4mm 5.5mm;font-size:6.6px;line-height:1.3;color:var(--ink2);}.why b{color:var(--terra);font-weight:700;}
.bar{position:absolute;left:0;right:0;bottom:0;font-size:6.6px;font-weight:700;padding:.7mm 1.4mm;background:var(--paper2);color:var(--ink2);border-top:1px solid var(--line);}
.bar.ad{background:var(--blue);color:#fff;}
.stories-only{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:Instrument;font-style:italic;color:var(--brown);font-size:9px;}
.legend{display:flex;gap:4mm;align-items:center;color:var(--ink2);font-size:7px;margin-top:1mm;}.legend i{display:inline-block;width:2.6mm;height:2.6mm;margin-right:1mm;vertical-align:-.4mm;}
/* boxes */
.boxes{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin-top:2mm;}.boxes.three{grid-template-columns:repeat(3,1fr);}
.box{background:var(--paper2);border:1.5px solid var(--ink);padding:2mm 2.4mm;font-size:7.4px;color:var(--ink2);line-height:1.4;}.box h3{font-family:Anton;font-weight:400;text-transform:uppercase;font-size:9.6px;margin:0 0 1mm;color:var(--ink);letter-spacing:.2px;}
.box .big{font-family:Anton;font-size:16px;color:var(--ink);margin-right:1.5mm;}.box ul{margin:0;padding-left:3.2mm;}.box li{margin:0 0 .6mm;}
/* performance table */
table.pm{width:100%;border-collapse:collapse;margin-top:1mm;}
table.pm th{text-align:left;font-size:6.6px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);padding:1mm 1.4mm;border-bottom:1.5px solid var(--ink);}
table.pm td{vertical-align:top;padding:1.8mm 1.4mm;border-bottom:1px solid var(--line);font-size:7.4px;color:var(--ink2);}
table.pm td.name{color:var(--ink);}table.pm td.name b{display:block;font-size:8.4px;color:var(--ink);}table.pm td.name span{color:var(--dim);font-size:7px;}
table.pm td.thumb{width:12mm;padding-right:0;}table.pm td.thumb img{width:10.5mm;height:10.5mm;object-fit:cover;display:block;}
.chip{display:inline-block;font-size:6.8px;font-weight:700;color:#fff;background:var(--ink);padding:.7mm 1.3mm;border-radius:1mm;white-space:nowrap;}
.chip.c1{background:var(--pink)}.chip.c2{background:var(--blue)}.chip.c3{background:var(--brown)}.chip.c4{background:var(--ink)}.chip.c5{background:var(--sage)}.chip.c6{background:var(--terra)}.chip.soft{background:var(--paper2);color:var(--ink);border:1px solid var(--line);font-weight:600;}
table.pm td.num{white-space:nowrap;font-weight:700;color:var(--ink);}table.pm td.ret{white-space:nowrap;font-weight:700;color:var(--sage);}
table.pm tr.total td{background:var(--paper2);border-top:1.5px solid var(--ink);border-bottom:1.5px solid var(--ink);font-weight:700;color:var(--ink);}
`;

// ── Pieces ───────────────────────────────────────────────────────────────────────────
const TYPE_LABEL = { reel: 'Reel', photo: 'Photo', carousel: 'Carousel', stories: 'Stories', ad: 'Ad launch', video: 'Video' };
const logo = `file://${resolve(ROOT, 'public/retail-os/email/devshop-logo.png')}`;

function head(title, intro) {
  return `<div class="band"><i></i><i></i><i></i><i></i></div>
<div class="head"><div><div class="brandmark"><img src="${logo}" alt="DevShop"><i>Retail OS™</i></div><h1>${esc(title)}</h1></div><div class="intro">${esc(intro)}</div></div>`;
}
function foot(pageNo, total, right) {
  return `<div class="foot"><span>Made by DevShop Retail OS™ on behalf of founder Virat Mohan · +91 99992 77240 · viratmohan@gmail.com · viratmohan.com/retail-os</span><span>${esc(right)} · Page ${pageNo} of ${total}</span></div>`;
}
function legend() {
  return `<div class="legend"><span><i style="background:var(--pink)"></i>Reel</span><span><i style="background:var(--blue)"></i>Photo</span><span><i style="background:var(--brown)"></i>Carousel</span><span><i style="background:#8A5A3C"></i>Stories</span><span><i style="background:var(--terra)"></i>Ad launch</span><span style="margin-left:auto">Blue bar: also runs as a paid ad (last page). Open days take new reels as they are shot.</span></div>`;
}
function cell(day) {
  if (!day) return `<td class="day empty"></td>`;
  const d = `<div class="d">${esc(day.date)}</div>`;
  if (!day.post) return `<td class="day">${d}${day.storiesOnly ? '<div class="stories-only">Stories only</div>' : ''}</td>`;
  const p = day.post;
  const tag = `<span class="tag ${p.type}">${esc(TYPE_LABEL[p.type] ?? p.type)}${p.count ? ` · ${p.count} images` : ''}</span>`;
  const img = p.image ? `<div class="img"><img src="${esc(p.image)}" alt="">${tag}</div>` : `<div class="img" style="height:6mm">${tag}</div>`;
  const bar = p.ad ? `<div class="bar ad">Ad: ${esc(p.ad)}</div>` : `<div class="bar">Organic</div>`;
  return `<td class="day">${d}${img}<div class="cap">${esc(p.caption)}</div><div class="why"><b>Why:</b> ${esc(p.why)}</div>${bar}</td>`;
}
function grid(weeks) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const rows = weeks.map((w) => {
    const n = w.days.filter((x) => x?.post).length;
    return `<tr><td class="wk"><b>Week of ${esc(w.label)}</b><div class="theme">${esc(w.theme ?? '')}</div><div class="n">${n} ${n === 1 ? 'post' : 'posts'}</div></td>${w.days.map(cell).join('')}</tr>`;
  }).join('');
  return `<table class="cal"><thead><tr><th class="wk"></th>${days.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}
function boxes(list, three = false) {
  if (!list?.length) return '';
  return `<div class="boxes${three ? ' three' : ''}">${list.map((b) => `<div class="box"><h3>${esc(b.title)}</h3>${b.big ? `<span class="big">${esc(b.big)}</span>` : ''}${b.html ?? (b.items ? `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : esc(b.text ?? ''))}</div>`).join('')}</div>`;
}
function performance(pm) {
  const cols = pm.weeks;
  const rows = pm.campaigns.map((c, i) => {
    const chips = cols.map((w) => { const v = c.weekly?.[w]; return `<td>${v ? `<span class="chip c${(i % 6) + 1}${v.soft ? ' soft' : ''}">${esc(v.label ?? v)}</span>` : ''}</td>`; }).join('');
    return `<tr><td class="thumb">${c.image ? `<img src="${esc(c.image)}" alt="">` : ''}</td><td class="name"><b>${esc(c.name)}</b><span>${esc(c.sub ?? '')}</span></td><td>${esc(c.audience)}</td><td>${esc(c.creative)}</td>${chips}<td class="num">${inr(c.budget)}</td><td class="ret">${esc(c.expected)}</td><td>${esc(c.why)}</td></tr>`;
  }).join('');
  const totals = cols.map((w) => `<td>${inr(pm.totals?.weekly?.[w] ?? '')}</td>`).join('');
  return `<table class="pm"><thead><tr><th></th><th>Campaign</th><th>Audience</th><th>Creative</th>${cols.map((w) => `<th>${esc(w)}</th>`).join('')}<th>Budget</th><th>Expected return</th><th>Why</th></tr></thead>
<tbody>${rows}<tr class="total"><td></td><td colspan="3">${esc(pm.totals?.label ?? 'Recommended budget per week')}</td>${totals}<td class="num">${inr(pm.totals?.budget ?? '')}</td><td class="ret">${esc(pm.totals?.expected ?? '')}</td><td>${esc(pm.totals?.why ?? '')}</td></tr></tbody></table>`;
}

// ── Pages ────────────────────────────────────────────────────────────────────────────
const pages = [];
const perPage = spec.weeksPerPage ?? 4;
const chunks = [];
for (let i = 0; i < spec.weeks.length; i += perPage) chunks.push(spec.weeks.slice(i, i + perPage));
const total = chunks.length + 1;
chunks.forEach((weeks, i) => {
  const first = i === 0;
  const title = first ? `${spec.brand} · ${spec.title}` : `${spec.title}, continued · weeks ${i * perPage + 1} to ${Math.min(spec.weeks.length, (i + 1) * perPage)}`;
  const intro = first ? spec.intro : (spec.introContinued ?? '');
  const last = i === chunks.length - 1;
  pages.push(`<section class="page">${head(title, intro)}${grid(weeks)}${last ? boxes(spec.boxes) : ''}${legend()}${foot(i + 1, total, spec.footRight ?? `Nothing is posted until ${spec.approver} approves it`)}</section>`);
});
pages.push(`<section class="page">${head(`Performance marketing calendar · ${spec.performance.channel ?? 'Meta Ads'}`, spec.performance.intro)}${performance(spec.performance)}${boxes(spec.performance.boxes, true)}${foot(total, total, spec.performance.footRight ?? 'Expected returns are targets from this account’s own history, not guarantees')}</section>`);

const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(spec.brand)} · ${esc(spec.title)}</title><style>${CSS}</style></head><body>${pages.join('')}</body></html>`;

const work = resolve(tmpdir(), `calendar-${spec.slug}`);
mkdirSync(work, { recursive: true });
mkdirSync(dirname(outPdf), { recursive: true });
const htmlPath = resolve(work, 'index.html');
writeFileSync(htmlPath, html);
if (args.includes('--html')) { console.log(htmlPath); process.exit(0); }
if (!existsSync(CHROME)) { console.error('Google Chrome not found; HTML written to', htmlPath); process.exit(2); }
try {
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--allow-file-access-from-files', `--user-data-dir=${resolve(work, 'profile')}`, '--no-pdf-header-footer', `--print-to-pdf=${outPdf}`, `file://${htmlPath}`], { stdio: 'ignore', timeout: 90_000 });
} catch (e) { if (!existsSync(outPdf)) throw e; } // headless Chrome sometimes lingers after the PDF is written; the file is what matters
try { execFileSync('pkill', ['-f', `calendar-${spec.slug}`], { stdio: 'ignore' }); } catch { /* nothing to clean */ }
console.log(outPdf);
