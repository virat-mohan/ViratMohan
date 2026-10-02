#!/usr/bin/env node
// Live health check for every live brand and viratmohan.com. Read-only: GETs and
// harmless POSTs with empty bodies that must be refused. Prints JSON; exit 1 if
// anything fails. Run: node scripts/health/check.mjs [brand]
const BRANDS = {
  viratmohan: {
    base: 'https://www.viratmohan.com',
    pages: ['/', '/mission', '/launches', '/launches/moonglasses', '/devshop', '/retail-os/', '/work', '/writing', '/scs'],
    gated: ['/retail-os/admin/console', '/retail-os/admin/publish', '/retail-os/admin/inbox'],
  },
  moonglasses: {
    base: 'https://www.moon-glasses.store',
    pages: ['/', '/cart', '/checkout', '/about', '/contact', '/terms', '/privacy', '/refund-policy', '/shipping-policy', '/limited-series', '/pay-with-a-post/terms', '/sitemap.xml', '/robots.txt'],
    refuse: [
      ['/api/checkout/razorpay/create-order', 410],
      ['/api/checkout/razorpay/verify', 410],
      ['/api/orders', 410],
    ],
    config: '/api/checkout/config',
    expect: (c) => [
      ['COD off', c.codEnabled === false],
      ['Card payments off', c.razorpayEnabled === false],
      ['UPI on', c.upiEnabled === true && !!c.upiId],
      ['UPI QR set', !!c.upiQrImageUrl],
    ],
  },
  travaholic: { base: 'https://travaholic.in', pages: ['/', '/cart', '/checkout'] },
  ceremony: { base: 'https://ceremonykitchen.com', pages: ['/'] },
};

async function get(url, opts = {}) {
  const t = Date.now();
  try {
    const r = await fetch(url, { redirect: 'follow', ...opts, signal: AbortSignal.timeout(20000) });
    return { status: r.status, ms: Date.now() - t, body: opts.wantBody ? await r.text() : '' };
  } catch (e) { return { status: 0, ms: Date.now() - t, error: String(e.message || e) }; }
}

async function check(name, b) {
  const out = [];
  for (const p of b.pages ?? []) {
    const r = await get(b.base + p);
    out.push({ check: `page ${p}`, ok: r.status === 200, detail: `${r.status} ${r.ms}ms${r.error ? ' ' + r.error : ''}`, slow: r.ms > 4000 });
  }
  for (const p of b.gated ?? []) {
    const r = await get(b.base + p);
    out.push({ check: `admin locked ${p}`, ok: r.status === 401, detail: String(r.status) });
  }
  for (const [p, code] of b.refuse ?? []) {
    const r = await get(b.base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    out.push({ check: `refuses ${p}`, ok: r.status === code, detail: String(r.status) });
  }
  if (b.config) {
    const r = await get(b.base + b.config, { wantBody: true });
    let c = null; try { c = JSON.parse(r.body); } catch {}
    if (!c) out.push({ check: 'checkout config', ok: false, detail: String(r.status) });
    else for (const [label, ok] of b.expect(c)) out.push({ check: label, ok: !!ok, detail: '' });
  }
  // Every link on the homepage loads.
  const home = await get(b.base + '/', { wantBody: true });
  const links = [...new Set([...home.body.matchAll(/href="(\/(?!\/)[^"#?]*)"/g)].map((m) => m[1]))].slice(0, 60);
  const broken = [];
  for (const l of links) { const r = await get(b.base + l); if (r.status !== 200 && r.status !== 401) broken.push(`${r.status} ${l}`); }
  out.push({ check: `homepage links (${links.length})`, ok: broken.length === 0, detail: broken.join(', ') });
  return { brand: name, base: b.base, failed: out.filter((x) => !x.ok).length, results: out };
}

const only = process.argv[2];
const report = [];
for (const [n, b] of Object.entries(BRANDS)) if (!only || only === n) report.push(await check(n, b));
console.log(JSON.stringify({ at: new Date().toISOString(), report }, null, 2));
process.exit(report.some((r) => r.failed) ? 1 : 0);
