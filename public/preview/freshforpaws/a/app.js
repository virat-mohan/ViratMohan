/* Fresh For Paws mockup A: shared pieces (catalogue, cart, header cart button).
   Everything is read from catalogue.json (synced from the WooCommerce Store API by scripts/ffp-catalogue.mjs),
   so a price changed in WooCommerce changes here after a sync. The cart is a local stand-in for WooCommerce's
   cart: on the live site WooCommerce owns the cart, checkout (Razorpay) and orders. */
(function(){
  var KEY='ffpCart', mem=[];
  function load(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return mem}}
  function save(c){try{localStorage.setItem(KEY,JSON.stringify(c))}catch(e){mem=c}document.dispatchEvent(new CustomEvent('ffp:cart'))}
  var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
  var rs=function(n){return '₹'+Math.round(n).toLocaleString('en-IN')};
  var catP=null;
  function catalogue(){return catP||(catP=fetch('../catalogue.json').then(function(r){return r.json()}))}
  // Words the brand book keeps off the page until Srishti confirms them.
  var BANNED=/grain[\s-]*free|human[\s-]*grade|preservative|aafco|vet[\s-]*(formulated|approved|recommended)/i;
  function safeText(t){return String(t||'').split(/(?<=[.!?])\s+/).filter(function(x){return !BANNED.test(x)}).join(' ')}
  function toast(msg){var t=document.getElementById('ffpToast');if(!t){t=document.createElement('div');t.id='ffpToast';t.setAttribute('role','status');document.body.appendChild(t)}t.textContent=msg;t.className='show';clearTimeout(toast.h);toast.h=setTimeout(function(){t.className=''},2200)}
  var Cart={
    items:load,
    add:function(it){var c=load(),k=it.id+':'+(it.size||''),f=c.filter(function(x){return x.key===k})[0];
      if(f)f.qty+=it.qty||1;else c.push({key:k,id:it.id,vid:it.vid||null,name:it.name,size:it.size||'',price:it.price,qty:it.qty||1,image:it.image||'',url:it.url||''});
      save(c);toast((it.qty||1)+' × '+it.name+(it.size?' '+it.size:'')+' added to cart')},
    set:function(k,q){save(load().map(function(x){if(x.key===k)x.qty=Math.max(0,q);return x}).filter(function(x){return x.qty>0}))},
    clear:function(){save([])},
    count:function(){return load().reduce(function(n,x){return n+x.qty},0)},
    subtotal:function(){return load().reduce(function(n,x){return n+x.price*x.qty},0)}
  };
  function badge(){var n=Cart.count();Array.prototype.forEach.call(document.querySelectorAll('.cartN'),function(e){e.textContent=n;e.hidden=!n})}
  function header(){
    var nav=document.querySelector('header.nav'); if(!nav||nav.querySelector('.cartbtn')) return;
    var a=document.createElement('a'); a.className='cartbtn'; a.href='cart.html'; a.setAttribute('aria-label','Cart');
    a.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg><span class="cartN" hidden>0</span>';
    var m=nav.querySelector('.mnav'); if(m) nav.insertBefore(a,m); else nav.appendChild(a);
    var md=nav.querySelector('.mnav div'); if(md){var l=document.createElement('a');l.href='cart.html';l.innerHTML='Cart <span class="cartN" hidden>0</span>';md.appendChild(l)}
    badge();
  }
  document.addEventListener('ffp:cart',badge); window.addEventListener('storage',badge);
  if(document.readyState!=='loading') header(); else document.addEventListener('DOMContentLoaded',header);
  window.FFP={catalogue:catalogue,Cart:Cart,rs:rs,esc:esc,safeText:safeText,toast:toast,FREE_FROM:1000,
    price:function(p,size){var s=p.sizes.filter(function(x){return x.size===size})[0];return s?s.price:null},
    from:function(p){return Math.min.apply(null,p.sizes.map(function(s){return s.price}))},
    wooAdd:function(p,s){return 'https://freshforpaws.com/?add-to-cart='+p.id+(s&&s.vid?'&variation_id='+s.vid+'&attribute_size='+encodeURIComponent(s.size):'')+'&quantity=1'},
    kind:function(p){return p.group==='puppy'?'Mini Paws · puppies':p.species==='cat'?(p.group==='topper'?'Cats · topper':'Fresh For Purrs · cats'):(p.group==='topper'?'Dogs · topper':p.group==='treat'?'Dogs · treat':p.group==='combo'?'Dogs · combo':'Dogs · meal')},
    card:function(p){var f=p.species==='cat'?'../img/range-cats.webp':'../img/range-dogs.webp';
      var pr=p.sizes.map(function(s){return (s.size?esc(s.size)+' · ':'')+rs(s.price)}).join(' <small>| ')+(p.sizes.length>1?'</small>':'');
      return '<a class="card" href="recipe.html?id='+p.id+'"><img src="'+esc(p.image||f)+'" alt="'+esc(p.name)+'" loading="lazy" width="400" height="400" onerror="this.onerror=null;this.src=\''+f+'\'"><div class="info"><b>'+esc(p.name)+'</b><span>'+esc(FFP.kind(p))+'</span><span class="price">'+pr+'</span></div></a>'}
  };
})();
