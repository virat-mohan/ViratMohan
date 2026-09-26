// Mockups of Retail OS features, drawn from the live admin (moon-glasses repo)
// labels and layout. All figures are SAMPLE data, not a real brand's numbers.
window.RETAIL_OS_VISUALS = (function(){
  var T = function(title, sub, body){ return '<figure class="mk"><div class="mk-bar"><i></i><i></i><i></i><span>'+title+'</span></div><div class="mk-body">'+body+'</div><figcaption>'+sub+' <em>Mockup · sample data</em></figcaption></figure>'; };
  var tbl = function(head, rows){ return '<table class="mk-t"><tr>'+head.map(function(h){return '<th>'+h+'</th>';}).join('')+'</tr>'+rows.map(function(r){return '<tr>'+r.map(function(c){return '<td>'+c+'</td>';}).join('')+'</tr>';}).join('')+'</table>'; };
  var pill = function(t,c){ return '<span class="mk-p '+(c||'')+'">'+t+'</span>'; };
  var btn = function(t,c){ return '<span class="mk-b '+(c||'')+'">'+t+'</span>'; };

  var cal = (function(){
    var ev = {3:['Post','q'],5:['Launch','l'],8:['Post','q'],10:['Launched','ok'],12:['Post','q'],15:['Launch','l'],17:['Launched','ok'],19:['Post','q'],22:['Launch','l'],24:['Post','q'],26:['Launched','ok'],29:['Post','q']};
    var h='<div class="mk-cal">'+['M','T','W','T','F','S','S'].map(function(d){return '<b>'+d+'</b>';}).join('');
    for (var i=0;i<2;i++) h+='<div></div>';
    for (var d=1; d<=30; d++){ var e=ev[d]; h+='<div><small>'+d+'</small>'+(e?'<span class="ev '+e[1]+'">'+(e[1]==='ok'?e[0]:'Queued · '+e[0])+'</span>':'')+'</div>'; }
    return h+'</div>';
  })();

  return {
    admin: T('Admin', 'One admin runs the whole brand.',
      '<div class="mk-admin"><div class="mk-nav">'+[['Store','Orders · Manual order · Payment confirmations · Pre-orders'],['Marketing','Social · Website analytics · Ad brief generator · Content calendar · Growth reports · Abandoned carts · Pay with a Post · Ad agent'],['Logistics','Shipments & RTO · Return requests'],['Content','Journal drafts · Newsletter'],['Customers','Customers & loyalty · Leads'],['Community','Creators · UGC submissions · Reviews'],['Finance','P&L · Business plan · Expenses · Discount rules · Coupons'],['Catalog','Inventory · Inventory master · Product images · Models · Brand profile · Connected services']].map(function(s){return '<div><b>'+s[0]+'</b><span>'+s[1]+'</span></div>';}).join('')+'</div></div>'),

    connectors: T('Connected Services', 'Every outside service the store runs on, in one place.',
      '<div class="mk-conn">'+[['Orders & Shipping',['Razorpay','Checkout payments'],['Shiprocket','Courier booking, labels, tracking'],['Resend','Order, invoice and shipping emails']],['Customer Messaging',['WhatsApp Manager','Number & message templates'],['MSG91','Login OTPs']],['Social & Marketing',['Meta Ads Manager','Paid campaigns'],['Meta Events Manager','Pixel & conversion tracking'],['Instagram','Page & inbox']],['AI',['Claude','Ad copy, plans, recommendations'],['Image generation','Model & lifestyle photos']],['Hosting & Data',['Vercel','Hosting, scheduled jobs'],['Supabase','Database, file storage']]].map(function(g){return '<div class="g"><b>'+g[0]+'</b>'+g.slice(1).map(function(c){return '<div class="c"><i class="dot"></i><span>'+c[0]+'<small>'+c[1]+'</small></span>'+pill('Connected','ok')+'</div>';}).join('')+'</div>';}).join('')+'</div>'),

    metaDaily: T('Growth Reports · Meta Ads — Day By Day', 'Daily Meta spend against revenue, straight from the ads account.',
      tbl(['Date','Spend','Impr.','Clicks','Orders','Revenue','ROAS'],[
        ['Mon 21','₹2,400','18,210','402','6','₹10,740','<b>4.5×</b>'],
        ['Tue 22','₹2,400','17,650','371','4','₹7,160','<b>3.0×</b>'],
        ['Wed 23','₹2,800','21,940','488','8','₹14,320','<b>5.1×</b>'],
        ['Thu 24','₹2,800','20,105','455','5','₹8,950','<b>3.2×</b>']])+
      '<div class="mk-row">'+btn('Draft Ads From Sales Trends')+btn('Nudge Abandoned Carts Now','o')+btn('Email Today\'s Ops Summary','o')+'</div>'),

    calendar: T('Content Calendar · September', 'Posts and ad launches, queued and waiting for your yes.', cal),

    adBrief: T('Ad Brief Generator', 'The system drafts it. Nothing spends until you approve.',
      '<div class="mk-brief"><div class="img"></div><div><div class="mk-row">'+pill('Sales signal: selling fast','hot')+pill('Paused','')+'</div><b>Aviator Gold — 3 cities</b><p>"Built for the long drive home. Polarised, 22g, ships free."</p>'+tbl(['Budget / day','Target ROAS','Audience'],[['₹1,500','3.5×','Lookalike 1% · buyers']])+'<div class="mk-row">'+btn('Approve & Launch')+btn('Edit','o')+btn('Skip','o')+'</div></div></div>'),

    imageGen: T('Inventory Master', 'One product photo in. Pick a model, change the model, or skip the model entirely.',
      '<div class="mk-gen"><div class="src"><span>Product photo</span></div><div class="arrow">→</div>'+[['On model','Model: Riya · change','o0'],['No model','Lifestyle scene','o1'],['No model','Studio / flat lay','o2']].map(function(m){return '<div class="out '+m[2]+'"><span>'+m[0]+'</span><small>'+m[1]+'</small></div>';}).join('')+'</div><div class="mk-row">'+btn('Generate')+btn('Change Model','o')+btn('Without Model','o')+btn('Use This Photo','o')+'</div>'),

    waCatalog: T('WhatsApp', 'Catalog message to a pre-filled cart on your checkout, in one tap.',
      '<div class="mk-wa"><div class="in">Hi! Do you have the round frames in tortoise?</div><div class="out"><div class="card"><div class="img"></div><b>Round Tortoise</b><small>₹1,790 · in stock</small><span>View cart →</span></div></div><div class="out">Order #1042 confirmed. Shipping today via Delhivery. Track: mg.store/t/1042</div></div>'),

    cartRecovery: T('Abandoned Carts', 'Two-stage WhatsApp recovery: a nudge, then a coupon.',
      tbl(['Customer','Cart','Stage','Status'],[['Aditi S.','₹2,380','Nudge sent',pill('Read','')],['Rahul M.','₹1,790','Coupon sent',pill('Converted','ok')],['Neha K.','₹3,560','Nudge queued',pill('Waiting','')]])),

    statement: T('Weekly Statement', 'Itemised every week. Full history in the backend any time.',
      tbl(['Line','Amount'],[['Revenue','₹1,84,300'],['Cost of goods + packaging','– ₹46,100'],['Shipping','– ₹12,900'],['Tech / admin subscriptions','– ₹6,200'],['Marketing spend','– ₹41,500'],['Pay with a Post fee','– ₹420'],['<b>Profit</b>','<b>₹77,180</b>']])),

    pwap: T('Pay With A Post', 'Buyers pay with a post. Their code drives real orders.',
      '<div class="mk-steps">'+[['01','I make the post','On-brand, their code baked in'],['02','They share it','Feed or Story'],['03','It earns the ship','5K+ verified: ships on trust. Otherwise after 3 paid orders on the code']].map(function(s){return '<div><small>'+s[0]+'</small><b>'+s[1]+'</b><span>'+s[2]+'</span></div>';}).join('')+'</div>'+tbl(['Handle','Followers','Orders on code','Status'],[['@wander.aanya','12.4K','—',pill('Shipped on trust','ok')],['@kabir.frames','2.1K','2 / 3',pill('Earning','')]])),

    storefront: T('Storefront', 'Your brand system, not a theme. Trending strip updates daily.',
      '<div class="mk-store"><div class="hero"><b>YOUR BRAND</b><span>Shop the new drop →</span></div><small class="lbl">Trending now</small><div class="grid"><i></i><i></i><i></i><i></i></div><small class="lbl">From our customers</small><div class="grid ugc"><i></i><i></i><i></i><i></i></div></div>'),

    shipping: T('Shipments & RTO', 'Courier assigned the second an order confirms.',
      tbl(['Order','Courier','Status','Label'],[['#1042','Delhivery',pill('In transit',''),'Printed'],['#1041','Xpressbees',pill('Delivered','ok'),'Printed'],['#1039','Delhivery',pill('RTO risk · nudged','hot'),'Printed']])+'<div class="mk-row">'+btn('Print Labels (A4 × 2)')+'</div>'),

    checkout: T('Checkout', 'Guest checkout, live shipping rate, pay how you like.',
      '<div class="mk-co"><div><small>Delivery</small><b>110017 · New Delhi</b><span>Shipping ₹0 · arrives Thu</span></div><div><small>Pay with</small><div class="mk-row" style="margin:4px 0 0">'+pill('UPI','ok')+pill('Card')+pill('Netbanking')+pill('Wallet')+pill('COD + ₹99 advance')+'</div></div><div><small>Gift note</small><span>Happy birthday, Tara!</span></div><div class="tot"><span>Total</span><b>₹1,790</b></div>'+btn('Pay ₹1,790')+'</div>'),

    tracker: T('Your Onboarding Tracker', 'Every stage marked done as it happens.',
      '<ul class="mk-track">'+[['Brand identity set up',1],['Catalog connected',1],['Design direction proposed',1],['Payments configured',1],['Shipping configured',0],['Meta linked',0],['WhatsApp provisioned',0],['Go-live review',0],['Live & selling',0]].map(function(s){return '<li class="'+(s[1]?'d':'')+'">'+s[0]+'</li>';}).join('')+'</ul>')
  };
})();
