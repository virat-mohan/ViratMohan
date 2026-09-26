// Fails if public/brand/tokens.css drifts from src/styles/global.css.
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const vars = (css) => {
  const root = css.match(/:root\s*{([\s\S]*?)\n}/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
  return Object.fromEntries([...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].replace(/\s+/g, ' ').trim().toLowerCase()]));
};
const g = vars(read('src/styles/global.css'));
const t = vars(read('public/brand/tokens.css'));
const keys = ['ink', 'paper', 'gold', 'sage', 'dim', 'line', 'terracotta', 'cobalt', 'magenta', 'bronze', 'poster-cream', 'poster-ink', 'display', 'serif', 'sans'];
let bad = 0;
for (const k of keys) {
  if (g[`--${k}`] !== t[`--${k}`]) { console.error(`--${k}: global.css=${g[`--${k}`]} tokens.css=${t[`--${k}`]}`); bad++; }
}
if (bad) { console.error(`brand tokens out of sync (${bad})`); process.exit(1); }
console.log(`brand tokens in sync (${keys.length} checked)`);
