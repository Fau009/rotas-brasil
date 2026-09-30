// Simulação de veículos ao longo de um trajeto a partir do quadro de horários (GTFS).
// Não usa GPS: a posição é interpolada entre as paradas pelo tempo previsto de viagem.
const Simulador = (() => {
  const d2 = (a, b) => { const k = Math.cos(a[0] * Math.PI / 180); const dx = (a[1] - b[1]) * k, dy = a[0] - b[0]; return dx * dx + dy * dy; };

  // sentido: { trajeto:[[lat,lon]], paradas:[[id,min]], partidas:{u,s,d}, duracao }
  // coordParada: id -> [lat,lon]
  function preparar(sentido, coordParada) {
    const pts = sentido.trajeto;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.sqrt(d2(pts[i - 1], pts[i])));

    // posição de cada parada ao longo do trajeto (índice do vértice mais próximo, sem voltar)
    const marcos = []; let desde = 0;
    for (const [id, min] of sentido.paradas) {
      const c = coordParada(id); if (!c) continue;
      let melhor = desde, md = Infinity;
      const ate = Math.min(pts.length, desde + Math.max(40, Math.ceil(pts.length / 3)));
      for (let i = desde; i < ate; i++) { const d = d2(c, pts[i]); if (d < md) { md = d; melhor = i; } }
      desde = melhor;
      marcos.push([min, cum[melhor]]);
    }
    if (!marcos.length || marcos[0][1] > 0) marcos.unshift([0, 0]);
    const total = cum.at(-1);
    const dur = Math.max(sentido.duracao || 0, marcos.at(-1)[0], 1);
    if (marcos.at(-1)[1] < total) marcos.push([dur, total]);
    return { pts, cum, marcos, dur, partidas: sentido.partidas };
  }

  function pontoNaDistancia(p, dist) {
    const { pts, cum } = p;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < dist) lo = m + 1; else hi = m; }
    if (lo === 0) return pts[0];
    const a = pts[lo - 1], b = pts[lo], seg = cum[lo] - cum[lo - 1];
    const t = seg ? (dist - cum[lo - 1]) / seg : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function posicao(p, minutos) {
    const m = p.marcos;
    for (let i = 1; i < m.length; i++) {
      if (minutos <= m[i][0]) {
        const [t0, s0] = m[i - 1], [t1, s1] = m[i];
        const f = t1 > t0 ? (minutos - t0) / (t1 - t0) : 1;
        return pontoNaDistancia(p, s0 + (s1 - s0) * Math.max(0, Math.min(1, f)));
      }
    }
    return p.pts.at(-1);
  }

  // veículos em circulação no minuto T (0–1439) do tipo de dia informado
  function ativos(p, T, dia) {
    const lista = p.partidas[dia] || [];
    const out = [];
    for (const saida of lista) {
      for (const t of [T, T + 1440]) { // inclui viagens que começaram antes da meia-noite
        const decorrido = t - saida;
        if (decorrido >= 0 && decorrido <= p.dur) out.push({ saida, decorrido, pos: posicao(p, decorrido) });
      }
    }
    return out;
  }

  return { preparar, posicao, ativos };
})();
