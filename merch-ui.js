'use strict';
let productMeta=[],abcOverrides=new Map(),newProductRows=[];
function resetMerch(){productMeta=[];abcOverrides.clear();$('metaFile').value='';$('metaStatus').textContent='商品情報CSVは未読込です。未販売商品も含む一覧を指定してください。';renderABC();renderNewProducts();}
function operationalABC(p){return abcOverrides.get(p.key)||p.abc;}
function renderABC(){
 if(!state.result)return;const ps=state.result.items,total=ps.reduce((n,p)=>n+Math.max(0,p.revenue),0);
 $('abcSummary').innerHTML=table(['自動ABC','商品数','正の売上構成比','純売上','在庫金額（判明分）'],['A','B','C','—'].map(a=>{const group=ps.filter(p=>p.abc===a);return [a,group.length,fmt(total?group.reduce((n,p)=>n+Math.max(0,p.revenue),0)/total*100:0,1)+'%',yen(group.reduce((n,p)=>n+p.revenue,0)),yen(group.reduce((n,p)=>n+(p.value??0),0))];}));
 const selected=$('abcFilter').value;const rows=[...ps].filter(p=>selected==='all'||operationalABC(p)===selected).sort((a,b)=>b.revenue-a.revenue);
 $('abcProducts').innerHTML=table(['商品','自動ABC','運用ABC（手動指定可）','売上','在庫数'],rows.slice(0,500).map(p=>[product(p),p.abc,`<select aria-label="${esc(p.name)}の運用ABC" data-abc-key="${esc(p.key)}"><option value="auto">自動に従う</option>${['A','B','C'].map(a=>`<option value="${a}" ${abcOverrides.get(p.key)===a?'selected':''}>${a}</option>`).join('')}</select>`,yen(p.revenue),fmt(p.stock,2)]));
}
function renderNewProducts(){
 if(!state.result)return;
 try{const r=RetailNew.analyze(state.result.items,state.sales,productMeta,state.opts,Number($('newDays').value),Number($('newTarget').value));
 $('newCoverage').textContent=`登録情報 ${productMeta.length}商品 / 分析商品のうち日付未登録 ${r.missing}商品。未登録商品は新旧を判定できません。`;
 const filter=$('newFilter').value;newProductRows=r.rows.filter(p=>filter==='all'||filter==='new'&&p.isNew||filter==='unsold'&&p.status==='入荷後未販売'||filter==='sold'&&p.sold>0).sort((a,b)=>(a.score??-1)-(b.score??-1)||b.age-a.age);
 $('newProductsRows').innerHTML=table(['商品','状態','起点 / 経過','販売数 / 返品','在庫数','初回販売 / 待ち日数','販売速度','参考スコア / 根拠','自動ABC'],newProductRows.slice(0,500).map(p=>[product(p),p.status+(p.isNew?'<small>新商品期間内</small>':''),Retail.iso(p.origin)+`<small>${p.receipt!==null?'初回入荷':'登録'} / ${p.age>0?p.age+'日間':'予定日'}</small>`,fmt(p.sold,2)+' / '+fmt(p.returns,2),fmt(p.stock,2),p.first===null?'観測期間内の販売なし':Retail.iso(p.first)+'<small>'+fmt(p.delay)+'日後</small>',fmt(p.velocity,2)+'個/日',p.score===null?'保留<small>'+esc(p.reason)+'</small>':p.score+' / 100<small>'+esc(p.reason)+'</small>',p.abc]));
 }catch(e){newProductRows=[];$('newCoverage').textContent=e.message;$('newProductsRows').innerHTML='';}
}
$('abcFilter').onchange=renderABC;$('abcProducts').onchange=e=>{if(e.target.dataset.abcKey){const key=e.target.dataset.abcKey;if(e.target.value==='auto')abcOverrides.delete(key);else abcOverrides.set(key,e.target.value);renderABC();}};
for(const id of ['newFilter','newDays','newTarget'])$(id).onchange=renderNewProducts;
async function importMeta(file){try{if(!state.result)throw Error('先に在庫と販売履歴を分析してください。');if(!file)return;if(file.size>10*1024*1024)throw Error('10MB以下で指定してください。');const b=await file.arrayBuffer();let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(b);}catch{text=new TextDecoder('shift_jis',{fatal:true}).decode(b);}productMeta=RetailNew.parse(Retail.parseCSV(text),Retail,state.map.stock.store>=0);$('metaStatus').textContent=file.name+'：'+productMeta.length+'商品を適用しました。';renderNewProducts();}catch(e){productMeta=[];$('metaStatus').textContent=e.message;renderNewProducts();}}
$('metaFile').onchange=e=>importMeta(e.target.files[0]);
$('metaSample').onclick=()=>{if(!state.sample){$('metaStatus').textContent='架空データ専用です。まず「サンプルで試す」を選んでください。';return;}productMeta=RetailNew.parse(Retail.parseCSV(NEW_PRODUCT_SAMPLE),Retail,true);$('metaStatus').textContent='架空の商品登録・初回入荷情報を適用しました。';renderNewProducts();};
$('abcExport').onclick=()=>{if(!state.result)return;download('abc-categories.csv',[['商品コード','商品名','店舗','自動ABC','運用ABC','手動指定','売上'],...state.result.items.map(p=>[p.code,p.name,p.store,p.abc,operationalABC(p),abcOverrides.has(p.key),p.revenue])]);};
$('newExport').onclick=()=>download('new-product-analysis.csv',[['商品コード','商品名','店舗','登録日','初回入荷日','状態','経過日数','販売数','返品数','販売速度','参考スコア','根拠'],...newProductRows.map(p=>[p.code,p.name,p.store,p.registered===null?'':Retail.iso(p.registered),p.receipt===null?'':Retail.iso(p.receipt),p.status,p.age,p.sold,p.returns,p.velocity,p.score,p.reason])]);
