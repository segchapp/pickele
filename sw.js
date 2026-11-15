// 諏訪ピックルボール参加者 — オフライン対応用サービスワーカー
//
// ・初回にオンラインで開いたとき、下の ASSETS を端末に保存する
// ・オンラインのときは常に最新版を取りに行き、保存分も更新する
// ・圏外／通信が遅いとき（3 秒で打ち切り）は保存してある版を表示する
// ・ここに挙げたファイル以外（同じサイトの他のページ）には一切手を出さない
//
// ASSETS のファイルを増減したときは CACHE の番号を上げること（v1 → v2）。
const CACHE = 'pickle-members-v2';
const ASSETS = [
  'members.html',
  'roster.txt',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
];
const ASSET_URLS = new Set(ASSETS.map(p => new URL(p, self.location).href));
const TIMEOUT_MS = 3000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(p => new Request(p, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('pickle-members-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  url.search = '';
  url.hash = '';
  if (!ASSET_URLS.has(url.href)) return;          // 対象外はブラウザの通常動作に任せる
  event.respondWith(networkFirst(url.href));
});

async function networkFirst(href) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(href);
  const fromNetwork = fetch(href, { cache: 'no-cache' }).then(res => {
    if (res && res.ok) cache.put(href, res.clone());
    return res;
  });
  if (!cached) return fromNetwork;                 // 保存分がなければ通信するしかない
  fromNetwork.catch(() => {});                     // 打ち切り後に失敗しても警告を出さない
  const timeout = new Promise(resolve => setTimeout(resolve, TIMEOUT_MS, null));
  try {
    const res = await Promise.race([fromNetwork, timeout]);
    return (res && res.ok) ? res : cached;
  } catch (e) {
    return cached;                                 // 圏外
  }
}
