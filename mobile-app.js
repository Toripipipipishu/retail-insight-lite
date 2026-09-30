'use strict';
if(location.protocol==='https:' && 'serviceWorker' in navigator){
 navigator.serviceWorker.register('./sw.js').then(()=>{document.getElementById('mobileStatus').textContent='スマホで利用する場合はブラウザのメニューからホーム画面へ追加できます。初回のアプリ保存完了後はオフライン起動に対応します。';}).catch(()=>{document.getElementById('mobileStatus').textContent='アプリのオフライン準備に失敗しました。通常のブラウザ表示は利用できます。';});
}
