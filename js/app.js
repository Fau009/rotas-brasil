// Rotas Brasil — app principal (mapa, linhas, status de trilhos, veículos e simulador)
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TIPOS = { onibus: 'Ônibus', metro: 'Metrô', trem: 'Trem', vlt: 'VLT', barca: 'Barca' };
  const DIAS = { u: 'dia útil', s: 'sábado', d: 'domingo' };
  const hhmm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const dataHora = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { } } };
  const mobile = () => innerWidth <= 760;

  const E = {
    carimbo: Date.now(), regioes: [], gtfsEm: null, meta: null, regiao: null,
    cidades: [], cidade: 0, nomeMun: new Map(), // cidade 0 = todas as cidades do estado
    linhas: [], paradas: new Map(), status: null, veiculos: null,
    sel: null, sentido: 0, filtroTipo: 'todos', escopo: 'todas', trilhosDados: [], estacoes: []
  };

  async function obter(url) {
    const r = await fetch(`${url}?v=${E.carimbo}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  }
  function aviso(txt) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = txt;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }

  // ---------- mapa e modelos de fundo ----------
  const mapa = L.map('mapa', { preferCanvas: true, zoomControl: true }).setView([-15.8, -47.9], 4);
  mapa.createPane('rotulos').style.zIndex = 250; // nomes das ruas acima do fundo e abaixo das linhas
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
  const esriAttr = 'Tiles © <a href="https://www.esri.com">Esri</a> — Esri, HERE, Garmin, © OpenStreetMap';
  const FUNDOS = {
    detalhado: [L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' })],
    claro: [L.tileLayer(`${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 16, maxZoom: 19, attribution: esriAttr }),
      L.tileLayer(`${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 16, maxZoom: 19, pane: 'rotulos' })],
    escuro: [L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 16, maxZoom: 19, attribution: esriAttr }),
      L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 16, maxZoom: 19, pane: 'rotulos' })],
    branco: []
  };
  const render = L.canvas({ padding: 0.3 });
  mapa.createPane('contornos').style.zIndex = 350; // abaixo das linhas
  const renderContorno = L.canvas({ padding: 0.3, pane: 'contornos' });
  const C = {
    contorno: L.layerGroup().addTo(mapa),
    trilhos: L.layerGroup().addTo(mapa), paradas: L.layerGroup().addTo(mapa), linha: L.layerGroup().addTo(mapa),
    estacoes: L.layerGroup().addTo(mapa), veiculos: L.layerGroup(), sim: L.layerGroup().addTo(mapa),
    local: L.layerGroup().addTo(mapa)
  };
  let estilo = null;
  function usarEstilo(nome) {
    if (!FUNDOS[nome]) nome = 'detalhado';
    if (estilo) FUNDOS[estilo].forEach(t => mapa.removeLayer(t));
    FUNDOS[nome].forEach(t => t.addTo(mapa));
    estilo = nome; ls.set('mapa', nome);
    $('#mapa').classList.toggle('fundo-branco', nome === 'branco');
    document.querySelectorAll('#estilosMapa button').forEach(b => b.classList.toggle('ativo', b.dataset.estilo === nome));
    desenharContorno(); desenharEstacoes();
  }

  // contorno das cidades: no fundo branco mostra todas (a escolhida em destaque); nos demais, só a escolhida, tracejada
  function desenharContorno() {
    C.contorno.clearLayers();
    const branco = estilo === 'branco';
    const lista = branco ? E.cidades : E.cidades.filter(c => c.id === E.cidade);
    for (const c of [...lista].sort((a, b) => (a.id === E.cidade) - (b.id === E.cidade))) {
      const sel = c.id === E.cidade;
      L.polygon(c.contorno, branco
        ? { color: sel ? '#5b6675' : '#c3cad3', weight: sel ? 1.6 : 1, fill: true, fillColor: sel ? '#eef2f7' : '#fafbfc', fillOpacity: 1, interactive: false, renderer: renderContorno }
        : { color: '#1f6feb', weight: 1.5, dashArray: '4 4', fill: false, interactive: false, renderer: renderContorno }
      ).addTo(C.contorno);
    }
  }

  // ---------- tema da interface ----------
  const TEMAS = ['auto', 'claro', 'escuro'];
  function aplicarTema(t) {
    const raiz = document.documentElement;
    if (t === 'auto') delete raiz.dataset.theme; else raiz.dataset.theme = t === 'escuro' ? 'dark' : 'light';
    ls.set('tema', t);
    $('#btnTema').textContent = t === 'escuro' ? '☾' : t === 'claro' ? '☀' : '◐';
    $('#btnTema').title = `Tema: ${t === 'auto' ? 'automático (sistema)' : t}. Clique para alternar.`;
  }

  // ---------- cabeçalho ----------
  function atualizarCarimbo() {
    const s = E.meta?.atualizadoEm;
    const min = s ? Math.round((Date.now() - new Date(s)) / 60000) : null;
    const rel = min == null ? '' : min < 1 ? ' (agora)' : min < 120 ? ` (há ${min} min)` : '';
    $('#txtAtualizacao').innerHTML = `Última atualização: <b>${dataHora(s)}</b>${rel} · Itinerários: ${dataHora(E.gtfsEm)}`;
    $('#carimboMobile').innerHTML = `Atualizado: <b>${dataHora(s)}</b>${rel}`;
  }

  async function recarregar() {
    const btn = $('#btnRecarregar'); btn.disabled = true; btn.textContent = mobile() ? '↻' : '↻ Buscando…';
    const antes = E.meta?.atualizadoEm;
    E.carimbo = Date.now();
    try {
      const [meta, reg] = await Promise.all([obter('data/meta.json'), obter('data/regioes.json')]);
      E.meta = meta; E.gtfsEm = reg.gtfsAtualizadoEm;
      await carregarStatus();
      if ($('#cVeiculos').checked) await carregarVeiculos();
      atualizarCarimbo(); renderFontes();
      aviso(meta.atualizadoEm !== antes ? 'Dados atualizados' : 'Você já está com os dados mais recentes');
    } catch (e) { aviso('Falha ao recarregar: ' + e.message); }
    btn.disabled = false; rotuloRecarregar();
  }
  const rotuloRecarregar = () => { $('#btnRecarregar').textContent = mobile() ? '↻' : '↻ Recarregar'; };

  // ---------- estado e cidade ----------
  const acharRegiao = id => E.regioes.find(x => x.id === id || (x.antigo || []).includes(id));

  async function carregarRegiao(id, cidadeId) {
    const r = acharRegiao(id) || E.regioes[0];
    E.regiao = r; ls.set('regiao', r.id);
    $('#selRegiao').value = r.id;
    limparSelecao(); pararSim(); C.trilhos.clearLayers(); C.paradas.clearLayers(); C.estacoes.clearLayers(); C.veiculos.clearLayers(); C.contorno.clearLayers();
    $('#camadas').classList.toggle('oculto-v', !r.veiculos);
    if (!r.veiculos) { $('#cVeiculos').checked = false; mapa.removeLayer(C.veiculos); }
    $('#listaLinhas').innerHTML = '<li class="mais">Carregando linhas…</li>';
    $('#selCidade').innerHTML = '<option>Carregando…</option>';

    const [linhas, paradas, cidades, estacoes] = await Promise.all([
      obter(`data/${r.id}/linhas.json`), obter(`data/${r.id}/paradas.json`), obter(`data/${r.id}/cidades.json`),
      obter(`data/${r.id}/estacoes.json`).catch(() => [])
    ]);
    if (E.regiao !== r) return;
    E.estacoes = estacoes;
    E.linhas = linhas; E.paradas = new Map(paradas.map(p => [p[0], p]));
    E.cidades = cidades; E.nomeMun = new Map(cidades.map(c => [c.id, c.nome]));
    $('#selCidade').innerHTML = `<option value="0">Todas as cidades (${cidades.length})</option>` +
      cidades.map(c => `<option value="${c.id}">${esc(c.nome)}${c.capital ? ' · capital' : ''} (${c.linhas})</option>`).join('');
    renderStatus();
    const alvo = cidades.some(c => c.id === Number(cidadeId)) || Number(cidadeId) === 0 && cidadeId !== undefined ? Number(cidadeId) : (r.capital || cidades[0]?.id || 0);
    selecionarCidade(alvo);
    if ($('#cVeiculos').checked) carregarVeiculos();

    // trilhos: desenha todas as linhas de metrô/trem/VLT do estado
    const trilhos = linhas.filter(l => l.t !== 'onibus');
    E.trilhosDados = (await Promise.all(trilhos.map(l => obter(`data/${r.id}/l/${l.arq}.json`).then(d => ({ l, d })).catch(() => null)))).filter(Boolean);
    if (E.regiao !== r) return;
    desenharTrilhos();
  }

  function selecionarCidade(id) {
    E.cidade = Number(id) || 0;
    $('#selCidade').value = String(E.cidade);
    history.replaceState(null, '', `#${E.regiao.id}${E.cidade ? '/' + E.cidade : '/0'}`);
    if (E.escopo !== 'todas' && !E.cidade) E.escopo = 'todas';
    montarFiltros(); renderLista(); desenharContorno(); enquadrar(); desenharParadas();
  }

  // reposiciona o mapa: na pessoa (se a localização estiver ativa) ou na cidade escolhida
  function reposicionar() {
    if (G.ativo && G.pos) { mapa.setView(G.pos, Math.max(mapa.getZoom(), 16)); return; }
    if (G.ativo) aviso('Aguardando sua localização…');
    enquadrar();
  }
  function enquadrar() {
    const cs = E.cidade ? E.cidades.filter(c => c.id === E.cidade) : E.cidades;
    if (!cs.length) return;
    const b = L.latLngBounds(cs.flatMap(c => c.bbox));
    mapa.fitBounds(b, { padding: [20, 20], maxZoom: 14 });
  }

  function desenharTrilhos() {
    C.trilhos.clearLayers();
    if (!$('#cTrilhos').checked) return;
    for (const { l, d } of E.trilhosDados) {
      const s = d.sentidos[0];
      L.polyline(s.trajeto, { color: '#' + l.cor, weight: 5, opacity: .85, renderer: render })
        .bindTooltip(`${esc(l.c)} · ${esc(l.n)}`, { sticky: true })
        .on('click', () => selecionarLinha(l.id)).addTo(C.trilhos);
    }
  }

  function desenharParadas() {
    C.paradas.clearLayers();
    if (!$('#cParadas').checked || mapa.getZoom() < 15) return;
    const b = mapa.getBounds().pad(0.1); let n = 0;
    for (const p of E.paradas.values()) {
      if (!b.contains([p[2], p[3]])) continue;
      if (++n > 1500) break;
      L.circleMarker([p[2], p[3]], { radius: 5, color: '#555', weight: 1.5, fillColor: '#fff', fillOpacity: 1, renderer: render })
        .bindPopup(() => popupParada(p), { maxWidth: 280 }).addTo(C.paradas);
    }
  }

  // popup de parada: nome, cidade e as linhas que passam ali
  function popupParada(p, extra = '') {
    const doPonto = (p[5] || []).map(i => E.linhas[i]).filter(Boolean);
    const LIM = 40;
    return `<b>${esc(p[1])}</b><br><small>${esc(nomeCid(p[4]))} · parada ${esc(p[0])}${extra}</small>` +
      (doPonto.length ? `<div class="nota">${doPonto.length} linha(s) passam aqui:</div><div class="pop-linhas">` +
        doPonto.slice(0, LIM).map(l => `<button data-ver-linha="${esc(l.id)}" style="background:#${l.cor};color:#${l.tc}" title="${esc(l.n)}">${esc(l.c || l.n)}</button>`).join('') +
        (doPonto.length > LIM ? `<span class="nota">+${doPonto.length - LIM}</span>` : '') + '</div>'
        : '<div class="nota">Nenhuma linha cadastrada nesta parada.</div>');
  }

  // estações e terminais (OSM): nos fundos sem nomes (claro/escuro/branco) desenha ponto + nome
  function desenharEstacoes() {
    C.estacoes.clearLayers();
    if (!$('#cEstacoes').checked || estilo === 'detalhado' || !E.estacoes.length) return;
    const z = mapa.getZoom(); if (z < 11) return;
    const b = mapa.getBounds().pad(0.15); const escuroMapa = estilo === 'escuro';
    const COR = { metro: '#d62828', trem: '#6a4c93', vlt: '#2a9d8f', terminal: '#1f6feb' };
    const NOME = { metro: 'Estação de metrô', trem: 'Estação de trem', vlt: 'VLT / bonde', terminal: 'Terminal de ônibus' };
    // prioridade: metrô/trem, VLT e depois terminais; um nome só aparece se não encostar em outro
    const PRIO = { metro: 0, trem: 0, vlt: 1, terminal: 2 };
    const visiveis = E.estacoes.filter(e => b.contains([e[1], e[2]]) && (e[3] !== 'terminal' || z >= 13)).sort((a, b2) => PRIO[a[3]] - PRIO[b2[3]]);
    const ocupado = [];
    const cabe = (x, y, w, h) => !ocupado.some(o => x < o[2] && x + w > o[0] && y < o[3] && y + h > o[1]);
    for (const [nome, lat, lon, tipo, op] of visiveis) {
      const terminal = tipo === 'terminal';
      const m = L.circleMarker([lat, lon], {
        radius: terminal ? 4.5 : 5.5, weight: 2, color: COR[tipo], fillColor: escuroMapa ? '#171e27' : '#fff', fillOpacity: 1, renderer: render
      }).bindPopup(`<b>${esc(nome)}</b><br>${NOME[tipo]}${op ? ' · ' + esc(op) : ''}<br><small>OpenStreetMap</small>`).addTo(C.estacoes);
      const pt = mapa.latLngToContainerPoint([lat, lon]);
      const w = nome.length * (terminal ? 6 : 6.6) + 14, x = pt.x + 4, y = pt.y - 9;
      if (!cabe(x, y, w, 18)) continue;
      ocupado.push([x - 8, y, x + w, y + 18]);
      m.bindTooltip(esc(nome), { permanent: true, direction: 'right', offset: [6, 0], className: `rotulo-estacao${escuroMapa ? ' escuro' : ''}${terminal ? ' terminal' : ''}` });
    }
  }

  // ---------- lista de linhas ----------
  // municipal: todas as paradas numa só cidade; intermunicipal: atende mais de uma
  const ehMunicipal = l => l.m.length <= 1;
  const linhasDaCidade = () => E.cidade ? E.linhas.filter(l => l.m.includes(E.cidade)) : E.linhas;
  const nomeCid = id => E.nomeMun.get(id) || '?';
  function rotaCidades(l) {
    const [o, d] = l.od;
    if (o && d && o !== d) return `${nomeCid(o)} → ${nomeCid(d)}`;
    return l.m.map(nomeCid).join(' · ');
  }

  function montarFiltros() {
    const base = linhasDaCidade();
    const tipos = [...new Set(base.map(l => l.t))];
    if (!tipos.includes(E.filtroTipo)) E.filtroTipo = 'todos';
    $('#filtroTipo').innerHTML = [['todos', 'Todas']].concat(tipos.map(t => [t, TIPOS[t] || t])).map(([v, n]) => {
      const qtd = v === 'todos' ? base.length : base.filter(l => l.t === v).length;
      return `<button class="chip ${E.filtroTipo === v ? 'ativo' : ''}" data-t="${v}">${n} (${qtd})</button>`;
    }).join('');

    const inter = base.filter(l => !ehMunicipal(l)).length;
    const cid = E.cidade ? nomeCid(E.cidade) : null;
    $('#filtroEscopo').innerHTML = !inter ? '' : [
      ['todas', 'Todas'],
      ['municipais', cid ? `Só em ${cid}` : 'Municipais', base.length - inter],
      ['inter', cid ? `Ligam ${cid} a outras cidades` : 'Intermunicipais', inter]
    ].filter(([, , q]) => q !== 0).map(([v, n, q]) => `<button class="chip ${E.escopo === v ? 'ativo' : ''}" data-e="${v}">${esc(n)}${q != null ? ` (${q})` : ''}</button>`).join('');
  }

  function renderLista() {
    const q = $('#busca').value.trim().toLowerCase();
    const res = linhasDaCidade().filter(l => (E.filtroTipo === 'todos' || l.t === E.filtroTipo) &&
      (E.escopo === 'todas' || (E.escopo === 'municipais') === ehMunicipal(l)) &&
      (!q || `${l.c} ${l.n} ${l.s.join(' ')} ${l.m.map(nomeCid).join(' ')}`.toLowerCase().includes(q)));
    // na cidade escolhida: primeiro as linhas que só circulam nela, depois as que vêm de/vão para outras
    if (E.cidade) res.sort((a, b) => ehMunicipal(b) - ehMunicipal(a));
    const LIM = 150;
    $('#listaLinhas').innerHTML = res.slice(0, LIM).map(l => {
      const inter = !ehMunicipal(l);
      const tag = inter
        ? `<span class="escopo-tag inter" title="Atende: ${esc(l.m.map(nomeCid).join(', '))}">${esc(rotaCidades(l))}</span>`
        : !E.cidade && l.m[0] ? `<span class="escopo-tag">${esc(nomeCid(l.m[0]))}</span>` : '';
      return `
      <li data-id="${esc(l.id)}">
        <span class="cod" style="background:#${l.cor};color:#${l.tc}">${esc(l.c || '—')}</span>
        <span class="nome">${esc(l.n || l.s.join(' / '))}<small>${esc(l.s.join(' ⇄ '))}</small>${tag}</span>
        <span class="tipo">${TIPOS[l.t] || ''}</span>
      </li>`;
    }).join('') +
      (res.length > LIM ? `<li class="mais">Mostrando ${LIM} de ${res.length}. Refine a busca.</li>` : '') +
      (!res.length ? '<li class="mais">Nenhuma linha encontrada.</li>' : '');
  }

  // ---------- linha selecionada ----------
  function limparSelecao() { E.sel = null; C.linha.clearLayers(); $('#detalheLinha').classList.add('oculto'); atualizarSimInfo(); }

  async function selecionarLinha(id, sentido = 0) {
    const l = E.linhas.find(x => x.id === id); if (!l) return;
    const d = await obter(`data/${E.regiao.id}/l/${l.arq}.json`);
    E.sel = { l, d }; E.sentido = Math.min(sentido, d.sentidos.length - 1);
    mostrarAba('linhas'); desenharLinha(true); renderDetalhe(); atualizarSimInfo();
    $('#detalheLinha').scrollIntoView({ block: 'start' });
    if (mobile()) $('#painel').classList.remove('aberto');
  }

  function desenharLinha(ajustar) {
    C.linha.clearLayers(); if (!E.sel) return;
    const { l, d } = E.sel; const s = d.sentidos[E.sentido];
    const cor = '#' + (l.cor === 'ffffff' ? '1f6feb' : l.cor);
    L.polyline(s.trajeto, { color: '#000', weight: 9, opacity: .25, renderer: render }).addTo(C.linha);
    const pl = L.polyline(s.trajeto, { color: cor, weight: 6, opacity: .95, renderer: render }).addTo(C.linha);
    s.paradas.forEach(([pid, min], i) => {
      const p = E.paradas.get(pid); if (!p) return;
      const ponta = i === 0 || i === s.paradas.length - 1;
      L.circleMarker([p[2], p[3]], { radius: ponta ? 7 : 4.5, color: cor, weight: 2, fillColor: '#fff', fillOpacity: 1, renderer: render })
        .bindPopup(() => popupParada(p, ` · ${i + 1}ª parada desta linha, +${Math.round(min)} min da saída`), { maxWidth: 280 }).addTo(C.linha);
    });
    if (ajustar) mapa.fitBounds(pl.getBounds(), { padding: [30, 30] });
  }

  function renderDetalhe() {
    const { l, d } = E.sel; const s = d.sentidos[E.sentido];
    const dia = $('#simDia').value;
    const part = s.partidas[dia] || [];
    const porHora = {}; for (const m of part) (porHora[Math.floor(m / 60) % 24] ||= []).push(m);
    const intervalo = part.length > 1 ? Math.round((part.at(-1) - part[0]) / (part.length - 1)) : null;

    // itinerário com marcação de quando a linha entra em outra cidade
    let cidAnt = null; const inter = !ehMunicipal(l);
    const itens = s.paradas.map(([pid, min], i) => {
      const p = E.paradas.get(pid); const c = p?.[4];
      const cab = inter && c && c !== cidAnt ? `<li class="cidade-muda">${cidAnt ? 'Entra em ' : ''}${esc(nomeCid(c))}</li>` : '';
      if (c) cidAnt = c;
      return `${cab}<li value="${i + 1}" data-p="${esc(pid)}">${esc(p?.[1] || pid)} <span>+${Math.round(min)}′</span></li>`;
    }).join('');

    const el = $('#detalheLinha'); el.classList.remove('oculto');
    el.innerHTML = `
      <div class="cab">
        <span class="cod" style="background:#${l.cor};color:#${l.tc}">${esc(l.c || '—')}</span>
        <div><b>${esc(l.n)}</b><br><small class="tipo">${TIPOS[l.t]} · ${inter ? 'intermunicipal' : 'municipal'}</small></div>
        <button class="btn mini fechar" id="btnFechar">✕</button>
      </div>
      <div class="cidades-linha">${inter
        ? `<span class="escopo-tag inter">${esc(rotaCidades(l))}</span>` + l.m.map(c => `<span class="escopo-tag">${esc(nomeCid(c))}</span>`).join('')
        : `<span class="escopo-tag">${esc(nomeCid(l.m[0]))}</span>`}</div>
      <div class="chips">${d.sentidos.map((x, i) => `<button class="chip ${i === E.sentido ? 'ativo' : ''}" data-sentido="${i}">→ ${esc(x.destino || 'Sentido ' + (i + 1))}</button>`).join('')}</div>
      <div class="kpis">
        <div class="kpi"><b>${s.paradas.length}</b><span>paradas</span></div>
        <div class="kpi"><b>${Math.round(s.duracao)} min</b><span>viagem</span></div>
        <div class="kpi"><b>${part.length}</b><span>partidas (${DIAS[dia]})</span></div>
      </div>
      ${part.length ? `<p class="nota">Primeira ${hhmm(part[0])} · última ${hhmm(part.at(-1))}${intervalo ? ` · intervalo médio ~${intervalo} min` : ''}</p>` : `<p class="nota">Sem partidas programadas para ${DIAS[dia]}.</p>`}
      <div class="linha-campos">
        <button class="btn primario" id="btnSimular">▶ Simular esta linha</button>
        ${E.regiao.veiculos ? '<button class="btn" id="btnVerOnibus">Ônibus agora</button>' : ''}
      </div>
      <h3>Horários de partida (${DIAS[dia]})</h3>
      <div class="horarios">${Object.keys(porHora).map(h => `<b>${String(h).padStart(2, '0')}h</b><span>${porHora[h].map(m => hhmm(m).slice(3)).join(' ')}</span>`).join('') || '<span></span><span class="nota">—</span>'}</div>
      <h3>Itinerário</h3>
      <ol class="paradas">${itens}</ol>`;
  }

  // ---------- status dos trilhos ----------
  async function carregarStatus() {
    try { E.status = await obter('data/status-trilhos.json'); } catch { E.status = null; }
    renderStatus();
  }
  function renderStatus() {
    const r = E.regiao; if (!r) return;
    const linhas = (E.status?.linhas || []).filter(x => x.regiao === r.id);
    $('#notaTrilhos').innerHTML = linhas.length
      ? `Status informado pelas operadoras · coletado em <b>${dataHora(E.status.atualizadoEm)}</b>. Clique para ver a linha no mapa.`
      : `Sem fonte pública de status de trilhos para ${esc(r.nome)}. ${esc(r.obs || '')}`;
    $('#listaStatus').innerHTML = linhas.map(x => `
      <li data-num="${esc(x.linha)}">
        <span class="num" style="background:#${x.cor}">${esc(x.linha)}</span>
        <span><b>${esc(x.nome)}</b> <small>${esc(x.operador)}${x.mensagem ? ' · ' + esc(x.mensagem) : ''}</small></span>
        <span class="badge ${x.status}">${esc(x.texto)}</span>
      </li>`).join('');
  }
  const numeroTrilho = c => (c.match(/(\d+)/) || [])[1]?.replace(/^0+/, '');

  // ---------- veículos (última posição coletada) ----------
  async function carregarVeiculos() {
    C.veiculos.clearLayers();
    const r = E.regiao; if (!r?.veiculos) return;
    try { E.veiculos = await obter(`data/${r.id}/veiculos.json`); }
    catch { aviso('Posições de ônibus indisponíveis no momento'); return; }
    const selC = E.sel?.l.c?.replace(/^0+/, '');
    for (const [linha, lat, lon, vel, hora, id, tipo] of E.veiculos.v) {
      const destaque = selC && String(linha).replace(/^0+/, '') === selC;
      L.circleMarker([lat, lon], {
        radius: destaque ? 7 : 3.5, weight: destaque ? 2 : 0, color: '#000',
        fillColor: tipo === 'brt' ? '#e76f51' : destaque ? '#ffd400' : '#1f6feb', fillOpacity: .85, renderer: render
      }).bindPopup(() => {
        const g = acharLinha(linha);
        return `<b>${tipo === 'brt' ? 'BRT' : 'Ônibus'} ${esc(linha)}</b><br>Veículo ${esc(id)} · ${vel} km/h<br><small>GPS em ${dataHora(hora)}</small>` +
          (g ? `<br><button class="btn mini" data-ver-linha="${esc(g.id)}">Ver itinerário</button>` : '');
      }).addTo(C.veiculos);
    }
    atualizarCarimbo();
  }
  const acharLinha = cod => { const c = String(cod).replace(/^0+/, ''); return E.linhas.find(l => l.c.replace(/^0+/, '') === c); };

  // ---------- localização da pessoa ("Você está aqui") ----------
  const G = { ativo: false, watch: null, pos: null, precisao: 0, marcador: null, circulo: null, centrou: false };
  const distM = (a, b) => { const k = Math.cos(a[0] * Math.PI / 180) * 111320; return Math.hypot((a[1] - b[1]) * k, (a[0] - b[0]) * 110540); };

  function popupVoce() {
    const perto = [];
    for (const p of E.paradas.values()) { const d = distM(G.pos, [p[2], p[3]]); if (d <= 500) perto.push([d, p]); }
    perto.sort((a, b) => a[0] - b[0]);
    return `<b>Você está aqui</b><br><small>Precisão de ~${Math.round(G.precisao)} m</small>` + (perto.length
      ? `<div class="nota">Paradas mais próximas:</div><ul class="pop-perto">` + perto.slice(0, 6).map(([d, p]) =>
        `<li data-parada="${esc(p[0])}">${esc(p[1])} <span>· ${Math.round(d)} m · ${(p[5] || []).length} linha(s)</span></li>`).join('') + '</ul>'
      : '<div class="nota">Nenhuma parada cadastrada num raio de 500 m.</div>');
  }

  function aoLocalizar(ev) {
    const { latitude, longitude, accuracy } = ev.coords;
    G.pos = [latitude, longitude]; G.precisao = accuracy;
    $('#btnLocal').classList.remove('buscando');
    if (!G.marcador) {
      G.circulo = L.circle(G.pos, { radius: accuracy, color: '#1f6feb', weight: 1, fillColor: '#1f6feb', fillOpacity: .08, interactive: false }).addTo(C.local);
      G.marcador = L.marker(G.pos, { icon: L.divIcon({ className: '', html: '<div class="voce-aqui"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000, keyboard: false })
        .bindTooltip('Você está aqui', { permanent: true, direction: 'top', offset: [0, -12], className: 'rotulo-voce' })
        .bindPopup(popupVoce, { maxWidth: 280 }).addTo(C.local);
    } else { G.marcador.setLatLng(G.pos); G.circulo.setLatLng(G.pos).setRadius(accuracy); }
    if (!G.centrou) { G.centrou = true; mapa.setView(G.pos, Math.max(mapa.getZoom(), 15)); }
  }
  function erroLocal(e) {
    const msg = e.code === 1 ? 'Permissão de localização negada no navegador' : e.code === 3 ? 'Não foi possível obter a localização a tempo' : 'Localização indisponível';
    aviso(msg); if (e.code === 1) desligarLocal();
    $('#btnLocal').classList.remove('buscando');
  }
  function ligarLocal() {
    if (!('geolocation' in navigator)) { aviso('Este navegador não oferece localização'); return; }
    G.ativo = true; G.centrou = false; ls.set('local', '1');
    $('#btnLocal').setAttribute('aria-pressed', 'true'); $('#btnLocal').classList.add('buscando');
    $('#btnLocal').title = 'Localização ativada: clique para desativar';
    $('#btnCentralizar').title = 'Centralizar na sua localização';
    G.watch = navigator.geolocation.watchPosition(aoLocalizar, erroLocal, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  }
  function desligarLocal() {
    if (G.watch != null) navigator.geolocation.clearWatch(G.watch);
    Object.assign(G, { ativo: false, watch: null, pos: null, marcador: null, circulo: null });
    C.local.clearLayers(); ls.set('local', '0');
    $('#btnLocal').setAttribute('aria-pressed', 'false'); $('#btnLocal').classList.remove('buscando');
    $('#btnLocal').title = 'Mostrar minha localização no mapa (ativar/desativar)';
    $('#btnCentralizar').title = 'Reposicionar o mapa na cidade escolhida';
  }

  // ---------- simulador ----------
  const S = { rodando: false, T: 480, ultimo: 0, preps: [], pool: [], raf: 0, ultimoRender: 0 };
  const coordParada = id => { const p = E.paradas.get(id); return p ? [p[2], p[3]] : null; };

  function prepararSim() {
    const alvo = $('#simAlvo').value;
    const fontes = alvo === 'trilhos' ? E.trilhosDados : E.sel ? [E.sel] : [];
    S.preps = [];
    for (const { l, d } of fontes) for (const s of d.sentidos)
      S.preps.push({ l, destino: s.destino, p: Simulador.preparar(s, coordParada) });
    return S.preps.length > 0;
  }

  function atualizarSimInfo() {
    const alvo = $('#simAlvo').value;
    $('#simLinha').textContent = alvo === 'trilhos'
      ? (E.trilhosDados.length ? `${E.trilhosDados.length} linhas de trilhos em ${E.regiao?.nome}` : 'Este estado não tem linhas de trilhos no GTFS')
      : E.sel ? `Linha ${E.sel.l.c} · ${E.sel.l.n}` : 'Selecione uma linha na aba Linhas';
  }

  function renderSim() {
    const dia = $('#simDia').value; let n = 0;
    for (const { l, destino, p } of S.preps) {
      for (const a of Simulador.ativos(p, S.T, dia)) {
        let m = S.pool[n];
        if (!m) { m = S.pool[n] = L.circleMarker(a.pos, { radius: 6, weight: 2, color: '#fff', fillOpacity: 1, renderer: render }).addTo(C.sim); m.bindTooltip(''); }
        m.setLatLng(a.pos); m.setStyle({ fillColor: '#' + (l.cor === 'ffffff' ? '1f6feb' : l.cor) });
        m.setTooltipContent(`${esc(l.c)} → ${esc(destino)} · saiu ${hhmm(a.saida)}`);
        if (!C.sim.hasLayer(m)) m.addTo(C.sim);
        n++;
      }
    }
    for (let i = n; i < S.pool.length; i++) C.sim.removeLayer(S.pool[i]);
    $('#simHora').textContent = hhmm(S.T); $('#simRelogio').value = Math.floor(S.T);
    $('#simInfo').textContent = `${n} veículo(s) em circulação às ${hhmm(S.T)} (${DIAS[dia]}).`;
  }

  function passo(ts) {
    if (!S.rodando) return;
    const dt = S.ultimo ? (ts - S.ultimo) / 1000 : 0; S.ultimo = ts;
    S.T = (S.T + dt * Number($('#simVel').value) / 60) % 1440;
    if (ts - S.ultimoRender > 80) { renderSim(); S.ultimoRender = ts; }
    S.raf = requestAnimationFrame(passo);
  }
  function iniciarSim() {
    if (!prepararSim()) { aviso($('#simAlvo').value === 'trilhos' ? 'Sem linhas de trilhos neste estado' : 'Selecione uma linha primeiro'); mostrarAba('linhas'); return; }
    S.rodando = true; S.ultimo = 0; $('#simPlay').textContent = '⏸ Pausar';
    renderSim(); S.raf = requestAnimationFrame(passo);
    if (mobile()) $('#painel').classList.remove('aberto');
  }
  function pararSim(limpar = true) {
    S.rodando = false; cancelAnimationFrame(S.raf); $('#simPlay').textContent = '▶ Iniciar';
    if (limpar) { C.sim.clearLayers(); S.pool = []; S.preps = []; $('#simInfo').textContent = ''; }
  }
  function agoraSim() {
    const d = new Date(); S.T = d.getHours() * 60 + d.getMinutes();
    $('#simDia').value = d.getDay() === 0 ? 'd' : d.getDay() === 6 ? 's' : 'u';
    if (E.sel) renderDetalhe();
    if (S.preps.length) renderSim(); else { $('#simHora').textContent = hhmm(S.T); $('#simRelogio').value = S.T; }
  }

  // ---------- abas e fontes ----------
  function mostrarAba(nome) {
    document.querySelectorAll('.aba').forEach(b => b.classList.toggle('ativa', b.dataset.aba === nome));
    document.querySelectorAll('.conteudo').forEach(c => c.classList.toggle('ativa', c.id === 'aba-' + nome));
    if (nome === 'simulador') atualizarSimInfo();
  }
  function renderFontes() {
    $('#listaFontes').innerHTML = (E.meta?.fontes || []).map(f =>
      `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.nome)}</a> — ${f.ok ? '<span class="ok">ok</span>' : `<span class="erro">falhou (${esc(f.erro)})</span>`}</li>`).join('') +
      E.regioes.map(r => `<li>GTFS ${esc(r.nome)}: ${r.linhas} linhas, ${r.paradas} paradas, ${r.cidades.length} cidades${r.obs ? ` <small class="nota">· ${esc(r.obs)}</small>` : ''}</li>`).join('');
  }

  // ---------- eventos ----------
  $('#btnRecarregar').onclick = recarregar;
  $('#btnTema').onclick = () => aplicarTema(TEMAS[(TEMAS.indexOf(ls.get('tema') || 'auto') + 1) % TEMAS.length]);
  $('#selRegiao').onchange = e => carregarRegiao(e.target.value);
  $('#selCidade').onchange = e => { limparSelecao(); selecionarCidade(e.target.value); };
  $('#btnCentralizar').onclick = () => { reposicionar(); if (mobile()) $('#camadas').classList.remove('aberto'); };
  $('#btnLocal').onclick = () => G.ativo ? desligarLocal() : ligarLocal();
  addEventListener('hashchange', () => {
    const [id, cid] = location.hash.slice(1).split('/');
    const r = acharRegiao(id); if (!r) return;
    if (r !== E.regiao) carregarRegiao(r.id, cid);
    else if (cid !== undefined && Number(cid) !== E.cidade) selecionarCidade(cid);
  });
  addEventListener('resize', rotuloRecarregar);
  $('#btnPainel').onclick = () => { $('#painel').classList.toggle('aberto'); $('#camadas').classList.remove('aberto'); };
  $('#btnCamadas').onclick = () => $('#camadas').classList.toggle('aberto');
  mapa.on('click', () => { if (mobile()) { $('#painel').classList.remove('aberto'); $('#camadas').classList.remove('aberto'); } });
  $('#estilosMapa').onclick = e => { const s = e.target.closest('button')?.dataset.estilo; if (s) usarEstilo(s); };
  document.querySelectorAll('.aba').forEach(b => b.onclick = () => mostrarAba(b.dataset.aba));
  $('#busca').oninput = renderLista;
  $('#filtroTipo').onclick = e => { const t = e.target.closest('.chip')?.dataset.t; if (t) { E.filtroTipo = t; montarFiltros(); renderLista(); } };
  $('#filtroEscopo').onclick = e => { const v = e.target.closest('.chip')?.dataset.e; if (v) { E.escopo = v; montarFiltros(); renderLista(); } };
  $('#listaLinhas').onclick = e => { const id = e.target.closest('li[data-id]')?.dataset.id; if (id) selecionarLinha(id); };
  $('#detalheLinha').onclick = e => {
    const t = e.target;
    if (t.id === 'btnFechar') limparSelecao();
    else if (t.dataset.sentido) { E.sentido = +t.dataset.sentido; desenharLinha(true); renderDetalhe(); }
    else if (t.id === 'btnSimular') { $('#simAlvo').value = 'linha'; mostrarAba('simulador'); pararSim(); iniciarSim(); }
    else if (t.id === 'btnVerOnibus') { $('#cVeiculos').checked = true; mapa.addLayer(C.veiculos); carregarVeiculos(); }
    else if (t.closest('li[data-p]')) { const p = E.paradas.get(t.closest('li').dataset.p); if (p) { mapa.setView([p[2], p[3]], 17); if (mobile()) $('#painel').classList.remove('aberto'); } }
  };
  $('#listaStatus').onclick = e => {
    const num = e.target.closest('li')?.dataset.num; if (!num) return;
    const l = E.linhas.find(x => x.t !== 'onibus' && numeroTrilho(x.c) === num);
    l ? selecionarLinha(l.id) : aviso('Traçado desta linha não está no GTFS');
  };
  mapa.on('popupopen', e => {
    const el = e.popup.getElement();
    el.querySelectorAll('[data-ver-linha]').forEach(b => b.onclick = () => { mapa.closePopup(); selecionarLinha(b.dataset.verLinha); });
    el.querySelectorAll('[data-parada]').forEach(li => li.onclick = () => {
      const p = E.paradas.get(li.dataset.parada); if (!p) return;
      mapa.setView([p[2], p[3]], 17);
      L.popup({ maxWidth: 280 }).setLatLng([p[2], p[3]]).setContent(popupParada(p)).openOn(mapa);
    });
  });
  mapa.on('moveend', () => { desenharParadas(); desenharEstacoes(); });
  $('#cParadas').onchange = desenharParadas;
  $('#cTrilhos').onchange = desenharTrilhos;
  $('#cVeiculos').onchange = e => { if (e.target.checked) { mapa.addLayer(C.veiculos); carregarVeiculos(); } else mapa.removeLayer(C.veiculos); };
  $('#cEstacoes').onchange = desenharEstacoes;
  $('#simPlay').onclick = () => S.rodando ? pararSim(false) : iniciarSim();
  $('#simAgora').onclick = agoraSim;
  $('#simAlvo').onchange = () => { pararSim(); atualizarSimInfo(); };
  $('#simDia').onchange = () => { if (E.sel) renderDetalhe(); if (S.preps.length) renderSim(); };
  $('#simRelogio').oninput = e => { S.T = +e.target.value; if (!S.preps.length) prepararSim(); if (S.preps.length) renderSim(); else $('#simHora').textContent = hhmm(S.T); };

  // ---------- início ----------
  (async () => {
    aplicarTema(ls.get('tema') || 'auto');
    usarEstilo(ls.get('mapa') || 'detalhado');
    if (ls.get('local') === '1') ligarLocal();
    rotuloRecarregar();
    try {
      const [reg, meta] = await Promise.all([obter('data/regioes.json'), obter('data/meta.json').catch(() => null)]);
      E.regioes = reg.regioes; E.gtfsEm = reg.gtfsAtualizadoEm; E.meta = meta;
      $('#selRegiao').innerHTML = E.regioes.map(r => `<option value="${r.id}">${esc(r.nome)} (${r.uf})</option>`).join('');
      atualizarCarimbo(); renderFontes(); agoraSim();
      await carregarStatus();
      const [id, cid] = location.hash.slice(1).split('/');
      await carregarRegiao(id || ls.get('regiao') || 'sp', cid);
      setInterval(atualizarCarimbo, 60000);
    } catch (e) {
      $('#txtAtualizacao').textContent = 'Erro ao carregar dados: ' + e.message;
    }
  })();
})();
