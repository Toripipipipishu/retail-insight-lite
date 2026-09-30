(function (root) {
  'use strict';
  const DAY = 86400000;
  const norm = s => String(s).normalize('NFKC').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_]/g, '');
  const fields = {
    code: ['商品コード', 'sku', 'productCode', '商品番号', 'JANコード'], name: ['商品名', 'productName', 'name'],
    store: ['店舗ID', 'storeId', '店舗コード'], stock: ['在庫数', '在庫数量', '現在庫', 'stock', 'quantityOnHand'],
    cost: ['原価', '原価（税抜）', '仕入単価', 'unitCost', 'cost'], date: ['取引日時', '販売日', '売上日', '日付', 'date'],
    qty: ['数量', '販売数量', '売上数量', 'quantity', 'qty'], amount: ['値引き後計', '明細売上金額', '売上金額', 'salesAmount', 'revenue'],
    price: ['販売単価', '商品単価', '単価', 'unitPrice'], costTotal: ['原価計', '明細原価金額', 'costTotal'],
    cancel: ['取消区分'], returnCancel: ['返品取消区分'], kind: ['取引区分'], detailKind: ['取引明細区分'], salesKind: ['売上区分'], productKind: ['商品区分'],
    tx: ['取引ID', 'transactionId'], detail: ['取引明細ID', 'detailId'],
    discount: ['小計値引き按分'], points: ['ポイント値引き按分'], intax: ['内税按分']
  };
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = [], cell = '', quoted = false, closed = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (c === '"') { if (text[i+1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += c; }
      else if (c === '"') { if (cell || closed) throw Error('引用符の位置が不正です。'); quoted = true; }
      else if (c === ',' || c === '\n' || c === '\r') {
        row.push(cell); cell = ''; closed = false;
        if (c !== ',') { if (row.some(v => v.trim())) rows.push(row); row = []; if (c === '\r' && text[i+1] === '\n') i++; }
      } else { if (closed) throw Error('閉じ引用符の後に文字があります。'); cell += c; }
    }
    if (quoted) throw Error('CSVの引用符が閉じていません。');
    row.push(cell); if (row.some(v => v.trim())) rows.push(row);
    if (rows.length < 2) throw Error('ヘッダーと1行以上のデータが必要です。');
    const headers = rows.shift().map(x => x.trim());
    if (headers.some(x => !x) || new Set(headers.map(norm)).size !== headers.length) throw Error('空または重複した列名があります。');
    rows.forEach((r, i) => { if (r.length !== headers.length) throw Error(`データ行${i+1}の列数が一致しません。`); });
    if (rows.length > 100000) throw Error('上限は100,000行です。期間を分けてください。');
    return { headers, rows };
  }
  function detect(headers) { const m = {}; for (const [key, aliases] of Object.entries(fields)) { m[key] = headers.findIndex(h => aliases.some(a => norm(a) === norm(h))); } return m; }
  function number(v, required = false) {
    const s = String(v ?? '').normalize('NFKC').trim().replace(/[¥￥,\s]/g, '');
    if (!s) { if (required) throw Error('数値が空欄です'); return null; }
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) || !Number.isFinite(Number(s))) throw Error(`数値が不正です: ${String(v).slice(0,40)}`);
    return Number(s);
  }
  function day(v) {
    const m = String(v).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?$)/);
    if (!m) throw Error('日付は YYYY-MM-DD または YYYY/MM/DD（時刻付き可）で指定してください');
    const d = Date.UTC(+m[1], +m[2]-1, +m[3]); const x = new Date(d);
    if (x.getUTCFullYear() !== +m[1] || x.getUTCMonth() !== +m[2]-1 || x.getUTCDate() !== +m[3]) throw Error('存在しない日付です');
    return d / DAY;
  }
  const iso = d => new Date(d*DAY).toISOString().slice(0,10);
  const keyOf = (store, code) => JSON.stringify([store, code]);
  function importData(csv, map, type) {
    const required = type === 'stock' ? ['code','stock'] : ['code','date','qty'];
    for (const k of required) if (!(map[k] >= 0)) throw Error(`必須列がありません: ${k}`);
    if (type === 'sales' && !(map.amount >= 0 || map.price >= 0)) throw Error('明細売上金額または販売単価が必要です。');
    if (type === 'sales') {
      const headerTotals = ['合計','小計','数量合計','返品数量合計','原価合計','単価値引き前小計','単価値引き小計'].map(norm);
      for (const k of ['qty','amount','price','cost','costTotal']) if (map[k] >= 0 && headerTotals.includes(norm(csv.headers[map[k]]))) throw Error('取引全体の合計列は商品明細に使えません。数量・値引き後計・原価計などを指定してください。');
    }
    const selected = Object.values(map).filter(x => x >= 0);
    if (new Set(selected).size !== selected.length) throw Error('同じ列を複数項目に指定できません。');
    const data = [], seen = new Set(), errors = []; let excluded = 0, duplicates = 0;
    csv.rows.forEach((row, index) => {
      const v = k => map[k] >= 0 ? row[map[k]].trim() : '';
      const num = (k, req = false) => number(v(k), req);
      try {
        if (type === 'sales') {
          for (const [k, valid] of Object.entries({cancel:['0','1'],returnCancel:['0','1','2'],kind:['1','2','3','4','5','6','7','8','11','13','14','16'],detailKind:['1','2','3'],salesKind:['0','1'],productKind:['0','1','2','3','4','5','6','7','8','A','B']})) {
            if (v(k) && !valid.includes(v(k))) throw Error(`${k}の区分値が未対応です`);
          }
          if (v('cancel') === '1' || ['1','2'].includes(v('returnCancel')) || (v('kind') && v('kind') !== '1') || v('detailKind') === '3' || v('salesKind') === '1' || (v('productKind') && v('productKind') !== '0')) { excluded++; return; }
        }
        const code = v('code'); if (!code) throw Error('商品コードが空欄です');
        const store = v('store'); if (map.store >= 0 && !store) throw Error('店舗が空欄です');
        const item = { code, store, name:v('name') || code, key:keyOf(store,code), cost:num('cost') };
        if (item.cost !== null && item.cost < 0) throw Error('原価は0以上で指定してください');
        if (type === 'stock') {
          item.stock = num('stock', true);
          if (seen.has(item.key)) throw Error('同一店舗・商品の在庫が重複しています。単一時点・商品単位に集約してください');
          seen.add(item.key);
        } else {
          item.date = day(v('date')); const q = num('qty',true);
          const returned = v('detailKind') === '2' || q < 0;
          item.qty = returned ? -Math.abs(q) : q;
          const raw = num('amount'); const price = num('price');
          if (raw === null && price === null) throw Error('売上金額と販売単価が両方空欄です');
          const signed = a => returned ? -Math.abs(a) : a;
          item.amount = signed(raw === null ? price * Math.abs(q) : raw);
          item.discount = signed(num('discount') ?? 0); item.points = signed(num('points') ?? 0); item.intax = signed(num('intax') ?? 0);
          const total = num('costTotal'); item.costTotal = total === null ? (item.cost === null ? null : item.cost * item.qty) : signed(total);
          if (v('tx') && v('detail')) {
            const id = JSON.stringify([store,v('tx'),v('detail')]);
            if (seen.has(id)) throw Error('取引ID＋明細IDが重複しています。重複・取消レコードを確認してください');
            seen.add(id);
          }
        }
        data.push(item);
      } catch (e) { if (errors.length < 12) errors.push(`データ行${index+1}: ${e.message}`); }
    });
    if (errors.length) throw Error(errors.join('\n') + '\n修正するまで、このファイルは適用されません。');
    if (!data.length) throw Error('対象データがありません。除外区分や列指定を確認してください。');
    return {data, excluded, duplicates};
  }
  function analyze(stocks, sales, opts) {
    const {start,end,lead,safety,cycle,window,excess,stale,net} = opts;
    if (end < start) throw Error('集計終了日は開始日以降にしてください。');
    const days = end-start+1;
    const items = new Map(stocks.map(s => [s.key, {...s, revenue:0, qty:0, sold:0, returns:0, cogs:0, costMissing:false, estimated:false, q7:0,q30:0,q90:0,last:null,knownStock:true}]));
    const daily = new Map(); let outside = 0;
    for (const s of sales) {
      if (s.date < start || s.date > end) { outside++; continue; }
      if (!items.has(s.key)) items.set(s.key,{...s,stock:null,cost:null,revenue:0,qty:0,sold:0,returns:0,cogs:0,costMissing:false,estimated:false,q7:0,q30:0,q90:0,last:null,knownStock:false});
      const p = items.get(s.key); const rev = s.amount - (net ? s.discount+s.points+s.intax : 0);
      p.revenue += rev; p.qty += s.qty; p.sold += Math.max(0,s.qty); p.returns += Math.max(0,-s.qty);
      const cost = s.costTotal ?? (p.cost === null ? null : p.cost*s.qty);
      if (cost === null && s.qty !== 0) p.costMissing = true; else p.cogs += cost ?? 0;
      if (s.costTotal === null && cost !== null && s.qty !== 0) p.estimated = true;
      for (const w of [7,30,90]) if (s.date > end-w) p['q'+w] += Math.max(0,s.qty);
      if (s.qty > 0) p.last = Math.max(p.last ?? s.date,s.date);
      daily.set(s.date, (daily.get(s.date) || 0)+rev);
    }
    const result = Array.from(items.values());
    for (const p of result) {
      p.gross = p.costMissing ? null : p.revenue-p.cogs;
      p.value = p.stock === null || p.cost === null ? null : p.stock*p.cost;
      for (const w of [7,30,90]) p['v'+w] = p['q'+w]/Math.min(w,days);
      p.velocity = p['v'+window]; p.daily = p.sold/days;
      p.cover = p.knownStock && p.velocity > 0 ? Math.max(0,p.stock)/p.velocity : null;
      p.safe = Math.ceil(p.velocity*safety); p.point = Math.ceil(p.velocity*lead+p.safe);
      p.target = Math.ceil(p.velocity*(lead+cycle)+p.safe);
      p.due = !p.knownStock || !p.velocity ? null : Math.max(0, Math.floor((p.stock-p.point)/p.velocity));
      p.order = !p.knownStock || !p.velocity ? null : Math.max(0,p.target-p.stock);
      p.order = p.order === null ? null : Math.ceil(p.order);
      p.risk = p.knownStock && p.velocity > 0 && p.cover <= lead;
      p.dormant = p.knownStock && p.stock > 0 && days >= stale && (p.last === null || end-p.last >= stale);
      p.over = p.knownStock && p.stock > 0 && ((p.cover !== null && p.cover > excess) || p.dormant);
      p.priority = !p.knownStock ? '在庫未登録' : p.stock < 0 ? '在庫要確認' : p.risk ? '最優先' : p.due === 0 ? '高' : p.due !== null && p.due <= cycle ? '計画' : '経過観察';
    }
    const ranked = [...result].sort((a,b)=>b.revenue-a.revenue); const total = ranked.reduce((s,p)=>s+Math.max(0,p.revenue),0); let cumulative=0;
    for (const p of ranked) { p.abc = p.revenue <= 0 ? '—' : cumulative/total < .8 ? 'A' : cumulative/total < .95 ? 'B' : 'C'; cumulative += Math.max(0,p.revenue); }
    result.sort((a,b) => (a.due ?? Infinity)-(b.due ?? Infinity) || b.revenue-a.revenue);
    return {items:result,daily:[...daily].sort((a,b)=>a[0]-b[0]),outside,days};
  }
  function csvExport(rows) { return '\uFEFF'+rows.map(row => row.map(v => { let s=String(v??''); if (/^[=+\-@\t\r]/.test(s)) s="'"+s; return '"'+s.replace(/"/g,'""')+'"'; }).join(',')).join('\r\n'); }
  const api = {parseCSV,detect,importData,analyze,day,iso,number,csvExport,fields};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Retail = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
