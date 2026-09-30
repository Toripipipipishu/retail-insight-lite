(function(root){
 'use strict';
 function analyze(sales,opts,key,launch=null,history=[]){
  const matched=sales.filter(s=>s.key===key&&s.date<=opts.end);
  const positive=matched.filter(s=>s.qty>0);const first=positive.reduce((a,s)=>Math.min(a,s.date),Infinity);
  const origin=launch??(Number.isFinite(first)?first:null);
  if(launch!==null&&(!Number.isFinite(launch)||launch>opts.end))throw Error('発売日は集計終了日以前にしてください。');
  const byDay=new Map();for(const s of matched){if(s.date<opts.start)continue;if(!byDay.has(s.date))byDay.set(s.date,{qty:0,returns:0});const d=byDay.get(s.date);d.qty+=Math.max(0,s.qty);d.returns+=Math.max(0,-s.qty);}
  const stock=new Map(history.filter(s=>s.key===key).map(s=>[s.date,s.stock]));
  const start=Math.max(opts.start,origin??opts.start);const series=[];let sum7=0,sum30=0;
  for(let d=start;d<=opts.end;d++){
   const data=byDay.get(d)||{qty:0,returns:0};const i=series.length;
   sum7+=data.qty;sum30+=data.qty;if(i>=7)sum7-=series[i-7].qty;if(i>=30)sum30-=series[i-30].qty;
   series.push({date:d,elapsed:origin===null?null:d-origin,qty:data.qty,returns:data.returns,ma7:i>=6?sum7/7:null,ma30:i>=29?sum30/30:null,stock:stock.has(d)?stock.get(d):null});
  }
  const average=rows=>rows.reduce((n,r)=>n+r.qty,0)/rows.length;
  const recent=series.length>=7?average(series.slice(-7)):null,previous=series.length>=14?average(series.slice(-14,-7)):null;
  const ratio=previous>0?recent/previous:null;
  return {series,origin,first:Number.isFinite(first)?first:null,launch, recent,previous,ratio,zeroStock:series.filter(s=>s.stock===0).length,knownStock:series.filter(s=>s.stock!==null).length,beforeLaunch:launch!==null&&positive.some(s=>s.date<launch)};
 }
 function parseHistory(csv,R,needStore){
  const headers=csv.headers;const map=R.detect(headers);if(map.date<0)map.date=headers.findIndex(h=>['在庫日','基準日'].includes(h.trim()));
  for(const k of ['date','code','stock'])if(map[k]<0)throw Error('在庫履歴には日付・商品コード・在庫数が必要です。');
  if(needStore&&map.store<0)throw Error('店舗別分析のため、在庫履歴にも店舗IDまたは店舗コードが必要です。');
  if(!needStore&&map.store>=0)throw Error('元の分析は店舗列なしです。在庫履歴も同じ対象に集約し、店舗列を除いてください。');
  const seen=new Set();return csv.rows.map((row,i)=>{try{const code=row[map.code].trim(),store=map.store<0?'':row[map.store].trim();if(!code||needStore&&!store)throw Error('商品・店舗が空欄です');const date=R.day(row[map.date]),stock=R.number(row[map.stock],true),key=JSON.stringify([store,code]),id=key+':'+date;if(stock<0)throw Error('日末在庫は0以上にしてください');if(seen.has(id))throw Error('同一日・店舗・商品の在庫が重複しています');seen.add(id);return {date,stock,key};}catch(e){throw Error('データ行'+(i+1)+': '+e.message);}});
 }
 const api={analyze,parseHistory};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RetailTrend=api;
})(globalThis);
