'use strict';
let budgetResult=null;
function resetBudget(){
 budgetResult=null;$('budgetResult').hidden=true;$('budgetExport').disabled=true;
 $('budgetMessage').textContent='初期値は試算例です。使える仕入れ資金と費用条件を確認して「発注計画を作る」を押してください。';
 const monthly=$('budgetMode').value!=='fixed';$('budgetFinancial').hidden=!monthly;$('budgetGoalLabel').hidden=$('budgetMode').value!=='goal';
 if(state.result){const f=RetailBudget.forecast(state.sales,state.opts);$('budgetPeriod').textContent='売上計画の対象月：'+f.month+' / 在庫基準日：'+Retail.iso(state.opts.end);}
}
function createBudget(){
 if(!state.result)return;
 try{
  const n=id=>{if(!$(id).value.trim())throw Error('空欄の金額・率を入力してください。');return Number($(id).value);};
  const input={mode:$('budgetMode').value,cash:n('budgetCash'),revenue:n('budgetRevenue'),fixed:n('budgetFixed'),variableRate:n('budgetVariable'),costRate:n('budgetCostRate'),profitRate:n('budgetProfitRate')};
  const r=RetailBudget.plan(state.result.items,state.sales,state.opts,input);budgetResult=r;
  $('budgetResult').hidden=false;$('budgetExport').disabled=r.blocked||!r.candidates.some(c=>c.allocated>0);
  const notices=[];
  if(r.monthly){
   notices.push(r.blocked?'この条件では目標利益を満たす計画を作れません。売上・固定費・原価率・目標利益率を見直してください。発注配分だけで赤字を解消したとは扱いません。':'入力した売上・費用条件では目標利益率を満たします。ただし、今回の発注だけでその売上や利益を実現できるという意味ではありません。');
   if(!r.baseMonth)notices.push('直近の正の売上実績がないため、商品別の目標数量を配分できません。');
   if(input.mode==='goal')notices.push('目標売上は需要予測ではありません。現在の商品構成のまま販売数量が一律に増減する仮定です。');
  }
  if(r.shortfall&&!r.blocked)notices.push('必要補充に対して'+fmt(r.shortfall)+'個が未充足です。予算不足の場合、想定売上を達成できない可能性があります。');
  if(r.excluded.length)notices.push(r.excluded.length+'商品は原価・在庫・単品粗利の条件を満たさず除外しています。');
  if(!r.candidates.length)notices.push('条件に合う発注候補がありません。');
  notices.push('現在の在庫原価を仕入単価の参考にしています。発注残・予約在庫・送料・ロット・仕入値変更は未反映です。予算を使い切ることは目的にしません。');
  $('budgetMessage').textContent=notices.join('\n');
  $('budgetKpis').innerHTML=[['今回の仕入れ配分',yen(r.spend),'上限 '+yen(r.cash)],['予算の残額',yen(r.left),'未充足 '+fmt(r.shortfall)+'個'],['必要補充の参考額',yen(r.needed),r.monthly?'対象月末＋安全在庫を想定':'通常の補充間隔を想定'],['採算条件',r.monthly?(r.feasible?'目標利益率以上':'目標利益率未達'):'予算指定のみ',r.monthly?'売上シナリオに対する判定':'月間の利益判定なし']].map(a=>`<div class="kpi"><div class="label">${a[0]}</div><div class="value budget-value">${a[1]}</div><div class="hint">${a[2]}</div></div>`).join('');
  $('budgetProfit').hidden=!r.monthly;
  $('budgetProfit').innerHTML='<h3>月次の採算シミュレーション</h3>'+table(['項目','金額・条件'],[['計画売上',yen(r.revenue)],['想定売上原価',yen(r.cogs)+'（原価率 '+fmt(input.costRate,2)+'%）'],['固定費',yen(input.fixed)],['その他変動費',yen(r.revenue*input.variableRate/100)],['参考営業利益',yen(r.operatingProfit)],['目標利益',yen(r.targetProfit)+'（売上の '+fmt(input.profitRate,2)+'%）'],['損益分岐売上',yen(r.breakEven)],['目標利益率に必要な売上',yen(r.targetSales)]])+'<p class="footnote">売上 − 売上原価 − 固定費 − その他変動費で計算。税金・借入返済等は含みません。仕入支払額をそのまま当月の原価にしていません。全項目の税込・税抜基準を揃えてください。</p>';
  $('budgetForecast').hidden=input.mode!=='forecast';
  $('budgetForecast').innerHTML='<h3>売上予測の根拠（簡易推計）</h3>'+table(['項目','値'],[['対象月',esc(r.f.month)],['直近30日の日平均売上',yen(r.f.recent)],['前の30日との傾向係数',fmt(r.f.trend,3)+'倍'],['月別の季節補正',r.f.hasSeason?fmt(r.f.seasonal,3)+'倍':'未適用（連続した完全12か月が不足、または基準売上0）'],['翌月売上の試算',yen(r.f.revenue)]])+'<p class="footnote">直近30日平均 × 対象月の日数 × 傾向係数 × 季節補正。傾向係数は0.75〜1.25倍。完全12か月がある場合、対象月と直近期間の月別日平均の比で補正（0.25〜4倍）。1年だけの季節性は暫定的で、キャンペーンや欠品の影響を区別できません。</p>';
  $('budgetTable').innerHTML=table(['商品','優先理由','予算内発注数','参考仕入額','必要数 / 未充足','発注期限','予算計算単価','実績単価粗利率'],r.candidates.slice(0,500).map(c=>[product(c.p),c.risk?'納品前の欠品リスク':c.due===0?'発注点以下':'補充計画',`<strong>${fmt(c.allocated)} 個</strong>`,yen(c.allocated*c.unit),fmt(c.need)+' / '+fmt(c.need-c.allocated),c.due===0?'基準日中':fmt(c.due)+'日以内',yen(c.unit),fmt((c.price-c.p.cost)/c.price*100,1)+'%']));
  $('budgetExcluded').innerHTML=r.excluded.length?'<h3>配分から除外した商品（先頭50件）</h3>'+table(['商品','理由'],r.excluded.slice(0,50).map(x=>[product(x.p),esc(x.reason)])):'';
 }catch(e){budgetResult=null;$('budgetResult').hidden=true;$('budgetExport').disabled=true;$('budgetMessage').textContent=e.message;}
}
for(const id of ['budgetMode','budgetCash','budgetRevenue','budgetFixed','budgetVariable','budgetCostRate','budgetProfitRate'])$(id).oninput=resetBudget;
$('budgetBuild').onclick=createBudget;
$('budgetExport').onclick=()=>{const r=budgetResult;if(!r||r.blocked)return;download('budget-order-plan.csv',[['商品コード','商品名','店舗','発注数量','予算計算単価','参考仕入額','必要数','未充足','何日以内','基準日','モード','計画対象月','資金上限','計画売上','シナリオ参考利益'],...r.candidates.filter(c=>c.allocated>0).map(c=>[c.p.code,c.p.name,c.p.store,c.allocated,c.unit,c.unit*c.allocated,c.need,c.need-c.allocated,c.due,Retail.iso(state.opts.end),r.monthly?($('budgetMode').value==='goal'?'売上指定':'売上予測'):'予算指定',r.monthly?r.f.month:'',r.cash,r.monthly?r.revenue:'',r.monthly?r.operatingProfit:''])]);};
