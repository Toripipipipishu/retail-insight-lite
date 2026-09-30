'use strict';
function renderTimeAnalysis(){
 if(!state.result)return;
 const mode=$('timeMode').value;
 const buckets=RetailTime.analyze(state.sales,state.opts,mode);
 $('timeDate').hidden=mode!=='date';$('timeDateLabel').hidden=mode!=='date';
 $('timePeriod').textContent=Retail.iso(state.opts.start)+' 〜 '+Retail.iso(state.opts.end);
 $('timeDate').min=Retail.iso(state.opts.start);$('timeDate').max=Retail.iso(state.opts.end);
 if(!$('timeDate').value||$('timeDate').value<$('timeDate').min||$('timeDate').value>$('timeDate').max)$('timeDate').value=$('timeDate').max;
 const metric=$('timeMetric').value;
 const score=p=>metric==='revenue'?p.revenueAvg:p.avg;
 const unit=metric==='revenue'?'円 / 日':'個 / 日';
 let shown=mode==='date'?buckets.filter(b=>b.key===Retail.day($('timeDate').value)):buckets;
 $('timeHelp').textContent=mode==='date'?'選択した日付の商品別実績です。返品は別列に表示します。':'平均は、売上のない日も含む対象日数で割っています。商品の取扱期間や欠品日は補正していません。';
 $('timeSummary').innerHTML=table([mode==='weekday'?'曜日':mode==='monthday'?'毎月の日にち':'日付','対象日数','販売数 / 日','売上 / 日','販売数量','返品数量','販売数 TOP 3'],shown.map(b=>[esc(b.label),b.days+'日'+(b.days<4?'<small>少数データ</small>':''),fmt(b.avg,2),yen(b.revenueAvg),fmt(b.qty,2),fmt(b.returns,2),b.products.filter(p=>p.qty>0).slice(0,3).map(p=>esc(p.name)+(p.store?'（店舗'+esc(p.store)+'）':'')+' '+fmt(p.avg,2)+'個/日').join('<br>')||'販売なし']));
 const selected=$('timeBucket').value;
 $('timeBucket').innerHTML=shown.map(b=>`<option value="${b.key}">${esc(b.label)}（${b.days}日分）</option>`).join('');
 if(shown.some(b=>String(b.key)===selected))$('timeBucket').value=selected;
 function detail(){
  const b=shown.find(b=>String(b.key)===$('timeBucket').value);
  if(!b){$('timeProducts').innerHTML='<p>対象日を選択してください。</p>';return;}
  const ranked=[...b.products].sort((a,b)=>score(b)-score(a));
  const max=Math.max(1,...ranked.map(score));
  $('timeProducts').innerHTML=table(['商品（上位30件）','平均 '+unit,'全期間の日平均比','販売数量','返品数量','売上金額'],ranked.slice(0,30).map(p=>[product(p),`<strong>${fmt(score(p),2)}</strong><div class="time-bar"><i style="width:${Math.max(0,score(p))/max*100}%"></i></div>`,(metric==='revenue'?p.revenueLift:p.lift)===null?'—':fmt(metric==='revenue'?p.revenueLift:p.lift,2)+'倍',fmt(p.qty,2),fmt(p.returns,2),yen(p.revenue)]));
 }
 $('timeBucket').onchange=detail;detail();
}
for(const id of ['timeMode','timeMetric','timeDate'])$(id).onchange=renderTimeAnalysis;
