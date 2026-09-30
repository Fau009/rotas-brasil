// Converte os feeds GTFS de cada região em JSON compacto para o site.
// Uso: node scripts/build-gtfs.mjs [pastaCacheZip]
// Saída: data/regioes.json, data/<regiao>/{linhas,paradas}.json, data/<regiao>/l/<linha>.json
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import unzipper from 'unzipper';
import { REGIOES } from './regioes.mjs';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const CACHE = path.resolve(process.argv[2] || path.join(RAIZ, '.cache-gtfs'));
const DATA = path.join(RAIZ, 'data');

// ---------- utilidades ----------
function parseLinha(l) {
  const out = []; let f = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"') { if (l[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(f); f = ''; }
    else f += c;
  }
  out.push(f);
  return out;
}

async function lerCsv(zip, nome, cb) {
  const ent = zip.files.find(f => path.basename(f.path) === nome);
  if (!ent) return false;
  const rl = readline.createInterface({ input: ent.stream(), crlfDelay: Infinity });
  let cab = null;
  for await (let l of rl) {
    if (!cab) { cab = parseLinha(l.replace(/^﻿/, '')).map(s => s.trim()); continue; }
    if (!l.trim()) continue;
    const v = parseLinha(l); const o = {};
    for (let i = 0; i < cab.length; i++) o[cab[i]] = (v[i] ?? '').trim();
    cb(o);
  }
  return true;
}

const hms = t => { if (!t) return null; const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + (s || 0); };

function tipoDe(rt) {
  const t = Number(rt);
  if (t === 0 || t === 900 || (t >= 900 && t < 1000)) return 'vlt';
  if (t === 1 || (t >= 400 && t < 500)) return 'metro';
  if (t === 2 || (t >= 100 && t < 200)) return 'trem';
  if (t === 4 || t === 1000 || t === 1200) return 'barca';
  return 'onibus';
}
const COR_PADRAO = { onibus: '1f6feb', metro: 'd62828', trem: '6a4c93', vlt: '2a9d8f', barca: '0077b6' };

