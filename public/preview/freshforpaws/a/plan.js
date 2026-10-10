/* Fresh For Paws plan builder (Mockup A): dog, cat (Fresh For Purrs) and puppy (Mini Paws).
   Menu, sizes, prices and pictures are read from catalogue.json, synced from the WooCommerce Store API by
   scripts/ffp-catalogue.mjs. Calories per recipe are NOT in WooCommerce: until Srishti sends them, feeding
   amounts use a placeholder marked "sample" on screen. Discounts are proposals for Virat to decide. */
(function(){
  var TIERS = [
    {id:'taster', label:'Taster', disc:0, days:0, when:'one of each recipe', taster:true},
    {id:'bundle', label:'One-time bundle', disc:0.05, days:14, when:'delivered once'},
    {id:'weekly', label:'Every week', disc:0.08, days:7, when:'delivered every week'},
    {id:'fortnight', label:'Twice a month', disc:0.10, days:15, when:'delivered twice a month'},
    {id:'monthly', label:'Every month', disc:0.12, days:30, when:'delivered every month'}
  ];
  var SAMPLE_KCAL = {dog:125, puppy:125, cat:110}; // kcal per 100 g, placeholders until recipe sheets arrive
  var DOG_SIZE = {small:{puppy:10,senior:9}, medium:{puppy:12,senior:8}, large:{puppy:15,senior:7}, giant:{puppy:18,senior:6}};
  var DOG_BREEDS = [['Indian Pariah (Indie)','medium'],['Labrador Retriever','large'],['Golden Retriever','large'],['German Shepherd','large'],['Beagle','medium'],['Pug','small'],['Shih Tzu','small'],['Lhasa Apso','small'],['Pomeranian','small'],['Dachshund','small'],['Cocker Spaniel','medium'],['Boxer','large'],['Rottweiler','large'],['Doberman','large'],['Siberian Husky','large'],['Labrador cross','large'],['Spitz (Indian)','small'],['French Bulldog','small'],['Great Dane','giant'],['Saint Bernard','giant'],['Mixed breed, small','small'],['Mixed breed, medium','medium'],['Mixed breed, large','large']];
  var CAT_BREEDS = [['Indian domestic (Indie)'],['Persian'],['Siamese'],['Maine Coon'],['Bengal'],['British Shorthair'],['Ragdoll'],['Domestic shorthair mix'],['Domestic longhair mix']];
  var PETS = {
    dog:{noun:'dog',title:'Tell us about your dog',crumb:'Tell us about your dog',breeds:DOG_BREEDS,weight:22,step:0.5,avoid:['chicken','egg','fish','lamb','goat','dairy']},
    cat:{noun:'cat',title:'Tell us about your cat',crumb:'Tell us about your cat',breeds:CAT_BREEDS,weight:4,step:0.1,avoid:['chicken','fish','lamb','goat']},
    puppy:{noun:'puppy',title:'Tell us about your puppy',crumb:'Tell us about your puppy',breeds:DOG_BREEDS,weight:6,step:0.5,avoid:['chicken']}
  };
  var INFO = { // plain-terms notes (not stored in WooCommerce); key = product name as sold
    'Chicken Pot Pie':{kind:'meat',has:['chicken'],tag:'Chicken',why:'A familiar single-protein meal that most adult dogs take to.'},
    'Eggstravaganza':{kind:'meat',has:['egg'],tag:'Egg',why:'Egg is a digestible protein and a change for a dog that tires of one recipe.'},
    'Fish Supper':{kind:'meat',has:['fish'],tag:'Fish',why:'Lean and listed as low in fat and calories, which suits a dog watching its weight. Fish also brings omega-3 fats.'},
    'Lamb On The Go':{kind:'meat',has:['lamb'],tag:'Lamb',why:'A different protein for a dog that does not do well on chicken.'},
    'Wholesome Goat Feast':{kind:'meat',has:['goat'],tag:'Goat',why:'High protein and listed as low in calories, so it suits a dog watching its weight.'},
    'Go Go Cottage Cheese':{kind:'veg',has:['dairy'],tag:'Vegetarian',why:'A vegetarian protein source for dogs that do not eat meat.'},
    'Pumpkin It Up':{kind:'vegan',has:[],tag:'Plant-based',why:'Plant protein with pumpkin fibre, gentle on the tummy.'},
    'Oh My Greens':{kind:'vegan',has:[],tag:'Plant-based',why:'The lightest plant recipe, a good partner to rotate with.'},
    'A Green Affair':{kind:'vegan',has:[],tag:'Plant-based',why:'A third plant recipe so a dog is not eating one meal on repeat.'},
    'Purrfect Chicken Delight':{kind:'meat',has:['chicken'],tag:'Chicken',why:'Chicken is the familiar favourite for most cats.'},
    'Fin-tastic Fish Feast':{kind:'meat',has:['fish'],tag:'Fish',why:'Fish for cats that love it, and a change from chicken.'},
    'Lamb Medley':{kind:'meat',has:['lamb'],tag:'Lamb',why:'A different protein for a cat that does not do well on chicken.'},
    'Goat Goodness':{kind:'meat',has:['goat'],tag:'Goat',why:'Another protein to rotate with, for variety.'}
  };
  var $=function(id){return document.getElementById(id)};
  var rs=function(n){return '₹'+Math.round(n).toLocaleString('en-IN')};
  var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
  var cat=null, menu={dog:[],cat:[],puppy:[]}, st={rot:3,tier:'fortnight'}, pet='dog', cur=1;

  function price(p,size){var s=p.sizes.filter(function(x){return x.size===size})[0];return s?s.price:null}
  function imgTag(p,alt){var f=p.species==='cat'?'../img/range-cats.webp':'../img/range-dogs.webp';
    return p.image?'<img src="'+esc(p.image)+'" alt="'+esc(alt||p.name)+'" loading="lazy" width="400" height="300" onerror="this.onerror=null;this.src=\''+f+'\'">':'<img src="'+f+'" alt="'+esc(alt||p.name)+'" loading="lazy" width="400" height="300">'}

  fetch('../catalogue.json').then(function(r){return r.json()}).then(function(d){
    cat=d;
    d.products.forEach(function(p){
      var i=INFO[p.name];
      if(p.group==='meal'&&i){
        if(p.species==='dog'&&price(p,'100g')&&price(p,'300g')) menu.dog.push({p:p,id:p.name,kind:i.kind,has:i.has,tag:i.tag,why:i.why,p100:price(p,'100g'),p300:price(p,'300g'),unit:100});
        if(p.species==='cat'&&p.sizes.length){var g=parseInt(p.sizes[0].size,10)||85;menu.cat.push({p:p,id:p.name,kind:'meat',has:i.has,tag:i.tag,why:i.why,single:p.sizes[0].price,unit:g,p100:p.sizes[0].price,p300:p.sizes[0].price})}
      }
      if(p.group==='puppy') menu.puppy.push({p:p,id:p.name,kind:'puppy',has:['chicken'],tag:'Puppy',why:'The puppy recipe on our menu. It is listed as complete and balanced for puppies.',p100:price(p,'100g'),p300:price(p,'300g'),unit:100});
    });
    $('pbSrc').textContent='Menu, prices and pictures read from '+d.source+' on '+new Date(d.readAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})+'. Calories per recipe are not in the store yet, so feeding amounts use a placeholder.';
    $('pbGo1').disabled=false;
  }).catch(function(){$('pbSrc').textContent='The menu could not be loaded. Reload the page.'});
  $('pbGo1').disabled=true;

  // ---- Who is it for + form ----
  function drawWho(){
    $('pbWho').innerHTML=['dog','cat','puppy'].map(function(k){var lab={dog:'My dog',cat:'My cat',puppy:'My puppy'}[k];return '<label class="pb-chip"><input type="radio" name="pet" value="'+k+'"'+(pet===k?' checked':'')+'><span>'+lab+'</span></label>'}).join('');
    Array.prototype.forEach.call(document.querySelectorAll('input[name=pet]'),function(e){e.onchange=function(){setPet(e.value,true)}});
  }
  function setPet(k,push){
    pet=k; var c=PETS[k];
    if(push){try{history.replaceState(history.state,'','?pet='+k+(location.hash||''))}catch(e){}}
    drawWho(); drawForm();
    $('pbTitle').textContent=c.title; if(cur===1){crumbs(1); document.title=c.title+' · Fresh For Paws · Mockup A'}
  }
  function opt(v,t,sel){return '<option value="'+v+'"'+(sel?' selected':'')+'>'+t+'</option>'}
  function drawForm(){
    var c=PETS[pet], h='';
    h+='<div><label for="pbName">Your '+c.noun+'\'s name</label><input id="pbName" type="text" value="'+(pet==='cat'?'Mishti':(pet==='puppy'?'Pixel':'Biscuit'))+'" autocomplete="off" enterkeyhint="next"></div>';
    h+='<div><label for="pbBreed">Breed</label><select id="pbBreed">'+c.breeds.map(function(b,i){return opt(i,b[0],(pet==='dog'&&i===1)||(pet==='puppy'&&i===1))}).join('')+'</select></div>';
    if(pet==='puppy'){
      var ms=''; for(var m=2;m<=18;m++) ms+=opt(m,m+' months',m===4);
      h+='<div><label for="pbAgeM">Age</label><select id="pbAgeM">'+ms+'</select></div>';
    } else {
      var ys='',ms2=''; for(var y=0;y<=(pet==='cat'?20:18);y++) ys+=opt(y,y+(y===1?' year':' years'),y===(pet==='cat'?3:4)); for(var m2=0;m2<12;m2++) ms2+=opt(m2,m2+(m2===1?' month':' months'),m2===6);
      h+='<div><span class="lab" id="ageLab">Age</span><div class="pb-row2" role="group" aria-labelledby="ageLab"><select id="pbY" aria-label="Years">'+ys+'</select><select id="pbM" aria-label="Months">'+ms2+'</select></div></div>';
    }
    h+='<div><label for="pbKg">Weight in kg</label><input id="pbKg" type="number" inputmode="decimal" min="0.5" max="90" step="'+c.step+'" value="'+c.weight+'" enterkeyhint="done"></div>';
    if(pet==='puppy'){
      h+='<div class="pb-full"><span class="lab" id="sexLab">Boy or girl?</span><div class="pb-chips" role="radiogroup" aria-labelledby="sexLab"><label class="pb-chip"><input type="radio" name="sex" value="m-no" checked><span>Boy</span></label><label class="pb-chip"><input type="radio" name="sex" value="f-no"><span>Girl</span></label></div></div>';
    } else {
      h+='<div class="pb-full"><span class="lab" id="sexLab">Boy or girl?</span><div class="pb-chips" role="radiogroup" aria-labelledby="sexLab"><label class="pb-chip"><input type="radio" name="sex" value="m-yes" checked><span>Boy, neutered</span></label><label class="pb-chip"><input type="radio" name="sex" value="m-no"><span>Boy, not neutered</span></label><label class="pb-chip"><input type="radio" name="sex" value="f-yes"><span>Girl, spayed</span></label><label class="pb-chip"><input type="radio" name="sex" value="f-no"><span>Girl, not spayed</span></label></div></div>';
    }
    h+='<div class="pb-full"><span class="lab" id="bcsLab">How does your '+c.noun+' feel? <small>Gently run your hands along the ribs.</small></span><div class="pb-chips" role="radiogroup" aria-labelledby="bcsLab"><label class="pb-chip"><input type="radio" name="bcs" value="thin"><span>Ribs easy to feel and see</span></label><label class="pb-chip"><input type="radio" name="bcs" value="ideal" checked><span>Ribs felt, waist visible</span></label><label class="pb-chip"><input type="radio" name="bcs" value="over"><span>Hard to feel ribs</span></label></div></div>';
    if(pet==='dog') h+='<div class="pb-full"><span class="lab" id="prefLab">What does your dog eat?</span><div class="pb-chips" role="radiogroup" aria-labelledby="prefLab"><label class="pb-chip"><input type="radio" name="pref" value="any" checked><span>Everything</span></label><label class="pb-chip"><input type="radio" name="pref" value="veg"><span>Vegetarian</span></label><label class="pb-chip"><input type="radio" name="pref" value="vegan"><span>Vegan</span></label></div></div>';
    if(pet==='cat') h+='<div class="pb-full"><p class="pb-fine" style="margin:0">Cats are meat eaters and need nutrients that only meat gives, so we only suggest meat meals for cats.</p></div>';
    h+='<details class="pb-full pb-opt"><summary>Any foods to avoid? (optional)</summary><div class="pb-chips" id="pbAvoid">'+c.avoid.map(function(a){return '<label class="pb-chip"><input type="checkbox" value="'+a+'"><span>'+a.charAt(0).toUpperCase()+a.slice(1)+'</span></label>'}).join('')+'</div></details>';
    $('pbForm').innerHTML=h;
  }

  // ---- The maths ----
  function stageOf(p){
    if(pet==='cat') return p.months<12?'kitten':(p.months>=11*12?'senior':'adult');
    var c=DOG_SIZE[p.size]; return p.months<c.puppy?'puppy':(p.months>=c.senior*12?'senior':'adult');
  }
  function energy(p){
    var rer=70*Math.pow(p.kg,0.75), f, why;
    if(pet==='cat'){
      if(p.stage==='kitten'){f=2.5;why='growing kitten'}
      else if(p.bcs==='over'){f=1.0;why='overweight: a gentle weight-loss start'}
      else if(p.bcs==='thin'){f=1.4;why='thin: a build-up start'}
      else if(p.neut==='yes'){f=1.2;why='neutered adult'}
      else {f=1.4;why='adult, not neutered'}
    } else if(p.stage==='puppy'){ if(p.months<4){f=3.0;why='puppy under 4 months'} else {f=2.0;why='puppy from 4 months'} }
    else if(p.bcs==='over'){f=1.2;why='overweight: a gentle weight-loss start'}
    else if(p.bcs==='thin'){f=1.8;why='thin: a build-up start'}
    else if(p.stage==='senior'){f=1.4;why='senior dog'}
    else if(p.neut==='yes'){f=1.6;why='neutered adult'}
    else {f=1.8;why='adult, not neutered'}
    return {rer:rer,f:f,why:why,kcal:rer*f};
  }
  function meals(p){
    if(pet==='cat') return p.stage==='kitten'?(p.months<6?4:3):2;
    return p.stage==='puppy'?(p.months<4?4:(p.months<6?3:2)):2;
  }
  function pick(p){
    var pool=menu[pet].filter(function(r){
      if(pet==='dog'&&p.pref==='veg'&&r.kind==='meat')return false;
      if(pet==='dog'&&p.pref==='vegan'&&r.kind!=='vegan')return false;
      return !r.has.some(function(h){return p.avoid.indexOf(h)>=0});
    });
    if(pet==='puppy') return {list:pool.slice(0,1),blocked:pool.length===0};
    var order=pet==='cat'?['Purrfect Chicken Delight','Fin-tastic Fish Feast','Lamb Medley','Goat Goodness']
      :p.bcs==='over'?['Fish Supper','Wholesome Goat Feast','Oh My Greens','Pumpkin It Up','Chicken Pot Pie','Eggstravaganza','Lamb On The Go','Go Go Cottage Cheese','A Green Affair']
      :p.stage==='senior'?['Fish Supper','Chicken Pot Pie','Eggstravaganza','Wholesome Goat Feast','Pumpkin It Up','Lamb On The Go','Go Go Cottage Cheese','Oh My Greens','A Green Affair']
      :['Chicken Pot Pie','Fish Supper','Eggstravaganza','Lamb On The Go','Wholesome Goat Feast','Go Go Cottage Cheese','Pumpkin It Up','A Green Affair','Oh My Greens'];
    pool.sort(function(a,b){return order.indexOf(a.id)-order.indexOf(b.id)});
    return {list:pool.slice(0,3),blocked:false};
  }
  function packsFor(r,g){
    if(pet==='cat'){var n=Math.max(1,Math.ceil(g/r.unit));return {n3:0,n1:n,cat:true}}
    var n3=Math.floor(g/300),rem=g-n3*300,n1=Math.ceil(rem/100); if(n1>=3){n3++;n1=0} return {n3:n3,n1:n1};
  }
  function packCost(r,pk){return pet==='cat'?pk.n1*r.single:pk.n3*r.p300+pk.n1*r.p100}
  function schedule(list,kcal,days,rot,p){
    var gDay=kcal/(SAMPLE_KCAL[pet]/100), M=meals(p), perMeal=Math.round(gDay/M/5)*5, rows=[], by={};
    for(var d=0;d<days;d++){var r=list[Math.floor(d/rot)%list.length]; rows.push({day:d+1,r:r,g:gDay,meals:M,perMeal:perMeal}); by[r.id]=(by[r.id]||0)+gDay}
    return {rows:rows,by:by,gDay:gDay,meals:M,perMeal:perMeal};
  }
  function cost(list,kcal,t,rot,p){
    if(t.taster){var lines=[],sum=0,total=0; list.forEach(function(r){var pk={n3:0,n1:1}; var c=packCost(r,pk); lines.push({r:r,pk:pk,cost:c}); sum+=c; total+=1}); return {lines:lines,sum:sum,sch:schedule(list,kcal,1,rot,p),packs:total}}
    var sch=schedule(list,kcal,t.days,rot,p), lines2=[], sum2=0, total2=0;
    list.forEach(function(r){var g=sch.by[r.id]||0; if(!g)return; var pk=packsFor(r,g), c=packCost(r,pk); lines2.push({r:r,pk:pk,cost:c,grams:g}); sum2+=c; total2+=pk.n3+pk.n1});
    return {lines:lines2,sum:sum2,sch:sch,packs:total2};
  }

  // ---- Steps, breadcrumb, history ----
  function crumbs(n){
    var ol=$('crumbs'), c=PETS[pet].crumb;
    var h='<li><a href="index.html">Home</a></li><li><a href="plan.html">Build a plan</a></li>';
    if(n===1) h+='<li aria-current="page">'+c+'</li>';
    else { h+='<li><a href="#" data-go="1">'+c+'</a></li>'; h+= n===2?'<li aria-current="page">Your plan</li>':'<li><a href="#" data-go="2">Your plan</a></li><li aria-current="page">Review</li>'; }
    ol.innerHTML=h;
    Array.prototype.forEach.call(ol.querySelectorAll('[data-go]'),function(a){a.onclick=function(e){e.preventDefault();go(+a.getAttribute('data-go'))}});
  }
  function go(n,push){
    cur=n;
    ['s1','s2','s3'].forEach(function(id,i){$(id).classList.toggle('pb-hide',i!==n-1)});
    Array.prototype.forEach.call($('pbSteps').children,function(li,i){li.className=i===n-1?'on':(i<n-1?'done':'');if(i===n-1)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current')});
    $('pbTitle').textContent=n===1?PETS[pet].title:(n===2?st.name+'\'s plan':'Review '+st.name+'\'s plan');
    $('pbLead').classList.toggle('pb-hide',n!==1);
    $('pbBar').classList.toggle('pb-hide',n!==2);
    crumbs(n); document.title=(n===1?PETS[pet].title:(n===2?'Your plan':'Review'))+' · Fresh For Paws · Mockup A';
    if(push!==false){try{history.pushState({n:n},'','?pet='+pet+'#'+['dog','plan','review'][n-1])}catch(e){}}
    window.scrollTo({top:0,behavior:'auto'});
    var h=$('pbTitle'); h.setAttribute('tabindex','-1'); h.focus({preventScroll:true});
  }
  window.addEventListener('popstate',function(e){var n=(e.state&&e.state.n)||1; if(n>1&&!st.rec){n=1} go(n,false)});

  function val(n){var e=document.querySelector('input[name='+n+']:checked');return e?e.value:null}
  $('pbGo1').onclick=function(){
    var b=PETS[pet].breeds[+$('pbBreed').value], kg=parseFloat($('pbKg').value), sx=(val('sex')||'m-yes').split('-');
    var months=pet==='puppy'?(+$('pbAgeM').value):((+$('pbY').value)*12+(+$('pbM').value));
    if(!(kg>0)||kg>90){$('pbKg').setCustomValidity('Enter a weight between 1 and 90 kg');$('pbKg').reportValidity();return}
    $('pbKg').setCustomValidity('');
    st={pet:pet,name:($('pbName').value||'Your '+PETS[pet].noun).trim(),breed:b[0],size:b[1]||'medium',months:months,kg:kg,sex:sx[0]==='m'?'male':'female',neut:sx[1],bcs:val('bcs'),pref:val('pref')||'any',rot:3,tier:'fortnight',
        avoid:Array.prototype.map.call(document.querySelectorAll('#pbAvoid input:checked'),function(e){return e.value})};
    st.stage=stageOf(st);
    if(pet==='puppy'&&st.stage!=='puppy') st.over=true;
    st.en=energy(st); st.rec=pick(st);
    plan(); go(2);
  };

  function plan(){
    var p=st,en=p.en,g=en.kcal/(SAMPLE_KCAL[pet]/100), M=meals(p), per=Math.round(g/M/5)*5, N=PETS[pet].noun;
    var stg={puppy:'a puppy',kitten:'a kitten',adult:'an adult',senior:'a senior'}[p.stage];
    var h='<p class="pb-sum"><b>'+esc(p.name)+'</b> is '+stg+' and needs about <b>'+Math.round(en.kcal)+' kcal</b> a day: around <b>'+Math.round(g)+' g</b> of food <span class="pb-sample">sample</span> in <b>'+M+' meals of '+per+' g</b>.</p>';
    if(p.over) h+='<div class="pb-note warn"><b>'+esc(p.name)+' looks past the puppy stage</b> for a '+p.size+' breed. The "My dog" plan is the better fit.</div>';
    if(pet==='puppy'&&(p.size==='large'||p.size==='giant')) h+='<div class="pb-note warn"><b>To confirm with Fresh For Paws:</b> large and giant breed puppies need a controlled calcium level. The puppy recipe must be confirmed for them before this plan is sold.</div>';
    if(pet==='cat'&&p.stage==='kitten') h+='<div class="pb-note warn"><b>To confirm with Fresh For Paws:</b> whether the Fresh For Purrs recipes are complete for growing kittens. Please check with your vet until confirmed.</div>';
    if(pet==='dog'&&p.pref==='vegan') h+='<div class="pb-note warn">Plant-only diets need careful balance. Please keep your vet in the loop.</div>';
    if(!p.rec.list.length||p.rec.blocked){h+='<p>No recipe on the menu fits those choices yet. Fresh For Paws will suggest a plan by message.</p><div class="pb-actions"><button class="btn outline" id="b2" type="button">Back</button></div>';$('s2').innerHTML=h;$('b2').onclick=function(){history.back()};return}
    h+='<h2 class="pb-h">Meals we chose, and why</h2><div class="pb-recipes">';
    p.rec.list.forEach(function(r){h+='<div class="pb-rec">'+imgTag(r.p)+'<div class="in"><span class="tag">'+esc(r.tag)+'</span><h3>'+esc(r.id)+'</h3><p>'+esc(r.why)+'</p></div></div>'});
    h+='</div><h2 class="pb-h">How would you like to start?</h2><div class="pb-plans" id="pbPlans"></div><p class="pb-fine" id="pbShip"></p>';
    if(p.rec.list.length>1){
      h+='<details class="pb-opt"><summary>Change how often the recipe rotates</summary><div class="pb-chips" style="margin-top:10px">';
      [[1,'Every day'],[3,'Every 3 days'],[7,'Every week']].forEach(function(o){h+='<label class="pb-chip"><input type="radio" name="rot" value="'+o[0]+'"'+(p.rot===o[0]?' checked':'')+'><span>'+o[1]+'</span></label>'});
      h+='</div><p class="pb-fine">Every recipe is complete and balanced on its own, so rotating is for variety, not for nutrition. Pets with sensitive tummies do best changing slowly.</p></details>';
    }
    h+='<details class="pb-opt"><summary>How we worked this out</summary><div class="pb-how"><p>Resting energy is 70 × '+p.kg+'^0.75 = <b>'+Math.round(en.rer)+' kcal</b>. The life-stage factor is <b>× '+en.f.toFixed(1)+'</b> ('+esc(en.why)+'), so <b>'+Math.round(en.kcal)+' kcal</b> a day.</p><ul><li><b>Energy.</b> The formula is in the NRC\'s Nutrient Requirements of Dogs and Cats (2006) and the WSAVA nutrition guidelines.</li><li><b>Factors.</b> Dogs: 1.6 neutered adult, 1.8 not neutered, 3.0 puppy under 4 months, 2.0 puppy from 4 months. Cats: 1.2 neutered adult, 1.4 not neutered, 2.5 growing kitten (Hand et al., <i>Small Animal Clinical Nutrition</i>).</li><li><b>Body shape.</b> Rib and waist feel is the idea behind the 9-point body condition score vets use.</li><li><b>What we leave out.</b> Anything you tick. Chicken, dairy, beef and wheat are the foods most often reported as allergens in dogs.</li></ul><div class="pb-note warn"><b>A starting point, not veterinary advice.</b> A vet adjusts these figures for each '+N+'. Pets with a health condition, pregnant or nursing pets, and pets gaining or losing weight fast should follow their vet\'s plan.</div></div></details>';
    h+='<div class="pb-actions"><button class="btn outline" id="b2" type="button">Back</button><button class="btn" id="n2" type="button">Review</button></div>';
    $('s2').innerHTML=h;
    Array.prototype.forEach.call(document.querySelectorAll('input[name=rot]'),function(e){e.onchange=function(){p.rot=+e.value;plans()}});
    $('b2').onclick=function(){history.back()}; $('n2').onclick=function(){review();go(3)}; $('pbBarGo').onclick=$('n2').onclick;
    plans();
  }
  function plans(){
    var p=st, h='';
    TIERS.forEach(function(t){
      var c=cost(p.rec.list,p.en.kcal,t,p.rot,p); t.c=c; t.list=c.sum; t.net=c.sum*(1-t.disc);
      var pk=function(n){return n+(n===1?' pack':' packs')}; var sub=t.taster?((c.packs===1?'one pack':'one pack of each recipe')+' · '+pk(c.packs)):(t.days+' days of food · '+pk(c.packs));
      h+='<label class="pb-plan'+(t.taster?' pb-taster':'')+(t.id===p.tier?' sel':'')+'" id="pl-'+t.id+'"><input type="radio" name="tier" value="'+t.id+'"'+(t.id===p.tier?' checked':'')+'><h3>'+t.label+'</h3>'+(t.disc?'<span class="pb-save">'+Math.round(t.disc*100)+'% off</span>':'<span class="pb-save" style="background:var(--ffp-ink)">Try first</span>')+'<div class="big">'+rs(t.net)+'</div>'+(t.disc?'<s>'+rs(t.list)+'</s>':'<s style="visibility:hidden">.</s>')+'<p>'+sub+'</p><p class="sh">'+(t.net>=1000?'Free shipping':'Plus shipping')+'</p></label>';
    });
    $('pbPlans').innerHTML=h;
    Array.prototype.forEach.call(document.querySelectorAll('input[name=tier]'),function(e){e.onchange=function(){p.tier=e.value;plans()}});
    var t=TIERS.filter(function(x){return x.id===p.tier})[0];
    $('pbShip').textContent='A taster is one pack of each recipe at menu price, to mix in over the first week. Orders of ₹1,000 and above ship free, cost inside the price. Orders up to ₹999 pay shipping at the Shiprocket rate, shown at checkout. Prepaid only: UPI or card, no cash on delivery.';
    $('pbBarPrice').textContent=rs(t.net)+' · '+t.label.toLowerCase(); $('pbBarSub').textContent=(t.taster?'one pack of each recipe':t.days+' days of food')+(t.net>=1000?', free shipping':', plus shipping');
  }
  function review(){
    var p=st,t=TIERS.filter(function(x){return x.id===p.tier})[0],c=t.c,sch=c.sch;
    var h='<div class="pb-scroll"><table class="pb-table"><thead><tr><th>Recipe</th>'+(pet==='cat'?'<th class="n">Packs</th>':'<th class="n">300 g</th><th class="n">100 g</th>')+'<th class="n">Price</th></tr></thead><tbody>';
    var span=pet==='cat'?2:3;
    c.lines.forEach(function(l){h+='<tr><td>'+esc(l.r.id)+'</td>'+(pet==='cat'?'<td class="n">'+l.pk.n1+'</td>':'<td class="n">'+l.pk.n3+'</td><td class="n">'+l.pk.n1+'</td>')+'<td class="n">'+rs(l.cost)+'</td></tr>'});
    h+='<tr><td colspan="'+span+'">Menu price</td><td class="n">'+rs(t.list)+'</td></tr>'+(t.disc?'<tr><td colspan="'+span+'">'+t.label+', '+Math.round(t.disc*100)+'% off</td><td class="n">− '+rs(t.list-t.net)+'</td></tr>':'')+'<tr><td colspan="'+span+'"><b>You pay'+(t.taster?'':' each time')+'</b></td><td class="n"><b>'+rs(t.net)+'</b></td></tr></tbody></table></div>';
    h+='<p class="pb-fine">'+(t.net>=1000?'Shipping is free on this order.':'Shipping is added at the Shiprocket rate for your pincode. Add '+rs(1000-t.net)+' more and it ships free.')+((!t.taster&&t.id!=='bundle')?' About '+rs(t.net*30/t.days)+' a month, against '+rs(t.list*30/t.days)+' at menu price.':'')+'</p>';
    if(t.taster){
      h+='<h2 class="pb-h">How to use the taster</h2><div class="pb-cal" style="grid-template-columns:repeat(4,minmax(0,1fr))"><div class="pb-day"><span class="d">Days 1 to 3</span><b>A quarter new</b><span>three quarters current food</span></div><div class="pb-day"><span class="d">Days 4 to 6</span><b>Half new</b><span>half current food</span></div><div class="pb-day"><span class="d">Days 7 to 9</span><b>Three quarters new</b><span>a quarter current food</span></div><div class="pb-day"><span class="d">Day 10</span><b>All new</b><span>then start a plan</span></div></div><p class="pb-fine">Mixing in over 7 to 10 days is the standard way to avoid an upset stomach. When '+esc(p.name)+' is happy, start a plan and we size it from how the taster went.</p>';
      h+='<div class="pb-actions"><button class="btn outline" id="goPlan" type="button">Choose a plan instead</button></div>';
    } else {
      h+='<h2 class="pb-h">Feeding calendar</h2><p class="pb-fine" style="margin-top:0">'+esc(p.name)+' eats '+Math.round(sch.gDay)+' g a day <span class="pb-sample">sample</span> in '+sch.meals+' meals of about '+sch.perMeal+' g.</p><div class="pb-cal" id="pbCal"></div><div class="pb-actions" style="margin-top:12px"><button class="btn outline small" id="calMore" type="button">Show 14 days</button></div>';
    }
    h+='<details class="pb-opt"><summary>Why we feed it this way</summary><ul class="pb-how"><li><b>Meals a day.</b> Adults do well on two. Puppies and kittens need smaller, more frequent meals: four a day when very young, three until about six months, then two to three (common veterinary guidance, including the WSAVA).</li><li><b>Same times each day.</b> A steady routine helps digestion and makes a change in appetite easy to spot.</li><li><b>Switching recipes.</b> Mix the new food in over 7 to 10 days: a quarter new on days 1 to 3, half on days 4 to 6, three quarters on days 7 to 9, then all.</li><li><b>Treats and toppers.</b> No more than about 10% of the day\'s calories.</li><li><b>Weigh every month.</b> '+(pet==='puppy'||p.stage==='kitten'?'Growing pets change fast, so we re-size at every delivery from the latest weight you enter. ':'We re-size the food when weight or age changes. ')+'If weight moves more than about 5% in a month, talk to your vet.</li></ul></details>';
    h+='<div class="pb-note"><b>What you can count on.</b> A message the day before each charge with a link to skip, pause, swap a recipe or cancel. Prepaid only, no cash on delivery.</div>';
    h+='<div class="pb-note warn"><b>For Virat and Srishti, not shown to customers.</b> At this price the product share (25% of the sale) is '+rs(t.net*0.25)+' per order. The food in this order must cost less than that to make.</div>';
    h+='<div class="pb-actions"><button class="btn outline" id="b3" type="button">Back</button><button class="btn" id="n3" type="button">Add to cart</button></div><p id="pbDone" class="pb-fine" role="status"></p>';
    $('s3').innerHTML=h;
    if(!t.taster){var shown=7; var cal=function(){var o='';sch.rows.slice(0,Math.min(shown,t.days)).forEach(function(r){o+='<div class="pb-day"><span class="d">Day '+r.day+'</span><b>'+esc(r.r.id)+'</b><span>'+r.meals+' × '+r.perMeal+' g</span></div>'});$('pbCal').innerHTML=o;$('calMore').hidden=(t.days<=shown)}; cal(); $('calMore').onclick=function(){shown=14;cal()};}
    else $('goPlan').onclick=function(){p.tier='fortnight';history.back()};
    $('b3').onclick=function(){history.back()}; $('n3').onclick=function(){
      var added=0; t.c.lines.forEach(function(l){var pr=l.r.p, sz=function(name){return pr.sizes.filter(function(s){return s.size===name})[0]};
        if(pet==='cat'){var s0=pr.sizes[0]; FFP.Cart.add({id:pr.id,vid:s0.vid,name:pr.name,size:s0.size,price:s0.price,qty:l.pk.n1,image:pr.image,url:pr.url});added+=l.pk.n1}
        else{ if(l.pk.n3){var s3=sz('300g');FFP.Cart.add({id:pr.id,vid:s3.vid,name:pr.name,size:s3.size,price:s3.price,qty:l.pk.n3,image:pr.image,url:pr.url});added+=l.pk.n3}
              if(l.pk.n1){var s1=sz('100g');FFP.Cart.add({id:pr.id,vid:s1.vid,name:pr.name,size:s1.size,price:s1.price,qty:l.pk.n1,image:pr.image,url:pr.url});added+=l.pk.n1} }});
      $('pbDone').innerHTML=added+' packs added to your cart at menu price. <a href="cart.html">Go to the cart</a>. The plan discount ('+(t.disc?Math.round(t.disc*100)+'%':'none for a taster')+') and the repeat schedule are set up at checkout on the live site.';
    };
  }

  // ---- Start ----
  var q=(location.search.match(/pet=(dog|cat|puppy)/)||[])[1]; if(q) pet=q;
  try{if(location.hash==='#plan'||location.hash==='#review') history.replaceState({n:1},'','?pet='+pet+'#dog')}catch(e){}
  setPet(pet,false); crumbs(1);
})();
