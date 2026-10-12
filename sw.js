/*
  Service worker: deixa o site instalável como app e dá uma sobrevida offline à
  página e aos arquivos do próprio site. Mesmo padrão do Clio: rede primeiro
  (sempre a versão mais nova) e cache só quando estiver sem conexão.
  Não toca em dados (JSON/APIs) nem em nada fora da própria pasta do site.
*/
const PREFIXO = 'fs-rotas-brasil-';                                      // cada site do domínio tem o seu
const CACHE = PREFIXO + 'v2';
const PASTA = new URL(self.registration.scope).pathname;           // ex.: /dado-online/
const SO_PROPRIOS = null;                                 // regex quando o escopo é a raiz do domínio

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIXO) && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(PASTA)) return;
  if (SO_PROPRIOS && !SO_PROPRIOS.test(url.pathname)) return;
  const estatico = req.mode === 'navigate' || ['document', 'style', 'script', 'image', 'font', 'manifest'].includes(req.destination);
  if (!estatico) return;   // dados e chamadas de API vão direto para a rede
  // 'no-cache' revalida com o servidor: evita juntar página nova com CSS/JS antigos
  // guardados pelo navegador (o GitHub Pages permite reaproveitar arquivos por 10 min).
  e.respondWith(
    fetch(req, req.mode === 'navigate' ? undefined : { cache: 'no-cache' }).then(resp => {
      if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {}); }
      return resp;
    }).catch(() => caches.open(CACHE).then(c => c.match(req).then(r => r || (req.mode === 'navigate' ? c.match('./') : undefined))))
  );
});
