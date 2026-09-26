/* Virat's AI assistant: website chat. Include with <script src="/assistant.js" defer></script>. */
(function () {
  if (window.__vmAssistant) return; window.__vmAssistant = true;
  var KEY = 'vm-assistant';
  var state; try { state = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!state) state = { id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()), messages: [] };
  var save = function () { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
  var WA = 'https://wa.me/919999277240?text=' + encodeURIComponent("Hi Virat, I was chatting with your assistant. Let's talk.");

  var css = document.createElement('style');
  css.textContent = [
    '.vma-btn{position:fixed;left:20px;bottom:20px;z-index:70;display:flex;align-items:center;gap:10px;padding:12px 18px 12px 12px;background:#1a1410;color:#f4ead4;border:1px solid #d4af37;border-radius:999px;font:600 14px/1 Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 14px 30px -10px rgba(23,19,15,.5)}',
    '.vma-btn i{width:30px;height:30px;border-radius:50%;background:#d9714b;display:grid;place-items:center;font:400 15px/1 Anton,Impact,sans-serif;color:#f4ead4;font-style:normal}',
    '.vma-panel{position:fixed;left:20px;bottom:20px;z-index:71;width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 40px));display:none;flex-direction:column;background:#f4ead4;border:1px solid #1a1410;border-radius:16px;overflow:hidden;box-shadow:0 24px 50px -16px rgba(23,19,15,.55);font:400 14.5px/1.45 Inter,system-ui,sans-serif;color:#1a1410}',
    '.vma-open .vma-panel{display:flex}.vma-open .vma-btn{display:none}',
    '.vma-head{background:#1a1410;color:#f4ead4;padding:14px 16px;display:flex;align-items:center;gap:10px}',
    '.vma-head b{font:400 18px/1 Anton,Impact,sans-serif;text-transform:uppercase;letter-spacing:.02em}.vma-head small{display:block;color:#d9714b;font:700 10px/1.2 Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase;margin-top:4px}',
    '.vma-x{margin-left:auto;background:none;border:0;color:#f4ead4;font-size:22px;cursor:pointer;opacity:.7}',
    '.vma-log{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background-image:radial-gradient(rgba(23,19,15,.08) 1px,transparent 1px);background-size:14px 14px}',
    '.vma-m{max-width:85%;padding:10px 12px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}',
    '.vma-a{background:#fff8ea;border:1px solid rgba(23,19,15,.14);align-self:flex-start}.vma-u{background:#1a1410;color:#f4ead4;align-self:flex-end}',
    '.vma-m a{color:#d9714b;font-weight:600}',
    '.vma-row{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(23,19,15,.14);background:#f4ead4}',
    '.vma-row input{flex:1;padding:11px 12px;border:1px solid rgba(23,19,15,.25);border-radius:10px;font:inherit;background:#fffaf0;min-width:0}',
    '.vma-row button{padding:0 14px;border:0;border-radius:10px;background:#d9714b;color:#f4ead4;font:700 14px/1 Inter,sans-serif;cursor:pointer}',
    '.vma-foot{padding:0 12px 10px;font-size:11.5px;color:#5a4c3c;background:#f4ead4}.vma-foot a{color:#1a1410}',
    '@media (max-width:520px){.vma-btn{left:16px;bottom:16px}.vma-panel{left:16px;bottom:16px}}'
  ].join('');
  document.head.appendChild(css);

  var root = document.createElement('div');
  root.innerHTML = '<button class="vma-btn" type="button" aria-label="Let\'s talk: chat with Virat\'s AI assistant"><i>VM</i>Let\'s talk</button>' +
    '<div class="vma-panel" role="dialog" aria-label="Virat\'s AI assistant"><div class="vma-head"><div><b>Virat Mohan</b><small>AI assistant · Virat reviews every brand</small></div><button class="vma-x" type="button" aria-label="Close">×</button></div>' +
    '<div class="vma-log" aria-live="polite"></div><form class="vma-row"><input name="q" autocomplete="off" placeholder="What do you sell?" aria-label="Your message"><button type="submit">Send</button></form>' +
    '<div class="vma-foot">Prefer a human? <a href="' + WA + '" target="_blank" rel="noopener">Let\'s talk on WhatsApp →</a></div></div>';
  document.body.appendChild(root);
  var log = root.querySelector('.vma-log'), form = root.querySelector('form'), input = form.q;

  function linkify(t) {
    var esc = t.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
    return esc.replace(/(https?:\/\/[^\s)]+|\/(?:retail-os\/apply\/?|retail-os\/?|devshop|scs)(?=[\s.,)!?]|$))/g, function (u) { return '<a href="' + u + '" target="' + (u[0] === '/' ? '_self' : '_blank') + '" rel="noopener">' + (u[0] === '/' ? 'viratmohan.com' + u : u) + '</a>'; });
  }
  function add(role, text) { var d = document.createElement('div'); d.className = 'vma-m ' + (role === 'user' ? 'vma-u' : 'vma-a'); d.innerHTML = linkify(text); log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
  function render() { log.innerHTML = ''; state.messages.forEach(function (m) { add(m.role, m.content); }); }

  var HELLO = "Hi, I'm Virat's AI assistant. Virat personally reviews every brand, and I can get you from question to application in a few minutes. What do you sell?";
  function open() { root.classList.add('vma-open'); if (!state.messages.length) { state.messages.push({ role: 'assistant', content: HELLO }); save(); } render(); setTimeout(function () { input.focus(); }, 50); }
  root.querySelector('.vma-btn').onclick = open;
  window.vmOpenChat = open;
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('[data-chat]'); if (a) { e.preventDefault(); open(); } });
  root.querySelector('.vma-x').onclick = function () { root.classList.remove('vma-open'); };

  var busy = false;
  form.onsubmit = function (e) {
    e.preventDefault(); var q = input.value.trim(); if (!q || busy) return;
    busy = true; input.value = ''; state.messages.push({ role: 'user', content: q }); save(); add('user', q);
    var typing = add('assistant', '…');
    // API expects the conversation to start with a user turn; drop the local greeting.
    var msgs = state.messages.slice(state.messages[0].role === 'assistant' ? 1 : 0);
    fetch('/retail-os/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: state.id, page: location.pathname, messages: msgs }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { var t = d.reply || "Something went wrong on my side. Message Virat directly: " + WA; typing.remove(); state.messages.push({ role: 'assistant', content: t }); save(); add('assistant', t); })
      .catch(function () { typing.remove(); add('assistant', 'Connection dropped. Message Virat directly: ' + WA); })
      .finally(function () { busy = false; input.focus(); });
  };
  if (/[?&]chat=1/.test(location.search)) open();
})();
