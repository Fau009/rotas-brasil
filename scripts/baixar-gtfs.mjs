// Baixa os feeds GTFS (espelho da Mobility Database) para .cache-gtfs/
import fs from 'node:fs';
import path from 'node:path';
import { REGIOES } from './regioes.mjs';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const CACHE = path.join(RAIZ, '.cache-gtfs');
fs.mkdirSync(CACHE, { recursive: true });

for (const id of REGIOES.flatMap(r => r.gtfs)) {
  const url = `https://files.mobilitydatabase.org/${id}/latest.zip`;
  const r = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!r.ok) { console.warn(`! ${id}: HTTP ${r.status}`); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(path.join(CACHE, id + '.zip'), buf);
  console.log(`${id}: ${(buf.length / 1e6).toFixed(1)} MB`);
}
