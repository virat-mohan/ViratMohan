const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=>chromium.launch());
const p=await b.newPage();await p.goto('file://'+__dirname+'/catalogue.html',{waitUntil:'networkidle'});await p.evaluate(async()=>{const im=[...document.images];im.forEach(i=>i.loading='eager');await Promise.all(im.map(i=>i.complete&&i.naturalWidth?0:new Promise(r=>{i.onload=i.onerror=r})));});
await p.evaluate(()=>{document.documentElement.dataset.theme='light';document.querySelectorAll('details').forEach(d=>d.open=true);document.querySelector('.filters').remove();
const s=document.createElement('style');s.textContent=`main{display:block!important}.card{flex-direction:row!important;break-inside:avoid;margin-bottom:14px}.imgs{flex:0 0 200px;flex-direction:column;overflow:visible}.imgs img{width:200px;flex:none}body{font-size:12px}header{padding-top:10px}`;document.head.appendChild(s);});
await p.pdf({path:'Raghu-Antiques-Catalogue.pdf',format:'A4',printBackground:true,margin:{top:'12mm',bottom:'12mm',left:'10mm',right:'10mm'}});await b.close();})();
