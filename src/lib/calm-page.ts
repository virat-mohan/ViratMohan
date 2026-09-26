// A small, calm standalone page for one-tap flows (approve a reply, connect Gmail).
// Paper and ink from /brand/tokens.css, one idea per screen, works at phone width.
import { escapeHtml } from './retail-os-http';

export function calmPage(p: { title: string; eyebrow?: string; heading: string; body: string; status?: number }): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(p.title)}</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="/brand/tokens.css">
<style>
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 var(--sans);-webkit-font-smoothing:antialiased;}
main{max-width:560px;margin:0 auto;padding:72px 16px 96px;animation:rise .5s ease-out both;}
@keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.eyebrow{font:600 11px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--terracotta);margin:0 0 14px;}
h1{font-family:var(--serif);font-weight:400;font-size:clamp(2rem,6vw,2.6rem);line-height:1.1;margin:0 0 20px;}
p{margin:0 0 16px;color:var(--dim);} .quote{white-space:pre-wrap;font-family:var(--serif);font-size:1.08rem;color:var(--ink);border-left:2px solid var(--gold);padding:4px 0 4px 18px;margin:24px 0 32px;overflow-wrap:anywhere;}
.btn{display:inline-block;font:600 15px var(--sans);padding:14px 26px;border-radius:999px;border:1px solid var(--ink);background:var(--ink);color:var(--paper);text-decoration:none;cursor:pointer;transition:opacity .2s;}
.btn:hover{opacity:.86;} .quiet{color:var(--ink);text-underline-offset:3px;} .row{display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-top:8px;}
.small{font-size:13px;color:var(--dim);margin-top:28px;} code{font-size:13px;background:rgba(26,20,16,.05);padding:2px 6px;border-radius:4px;}
</style></head><body><main>
${p.eyebrow ? `<p class="eyebrow">${escapeHtml(p.eyebrow)}</p>` : ''}<h1>${escapeHtml(p.heading)}</h1>
${p.body}
</main></body></html>`;
  return new Response(html, { status: p.status ?? 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
