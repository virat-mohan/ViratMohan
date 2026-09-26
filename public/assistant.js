/* Virat's AI assistant: website chat. Include with <script src="/assistant.js" defer></script>.
   Wears /brand/tokens.css. A page can lift the button above its own fixed bars with --vma-bottom. */
(function () {
  if (window.__vmAssistant) return; window.__vmAssistant = true;
  var KEY = 'vm-assistant';
  var LABEL = "Let's talk";
  var state; try { state = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!state) state = { id: (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()), messages: [], escalated: false };
  var save = function () { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
  var WA = 'https://wa.me/919999277240?text=' + encodeURIComponent("Hi Virat, I was chatting with your assistant. Let's talk.");

  if (!document.querySelector('link[href$="/brand/tokens.css"]')) {
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/brand/tokens.css'; document.head.appendChild(l);
  }

  var css = document.createElement('style');
  css.textContent = [
    '.vma{--vma-ink:var(--ink,#1a1410);--vma-paper:var(--paper,#f4ead4);--vma-gold:var(--gold,#d4af37);--vma-terra:var(--terracotta,#d9714b);--vma-dim:var(--dim,#5a4c3c);--vma-line:var(--line,rgba(23,19,15,.14));--vma-sans:var(--sans,Inter,system-ui,sans-serif);--vma-serif:var(--serif,"Instrument Serif",Georgia,serif);--vma-display:var(--display,Anton,"Arial Narrow",sans-serif)}',
    '.vma *{box-sizing:border-box}',
    '.vma-btn{position:fixed;left:20px;bottom:calc(var(--vma-bottom,20px) + env(safe-area-inset-bottom));z-index:900;display:flex;align-items:center;gap:10px;min-height:48px;padding:8px 20px 8px 8px;background:var(--vma-ink);color:var(--vma-paper);border:1px solid var(--vma-gold);border-radius:999px;font:600 14px/1 var(--vma-sans);letter-spacing:.01em;cursor:pointer;box-shadow:0 12px 28px -14px rgba(23,19,15,.45);transition:transform .25s ease,box-shadow .25s ease,opacity .25s ease}',
    '.vma-btn:hover{transform:translateY(-1px);box-shadow:0 16px 32px -14px rgba(23,19,15,.5)}',
    '.vma-btn i{width:32px;height:32px;border-radius:50%;background:var(--vma-terra);display:grid;place-items:center;font:400 14px/1 var(--vma-display);color:var(--vma-paper);font-style:normal;letter-spacing:.02em}',
    '.vma-btn:focus-visible,.vma-x:focus-visible,.vma-send:focus-visible,.vma-foot a:focus-visible,.vma-m a:focus-visible{outline:2px solid var(--vma-gold);outline-offset:3px}',
    '.vma-panel{position:fixed;left:20px;bottom:calc(var(--vma-bottom,20px) + env(safe-area-inset-bottom));z-index:1000;width:min(400px,calc(100vw - 32px));height:min(600px,calc(100dvh - var(--vma-bottom,20px) - 40px));display:flex;flex-direction:column;background:var(--vma-paper);color:var(--vma-ink);border:1px solid var(--vma-line);border-radius:18px;overflow:hidden;box-shadow:0 30px 60px -24px rgba(23,19,15,.4);font:400 15px/1.55 var(--vma-sans);opacity:0;transform:translateY(12px) scale(.985);transform-origin:bottom left;visibility:hidden;transition:opacity .3s ease,transform .3s ease,visibility 0s linear .3s}',
    '.vma-open .vma-panel{opacity:1;transform:none;visibility:visible;transition:opacity .3s ease,transform .3s ease}',
    '.vma-open .vma-btn{opacity:0;pointer-events:none}',
    '.vma-band{height:5px;flex:none;background:linear-gradient(90deg,var(--vma-gold) 0 25%,var(--magenta,#e91e8c) 25% 50%,var(--cobalt,#3e6fa6) 50% 75%,var(--vma-terra) 75% 100%)}',
    '.vma-head{padding:18px 20px 14px;display:flex;align-items:flex-start;gap:12px;flex:none}',
    '.vma-head h2{margin:0;font:400 22px/1 var(--vma-display);text-transform:uppercase;letter-spacing:.02em;color:var(--vma-ink)}',
    '.vma-head p{margin:6px 0 0;font:600 10.5px/1.3 var(--vma-sans);letter-spacing:.14em;text-transform:uppercase;color:var(--vma-dim)}',
    '.vma-x{margin-left:auto;width:36px;height:36px;flex:none;border-radius:50%;background:transparent;border:1px solid var(--vma-line);color:var(--vma-ink);font:400 20px/1 var(--vma-sans);cursor:pointer;display:grid;place-items:center;transition:background .2s ease}',
    '.vma-x:hover{background:rgba(23,19,15,.05)}',
    '.vma-rule{height:1px;background:var(--vma-gold);margin:0 20px;flex:none;opacity:.8}',
    '.vma-log{flex:1;overflow-y:auto;overflow-x:hidden;padding:20px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}',
    '.vma-hello{font:italic 400 22px/1.3 var(--vma-serif);color:var(--vma-ink);margin:0 0 4px;max-width:92%}',
    '.vma-m{max-width:86%;padding:11px 14px;border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere;animation:vma-in .3s ease both}',
    '.vma-a{background:#fbf5e6;border:1px solid var(--vma-line);align-self:flex-start;border-bottom-left-radius:4px}',
    '.vma-u{background:var(--vma-ink);color:var(--vma-paper);align-self:flex-end;border-bottom-right-radius:4px}',
    '.vma-m a{color:var(--vma-terra);font-weight:600;text-underline-offset:2px}.vma-u a{color:var(--vma-gold)}',
    '.vma-note{align-self:stretch;border-left:2px solid var(--vma-gold);padding:10px 14px;font:400 13.5px/1.5 var(--vma-sans);color:var(--vma-dim);background:rgba(212,175,55,.08);border-radius:0 10px 10px 0;animation:vma-in .3s ease both}',
    '.vma-note b{display:block;color:var(--vma-ink);font-weight:600;margin-bottom:2px}',
    '.vma-typing{display:inline-flex;gap:5px;align-items:center;padding:14px 16px}',
    '.vma-typing span{width:6px;height:6px;border-radius:50%;background:var(--vma-dim);opacity:.35;animation:vma-dot 1.2s ease-in-out infinite}',
    '.vma-typing span:nth-child(2){animation-delay:.15s}.vma-typing span:nth-child(3){animation-delay:.3s}',
    '.vma-row{display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--vma-line);flex:none}',
    '.vma-row label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}',
    '.vma-row textarea{flex:1;min-width:0;resize:none;height:46px;max-height:120px;padding:12px 14px;border:1px solid rgba(23,19,15,.22);border-radius:12px;font:400 16px/1.35 var(--vma-sans);color:var(--vma-ink);background:#fffaf0;transition:border-color .2s ease}',
    '.vma-row textarea:focus{outline:none;border-color:var(--vma-gold);box-shadow:0 0 0 3px rgba(212,175,55,.2)}',
    '.vma-send{flex:none;min-width:72px;height:46px;padding:0 16px;border:0;border-radius:12px;background:var(--vma-ink);color:var(--vma-paper);font:600 14px/1 var(--vma-sans);cursor:pointer;transition:opacity .2s ease}',
    '.vma-send[disabled]{opacity:.45;cursor:default}',
    '.vma-foot{padding:0 16px 12px;font:400 12px/1.4 var(--vma-sans);color:var(--vma-dim);flex:none}.vma-foot a{color:var(--vma-ink);text-underline-offset:2px}',
    '@keyframes vma-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
    '@keyframes vma-dot{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:.8;transform:translateY(-2px)}}',
    '@media (max-width:560px){.vma-btn{left:16px}.vma-panel{left:0;right:0;top:0;bottom:0;width:100%;height:100%;height:100dvh;border:0;border-radius:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);transform:translateY(16px);transform-origin:bottom center}.vma-open .vma-panel{transform:none}.vma-open{overflow:hidden}}',
    '@media (prefers-reduced-motion:reduce){.vma-btn,.vma-panel,.vma-open .vma-panel{transition:none!important;transform:none!important}.vma-m,.vma-note{animation:none}.vma-typing span{animation:none;opacity:.6}}'
  ].join('');
  document.head.appendChild(css);

  var root = document.createElement('div');
  root.className = 'vma';
  root.innerHTML =
    '<button class="vma-btn" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="vma-panel"><i aria-hidden="true">VM</i>' + LABEL + '</button>' +
    '<div class="vma-panel" id="vma-panel" role="dialog" aria-modal="true" aria-labelledby="vma-title" aria-describedby="vma-sub" aria-hidden="true">' +
      '<div class="vma-band" aria-hidden="true"></div>' +
      '<div class="vma-head"><div><h2 id="vma-title">Virat Mohan</h2><p id="vma-sub">AI assistant · Virat reads every chat</p></div>' +
      '<button class="vma-x" type="button" aria-label="Close chat">×</button></div>' +
      '<div class="vma-rule" aria-hidden="true"></div>' +
      '<div class="vma-log" role="log" aria-live="polite" aria-relevant="additions" tabindex="-1"></div>' +
      '<form class="vma-row"><label for="vma-q">Your message</label><textarea id="vma-q" name="q" rows="1" autocomplete="off" placeholder="What do you sell?"></textarea>' +
      '<button class="vma-send" type="submit" aria-label="Send message">Send</button></form>' +
      '<div class="vma-foot">Prefer WhatsApp? <a href="' + WA + '" target="_blank" rel="noopener">Message Virat directly</a> · <a href="/mission">Read my mission →</a></div>' +
    '</div>';
  document.body.appendChild(root);
  var btn = root.querySelector('.vma-btn'), panel = root.querySelector('.vma-panel'), log = root.querySelector('.vma-log'),
      form = root.querySelector('form'), input = form.q, send = root.querySelector('.vma-send');

  function linkify(t) {
    var esc = t.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    return esc.replace(/(https?:\/\/[^\s)]+|\/(?:retail-os\/apply\/?|retail-os\/?|devshop|scs|mission)(?=[\s.,)!?]|$))/g, function (u) { return '<a href="' + u + '" target="' + (u[0] === '/' ? '_self' : '_blank') + '" rel="noopener">' + (u[0] === '/' ? 'viratmohan.com' + u : u) + '</a>'; });
  }
  function el(cls, html) { var d = document.createElement('div'); d.className = cls; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
  function add(role, text) { return el('vma-m ' + (role === 'user' ? 'vma-u' : 'vma-a'), linkify(text)); }
  function note() {
    return el('vma-note', '<b>Sent to Virat</b>He sees your details before any call is booked. He looks at this today, and once he says yes you get a time to pick here or on WhatsApp.');
  }
  var HELLO = "Hi, I'm Virat's AI assistant.";
  var ASK = "I help founders get a working online business live in 3–7 days after signing, run for them, with results every Monday. What do you sell?";
  function render() {
    log.innerHTML = '';
    el('vma-hello', HELLO);
    state.messages.forEach(function (m, i) { if (i === 0 && m.role === 'assistant' && m.content === ASK) { add('assistant', ASK); return; } add(m.role, m.content); });
    if (state.escalated) note();
  }

  var last = null;
  function focusables() { return Array.prototype.slice.call(panel.querySelectorAll('button,a[href],textarea,[tabindex]:not([tabindex="-1"])')).filter(function (x) { return !x.disabled; }); }
  function open() {
    if (root.classList.contains('vma-open')) { input.focus(); return; }
    last = document.activeElement;
    root.classList.add('vma-open'); document.documentElement.classList.add('vma-lock');
    panel.setAttribute('aria-hidden', 'false'); btn.setAttribute('aria-expanded', 'true');
    if (!state.messages.length) { state.messages.push({ role: 'assistant', content: ASK }); save(); }
    render(); setTimeout(function () { input.focus(); }, 60);
  }
  function close() {
    root.classList.remove('vma-open'); document.documentElement.classList.remove('vma-lock');
    panel.setAttribute('aria-hidden', 'true'); btn.setAttribute('aria-expanded', 'false');
    (last && last.focus ? last : btn).focus();
  }
  btn.onclick = open;
  window.vmOpenChat = open;
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('[data-chat]'); if (a) { e.preventDefault(); open(); } });
  root.querySelector('.vma-x').onclick = close;
  panel.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables(); if (!f.length) return;
    var first = f[0], end = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
  });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.onsubmit(e); } });
  input.addEventListener('input', function () { input.style.height = '46px'; input.style.height = Math.min(input.scrollHeight + 2, 120) + 'px'; });

  var busy = false;
  form.onsubmit = function (e) {
    e.preventDefault(); var q = input.value.trim(); if (!q || busy) return;
    busy = true; send.disabled = true; input.value = ''; input.style.height = '46px';
    state.messages.push({ role: 'user', content: q }); save(); add('user', q);
    var typing = el('vma-m vma-a vma-typing', '<span></span><span></span><span></span>');
    typing.setAttribute('aria-label', 'Typing');
    // API expects the conversation to start with a user turn; drop the local greeting.
    var msgs = state.messages.slice(state.messages[0].role === 'assistant' ? 1 : 0);
    fetch('/retail-os/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: state.id, page: location.pathname, messages: msgs }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var t = d.reply || "Sorry, something broke on my side. Message Virat directly on WhatsApp: " + WA;
        typing.remove(); state.messages.push({ role: 'assistant', content: t }); add('assistant', t);
        if (d.escalated && !state.escalated) { state.escalated = true; note(); }
        save();
      })
      .catch(function () { typing.remove(); add('assistant', 'The connection dropped. Try again, or message Virat directly on WhatsApp: ' + WA); })
      .finally(function () { busy = false; send.disabled = false; input.focus(); });
  };
  var lock = document.createElement('style'); lock.textContent = '@media (max-width:560px){html.vma-lock,html.vma-lock body{overflow:hidden}}'; document.head.appendChild(lock);
  if (/[?&]chat=1/.test(location.search)) open();
})();
