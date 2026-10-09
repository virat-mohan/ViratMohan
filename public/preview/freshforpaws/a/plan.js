/* Fresh For Paws "Tell us about your dog" plan builder (Mockup A).
   The menu, sizes, prices and pictures are read from catalogue.json, which scripts/ffp-catalogue.mjs
   syncs from the WooCommerce Store API. Calories per recipe are NOT in WooCommerce: until Srishti sends
   them, the feeding amount uses a placeholder, marked "sample" on screen. */
(function(){
  var TIERS = [ // proposed, Virat decides
    {id:'bundle', label:'One-time bundle', disc:0.05, days:14, when:'delivered once'},
    {id:'weekly', label:'Every week', disc:0.08, days:7, when:'delivered every week'},
    {id:'fortnight', label:'Twice a month', disc:0.10, days:15, when:'delivered twice a month'},
    {id:'monthly', label:'Every month', disc:0.12, days:30, when:'delivered every month'}
  ];
  var SAMPLE_KCAL = 125; // kcal per 100 g, placeholder until recipe sheets arrive
  var SIZE = {small:{puppy:10,senior:9}, medium:{puppy:12,senior:8}, large:{puppy:15,senior:7}, giant:{puppy:18,senior:6}};
  var BREEDS = [['Indian Pariah (Indie)','medium'],['Labrador Retriever','large'],['Golden Retriever','large'],['German Shepherd','large'],['Beagle','medium'],['Pug','small'],['Shih Tzu','small'],['Lhasa Apso','small'],['Pomeranian','small'],['Dachshund','small'],['Cocker Spaniel','medium'],['Boxer','large'],['Rottweiler','large'],['Doberman','large'],['Siberian Husky','large'],['Labrador cross','large'],['Spitz (Indian)','small'],['French Bulldog','small'],['Great Dane','giant'],['Saint Bernard','giant'],['Mixed breed, small','small'],['Mixed breed, medium','medium'],['Mixed breed, large','large']];
  // What each recipe is, in plain terms (not stored in WooCommerce). Key = product name as sold.
  var INFO = {
    'Chicken Pot Pie':{kind:'meat',has:['chicken'],tag:'Chicken',why:'A familiar single-protein meal that most adult dogs take to.'},
    'Eggstravaganza':{kind:'meat',has:['egg'],tag:'Egg',why:'Egg is a digestible protein and a change for a dog that tires of one recipe.'},
    'Fish Supper':{kind:'meat',has:['fish'],tag:'Fish',why:'Lean and listed as low in fat and calories, which suits a dog watching its weight. Fish also brings omega-3 fats.'},
    'Lamb On The Go':{kind:'meat',has:['lamb'],tag:'Lamb',why:'A different protein for a dog that does not do well on chicken.'},
    'Wholesome Goat Feast':{kind:'meat',has:['goat'],tag:'Goat',why:'High protein and listed as low in calories, so it suits a dog watching its weight.'},
    'Go Go Cottage Cheese':{kind:'veg',has:['dairy'],tag:'Vegetarian',why:'A vegetarian protein source for dogs that do not eat meat.'},
    'Pumpkin It Up':{kind:'vegan',has:[],tag:'Plant-based',why:'Plant protein with pumpkin fibre, gentle on the tummy.'},
    'Oh My Greens':{kind:'vegan',has:[],tag:'Plant-based',why:'The lightest plant recipe, a good partner to rotate with.'},
    'A Green Affair':{kind:'vegan',has:[],tag:'Plant-based',why:'A third plant recipe so a dog is not eating one meal on repeat.'}
  };
  var $=function(id){return document.getElementById(id)};
  var rs=function(n){return '₹'+Math.round(n).toLocaleString('en-IN')};
  var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
  var cat=null, menu=[], puppy=null, topper=null, st={rot:3};

  function price(p,size){var s=p.sizes.filter(function(x){return x.size===size})[0];return s?s.price:null}
  function imgTag(p,alt){var f=p.species==='cat'?'../img/range-cats.webp':'../img/range-dogs.webp';
    return p.image?'<img src="'+esc(p.image)+'" alt="'+esc(alt||p.name)+'" loading="lazy" onerror="this.onerror=null;this.src=\''+f+'\'">':'<img src="'+f+'" alt="'+esc(alt||p.name)+'" loading="lazy">'}

  fetch('../catalogue.json').then(function(r){return r.json()}).then(function(d){
    cat=d;
    d.products.forEach(function(p){
      if(p.species==='dog' && p.group==='meal' && INFO[p.name] && price(p,'100g') && price(p,'300g')){var i=INFO[p.name];menu.push({p:p,id:p.name,kind:i.kind,has:i.has,tag:i.tag,why:i.why,p100:price(p,'100g'),p300:price(p,'300g')})}
      if(p.group==='puppy') puppy={p:p,id:p.name,kind:'puppy',has:['chicken'],tag:'Puppy',why:'The puppy recipe on our menu, listed as complete and balanced.',p100:price(p,'100g'),p300:price(p,'300g')};
      if(p.name.indexOf('Liv-Love')===0 && p.species==='dog' && p.group==='topper' && !topper) topper={p:p,price:p.sizes[0].price,size:p.sizes[0].size};
    });
    $('pbSrc').textContent='Menu, prices and pictures read from '+d.source+' on '+new Date(d.readAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})+'. Calories per recipe are not in the store yet, so feeding amounts use a placeholder.';
    $('pbGo1').disabled=false;
  }).catch(function(){$('pbSrc').textContent='The menu could not be loaded. Reload the page.'});
  $('pbGo1').disabled=true;

  BREEDS.forEach(function(b,i){var o=document.createElement('option');o.value=i;o.textContent=b[0];$('pbBreed').appendChild(o)});
  $('pbBreed').value=1;
  for(var y=0;y<=18;y++){var o=document.createElement('option');o.value=y;o.textContent=y+(y===1?' year':' years');if(y===4)o.selected=true;$('pbY').appendChild(o)}
  for(var m=0;m<12;m++){var o2=document.createElement('option');o2.value=m;o2.textContent=m+(m===1?' month':' months');if(m===6)o2.selected=true;$('pbM').appendChild(o2)}
  function val(n){var e=document.querySelector('input[name='+n+']:checked');return e?e.value:null}

  function stage(sz,months){var c=SIZE[sz];return months<c.puppy?'puppy':(months>=c.senior*12?'senior':'adult')}
  function energy(p){
    var rer=70*Math.pow(p.kg,0.75), f, why;
    if(p.stage==='puppy'){ if(p.months<4){f=3.0;why='puppy under 4 months'} else {f=2.0;why='puppy from 4 months'} }
    else if(p.bcs==='over'){f=1.2;why='overweight: a gentle weight-loss start'}
    else if(p.bcs==='thin'){f=1.8;why='thin: a build-up start'}
    else if(p.stage==='senior'){f=1.4;why='senior dog'}
    else if(p.neut==='yes'){f=1.6;why='neutered adult'}
    else {f=1.8;why='intact adult'}
    return {rer:rer,f:f,why:why,kcal:rer*f};
  }
  function pick(p){
    if(p.stage==='puppy'){var ok=p.avoid.indexOf('chicken')<0&&puppy;return {list:ok?[puppy]:[],blocked:!ok}}
    var pool=menu.filter(function(r){
      if(p.pref==='veg'&&r.kind==='meat')return false;
      if(p.pref==='vegan'&&r.kind!=='vegan')return false;
      return !r.has.some(function(h){return p.avoid.indexOf(h)>=0});
    });
    var order=p.bcs==='over'?['Fish Supper','Wholesome Goat Feast','Oh My Greens','Pumpkin It Up','Chicken Pot Pie','Eggstravaganza','Lamb On The Go','Go Go Cottage Cheese','A Green Affair']
      :p.stage==='senior'?['Fish Supper','Chicken Pot Pie','Eggstravaganza','Wholesome Goat Feast','Pumpkin It Up','Lamb On The Go','Go Go Cottage Cheese','Oh My Greens','A Green Affair']
      :['Chicken Pot Pie','Fish Supper','Eggstravaganza','Lamb On The Go','Wholesome Goat Feast','Go Go Cottage Cheese','Pumpkin It Up','A Green Affair','Oh My Greens'];
    pool.sort(function(a,b){return order.indexOf(a.id)-order.indexOf(b.id)});
    return {list:pool.slice(0,3),blocked:false};
  }
  function packs(g){var n3=Math.floor(g/300),rem=g-n3*300,n1=Math.ceil(rem/100);if(n1>=3){n3++;n1=0}return {n3:n3,n1:n1}}
  function meals(p){return p.stage==='puppy'?(p.months<4?4:(p.months<6?3:2)):2}
  // Day-by-day schedule: one recipe a day, changed every `rot` days, rotation continuing across deliveries.
  function schedule(list,kcal,days,rot,p){
    var gDay=kcal/(SAMPLE_KCAL/100), M=meals(p), perMeal=Math.round(gDay/M/5)*5, rows=[], by={};
    for(var d=0;d<days;d++){
      var r=list[Math.floor(d/rot)%list.length];
      rows.push({day:d+1,r:r,g:gDay,meals:M,perMeal:perMeal});
      by[r.id]=(by[r.id]||0)+gDay;
    }
    return {rows:rows,by:by,gDay:gDay,meals:M,perMeal:perMeal};
  }
  function cost(list,kcal,days,rot,p){
    var sch=schedule(list,kcal,days,rot,p), lines=[], sum=0, total=0;
    list.forEach(function(r){
      var g=sch.by[r.id]||0; if(!g)return;
      var pk=packs(g), c=pk.n3*r.p300+pk.n1*r.p100;
      lines.push({r:r,pk:pk,cost:c,grams:g}); sum+=c; total+=pk.n3+pk.n1;
    });
    return {lines:lines,sum:sum,sch:sch,packs:total};
  }
  function show(n){
    ['s1','s2','s3','s4'].forEach(function(id,i){$(id).classList.toggle('pb-hide',i!==n-1)});
    Array.prototype.forEach.call($('pbSteps').children,function(li,i){li.className=i===n-1?'on':(i<n-1?'done':'')});
    $('pbSteps').scrollIntoView({behavior:'smooth',block:'start'});
  }


  var STEPNAMES=['Tell us about your dog','Your plan','Review'];
  function crumbs(n){
    var ol=$('crumbs'); ol.innerHTML='<li><a href="index.html">Home</a></li><li><a href="plan.html">Build a plan</a></li>';
    if(n===1) ol.innerHTML+='<li aria-current="page">Tell us about your dog</li>';
    else { ol.innerHTML+='<li><a href="#" data-go="1">Tell us about your dog</a></li>'; if(n===2) ol.innerHTML+='<li aria-current="page">Your plan</li>'; else ol.innerHTML+='<li><a href="#" data-go="2">Your plan</a></li><li aria-current="page">Review</li>'; }
    Array.prototype.forEach.call(ol.querySelectorAll('[data-go]'),function(a){a.onclick=function(e){e.preventDefault();go(+a.getAttribute('data-go'))}});
  }
  var cur=1;
  function go(n,push){
    cur=n;
    ['s1','s2','s3'].forEach(function(id,i){$(id).classList.toggle('pb-hide',i!==n-1)});
    Array.prototype.forEach.call($('pbSteps').children,function(li,i){li.className=i===n-1?'on':(i<n-1?'done':'');if(i===n-1)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current')});
    $('pbTitle').textContent=n===1?'Tell us about your dog':(n===2?st.name+'\'s plan':'Review '+st.name+'\'s plan');
    $('pbLead').classList.toggle('pb-hide',n!==1);
    $('pbBar').classList.toggle('pb-hide',n!==2);
    crumbs(n); document.title=STEPNAMES[n-1]+' · Fresh For Paws · Mockup A';
    if(push!==false){try{history.pushState({n:n},'','#'+['dog','plan','review'][n-1])}catch(e){}}
    window.scrollTo({top:0,behavior:'auto'});
    var h=$('pbTitle'); h.setAttribute('tabindex','-1'); h.focus({preventScroll:true});
  }
  window.addEventListener('popstate',function(e){var n=(e.state&&e.state.n)||1; if(n>1&&!st.rec){n=1} go(n,false)});

  $('pbGo1').onclick=function(){
    var b=BREEDS[+$('pbBreed').value], months=(+$('pbY').value)*12+(+$('pbM').value), kg=parseFloat($('pbKg').value), sx=(val('sex')||'m-yes').split('-');
    if(!(kg>0)||kg>90){$('pbKg').setCustomValidity('Enter a weight between 1 and 90 kg');$('pbKg').reportValidity();return}
    $('pbKg').setCustomValidity('');
    st={name:($('pbName').value||'Your dog').trim(),breed:b[0],size:b[1],months:months,kg:kg,sex:sx[0]==='m'?'male':'female',neut:sx[1],bcs:val('bcs'),pref:val('pref'),rot:3,tier:'fortnight',
        avoid:Array.prototype.map.call(document.querySelectorAll('#pbAvoid input:checked'),function(e){return e.value})};
    st.stage=stage(st.size,st.months); st.en=energy(st); st.rec=pick(st);
    plan(); go(2);
  };

  function plan(){
    var p=st,en=p.en,g=en.kcal/(SAMPLE_KCAL/100), M=meals(p), per=Math.round(g/M/5)*5;
    var stg={puppy:'a puppy',adult:'an adult',senior:'a senior'}[p.stage];
    var h='<p class="pb-sum"><b>'+esc(p.name)+'</b> is '+stg+' and needs about <b>'+Math.round(en.kcal)+' kcal</b> a day: around <b>'+Math.round(g)+' g</b> of food <span class="pb-sample">sample</span> in <b>'+M+' meals of '+per+' g</b>.</p>';
    if(p.stage==='puppy'&&(p.size==='large'||p.size==='giant'))h+='<div class="pb-note warn"><b>To confirm with Fresh For Paws:</b> large and giant breed puppies need a controlled calcium level. The puppy recipe must be confirmed for them before this plan is sold.</div>';
    if(p.rec.blocked)h+='<div class="pb-note warn">The only puppy recipe contains chicken, which you asked us to leave out. We will suggest a plan by message instead.</div>';
    if(p.pref==='vegan')h+='<div class="pb-note warn">Plant-only diets need careful balance. Please keep your vet in the loop.</div>';
    if(!p.rec.list.length){h+='<p>No recipe on the menu fits those choices yet.</p><div class="pb-actions"><button class="btn outline" id="b2" type="button">Back</button></div>';$('s2').innerHTML=h;$('b2').onclick=function(){history.back()};return}
    h+='<h2 class="pb-h">Meals we chose, and why</h2><div class="pb-recipes">';
    p.rec.list.forEach(function(r){h+='<div class="pb-rec">'+imgTag(r.p)+'<div class="in"><span class="tag">'+esc(r.tag)+'</span><h3>'+esc(r.id)+'</h3><p>'+esc(r.why)+'</p></div></div>'});
    h+='</div><h2 class="pb-h">How would you like to buy?</h2><div class="pb-plans" id="pbPlans"></div><p class="pb-fine" id="pbShip"></p>';
    h+='<details class="pb-opt"><summary>Change how often the recipe rotates</summary><div class="pb-chips" style="margin-top:10px">';
    [[1,'Every day'],[3,'Every 3 days'],[7,'Every week']].forEach(function(o){h+='<label class="pb-chip"><input type="radio" name="rot" value="'+o[0]+'"'+(p.rot===o[0]?' checked':'')+'><span>'+o[1]+'</span></label>'});
    h+='</div><p class="pb-fine">Every recipe is complete and balanced on its own, so rotating is for variety, not for nutrition. Dogs with sensitive tummies do best changing slowly.</p></details>';
    h+='<details class="pb-opt"><summary>How we worked this out</summary><div class="pb-how"><p>Resting energy is 70 × '+p.kg+'^0.75 = <b>'+Math.round(en.rer)+' kcal</b>. The life-stage factor is <b>× '+en.f.toFixed(1)+'</b> ('+esc(en.why)+'), so <b>'+Math.round(en.kcal)+' kcal</b> a day. '+esc(p.breed)+' is a '+p.size+' breed: under '+SIZE[p.size].puppy+' months is a puppy and over '+SIZE[p.size].senior+' years is senior.</p><ul><li><b>Energy.</b> The formula is in the NRC\'s Nutrient Requirements of Dogs and Cats (2006) and the WSAVA nutrition guidelines.</li><li><b>Factors.</b> 1.6 neutered adult, 1.8 not neutered, 3.0 puppy under 4 months, 2.0 puppy from 4 months (Hand et al., <i>Small Animal Clinical Nutrition</i>).</li><li><b>Body shape.</b> Rib and waist feel is the idea behind the 9-point body condition score vets use.</li><li><b>What we leave out.</b> Anything you tick. Chicken, dairy, beef and wheat are the foods most often reported as allergens in dogs.</li></ul><div class="pb-note warn"><b>A starting point, not veterinary advice.</b> A vet adjusts these figures for each dog. Dogs with a health condition, pregnant or nursing dogs, and dogs gaining or losing weight fast should follow their vet\'s plan.</div></div></details>';
    h+='<div class="pb-actions"><button class="btn outline" id="b2" type="button">Back</button><button class="btn" id="n2" type="button">Review</button></div>';
    $('s2').innerHTML=h;
    Array.prototype.forEach.call(document.querySelectorAll('input[name=rot]'),function(e){e.onchange=function(){p.rot=+e.value;plans()}});
    $('b2').onclick=function(){history.back()}; $('n2').onclick=function(){review();go(3)}; $('pbBarGo').onclick=$('n2').onclick;
    plans();
  }
  function plans(){
    var p=st, h='';
    TIERS.forEach(function(t){
      var c=cost(p.rec.list,p.en.kcal,t.days,p.rot,p); t.c=c; t.list=c.sum; t.net=c.sum*(1-t.disc);
      h+='<label class="pb-plan'+(t.id===p.tier?' sel':'')+'" id="pl-'+t.id+'"><input type="radio" name="tier" value="'+t.id+'"'+(t.id===p.tier?' checked':'')+'><h3>'+t.label+'</h3><span class="pb-save">'+Math.round(t.disc*100)+'% off</span><div class="big">'+rs(t.net)+'</div><s>'+rs(t.list)+'</s><p>'+t.days+' days of food · '+c.packs+' packs</p><p class="sh">'+(t.net>=1000?'Free shipping':'Plus shipping')+'</p></label>';
    });
    $('pbPlans').innerHTML=h;
    Array.prototype.forEach.call(document.querySelectorAll('input[name=tier]'),function(e){e.onchange=function(){p.tier=e.value;plans()}});
    var t=TIERS.filter(function(x){return x.id===p.tier})[0];
    $('pbShip').textContent='Orders of ₹1,000 and above ship free, cost inside the price. Orders up to ₹999 pay shipping at the Shiprocket rate, shown at checkout. Prepaid only: UPI or card, no cash on delivery.';
    $('pbBarPrice').textContent=rs(t.net)+' · '+t.label.toLowerCase(); $('pbBarSub').textContent=t.days+' days of food'+(t.net>=1000?', free shipping':', plus shipping');
  }
  function review(){
    var p=st,t=TIERS.filter(function(x){return x.id===p.tier})[0],c=t.c,sch=c.sch;
    var h='<div class="pb-scroll"><table class="pb-table"><thead><tr><th>Recipe</th><th class="n">300 g</th><th class="n">100 g</th><th class="n">Price</th></tr></thead><tbody>';
    c.lines.forEach(function(l){h+='<tr><td>'+esc(l.r.id)+'</td><td class="n">'+l.pk.n3+'</td><td class="n">'+l.pk.n1+'</td><td class="n">'+rs(l.cost)+'</td></tr>'});
    h+='<tr><td colspan="3">Menu price</td><td class="n">'+rs(t.list)+'</td></tr><tr><td colspan="3">'+t.label+', '+Math.round(t.disc*100)+'% off</td><td class="n">− '+rs(t.list-t.net)+'</td></tr><tr><td colspan="3"><b>You pay each time</b></td><td class="n"><b>'+rs(t.net)+'</b></td></tr></tbody></table></div>';
    h+='<p class="pb-fine">'+(t.net>=1000?'Shipping is free on this order.':'Shipping is added at the Shiprocket rate for your pincode. Add '+rs(1000-t.net)+' more and it ships free.')+(t.id!=='bundle'?' About '+rs(t.net*30/t.days)+' a month, against '+rs(t.list*30/t.days)+' at menu price.':'')+'</p>';
    h+='<h2 class="pb-h">Feeding calendar</h2><p class="pb-fine" style="margin-top:0">'+esc(p.name)+' eats '+Math.round(sch.gDay)+' g a day <span class="pb-sample">sample</span> in '+sch.meals+' meals of about '+sch.perMeal+' g.</p><div class="pb-cal" id="pbCal"></div><div class="pb-actions" style="margin-top:12px"><button class="btn outline small" id="calMore" type="button">Show 14 days</button></div>';
    h+='<details class="pb-opt"><summary>Why we feed it this way</summary><ul class="pb-how"><li><b>Meals a day.</b> Adults do well on two. Puppies need smaller, more frequent meals: four under four months, three until about six months, then two (common veterinary guidance, including the WSAVA).</li><li><b>Same times each day.</b> A steady routine helps digestion and makes a change in appetite easy to spot.</li><li><b>Switching recipes.</b> Mix the new food in over 7 to 10 days: a quarter new on days 1 to 3, half on days 4 to 6, three quarters on days 7 to 9, then all.</li><li><b>Treats and toppers.</b> No more than about 10% of the day\'s calories.</li><li><b>Weigh every month.</b> We re-size the food when weight or age changes. If weight moves more than about 5% in a month, talk to your vet.</li></ul></details>';
    h+='<div class="pb-note"><b>What you can count on.</b> A message the day before each charge with a link to skip, pause, swap a recipe or cancel. Prepaid only, no cash on delivery.</div>';
    h+='<div class="pb-note warn"><b>For Virat and Srishti, not shown to customers.</b> At this price the product share (25% of the sale) is '+rs(t.net*0.25)+' per delivery. The food in this plan must cost less than that to make.</div>';
    h+='<div class="pb-actions"><button class="btn outline" id="b3" type="button">Back</button><button class="btn" id="n3" type="button">Place the order (demo)</button></div><p id="pbDone" class="pb-fine"></p>';
    $('s3').innerHTML=h;
    var shown=7; function cal(){var o='';sch.rows.slice(0,Math.min(shown,t.days)).forEach(function(r){o+='<div class="pb-day"><span class="d">Day '+r.day+'</span><b>'+esc(r.r.id)+'</b><span>'+r.meals+' × '+r.perMeal+' g</span></div>'});$('pbCal').innerHTML=o;$('calMore').hidden=(t.days<=shown);} cal();
    $('calMore').onclick=function(){shown=14;cal()};
    $('b3').onclick=function(){history.back()}; $('n3').onclick=function(){$('pbDone').textContent='Demo only: nothing was charged and no order was created. The live build opens Razorpay, then sets up the repeat schedule.'};
  }
  try{var hh=location.hash; if(hh==='#plan'||hh==='#review'){history.replaceState({n:1},'','#dog')}}catch(e){}
  crumbs(1);
})();
