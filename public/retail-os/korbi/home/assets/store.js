// KORBI preview store: a working cart kept in this browser. Checkout runs on Shopify once KORBI approves.
(function () {
  var base = document.documentElement.getAttribute('data-base') || '';
  var PRODUCTS = {
    'warm-white': { name: 'Road LED Bulbs · 4300K Warm White', img: base + 'assets/bulb-4300k.jpg', price: 11500 },
    'cool-white': { name: 'Road LED Bulbs · 6000K Cool White', img: base + 'assets/bulb-6000k.jpg', price: 11500 }
  };
  var KEY = 'korbiPreviewCart';
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
  var cart = load();
  var inr = function (n) { return '₹' + n.toLocaleString('en-IN'); };

  var d = document.createElement('div');
  d.className = 'drawer'; d.id = 'drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Your cart');
  d.innerHTML = '<div class="veil" data-close></div><div class="panel"><div class="top"><h2>Your cart</h2><button class="x" data-close aria-label="Close cart">×</button></div><div class="lines" id="lines"></div><div class="foot"><div class="sum"><span>Subtotal</span><span id="sub"></span></div><p class="note">Taxes included. Free shipping to be confirmed by KORBI.</p><button class="btn full" id="checkout" type="button">Checkout</button><p class="note">This is a preview for KORBI\'s approval. Checkout opens on the live store.</p></div></div>';
  document.body.appendChild(d);
  var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t);
  function toast(m) { t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove('on'); }, 2200); }

  function render() {
    var lines = document.getElementById('lines'), count = 0, sub = 0;
    lines.innerHTML = '';
    if (!cart.length) lines.innerHTML = '<p class="empty">Your cart is empty.</p>';
    cart.forEach(function (l, i) {
      var p = PRODUCTS[l.id]; if (!p) return;
      count += l.qty; sub += l.qty * p.price;
      var el = document.createElement('div'); el.className = 'line';
      el.innerHTML = '<img src="' + p.img + '" alt=""><div><p>' + p.name + '<small>Holder type: ' + l.holder + '</small></p><div class="qty"><button data-i="' + i + '" data-d="-1" aria-label="One less">−</button><span>' + l.qty + '</span><button data-i="' + i + '" data-d="1" aria-label="One more">+</button></div><br><button class="rm" data-rm="' + i + '">Remove</button></div><p>' + inr(l.qty * p.price) + '</p>';
      lines.appendChild(el);
    });
    document.getElementById('sub').textContent = inr(sub);
    document.querySelectorAll('[data-count]').forEach(function (b) { b.textContent = count; b.hidden = !count; });
    save(cart);
  }
  function open() { d.classList.add('open'); d.querySelector('.x').focus(); }
  function close() { d.classList.remove('open'); }
  d.addEventListener('click', function (e) {
    var x = e.target;
    if (x.hasAttribute('data-close')) return close();
    if (x.dataset.d) { var l = cart[+x.dataset.i]; l.qty = Math.max(1, Math.min(10, l.qty + +x.dataset.d)); render(); }
    if (x.dataset.rm) { cart.splice(+x.dataset.rm, 1); render(); }
  });
  document.getElementById('checkout').addEventListener('click', function () { toast(cart.length ? 'Preview only: checkout goes live on Shopify after approval.' : 'Your cart is empty.'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  document.querySelectorAll('[data-open-cart]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); open(); }); });

  window.korbiAdd = function (id, holder, qty) {
    var hit = cart.find(function (l) { return l.id === id && l.holder === holder; });
    if (hit) hit.qty = Math.min(10, hit.qty + qty); else cart.push({ id: id, holder: holder, qty: qty });
    render(); open();
  };
  render();
})();
