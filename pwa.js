/*
  Full Solutions · app instalável (PWA) e atalho para a Central de Projetos.
  Mesmo padrão do Clio: registra o service worker (necessário para o navegador
  considerar o site instalável), guarda o convite de instalação do Chrome/Android
  e preenche os links discretos em qualquer elemento [data-app-links]:
    "Baixe o app" · "Central de projetos"
  Use data-sem-central no elemento para mostrar só "Baixe o app".
*/
(() => {
  const OBSERVAR = !!(document.currentScript && 'observar' in document.currentScript.dataset);
  const CENTRAL = 'https://fau009.github.io/';

  if ('serviceWorker' in navigator) {
    addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  let convite = null;
  const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); convite = e; });
  addEventListener('appinstalled', () => { convite = null; preencher(true); });

  // Estilo mínimo e de baixa prioridade (:where), para cada site poder ajustar.
  const css = document.createElement('style');
  css.textContent = `
    :where(.app-links){font-size:12px;line-height:1.6;opacity:.6;text-align:center;margin:12px 0 0}
    :where(.app-links) a{color:inherit;text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px;cursor:pointer}
    :where(.app-links) a:hover,:where(.app-links) a:focus-visible{opacity:1}
    .app-links-dica{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));translate:-50% 0;z-index:2147483000;
      width:min(340px,calc(100vw - 32px));background:#141414;color:#f2f2f2;border:1px solid rgba(255,255,255,.14);border-radius:14px;
      padding:14px 16px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.45);text-align:left}
    .app-links-dica b{display:block;margin-bottom:4px}
    .app-links-dica button{margin-top:10px;background:#f2f2f2;color:#141414;border:0;border-radius:999px;padding:6px 14px;font:inherit;font-weight:600;cursor:pointer}`;
  document.head.appendChild(css);

  function preencher(forcar) {
    document.querySelectorAll('[data-app-links]').forEach(el => {
      if (el.dataset.appLinksOk && !forcar) return;
      el.dataset.appLinksOk = '1';
      const partes = [];
      if (!instalado()) partes.push('<a href="#" data-instalar-app>Baixe o app</a>');
      if (!('semCentral' in el.dataset)) partes.push(`<a href="${CENTRAL}">Central de projetos</a>`);
      el.innerHTML = partes.join('<span aria-hidden="true"> · </span>');
      el.hidden = partes.length === 0;
    });
  }

  function dica() {
    document.querySelector('.app-links-dica')?.remove();
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const box = document.createElement('div');
    box.className = 'app-links-dica'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Como instalar o app');
    box.innerHTML = ios
      ? '<b>Instalar no iPhone ou iPad</b>No Safari, toque em Compartilhar (quadrado com a seta para cima) e depois em “Adicionar à Tela de Início”.'
      : '<b>Instalar o app</b>Abra o menu do navegador (⋮) e toque em “Instalar app” ou “Adicionar à tela inicial”.';
    const ok = document.createElement('button'); ok.type = 'button'; ok.textContent = 'Ok';
    ok.onclick = () => box.remove(); box.appendChild(ok);
    document.body.appendChild(box); ok.focus();
  }

  document.addEventListener('click', async e => {
    const a = e.target.closest('[data-instalar-app]');
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    if (convite) { convite.prompt(); try { await convite.userChoice; } catch (err) {} convite = null; return; }
    dica();
  }, true);

  // Telas montadas por JavaScript (ex.: jogos que redesenham a tela inicial) usam <script src="pwa.js" data-observar>
  // para receber os links sempre que a tela inicial reaparecer.
  const iniciar = () => { preencher(); if (OBSERVAR) new MutationObserver(() => preencher()).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
