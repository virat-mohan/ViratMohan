/* Shop grid for Mockup A, drawn from catalogue.json (synced from the WooCommerce Store API by scripts/ffp-catalogue.mjs). */
(function(){
  var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
  var rs=function(n){return '₹'+Math.round(n).toLocaleString('en-IN')};
  var SECTIONS=[
    ['Dog meals',function(p){return p.species==='dog'&&p.group==='meal'}],
    ['Fresh For Purrs: cat meals',function(p){return p.species==='cat'&&p.group==='meal'}],
    ['Mini Paws: puppy meals',function(p){return p.group==='puppy'}],
    ['Toppers',function(p){return p.group==='topper'}],
    ['Treats',function(p){return p.group==='treat'}],
    ['Combos',function(p){return p.group==='combo'}]
  ];
  fetch('../catalogue.json').then(function(r){return r.json()}).then(function(d){
    var h='';
    SECTIONS.forEach(function(sec,i){
      var items=d.products.filter(sec[1]); if(!items.length)return;
      h+='<h3 style="margin:'+(i?'40px':'0')+' 0 20px;color:var(--ffp-teal)">'+esc(sec[0])+'</h3><div class="grid">';
      items.forEach(function(p){
        var f=p.species==='cat'?'../img/range-cats.webp':'../img/range-dogs.webp';
        var price=p.sizes.map(function(s){return (s.size?esc(s.size)+' · ':'')+rs(s.price)}).join(' <small>| ')+(p.sizes.length>1?'</small>':'');
        h+='<a class="card" href="recipe.html"><img src="'+esc(p.image||f)+'" alt="'+esc(p.name)+'" loading="lazy" onerror="this.onerror=null;this.src=\''+f+'\'"><div class="info"><b>'+esc(p.name)+'</b><span>'+(p.species==='cat'?'Cats':'Dogs')+'</span><span class="price">'+price+'</span></div></a>';
      });
      h+='</div>';
    });
    document.getElementById('shopGrid').innerHTML=h;
    document.getElementById('shopSrc').textContent='Menu, prices and pictures read from '+d.source+' on '+new Date(d.readAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})+'.';
  }).catch(function(){document.getElementById('shopGrid').innerHTML='<p>The menu could not be loaded. Reload the page.</p>'});
})();
