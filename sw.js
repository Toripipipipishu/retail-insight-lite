'use strict';
const PREFIX='retail-insight:'+self.registration.scope+':';
const CACHE=PREFIX+'v1.5-portfolio-1';
const FILES=['new-products.js','new-product-sample.js','merch-ui.js','samples/product-metadata.csv','index.html','style.css','core.js','sample-data.js','app.js','time-analysis.js','time-ui.js','budget-analysis.js','budget-ui.js','product-trend.js','product-trend-ui.js','mobile-app.js','manifest.webmanifest','icons/app-192.png','icons/app-512.png','README.md','USER-GUIDE.md','MOBILE.md','samples/inventory.csv','samples/sales.csv','samples/stock-history.csv'];
const urls=FILES.map(p=>new URL(p,self.registration.scope).href);
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(urls)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))));});
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);if(url.origin!==self.location.origin)return;
 const target=request.mode==='navigate'&&url.href===self.registration.scope?new URL('index.html',self.registration.scope).href:request.url;
 if(!urls.includes(target))return;
 event.respondWith(caches.open(CACHE).then(cache=>cache.match(target)).then(cached=>cached||fetch(request)));
});

