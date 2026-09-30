'use strict';
const $ = id => document.getElementById(id);
const state = {csv:{},map:{},result:null,opts:null,tab:'overview',sample:false};
const labels = {code:'商品コード *',name:'商品名',store:'店舗ID / コード',stock:'在庫数 *',cost:'原価（単価）',date:'取引日時 *',qty:'数量 *',amount:'明細売上金額',price:'販売単価（代替）',costTotal:'明細原価計',cancel:'取消区分',returnCancel:'返品取消区分',kind:'取引区分',detailKind:'取引明細区分',salesKind:'売上区分',productKind:'商品区分',tx:'取引ID',detail:'取引明細ID',discount:'小計値引き按分',points:'ポイント値引き按分',intax:'内税按分'};
const stockFields = ['code','name','store','stock','cost'];
const salesFields = ['code','name','store','date','qty','amount','price','cost','costTotal','cancel','returnCancel','kind','detailKind','salesKind','productKind','tx','detail','discount','points','intax'];
const esc = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (x,n=0) => x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toLocaleString('ja-JP',{maximumFractionDigits:n});
const yen = x => x === null ? '—' : '¥'+fmt(x);
const msg = text => { $('message').textContent=text; $('message').hidden=!text; };
function tab(name) { state.tab=name; document.querySelectorAll('.tab').forEach(x=>x.hidden=x.id!==name || (!state.result && x.id!=='import')); document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.tab===name)); $('empty').hidden=!!state.result || name==='import'; }
function dirty() { state.result=null; $('mode').textContent='条件未適用'; $('navCount').textContent='0'; tab('import'); }
function loadCSV(type,text,name) {
  const parsed=Retail.parseCSV(text); state.csv[type]=parsed;
  const found=Retail.detect(parsed.headers); state.map[type]={};
  const fields=type==='stock'?stockFields:salesFields;
  fields.forEach(k=>state.map[type][k]=found[k]);
  $(type+'Status').textContent=name+' · '+fmt(parsed.rows.length)+'行';
  $(type+'Mapping').innerHTML=fields.map(k=>`<label>${labels[k]}<select data-type="${type}" data-field="${k}"><option value="-1">使用しない</option>${parsed.headers.map((h,i)=>`<option value="${i}" ${found[k]===i?'selected':''}>${esc(h)}</option>`).join('')}</select></label>`).join('');
  dirty(); $('confirmed').checked=false;
  if(type==='sales' && found.date>=0) {
    const dates=parsed.rows.map(r=>{try{return Retail.day(r[found.date]);}catch{return null;}}).filter(x=>x!==null);
    if(dates.length){let min=Infinity,max=-Infinity;for(const d of dates){min=Math.min(min,d);max=Math.max(max,d);} $('start').value=Retail.iso(min);$('end').value=Retail.iso(max);}
  }
}
async function readFile(type,file) {
  if(!file)return;
  try {
    if(file.size>10*1024*1024)throw Error('CSVは10MB以下にしてください。');
    const buffer=await file.arrayBuffer();let text,encoding='UTF-8';
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{text=new TextDecoder('shift_jis',{fatal:true}).decode(buffer);encoding='Shift_JIS';}
    state.sample=false;loadCSV(type,text,file.name+' / '+encoding);msg('列の対応と期間を確認してください。開始・終了日は販売行からの仮設定です。売上のない日も含む実際のCSV取得期間に合わせて変更してください。');
  } catch(e){delete state.csv[type];delete state.map[type];$(type+'Mapping').innerHTML='';$(type+'Status').textContent='読み込み失敗';dirty();msg(e.message);}
}
function options() {
  const o={start:Retail.day($('start').value),end:Retail.day($('end').value),net:$('net').value==='net'};
  for(const k of ['lead','safety','cycle','window','excess','stale']) {
    const v=Number($(k).value); const min=['cycle','window','excess','stale'].includes(k)?1:0;
    if(!$(k).value || !Number.isInteger(v) || v<min || v>(['excess','stale'].includes(k)?3650:365))throw Error('分析条件の日数を有効な整数にしてください。'); o[k]=v;
  }
  if(o.end-o.start>3650)throw Error('集計期間は10年以内にしてください。');
  return o;
}
function apply() {
  try {
    if(!state.csv.stock||!state.csv.sales)throw Error('在庫CSVと販売履歴CSVの両方を選択してください。');
    if(!$('confirmed').checked)throw Error('対象範囲・期間・在庫基準日の確認欄をチェックしてください。');
    if((state.map.stock.store>=0)!==(state.map.sales.store>=0))throw Error('店舗列は両方のCSVで指定するか、両方で使用しない設定にしてください。');
    const stock=Retail.importData(state.csv.stock,state.map.stock,'stock');const sales=Retail.importData(state.csv.sales,state.map.sales,'sales');
    const o=options();const r=Retail.analyze(stock.data,sales.data,o);
    state.opts=o;state.result=r;state.sales=sales.data;
    $('mode').textContent=state.sample?'架空サンプル':'CSV分析';
    const warnings=[];
    if(state.sample)warnings.push('サンプル表示：架空の雑貨店・1店舗・2026/07/01〜09/28の90日間です。');
    warnings.push(`読込：在庫${stock.data.length}行 / 販売${sales.data.length}行。区分による除外 ${sales.excluded}行、期間外 ${r.outside}行。`);
    if(r.days<90)warnings.push(`履歴は${r.days}日分です。7/30/90日速度の分母は取得できた日数までに短縮しています。`);
    const unmatched=r.items.filter(p=>!p.knownStock).length;if(unmatched)warnings.push(`在庫未登録 ${unmatched}商品：仕入れ提案を保留しています。`);
    if(r.items.some(p=>p.stock<0))warnings.push('マイナス在庫があります。実在庫を確認してから発注してください。');
    if(state.map.sales.amount<0)warnings.push('単価×数量による売上です。値引きは含まれません。');
    if(!['cancel','returnCancel','detailKind','productKind'].every(k=>state.map.sales[k]>=0))warnings.push('取消・返品・商品区分列の一部が未指定です。対象外明細が事前に除去されていることを確認してください。');
    const last=sales.data.reduce((m,s)=>s.date<=o.end?Math.max(m,s.date):m,-Infinity);if(last<o.end)warnings.push('終了日まで販売がない期間があります。履歴の取得漏れでないことを確認してください。');
    warnings.push('粗利は参考値です。原価欠損は「—」、在庫原価で補完した場合は「現在原価で推定」と表示します。');
    msg(warnings.join('\n'));render();tab('overview');
  } catch(e){dirty();msg(e.message);}
}
function badge(p){return `<span class="badge ${p.risk?'danger':p.due===0?'warn':''}">${esc(p.priority)}</span>`;}
function product(p){return `<strong>${esc(p.name)}</strong><small>${esc(p.code)}${p.store?' · 店舗 '+esc(p.store):''}</small>`;}
function due(p){return p.due===null?'—':p.due===0?'今日':`${fmt(p.due)}日以内`;}
function deadline(p){return p.due===null?'—':Retail.iso(state.opts.end+p.due);}
function render() {
  const r=state.result,ps=r.items,o=state.opts;
  $('period').textContent=`${Retail.iso(o.start)} — ${Retail.iso(o.end)} · ${r.days}日間`;
  const revenue=ps.reduce((s,p)=>s+p.revenue,0),known=ps.filter(p=>p.value!==null),value=known.reduce((s,p)=>s+p.value,0),gross=ps.every(p=>p.gross!==null)?ps.reduce((s,p)=>s+p.gross,0):null,risk=ps.filter(p=>p.risk).length;
  $('kpis').innerHTML=[['売上金額',yen(revenue),`純販売数量 ${fmt(ps.reduce((s,p)=>s+p.qty,0),2)}点`],['参考粗利',yen(gross),gross===null?'原価が未登録の明細あり':'原価・税区分の条件を確認'],['在庫金額'+(known.length<ps.length?'（判明分）':''),yen(value),`原価・在庫判明 ${known.length} / ${ps.length}商品`],['納品前の欠品リスク',fmt(risk)+' 商品',`リードタイム ${o.lead}日 / 安全在庫 ${o.safety}日分`]].map((a,i)=>`<div class="kpi ${i===3?'accent':''}"><div class="label">${a[0]}</div><div class="value ${i===3&&risk?'urgent':''}">${a[1]}</div><div class="hint">${a[2]}</div></div>`).join('');
  const sales=new Map(r.daily),values=[];for(let d=o.start;d<=o.end;d++)values.push(sales.get(d)||0);
  const hi=Math.max(1,...values),lo=Math.min(0,...values),H=145,W=650,axis=20+hi/(hi-lo)*H;
  const points=values.map((v,i)=>`${45+i/Math.max(1,values.length-1)*(W-60)},${20+(hi-v)/(hi-lo)*H}`).join(' ');
  $('trend').innerHTML=`<svg viewBox="0 0 670 205" role="img" aria-label="日別売上推移。最高 ${fmt(hi)}円、最低 ${fmt(lo)}円"><line x1="45" y1="${axis}" x2="650" y2="${axis}" stroke="#dce8e2"/><line x1="45" y1="20" x2="650" y2="20" stroke="#edf2ef"/><text x="0" y="24" fill="#81938b" font-size="10">${fmt(hi)}</text><text x="0" y="169" fill="#81938b" font-size="10">${fmt(lo)}</text><polyline points="${points}" fill="none" stroke="#218b73" stroke-width="2.4"/><text x="45" y="195" fill="#81938b" font-size="11">${Retail.iso(o.start)}</text><text x="570" y="195" fill="#81938b" font-size="11">${Retail.iso(o.end)}</text></svg>`;
  const top=[...ps].sort((a,b)=>b.revenue-a.revenue).slice(0,5);const max=Math.max(1,...top.map(p=>p.revenue));
  $('ranking').innerHTML=top.map((p,i)=>`<div class="rank-row"><span class="rank-n">0${i+1}</span><div class="rank-name">${esc(p.name)}<div class="bar"><i style="width:${Math.max(0,p.revenue)/max*100}%"></i></div></div><strong>${yen(p.revenue)}</strong></div>`).join('');
  const actions=ps.filter(p=>p.order>0 && p.due<=o.cycle && p.stock>=0);
  $('navCount').textContent=actions.length;
  $('actions').innerHTML=actions.length?actions.slice(0,4).map(p=>`<div class="action"><div>${product(p)}</div><div><strong class="${p.risk?'urgent':''}">${due(p)}に発注</strong><small>期限 ${deadline(p)}</small></div><div><strong>${fmt(p.order)} 個</strong><small>在庫 ${fmt(p.stock,2)} / ${fmt(p.cover,1)}日分</small></div>${badge(p)}</div>`).join(''):'<p class="muted">補充間隔内に発注期限を迎える商品はありません。</p>';
  renderOrders();renderProducts();renderTimeAnalysis();resetBudget();resetProductTrend();resetMerch();
}
function orderRows(){if(!state.result)return[];return state.result.items.filter(p=>p.order>0&&p.stock>=0&&($('orderFilter').value==='all'||($('orderFilter').value==='now'?p.due===0:p.due<=state.opts.cycle)));}
function productRows(){if(!state.result)return[];const s=$('search').value.toLowerCase(),f=$('productFilter').value;return state.result.items.filter(p=>(p.name+' '+p.code+' '+p.store).toLowerCase().includes(s)&&(f==='all'||f==='risk'&&p.risk||f==='over'&&p.over||f==='dormant'&&p.dormant||f==='unknown'&&!p.knownStock)).sort((a,b)=>$('sort').value==='due'?(a.due??Infinity)-(b.due??Infinity):$('sort').value==='stock'?(b.stock??-Infinity)-(a.stock??-Infinity):b.revenue-a.revenue);}
function table(headers,rows){return `<table><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">該当する商品はありません。</td></tr>`}</tbody></table>`;}
function renderOrders(){const ps=orderRows();$('orderSummary').textContent=`${ps.length}商品 / ${fmt(ps.reduce((s,p)=>s+p.order,0))}個（今発注する場合）`; $('orderTable').innerHTML=table(['商品','仕入優先度','発注期限','推奨発注数','参考仕入額','在庫 / 日数','予測販売速度','発注点','安全在庫','入荷予定日・根拠'],ps.slice(0,500).map(p=>[product(p),badge(p),`<strong>${due(p)}</strong><small>${deadline(p)}</small>`,`<strong>${fmt(p.order)} 個</strong>`,p.cost===null?'—':yen(p.order*p.cost),`${fmt(p.stock,2)} / ${fmt(p.cover,1)}日`,`${fmt(p.velocity,2)} 個/日`,fmt(p.point),fmt(p.safe),`${Retail.iso(state.opts.end+state.opts.lead)}<small>${p.risk?'通常納期では欠品見込み。納期短縮・移動を検討':'目標在庫 '+fmt(p.target)+'個 − 現在庫'}</small>`]));}
function renderProducts(){const ps=productRows();$('productTable').innerHTML=table(['商品','ABC','売上','純販売数 / 返品数','参考粗利','在庫数','在庫金額','全期間 個/日','7日 個/日','30日 個/日','90日 個/日','在庫日数','欠品リスク','在庫状態','最終販売日','発注点','推奨発注数','仕入優先度'],ps.slice(0,500).map(p=>[product(p),`<span class="badge">${p.abc}</span>`,yen(p.revenue),`${fmt(p.qty,2)} / ${fmt(p.returns,2)}`,yen(p.gross)+(p.estimated?'<small>現在原価で推定</small>':''),fmt(p.stock,2),yen(p.value),fmt(p.daily,2),fmt(p.v7,2),fmt(p.v30,2),fmt(p.v90,2),p.cover===null?'算出不可':fmt(p.cover,1)+'日',p.risk?'<span class="badge danger">納品前に欠品</span>':'—',p.dormant?'滞留候補':p.over?'過剰候補':'—',p.last===null?'期間内販売なし':Retail.iso(p.last),fmt(p.point),fmt(p.order),badge(p)]));}
function download(name,rows){const url=URL.createObjectURL(new Blob([Retail.csvExport(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$('startImport').onclick=()=>tab('import');$('showOrders').onclick=()=>tab('orders');
for(const type of ['stock','sales']) {
  $(type+'File').onchange=e=>readFile(type,e.target.files[0]);const drop=$(type+'Drop');
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('over');};drop.ondragleave=()=>drop.classList.remove('over');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');if(e.dataTransfer.files.length!==1){msg('1つずつCSVを読み込んでください。');return;}readFile(type,e.dataTransfer.files[0]);};
}
document.addEventListener('change',e=>{if(e.target.dataset.field){state.map[e.target.dataset.type][e.target.dataset.field]=Number(e.target.value);$('confirmed').checked=false;dirty();}});
for(const k of ['start','end','lead','safety','cycle','window','excess','stale','net'])$(k).onchange=()=>{dirty();$('confirmed').checked=false;};
$('apply').onclick=apply;
$('sample').onclick=()=>{state.sample=true;loadCSV('stock',SAMPLE.stock,'inventory.csv（架空）');loadCSV('sales',SAMPLE.sales,'sales.csv（架空）');$('start').value='2026-07-01';$('end').value='2026-09-28';$('lead').value=7;$('safety').value=3;$('cycle').value=14;$('window').value=30;$('stale').value=60;$('excess').value=90;$('net').value='net';$('confirmed').checked=true;apply();};
$('reset').onclick=()=>location.reload();$('orderFilter').onchange=renderOrders;$('productFilter').onchange=renderProducts;$('sort').onchange=renderProducts;$('search').oninput=renderProducts;
$('exportOrders').onclick=()=>{if(!state.result)return;download('order-proposals.csv',[['商品コード','商品名','店舗','優先度','発注期限','何日以内','推奨発注数(今発注)','参考仕入額','在庫数','在庫日数','販売速度','発注点','安全在庫','基準日','リードタイム','補充間隔','速度対象日数'],...orderRows().map(p=>[p.code,p.name,p.store,p.priority,deadline(p),p.due,p.order,p.cost===null?'':p.order*p.cost,p.stock,p.cover,p.velocity,p.point,p.safe,Retail.iso(state.opts.end),state.opts.lead,state.opts.cycle,state.opts.window])]);};
$('exportProducts').onclick=()=>{if(!state.result)return;download('product-analysis.csv',[['商品コード','商品名','店舗','ABC','売上','純販売数量','返品数量','参考粗利','原価補完あり','在庫数','在庫金額','全期間速度','7日速度','30日速度','90日速度','在庫日数','欠品リスク','過剰候補','滞留候補','発注点','推奨発注数(今発注)','仕入優先度'],...productRows().map(p=>[p.code,p.name,p.store,p.abc,p.revenue,p.qty,p.returns,p.gross,p.estimated,p.stock,p.value,p.daily,p.v7,p.v30,p.v90,p.cover,p.risk,p.over,p.dormant,p.point,p.order,p.priority])]);};
