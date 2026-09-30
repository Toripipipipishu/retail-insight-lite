(function(root){
 'use strict';
 const weekdays=['日','月','火','水','木','金','土'];
 function analyze(sales,opts,mode){
  const buckets=new Map(),totals=new Map();
  const key=d=>mode==='weekday'?new Date(d*86400000).getUTCDay():mode==='monthday'?new Date(d*86400000).getUTCDate():d;
  for(let d=opts.start;d<=opts.end;d++){
   const k=key(d);if(!buckets.has(k))buckets.set(k,{key:k,label:mode==='weekday'?weekdays[k]+'曜日':mode==='monthday'?k+'日':new Date(d*86400000).toISOString().slice(0,10),days:0,qty:0,returns:0,revenue:0,products:new Map()});
   buckets.get(k).days++;
  }
  for(const s of sales){
   if(s.date<opts.start||s.date>opts.end)continue;
   const b=buckets.get(key(s.date));const q=Math.max(0,s.qty),ret=Math.max(0,-s.qty),rev=s.amount-(opts.net?s.discount+s.points+s.intax:0);
   if(!totals.has(s.key))totals.set(s.key,{qty:0,revenue:0});totals.get(s.key).qty+=q;totals.get(s.key).revenue+=rev;
   b.qty+=q;b.returns+=ret;b.revenue+=rev;
   if(!b.products.has(s.key))b.products.set(s.key,{key:s.key,code:s.code,name:s.name,store:s.store,qty:0,returns:0,revenue:0});
   const p=b.products.get(s.key);p.qty+=q;p.returns+=ret;p.revenue+=rev;
  }
  const periodDays=opts.end-opts.start+1;
  return [...buckets.values()].sort((a,b)=>a.key-b.key).map(b=>({...b,avg:b.qty/b.days,revenueAvg:b.revenue/b.days,products:[...b.products.values()].map(p=>({...p,avg:p.qty/b.days,revenueAvg:p.revenue/b.days,lift:totals.get(p.key).qty>0?(p.qty/b.days)/(totals.get(p.key).qty/periodDays):null,revenueLift:totals.get(p.key).revenue>0?(p.revenue/b.days)/(totals.get(p.key).revenue/periodDays):null})).sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue)}));
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={analyze};else root.RetailTime={analyze};
})(globalThis);
