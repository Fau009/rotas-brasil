// Estações de metrô/trem/VLT e terminais de ônibus do OpenStreetMap (Overpass), por estado.
// Usa a área das cidades atendidas (data/<uf>/cidades.json). Saída: data/<uf>/estacoes.json
// Formato: [[nome, lat, lon, tipo, operador]] com tipo = metro | trem | vlt | terminal
import fs from 'node:fs';
import path from 'node:path';
import { REGIOES } from './regioes.mjs';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const DATA = path.join(RAIZ, 'data');
const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const r5 = n => Math.round(n * 1e5) / 1e5;
const espera = ms => new Promise(r => setTimeout(r, ms));

function tipoDe(t) {
  if (t.amenity === 'bus_station' || (t.public_transport === 'station' && t.bus === 'yes' && !t.railway)) return 'terminal';
  if (t.railway === 'tram_stop' || t.station === 'light_rail' || t.light_rail === 'yes' && t.station !== 'subway') return 'vlt';
  if (t.station === 'subway' || t.subway === 'yes') return 'metro';
  if (t.railway === 'station' || t.railway === 'halt') return 'trem';
  return null;
}

async function consultar(q) {
  for (const url of SERVIDORES) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const r = await fetch(url, {
          method: 'POST', body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(120000),
          headers: { 'User-Agent': 'rotas-brasil (+https://github.com/Fau009/rotas-brasil)', 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        if (r.ok) return r.json();
        console.warn(`  ${url}: HTTP ${r.status}`);
      } catch (e) { console.warn(`  ${url}: ${e.message}`); }
      await espera(5000);
    }
  }
  throw new Error('Overpass indisponível');
}

for (const r of REGIOES) {
  const arqCid = path.join(DATA, r.id, 'cidades.json');
  if (!fs.existsSync(arqCid)) continue;
  const cidades = JSON.parse(fs.readFileSync(arqCid, 'utf8'));
  const bb = cidades.reduce((b, c) => [Math.min(b[0], c.bbox[0][0]), Math.min(b[1], c.bbox[0][1]), Math.max(b[2], c.bbox[1][0]), Math.max(b[3], c.bbox[1][1])], [90, 180, -90, -180]);
  const area = bb.map((n, i) => (n + (i < 2 ? -0.05 : 0.05)).toFixed(3)).join(',');
  const q = `[out:json][timeout:90];(
    node["railway"~"^(station|halt|tram_stop)$"](${area});
    node["public_transport"="station"](${area});
    node["amenity"="bus_station"](${area});
    way["amenity"="bus_station"](${area});
  );out center 3000;`;
  try {
    const js = await consultar(q);
    const vistos = new Set(); const est = [];
    for (const e of js.elements) {
      const t = e.tags || {}; const nome = t.name; const tipo = tipoDe(t);
      const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
      if (!nome || !tipo || lat == null) continue;
      const chave = `${tipo}|${nome}|${lat.toFixed(2)}|${lon.toFixed(2)}`; // evita duplicatas próximas com o mesmo nome
      if (vistos.has(chave)) continue; vistos.add(chave);
      est.push([nome, r5(lat), r5(lon), tipo, t.operator || t.network || '']);
    }
    fs.writeFileSync(path.join(DATA, r.id, 'estacoes.json'), JSON.stringify(est));
    const cont = {}; for (const e of est) cont[e[3]] = (cont[e[3]] || 0) + 1;
    console.log(`${r.id}: ${est.length} estações/terminais ${JSON.stringify(cont)}`);
  } catch (e) {
    console.warn(`! ${r.id}: ${e.message}`);
  }
  await espera(3000);
}
