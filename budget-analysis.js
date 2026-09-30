(function(root){
 'use strict';
 const DAY=86400000,day=(y,m,d)=>Date.UTC(y,m,d)/DAY;
 const stamp=d=>new Date(d*DAY),monthKey=d=>stamp(d).toISOString().slice(0,7);
 function forecast(sales,opts){
  const last=stamp(opts.end),year=last.getUTCFullYear(),month=last.getUTCMonth();
  const nextStart=day(year,month+1,1),nextEnd=day(year,month+2,0),monthDays=nextEnd-nextStart+1;
  const sums=new Map();for(const s of sales)if(s.date>=opts.start&&s.date<=opts.end)sums.set(s.date,(sums.get(s.date)||0)+s.amount-(opts.net?s.discount+s.points+s.intax:0));
  const mean=(a,b)=>{let total=0;for(let d=a;d<=b;d++)total+=sums.get(d)||0;return Math.max(0,total/Math.max(1,b-a+1));};
  const span=opts.end-opts.start+1,recent=mean(Math.max(opts.start,opts.end-29),opts.end);
  const previous=span>=60?mean(opts.end-59,opts.end-30):null;
  const rawTrend=previous>0?recent/previous:1,trend=Math.min(1.25,Math.max(.75,rawTrend));
  const completeEnd=opts.end===day(year,month+1,0)?opts.end:day(year,month,0);
  const ce=stamp(completeEnd),completeStart=day(ce.getUTCFullYear(),ce.getUTCMonth()-11,1);
  let seasonal=1,hasSeason=opts.start<=completeStart,monthly=[];
  if(hasSeason){
   for(let i=0;i<12;i++){
    const a=day(ce.getUTCFullYear(),ce.getUTCMonth()-11+i,1),b=day(ce.getUTCFullYear(),ce.getUTCMonth()-10+i,0);
    monthly.push({month:stamp(a).getUTCMonth(),label:monthKey(a),days:b-a+1,daily:mean(a,b)});
   }
   const avg=monthly.reduce((n,m)=>n+m.daily*m.days,0)/(completeEnd-completeStart+1);
   if(avg>0){
    const index=new Map(monthly.map(m=>[m.month,m.daily/avg]));
    let recentWeight=0,count=0;for(let d=Math.max(opts.start,opts.end-29);d<=opts.end;d++){recentWeight+=index.get(stamp(d).getUTCMonth());count++;}
    const target=index.get(stamp(nextStart).getUTCMonth());
    if(recentWeight>0)seasonal=Math.max(.25,Math.min(4,target/(recentWeight/count)));else hasSeason=false;
   }else hasSeason=false;
  }
  if(!hasSeason)seasonal=1;
  return {revenue:recent*monthDays*trend*seasonal,recent,previous,trend,rawTrend,seasonal,hasSeason,monthly,month:monthKey(nextStart),monthDays,start:nextStart,end:nextEnd,span};
 }
 function plan(items,sales,opts,input){
  for(const k of ['cash','revenue','fixed','variableRate','costRate','profitRate'])if(!Number.isFinite(input[k])||input[k]<0)throw Error('予算・費用・率は0以上の数値にしてください。');
  if(input.cash>1e12||input.revenue>1e12||input.fixed>1e12)throw Error('金額は1兆円以下にしてください。');
  for(const k of ['variableRate','costRate','profitRate'])if(input[k]>100)throw Error('率は0〜100%で指定してください。');
  if(!['fixed','forecast','goal'].includes(input.mode))throw Error('計画モードが不正です。');
  const f=forecast(sales,opts),monthly=input.mode!=='fixed';
  const revenue=input.mode==='goal'?input.revenue:f.revenue;
  const ratio=input.costRate/100,variable=input.variableRate/100,margin=input.profitRate/100;
  const cogs=revenue*ratio,operatingProfit=revenue-cogs-revenue*variable-input.fixed,targetProfit=revenue*margin;
  const feasible=revenue>0&&operatingProfit>=targetProfit-1e-8;
  const breakEven=1-ratio-variable>0?input.fixed/(1-ratio-variable):null;
  const targetSales=1-ratio-variable-margin>0?input.fixed/(1-ratio-variable-margin):null;
  let observed=0;const historyDays=Math.min(opts.window,opts.end-opts.start+1);
  for(const s of sales)if(s.date>opts.end-historyDays&&s.date<=opts.end)observed+=s.amount-(opts.net?s.discount+s.points+s.intax:0);
  const baseMonth=Math.max(0,observed/historyDays*f.monthDays);
  const scale=monthly?(baseMonth>0?revenue/baseMonth:0):1;
  if(monthly&&scale>20)throw Error('目標が直近実績の20倍を超えています。商品構成・販売能力を見直して目標を設定してください。');
  const excluded=[],candidates=[];const gap=f.start-opts.end-1;
  for(const p of items){
   if(!p.knownStock||p.stock<0){excluded.push({p,reason:'在庫未登録・負在庫'});continue;}
   if(p.velocity<=0)continue;
   if(p.cost===null||p.cost<=0){excluded.push({p,reason:'仕入原価が未登録または0円'});continue;}
   const price=p.qty>0?p.revenue/p.qty:null;
   if(price===null||price<=p.cost){excluded.push({p,reason:'実績単価の粗利が0以下・算出不可'});continue;}
   const v=p.velocity*scale;if(v<=0)continue;
   const safe=Math.ceil(v*opts.safety),point=Math.ceil(v*opts.lead+safe);
   const horizon=monthly?Math.max(gap+f.monthDays,opts.lead+opts.cycle):opts.lead+opts.cycle;
   const target=Math.ceil(v*horizon+safe),need=Math.max(0,Math.ceil(target-p.stock));
   const due=Math.max(0,Math.floor((p.stock-point)/v));
   if(!need||!monthly&&due>opts.cycle)continue;
   // Round the current reference purchase cost upward to a whole yen to avoid overspending.
   const unit=Math.ceil(p.cost),essential=Math.min(need,Math.max(0,Math.ceil(point-p.stock)));
   candidates.push({p,unit,price,velocity:v,need,essential,allocated:0,due,risk:p.stock/v<=opts.lead,returnOnCost:(price-p.cost)/p.cost,stockDays:p.stock/v});
  }
  candidates.sort((a,b)=>Number(b.risk)-Number(a.risk)||a.due-b.due||b.returnOnCost-a.returnOnCost||b.velocity-a.velocity||a.p.key.localeCompare(b.p.key));
  let left=Math.floor(input.cash);const blocked=monthly&&(!feasible||baseMonth<=0);
  if(!blocked){
   for(const stage of ['essential','need'])for(const c of candidates){
    const quantity=Math.min(c[stage]-c.allocated,Math.floor(left/c.unit));
    if(quantity>0){c.allocated+=quantity;left-=quantity*c.unit;}
   }
  }
  const spend=Math.floor(input.cash)-left,needed=candidates.reduce((n,c)=>n+c.need*c.unit,0);
  return {f,monthly,revenue,cogs,operatingProfit,targetProfit,feasible,breakEven,targetSales,scale,baseMonth,candidates,excluded,spend,left,needed,blocked,shortfall:candidates.reduce((n,c)=>n+c.need-c.allocated,0),cash:Math.floor(input.cash)};
 }
 const api={forecast,plan};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RetailBudget=api;
})(globalThis);
