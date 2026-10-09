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

  $('pbGo1').onclick=function(){
    var b=BREEDS[+$('pbBreed').value], months=(+$('pbY').value)*12+(+$('pbM').value), kg=parseFloat($('pbKg').value);
    if(!(kg>0)||kg>90){$('pbKg').setCustomValidity('Enter a weight between 1 and 90 kg');$('pbKg').reportValidity();return}
    $('pbKg').setCustomValidity('');
    st={name:($('pbName').value||'Your dog').trim(),breed:b[0],size:b[1],months:months,kg:kg,sex:val('sex'),neut:val('neut'),bcs:val('bcs'),pref:val('pref'),
        avoid:Array.prototype.map.call(document.querySelectorAll('#pbAvoid input:checked'),function(e){return e.value})};
    st.rot=st.rot||3; st.stage=stage(st.size,st.months); st.en=energy(st); st.rec=pick(st);
    plan(); show(2);
  };

  function plan(){
    var p=st,en=p.en,g=en.kcal/(SAMPLE_KCAL/100);
    var stg={puppy:'a puppy',adult:'an adult',senior:'a senior'}[p.stage];
    var h='<p class="kick">'+esc(p.name)+'\'s plan</p><h2>'+esc(p.name)+' is '+stg+', needing about '+Math.round(en.kcal)+' kcal a day</h2>';
    h+='<div class="pb-kpis"><div class="pb-kpi"><b>'+Math.round(en.rer)+'</b><span>Resting energy a day: 70 × '+p.kg+'^0.75</span></div><div class="pb-kpi"><b>× '+en.f.toFixed(1)+'</b><span>Life-stage factor: '+esc(en.why)+'</span></div><div class="pb-kpi"><b>'+Math.round(g)+' g</b><span>of food a day <span class="pb-sample">sample</span> at '+SAMPLE_KCAL+' kcal per 100 g</span></div></div>';
    h+='<div class="pb-note">'+esc(p.breed)+' is a '+p.size+' breed. Under '+SIZE[p.size].puppy+' months counts as a puppy and over '+SIZE[p.size].senior+' years as senior. '+esc(p.name)+' is '+Math.floor(p.months/12)+' years '+(p.months%12)+' months, so '+stg+'. '+(p.bcs==='ideal'?'Body shape is ideal, so the standard factor applies.':p.bcs==='over'?'An overweight dog starts on a gentler factor; your vet sets the goal weight.':'A thin dog starts on a higher factor; your vet confirms the target.')+'</div>';
    if(p.stage==='puppy'&&(p.size==='large'||p.size==='giant'))h+='<div class="pb-note warn"><b>To confirm with Fresh For Paws:</b> large and giant breed puppies need a controlled calcium level. The puppy recipe must be confirmed for them before this plan is sold.</div>';
    if(p.rec.blocked)h+='<div class="pb-note warn">The only puppy recipe contains chicken, which you asked us to leave out. We will suggest a plan by message instead.</div>';
    if(p.pref==='vegan')h+='<div class="pb-note warn">Plant-only diets need careful balance. Please keep your vet in the loop.</div>';
    if(p.rec.list.length){
      h+='<h3 style="margin:18px 0 12px">Chosen from our menu, and why</h3><div class="pb-recipes">';
      p.rec.list.forEach(function(r){h+='<div class="pb-rec">'+imgTag(r.p)+'<div class="in"><span class="tag">'+esc(r.tag)+'</span><h3>'+esc(r.id)+'</h3><p>'+esc(r.why)+'</p><p style="opacity:.7;font-size:13.5px">'+rs(r.p100)+' for 100 g · '+rs(r.p300)+' for 300 g</p></div></div>'});
      h+='</div><p style="margin-top:12px;font-size:14px;opacity:.75">We use three recipes in rotation so meals stay varied. Move to a new recipe over 7 to 10 days.'+(topper?' Add a '+esc(topper.p.name.replace(/\s+/g,' '))+' liver topper ('+rs(topper.price)+') as a treat if you like.':'')+'</p>';
    }else h+='<p>No recipe on the menu fits those choices yet.</p>';
    h+='<div class="pb-actions"><button class="btn outline" id="b2" type="button">Back</button><button class="btn" id="n2" type="button"'+(p.rec.list.length?'':' disabled')+'>Choose how to buy</button></div>';
    $('s2').innerHTML=h;$('b2').onclick=function(){show(1)};$('n2').onclick=function(){buy('fortnight');show(3)};
  }
  function buy(sel){
    var p=st, selId=sel||(document.querySelector('input[name=tier]:checked')||{}).value||'fortnight';
    var h='<p class="kick">How to buy</p><h2>How should '+esc(p.name)+' eat?</h2>';
    if(p.rec.list.length>1){
      h+='<p class="lab" style="font-weight:600;margin-bottom:6px">How often should the recipe change?</p><div class="pb-chips" style="margin-bottom:18px">';
      [[1,'Every day'],[3,'Every 3 days'],[7,'Every week']].forEach(function(o){h+='<label class="pb-chip"><input type="radio" name="rot" value="'+o[0]+'"'+(p.rot===o[0]?' checked':'')+'><span>'+o[1]+'</span></label>'});
      h+='</div><p style="font-size:13.5px;opacity:.75;margin:-8px 0 16px">Every recipe is complete and balanced on its own, so rotating is for variety, not for nutrition. Dogs with sensitive tummies do best changing slowly.</p>';
    }
    h+='<div class="pb-plans">';
    TIERS.forEach(function(t,i){
      var c=cost(p.rec.list,p.en.kcal,t.days,p.rot,p);
      t.c=c;t.list=c.sum;t.net=c.sum*(1-t.disc);
      h+='<label class="pb-plan'+(t.id===selId?' sel':'')+'" id="pl-'+t.id+'"><input type="radio" name="tier" value="'+t.id+'"'+(t.id===selId?' checked':'')+'><h3>'+t.label+'</h3><span class="pb-save">'+Math.round(t.disc*100)+'% off</span><div class="big">'+rs(t.net)+'</div><s>'+rs(t.list)+'</s><p style="font-size:13.5px;margin:6px 0 0">'+t.days+' days of food, '+t.when+'</p><p style="font-size:13.5px;margin:4px 0 0"><b>'+c.packs+' packs</b> a delivery, about '+(c.packs/t.days).toFixed(1)+' a day</p></label>';
    });
    h+='</div><p style="font-size:13.5px;opacity:.7;margin-top:12px">Packs are 300 g and 100 g at the menu price, whichever fits the days. Recipes keep rotating from one delivery to the next, so a later delivery can cost a little more or less than the first. Free delivery in Delhi NCR is assumed, to be confirmed.</p><div class="pb-actions"><button class="btn outline" id="b3" type="button">Back</button><button class="btn" id="n3" type="button">Review and see the feeding calendar</button></div>';
    $('s3').innerHTML=h;
    Array.prototype.forEach.call(document.querySelectorAll('input[name=tier]'),function(e){e.onchange=function(){TIERS.forEach(function(t){$('pl-'+t.id).classList.toggle('sel',t.id===e.value)})}});
    Array.prototype.forEach.call(document.querySelectorAll('input[name=rot]'),function(e){e.onchange=function(){p.rot=+e.value;buy((document.querySelector('input[name=tier]:checked')||{}).value)}});
    $('b3').onclick=function(){show(2)};$('n3').onclick=function(){review();show(4)};
  }
  function review(){
    var p=st,id=document.querySelector('input[name=tier]:checked').value,t=TIERS.filter(function(x){return x.id===id})[0];
    var h='<p class="kick">Review</p><h2>'+esc(p.name)+'\'s plan: '+t.label.toLowerCase()+'</h2><div class="pb-scroll"><table class="pb-table"><thead><tr><th>Recipe</th><th class="n">300 g</th><th class="n">100 g</th><th class="n">Price</th></tr></thead><tbody>';
    t.c.lines.forEach(function(l){h+='<tr><td>'+esc(l.r.id)+'</td><td class="n">'+l.pk.n3+'</td><td class="n">'+l.pk.n1+'</td><td class="n">'+rs(l.cost)+'</td></tr>'});
    h+='<tr><td colspan="3"><b>Menu price</b></td><td class="n">'+rs(t.list)+'</td></tr><tr><td colspan="3">'+t.label+' discount, '+Math.round(t.disc*100)+'%</td><td class="n">− '+rs(t.list-t.net)+'</td></tr><tr><td colspan="3"><b>You pay each time</b></td><td class="n"><b>'+rs(t.net)+'</b></td></tr></tbody></table></div>';
    if(t.id!=='bundle')h+='<p style="margin-top:14px">About '+rs(t.net*30/t.days)+' a month on this plan, against '+rs(t.list*30/t.days)+' at menu price.</p>';
    var sch=t.c.sch, show14=Math.min(t.days,14);
    h+='<h3 style="margin:24px 0 6px">Feeding calendar</h3><p style="font-size:14.5px;margin-bottom:12px">'+esc(p.name)+' eats '+Math.round(sch.gDay)+' g a day <span class="pb-sample">sample</span>, in '+sch.meals+' meals of about '+sch.perMeal+' g'+(sch.meals>2?' (puppies do best on three or four small meals)':', morning and evening')+'. '+(t.days>14?'First 14 days shown; the pattern carries on.':'')+'</p><div class="pb-cal">';
    sch.rows.slice(0,show14).forEach(function(r){h+='<div class="pb-day"><span class="d">Day '+r.day+'</span><b>'+esc(r.r.id)+'</b><span>'+r.meals+' × '+r.perMeal+' g</span></div>'});
    h+='</div><div class="pb-note"><b>Why the plan feeds this way.</b><ul style="margin:6px 0 0;padding-left:1.1em">'
      +'<li><b>Meals a day.</b> Adult dogs do well on two meals a day. Puppies need smaller, more frequent meals: four a day under four months, three until about six months, then two. (Common veterinary guidance, including the WSAVA.)</li>'
      +'<li><b>Same times each day.</b> A steady routine helps digestion and makes a change in appetite easy to spot.</li>'
      +'<li><b>Switching recipes.</b> Mix the new food in over 7 to 10 days: a quarter new on days 1 to 3, half on days 4 to 6, three quarters on days 7 to 9, then all. Gradual change is the standard way to avoid an upset stomach.</li>'
      +'<li><b>Rotation.</b> Each recipe is listed as complete and balanced, so one alone meets the dog\'s needs. Rotating adds variety and keeps meals interesting; it is a choice, not a requirement.</li>'
      +'<li><b>Treats and toppers.</b> Keep them to no more than about 10% of the day\'s calories. A Liv-Love topper counts.</li>'
      +'<li><b>Weigh every month.</b> We re-size the food when weight or age changes. If weight moves more than about 5% in a month, talk to your vet.</li></ul></div>';
    h+='<div class="pb-note"><b>What you can count on.</b> A message the day before each charge with a link to skip, pause, swap a recipe or cancel. Pay by UPI AutoPay or card, prepaid. We re-size the food when your dog\'s weight or age changes.</div>';
    h+='<div class="pb-note warn"><b>For Virat and Srishti, not shown to customers.</b> At this price the product share (25% of the sale) is '+rs(t.net*0.25)+' per delivery. The food in this plan must cost less than that to make, or the discount is too deep.</div>';
    h+='<div class="pb-actions"><button class="btn outline" id="b4" type="button">Back</button><button class="btn" id="n4" type="button">Place the order (demo)</button></div><p id="pbDone" style="margin-top:12px;font-size:14px"></p>';
    $('s4').innerHTML=h;$('b4').onclick=function(){show(3)};$('n4').onclick=function(){$('pbDone').textContent='Demo only: nothing was charged and no order was created. The live build opens Razorpay, then sets up the repeat schedule.'};
  }
})();
