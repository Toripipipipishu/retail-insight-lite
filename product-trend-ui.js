'use strict';
let productHistory=[],launchDates=new Map(),trendData=null;
function resetProductTrend(){
 productHistory=[];launchDates.clear();$('historyStatus').textContent='日末在庫履歴：未読込（任意）';$('historyFile').value='';$('trendSearch').value='';populateTrendProducts();
}
function populateTrendProducts(){
 if(!state.result)return;const old=$('trendProduct').value,q=$('trendSearch').value.toLowerCase();
 const items=state.result.items.filter(p=>(p.code+' '+p.name+' '+p.store).toLowerCase().includes(q));
 $('trendProduct').innerHTML=items.map(p=>`<option value="${esc(p.key)}">${esc(p.name)} / ${esc(p.code)}${p.store?' / 店舗'+esc(p.store):''}</option>`).join('');
 if(items.some(p=>p.key===old))$('trendProduct').value=old;showProductTrend();
}
function showProductTrend(){
 if(!state.result)return;const key=$('trendProduct').value,p=state.result.items.find(p=>p.key===key);
 if(!p){$('productTrendChart').innerHTML='該当する商品はありません。';$('trendStats').innerHTML='';$('trendNote').textContent='';$('trendDaily').innerHTML='';trendData=null;return;}
 $('launchDate').value=launchDates.has(key)?Retail.iso(launchDates.get(key)):'';
 try{
  const r=RetailTrend.analyze(state.sales,state.opts,key,launchDates.get(key)??null,productHistory);trendData=r;
  $('trendNote').textContent=(r.launch!==null?'入力した発売日':r.origin!==null?'履歴内の初回販売日（発売日ではありません）':'起点不明')+(r.origin!==null?'：'+Retail.iso(r.origin):'')+'。'+(r.beforeLaunch?'発売日より前の販売があります。入力日を確認してください。 ':'')+'日末在庫0は一日中の欠品を意味しません。販売低下の原因はこのグラフだけでは断定しません。';
  $('trendStats').innerHTML=[['直近7日の販売速度',fmt(r.recent,2)+' 個/日'],['その前7日との比較',r.ratio===null?'比較不可':fmt((r.ratio-1)*100,1)+'%'],['日末在庫0の観測日',r.zeroStock+' / '+r.knownStock+'日'],['現在庫',fmt(p.stock,2)+' 個']].map(a=>`<div class="kpi"><div class="label">${a[0]}</div><div class="value budget-value">${a[1]}</div></div>`).join('');
  const visible=r.series.slice(-Number($('trendRange').value));const W=900,H=210,top=28,left=48,width=824;
  const maximum=Math.max(1,...visible.map(d=>Math.max(d.qty,d.ma7??0,d.ma30??0))),stockMax=Math.max(1,...visible.map(d=>d.stock??0));
  const x=i=>left+(i+.5)*width/Math.max(1,visible.length),y=v=>top+H-v/maximum*H;
  const path=field=>{let s='',connected=false;visible.forEach((d,i)=>{if(d[field]===null){connected=false;return;}s+=(connected?' L':' M')+x(i)+' '+y(d[field]);connected=true;});return s;};
  const bars=visible.map((d,i)=>`<rect x="${x(i)-width/visible.length*.32}" y="${y(d.qty)}" width="${Math.max(.5,width/visible.length*.64)}" height="${top+H-y(d.qty)}" fill="#b4dcf4"><title>${Retail.iso(d.date)} / 販売 ${d.qty}個</title></rect>${d.stock===0?`<rect x="${x(i)-width/visible.length*.45}" y="28" width="${width/visible.length*.9}" height="210" fill="#e970501c"/>`:''}`).join('');
  const stockDots=visible.map((d,i)=>d.stock===null?'':`<circle cx="${x(i)}" cy="${290+70-d.stock/stockMax*70}" r="3" fill="${d.stock===0?'#bc4231':'#8871b4'}"><title>${Retail.iso(d.date)} / 日末在庫 ${d.stock}個</title></circle>`).join('');
  const tick=d=>$('trendAxis').value==='elapsed'?(d.elapsed===null?'起点不明':d.elapsed+'日目'):Retail.iso(d.date);
  $('productTrendChart').innerHTML=`<svg viewBox="0 0 920 402" role="img" aria-label="${esc(p.name)}の日別販売数と移動平均、日末在庫"><text x="48" y="16" font-size="12" fill="#557084">販売数量・個/日（上）</text><text x="5" y="34" font-size="11">${fmt(maximum,1)}</text><line x1="48" y1="238" x2="872" y2="238" stroke="#d3e3ef"/>${bars}<path d="${path('ma7')}" stroke="#007bb8" stroke-width="2.6" fill="none"/><path d="${path('ma30')}" stroke="#d78828" stroke-width="2.6" fill="none"/><text x="48" y="278" font-size="12" fill="#557084">日末在庫・個（下／履歴のある日だけ）</text><text x="5" y="300" font-size="11">${fmt(stockMax)}</text><line x1="48" y1="360" x2="872" y2="360" stroke="#d3e3ef"/>${stockDots}${visible.length?`<text x="48" y="391" font-size="12">${tick(visible[0])}</text><text x="872" y="391" font-size="12" text-anchor="end">${tick(visible[visible.length-1])}</text>`:''}</svg>`;
  $('trendDaily').innerHTML=table(['日付','起点から','販売数量','返品数量','7日平均','30日平均','日末在庫'],[...visible].reverse().slice(0,90).map(d=>[Retail.iso(d.date),d.elapsed===null?'—':d.elapsed+'日',fmt(d.qty,2),fmt(d.returns,2),fmt(d.ma7,2),fmt(d.ma30,2),fmt(d.stock,2)]));
 }catch(e){$('trendNote').textContent=e.message;trendData=null;$('productTrendChart').innerHTML='';}
}
$('trendSearch').oninput=populateTrendProducts;
for(const id of ['trendProduct','trendRange','trendAxis'])$(id).onchange=showProductTrend;
$('launchDate').onchange=()=>{try{const key=$('trendProduct').value;if($('launchDate').value)launchDates.set(key,Retail.day($('launchDate').value));else launchDates.delete(key);showProductTrend();}catch(e){$('trendNote').textContent=e.message;}};
$('historyFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>10*1024*1024)throw Error('10MB以下で指定してください。');const bytes=await file.arrayBuffer();let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('shift_jis',{fatal:true}).decode(bytes);}const rows=RetailTrend.parseHistory(Retail.parseCSV(text),Retail,state.map.stock.store>=0);productHistory=rows;$('historyStatus').textContent='日末在庫履歴：'+rows.length+'行（在庫数の推定・補間はしません）';showProductTrend();}catch(e){productHistory=[];$('historyStatus').textContent=e.message;showProductTrend();}};
$('trendExport').onclick=()=>{if(!trendData)return;download('product-sales-trend.csv',[['日付','起点からの日数','販売数量','返品数量','7日平均','30日平均','日末在庫'],...trendData.series.map(d=>[Retail.iso(d.date),d.elapsed,d.qty,d.returns,d.ma7,d.ma30,d.stock])]);};