// Douglas-Peucker simples em graus
function simplificar(pts, tol) {
  if (pts.length < 3) return pts;
  const manter = new Uint8Array(pts.length); manter[0] = manter[pts.length - 1] = 1;
  const pilha = [[0, pts.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop(); let maxD = 0, idx = -1;
    const [ay, ax] = pts[a], [by, bx] = pts[b]; const dx = bx - ax, dy = by - ay; const len = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [py, px] = pts[i];
      let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0; t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ey = ay + t * dy - py; const d = ex * ex + ey * ey;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol * tol) { manter[idx] = 1; pilha.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => manter[i]);
}
function distKm(la1, lo1, la2, lo2) {
  const R = 6371, rad = Math.PI / 180, dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const r5 = n => Math.round(n * 1e5) / 1e5;
const seguro = s => s.replace(/[^A-Za-z0-9_-]/g, '_');

// ---------- processamento de um feed ----------
async function processarFeed(arquivo, prefixo, acc) {
  const zip = await unzipper.Open.file(arquivo);
  const P = id => prefixo + id;

  const rotas = new Map();
  await lerCsv(zip, 'routes.txt', r => rotas.set(P(r.route_id), r));

  // tipo de dia de cada serviço: u (útil), s (sábado), d (domingo)
  const servDias = new Map();
  const add = (sid, t) => { if (!servDias.has(sid)) servDias.set(sid, new Set()); servDias.get(sid).add(t); };
  await lerCsv(zip, 'calendar.txt', c => {
    if (['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].some(d => c[d] === '1')) add(c.service_id, 'u');
    if (c.saturday === '1') add(c.service_id, 's');
    if (c.sunday === '1') add(c.service_id, 'd');
  });
  await lerCsv(zip, 'calendar_dates.txt', c => {
    if (c.exception_type !== '1' || servDias.has(c.service_id) && servDias.get(c.service_id).size && !servDias.get(c.service_id).fromDates) return;
    const d = c.date; const dia = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))).getUTCDay();
    add(c.service_id, dia === 0 ? 'd' : dia === 6 ? 's' : 'u');
    servDias.get(c.service_id).fromDates = true;
  });

  const viagens = new Map(); // trip_id -> {rota, dir, shape, serv, destino}
  await lerCsv(zip, 'trips.txt', t => viagens.set(t.trip_id, {
    rota: P(t.route_id), dir: t.direction_id || '0', shape: t.shape_id, serv: t.service_id, destino: t.trip_headsign || ''
  }));

  const freq = new Map(); // trip_id -> [[ini, fim, headway]]
  await lerCsv(zip, 'frequencies.txt', f => {
    if (!freq.has(f.trip_id)) freq.set(f.trip_id, []);
    freq.get(f.trip_id).push([hms(f.start_time), hms(f.end_time), Number(f.headway_secs)]);
  });

  // viagem representativa por rota+sentido: a do traçado (shape) mais frequente
  const grupos = new Map();
  for (const [tid, v] of viagens) {
    const k = v.rota + '|' + v.dir;
    if (!grupos.has(k)) grupos.set(k, { viagens: [], shapes: new Map() });
    const g = grupos.get(k); g.viagens.push(tid);
    g.shapes.set(v.shape, (g.shapes.get(v.shape) || 0) + 1);
  }
  const repTrips = new Map(); // trip_id -> grupo
  for (const [k, g] of grupos) {
    const shape = [...g.shapes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const tid = g.viagens.find(t => viagens.get(t).shape === shape);
    g.rep = tid; repTrips.set(tid, k);
  }

  // passada única em stop_times
  const inicio = new Map(); // trip -> [seqMin, segundos]
  const repParadas = new Map(); // trip -> [[seq, stop, arr, dep]]
  await lerCsv(zip, 'stop_times.txt', s => {
    const seq = Number(s.stop_sequence); const t = hms(s.departure_time) ?? hms(s.arrival_time);
    const cur = inicio.get(s.trip_id);
    if (t != null && (!cur || seq < cur[0])) inicio.set(s.trip_id, [seq, t]);
    if (repTrips.has(s.trip_id)) {
      if (!repParadas.has(s.trip_id)) repParadas.set(s.trip_id, []);
      repParadas.get(s.trip_id).push([seq, P(s.stop_id), hms(s.arrival_time), hms(s.departure_time)]);
    }
  });

  const paradasUsadas = new Set();
  for (const lst of repParadas.values()) for (const p of lst) paradasUsadas.add(p[1]);
  await lerCsv(zip, 'stops.txt', s => {
    const id = P(s.stop_id);
    if (paradasUsadas.has(id)) acc.paradas.set(id, [id, s.stop_name, r5(+s.stop_lat), r5(+s.stop_lon)]);
  });

  const shapesUsados = new Set([...repTrips.keys()].map(t => viagens.get(t).shape).filter(Boolean));
  const shapes = new Map();
  await lerCsv(zip, 'shapes.txt', s => {
    if (!shapesUsados.has(s.shape_id)) return;
    if (!shapes.has(s.shape_id)) shapes.set(s.shape_id, []);
    shapes.get(s.shape_id).push([Number(s.shape_pt_sequence), +s.shape_pt_lat, +s.shape_pt_lon]);
  });

  // monta as linhas
  for (const [k, g] of grupos) {
    const [rotaId, dir] = k.split('|');
    const rota = rotas.get(rotaId); if (!rota) continue;
    const lst = (repParadas.get(g.rep) || []).sort((a, b) => a[0] - b[0]);
    if (lst.length < 2) continue;

    // tempos relativos, interpolando paradas sem horário
    const t0 = lst[0][3] ?? lst[0][2] ?? 0;
    const tempos = lst.map(p => (p[2] ?? p[3]));
    const tipo = tipoDe(rota.route_type);
    if (tempos.at(-1) == null || tempos.at(-1) <= t0) {
      // sem horário no fim da viagem: estima pela distância e velocidade média do modal
      const kmh = { onibus: 18, metro: 35, trem: 40, vlt: 20, barca: 20 }[tipo];
      let dist = 0; tempos[0] = t0;
      for (let i = 1; i < lst.length; i++) {
        const a = acc.paradas.get(lst[i - 1][1]), b = acc.paradas.get(lst[i][1]);
        if (a && b) dist += distKm(a[2], a[3], b[2], b[3]);
        tempos[i] = t0 + dist / kmh * 3600;
      }
    }
    for (let i = 0; i < tempos.length; i++) {
      if (tempos[i] != null) continue;
      let j = i; while (j < tempos.length && tempos[j] == null) j++;
      const a = tempos[i - 1] ?? t0, b = tempos[j] ?? a;
      for (let x = i; x < j; x++) tempos[x] = a + (b - a) * (x - i + 1) / (j - i + 1);
      i = j;
    }
    const paradas = lst.map((p, i) => [p[1], Math.max(0, Math.round((tempos[i] - t0) / 60 * 10) / 10)]); // minutos

    const shapeId = viagens.get(g.rep).shape;
    let pts = shapes.get(shapeId)?.sort((a, b) => a[0] - b[0]).map(p => [p[1], p[2]]);
    if (!pts || pts.length < 2) pts = paradas.map(p => acc.paradas.get(p[0])).filter(Boolean).map(p => [p[2], p[3]]);
    pts = simplificar(pts, 0.00008).map(p => [r5(p[0]), r5(p[1])]);

    // partidas por tipo de dia (minutos desde 0h)
    const partidas = { u: new Set(), s: new Set(), d: new Set() };
    for (const tid of g.viagens) {
      const v = viagens.get(tid); const dias = servDias.get(v.serv) || new Set(['u', 's', 'd']);
      let saidas = [];
      if (freq.has(tid)) for (const [a, b, h] of freq.get(tid)) for (let x = a; x < b; x += h) saidas.push(x);
      else if (inicio.has(tid)) saidas.push(inicio.get(tid)[1]);
      for (const d of dias) for (const x of saidas) partidas[d].add(Math.round(x / 60));
    }
    const ord = s => [...s].sort((a, b) => a - b);

    if (!acc.linhas.has(rotaId)) acc.linhas.set(rotaId, {
      id: rotaId, arq: seguro(rotaId),
      c: rota.route_short_name || (rota.route_id.length <= 6 ? rota.route_id : ''), n: rota.route_long_name || rota.route_desc || '',
      t: tipo, cor: (rota.route_color || COR_PADRAO[tipo]).replace('#', '').toLowerCase(),
      tc: (rota.route_text_color || 'ffffff').replace('#', '').toLowerCase(),
      sentidos: []
    });
    acc.linhas.get(rotaId).sentidos.push({
      d: dir, destino: viagens.get(g.rep).destino || acc.paradas.get(paradas.at(-1)[0])?.[1] || '',
      duracao: paradas.at(-1)[1], trajeto: pts, paradas,
      partidas: { u: ord(partidas.u), s: ord(partidas.s), d: ord(partidas.d) }
    });
  }
}

// ---------- municípios (IBGE) ----------
async function municipiosIBGE(uf) {
  const base = 'https://servicodados.ibge.gov.br/api';
  const [malha, nomes] = await Promise.all([
    fetch(`${base}/v3/malhas/estados/${uf}?intrarregiao=municipio&formato=application/vnd.geo%2Bjson&qualidade=intermediaria`).then(r => r.json()),
    fetch(`${base}/v1/localidades/estados/${uf}/municipios`).then(r => r.json())
  ]);
  const nome = new Map(nomes.map(m => [String(m.id), m.nome]));
  return malha.features.map(f => {
    const poligonos = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const bb = [180, 90, -180, -90];
    for (const pol of poligonos) for (const [lo, la] of pol[0]) { bb[0] = Math.min(bb[0], lo); bb[1] = Math.min(bb[1], la); bb[2] = Math.max(bb[2], lo); bb[3] = Math.max(bb[3], la); }
    const id = Number(f.properties.codarea);
    return { id, nome: nome.get(String(id)) || String(id), poligonos, bb };
  });
}

function dentro(anel, lo, la) {
  let d = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j];
    if ((yi > la) !== (yj > la) && lo < (xj - xi) * (la - yi) / (yj - yi) + xi) d = !d;
  }
  return d;
}
function acharMunicipio(muns, la, lo) {
  let perto = null, md = 0.02; // parada fora de todos os contornos (ex.: beira-mar): usa o mais próximo até ~2 km
  for (const m of muns) {
    const [x0, y0, x1, y1] = m.bb;
    const fora = Math.max(x0 - lo, 0, lo - x1) + Math.max(y0 - la, 0, la - y1);
    if (fora > 0) { if (fora < md) { md = fora; perto = m; } continue; }
    if (m.poligonos.some(pol => dentro(pol[0], lo, la) && !pol.slice(1).some(h => dentro(h, lo, la)))) return m;
  }
  return perto;
}

