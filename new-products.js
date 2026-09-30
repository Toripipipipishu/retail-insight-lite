(function(root){
 'use strict';
 function parse(csv,R,needStore){
  const col=name=>csv.headers.findIndex(h=>h.trim()===name),code=col('商品コード'),name=col('商品名'),store=col('店舗ID'),registered=col('登録日'),receipt=col('初回入荷日');
  if(code<0||registered<0&&receipt<0)throw Error('商品コードと、登録日または初回入荷日が必要です。');
  if(needStore!==(store>=0))throw Error('店舗ID列の有無を、現在の在庫分析と揃えてください。');
  const seen=new Set();return csv.rows.map((r,i)=>{try{const c=r[code].trim(),s=store<0?'':r[store].trim();if(!c||needStore&&!s)throw Error('商品・店舗が空欄です');const key=JSON.stringify([s,c]);if(seen.has(key))throw Error('商品・店舗が重複しています');seen.add(key);const reg=registered<0||!r[registered].trim()?null:R.day(r[registered]),rec=receipt<0||!r[receipt].trim()?null:R.day(r[receipt]);if(reg===null&&rec===null)throw Error('登録日・初回入荷日が両方空欄です');return {key,code:c,store:s,name:name<0?c:r[name]||c,registered:reg,receipt:rec};}catch(e){throw Error('データ行'+(i+1)+': '+e.message);}});
 }
 function analyze(items,sales,meta,opts,newDays,target){
  if(!Number.isInteger(newDays)||newDays<1||newDays>3650||!Number.isFinite(target)||target<=0)throw Error('新商品期間は1〜3650日、目標速度は0より大きい数値で指定してください。');
  const products=new Map(items.map(p=>[p.key,p]));const byKey=new Map();for(const s of sales){if(s.date>opts.end)continue;if(!byKey.has(s.key))byKey.set(s.key,[]);byKey.get(s.key).push(s);}
  const rows=meta.map(m=>{
   const origin=m.receipt??m.registered,age=opts.end-origin+1,complete=opts.start<=origin;
   const p=products.get(m.key),relevant=(byKey.get(m.key)||[]).filter(s=>s.date>=origin&&s.date>=opts.start),sold=relevant.reduce((n,s)=>n+Math.max(0,s.qty),0),returns=relevant.reduce((n,s)=>n+Math.max(0,-s.qty),0);
   const first=relevant.filter(s=>s.qty>0).reduce((a,s)=>Math.min(a,s.date),Infinity),observedDays=Math.max(0,opts.end-Math.max(opts.start,origin)+1),velocity=observedDays?sold/observedDays:0;
   const conflict=(byKey.get(m.key)||[]).some(s=>s.date<origin&&s.qty>0);
   const canScore=m.receipt!==null&&complete&&age>=7&&!conflict;
   const firstPoints=sold>0?40:0,pacePoints=Math.min(40,40*velocity/target),startPoints=Number.isFinite(first)?Math.max(0,20*(1-(first-origin)/14)):0;
   const score=canScore?Math.round(firstPoints+pacePoints+startPoints):null;
   const status=age<=0?'開始予定':conflict?'日付要確認':m.receipt===null?'入荷日未登録':!complete?'履歴不足':sold===0?'入荷後未販売':age<7?'観察中（7日未満）':'販売あり';
   const reason=conflict?'起点より前に販売明細あり':m.receipt===null?'入荷日が必要':!complete?'入荷日からの履歴が必要':age<7?'最低7日間の観察が必要':`販売開始 ${firstPoints}/40・速度 ${Math.round(pacePoints)}/40・初動 ${Math.round(startPoints)}/20`;
   return {...m,name:p?.name||m.name,origin,age,complete,sold,returns,first:Number.isFinite(first)?first:null,delay:Number.isFinite(first)&&complete?first-origin:null,observedDays,velocity,score,status,reason,stock:p?.stock??null,abc:p?.abc??'—',isNew:age>0&&age<=newDays};
  });
  const registeredKeys=new Set(meta.map(m=>m.key));return {rows,missing:items.filter(p=>!registeredKeys.has(p.key)).length};
 }
 const api={parse,analyze};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RetailNew=api;
})(globalThis);