// ---------- principal ----------
async function main() {
  fs.mkdirSync(DATA, { recursive: true });
  const saida = [];
  for (const r of REGIOES) {
    const t = Date.now();
    const acc = { linhas: new Map(), paradas: new Map() };
    for (const [i, feed] of r.gtfs.entries()) {
      const arq = path.join(CACHE, feed + '.zip');
      if (!fs.existsSync(arq)) { console.warn(`! ${feed} não encontrado em ${CACHE}`); continue; }
      await processarFeed(arq, r.gtfs.length > 1 ? `f${i}-` : '', acc);
    }
    const dir = path.join(DATA, r.id); fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'l'), { recursive: true });

    // município de cada parada (contornos do IBGE)
    const muns = await municipiosIBGE(r.ibge);
    const porMun = new Map(); // código -> {linhas:Set, bbox}
    for (const p of acc.paradas.values()) {
      const m = acharMunicipio(muns, p[2], p[3]);
      p.push(m ? m.id : 0);
      if (!m) continue;
      if (!porMun.has(m.id)) porMun.set(m.id, { m, linhas: new Set(), paradas: 0, bb: [90, 180, -90, -180] });
      const x = porMun.get(m.id); x.paradas++;
      x.bb = [Math.min(x.bb[0], p[2]), Math.min(x.bb[1], p[3]), Math.max(x.bb[2], p[2]), Math.max(x.bb[3], p[3])];
    }

    const indice = [];
    for (const l of acc.linhas.values()) {
      l.sentidos.sort((a, b) => a.d.localeCompare(b.d));
      const ms = new Set();
      for (const s of l.sentidos) for (const [pid] of s.paradas) { const c = acc.paradas.get(pid)?.[4]; if (c) ms.add(c); }
      for (const c of ms) porMun.get(c).linhas.add(l.id);
      fs.writeFileSync(path.join(dir, 'l', l.arq + '.json'), JSON.stringify({ id: l.id, sentidos: l.sentidos }));
      // origem e destino (município da primeira e da última parada do primeiro sentido)
      const ps = l.sentidos[0].paradas;
      const od = [acc.paradas.get(ps[0][0])?.[4] || 0, acc.paradas.get(ps.at(-1)[0])?.[4] || 0];
      indice.push({ id: l.id, arq: l.arq, c: l.c, n: l.n, t: l.t, cor: l.cor, tc: l.tc, s: l.sentidos.map(s => s.destino), m: [...ms], od });
    }
    indice.sort((a, b) => a.c.localeCompare(b.c, 'pt-BR', { numeric: true }));
    fs.writeFileSync(path.join(dir, 'linhas.json'), JSON.stringify(indice));
    fs.writeFileSync(path.join(dir, 'paradas.json'), JSON.stringify([...acc.paradas.values()]));

    // cidades com pelo menos uma parada: contorno simplificado para o mapa "Branco"
    const cidades = [...porMun.values()].map(({ m, linhas, paradas, bb }) => ({
      id: m.id, nome: m.nome, capital: m.id === r.capital, linhas: linhas.size, paradas,
      bbox: [[r5(bb[0]), r5(bb[1])], [r5(bb[2]), r5(bb[3])]],
      contorno: m.poligonos.map(pol => simplificar(pol[0], 0.0015).map(([lo, la]) => [r5(la), r5(lo)]))
    })).sort((a, b) => b.capital - a.capital || b.linhas - a.linhas || a.nome.localeCompare(b.nome, 'pt-BR'));
    fs.writeFileSync(path.join(dir, 'cidades.json'), JSON.stringify(cidades));

    const porTipo = {}; for (const l of indice) porTipo[l.t] = (porTipo[l.t] || 0) + 1;
    const cap = cidades.find(c => c.capital) || cidades[0];
    saida.push({
      id: r.id, nome: r.nome, uf: r.uf, antigo: r.antigo, veiculos: r.veiculos, statusTrilhos: r.statusTrilhos, obs: r.obs,
      capital: cap?.id, cidades: cidades.map(c => ({ id: c.id, nome: c.nome, linhas: c.linhas })),
      linhas: indice.length, paradas: acc.paradas.size, porTipo
    });
    console.log(`   ${cidades.length} cidades: ${cidades.slice(0, 6).map(c => `${c.nome} (${c.linhas})`).join(', ')}…`);
    console.log(`${r.id}: ${indice.length} linhas, ${acc.paradas.size} paradas, ${JSON.stringify(porTipo)} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
  }
  fs.writeFileSync(path.join(DATA, 'regioes.json'), JSON.stringify({ gtfsAtualizadoEm: new Date().toISOString(), regioes: saida }, null, 1));
}

main().catch(e => { console.error(e); process.exit(1); });
