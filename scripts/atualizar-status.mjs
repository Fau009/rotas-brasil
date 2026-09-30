// Coleta status das linhas de trilhos e a última posição dos ônibus (onde há API aberta).
// Uso: node scripts/atualizar-status.mjs  → data/status-trilhos.json, data/<regiao>/veiculos.json, data/meta.json
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const DATA = path.join(RAIZ, 'data');
const UA = { 'User-Agent': 'Mozilla/5.0 (rotas-brasil; +https://github.com/Fau009/rotas-brasil)' };

async function buscar(url, tipo = 'text') {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return tipo === 'json' ? r.json() : r.text();
}

function normalizar(txt) {
  const t = (txt || '').toLowerCase();
  if (!t) return 'sem_dados';
  if (t.includes('normal')) return 'normal';
  if (t.includes('reduzida')) return 'velocidade_reduzida';
  if (t.includes('paralisad')) return 'paralisada';
  if (t.includes('encerrad') || t.includes('fechad')) return 'encerrada';
  if (t.includes('parcial')) return 'operacao_parcial';
  return 'atencao';
}
const limpar = s => (s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// Linhas de trilhos da Grande SP (cor oficial e operador)
const LINHAS_SP = [
  ['1', 'Azul', '0455a1', 'Metrô'], ['2', 'Verde', '007e5e', 'Metrô'], ['3', 'Vermelha', 'ee372f', 'Metrô'],
  ['4', 'Amarela', 'ffd400', 'ViaQuatro'], ['5', 'Lilás', '9b3894', 'ViaMobilidade'],
  ['7', 'Rubi', 'ca016b', 'TIC Trens'], ['8', 'Diamante', '97a098', 'ViaMobilidade'], ['9', 'Esmeralda', '01a9a7', 'ViaMobilidade'],
  ['10', 'Turquesa', '049fc3', 'CPTM'], ['11', 'Coral', 'f68368', 'CPTM'], ['12', 'Safira', '133c8d', 'CPTM'], ['13', 'Jade', '00b352', 'CPTM'],
  ['15', 'Prata', '868686', 'Metrô'], ['17', 'Ouro', 'd58405', 'Metrô']
];

const fontes = [];
async function fonte(nome, url, fn) {
  try { const r = await fn(); fontes.push({ nome, url, ok: true }); return r; }
  catch (e) { fontes.push({ nome, url, ok: false, erro: String(e.message || e) }); console.warn(`! ${nome}: ${e.message}`); return null; }
}

async function statusSP() {
  const st = new Map();
  const URL_METRO = 'https://www.metro.sp.gov.br/wp-content/themes/metrosp/direto-metro.php';
  await fonte('Direto do Metrô (Metrô SP)', URL_METRO, async () => {
    const html = await buscar(URL_METRO);
    const itens = html.split('<li class="linha').slice(1);
    if (!itens.length) throw new Error('formato da página mudou');
    for (const it of itens) {
      const num = limpar(it.match(/linha-numero[^>]*>([^<]*)/)?.[1]);
      const sit = limpar(it.match(/linha-situacao"[^>]*>([^<]*)/)?.[1]);
      const desc = limpar(it.match(/class='description'>(.*?)<\/div>/)?.[1]);
      const extra = desc && desc !== sit && normalizar(desc) !== 'normal' ? desc : '';
      if (num) st.set(num, { texto: sit, mensagem: extra, fonte: 'Metrô SP' });
    }
  });
  const URL_CPTM = 'https://api.cptm.sp.gov.br/AppCPTM/v1/Linhas/ObterStatus';
  await fonte('CPTM', URL_CPTM, async () => {
    const js = await buscar(URL_CPTM, 'json');
    for (const l of js) st.set(String(l.linhaId), { texto: l.status, mensagem: l.descricao || '', fonte: 'CPTM', em: l.dataGeracao });
  });
  const URL_TIC = 'https://www.tictrens.com.br/';
  await fonte('TIC Trens (Linha 7)', URL_TIC, async () => {
    const html = await buscar(URL_TIC);
    const m = html.match(/status-linha-7[^"]*">\s*([^<]+)/);
    if (!m) throw new Error('formato da página mudou');
    st.set('7', { texto: limpar(m[1]), mensagem: '', fonte: 'TIC Trens' });
  });

  return LINHAS_SP.map(([num, nome, cor, operador]) => {
    const s = st.get(num);
    return {
      regiao: 'sp', linha: num, nome, cor, operador,
      status: s ? normalizar(s.texto) : 'sem_dados',
      texto: s?.texto || 'Sem fonte pública de status', mensagem: s?.mensagem || '', fonte: s?.fonte || null
    };
  });
}

// hora local de Brasília em "YYYY-MM-DD HH:MM:SS"
function horaBR(d) {
  const x = new Date(d.getTime() - 3 * 3600e3).toISOString();
  return x.slice(0, 10) + ' ' + x.slice(11, 19);
}

async function veiculosRJ() {
  const v = new Map();
  const agora = new Date();
  const URL_SPPO = `https://dados.mobilidade.rio/gps/sppo?dataInicial=${encodeURIComponent(horaBR(new Date(agora - 3 * 60e3)))}&dataFinal=${encodeURIComponent(horaBR(agora))}`;
  await fonte('GPS ônibus municipais (Prefeitura do Rio)', 'https://dados.mobilidade.rio/gps/sppo', async () => {
    const js = await buscar(URL_SPPO, 'json');
    for (const o of js) {
      if (!o.servico || o.servico === 'GARAGEM') continue;
      const ant = v.get(o.id_veiculo);
      if (!ant || ant[4] < o.datetime) v.set(o.id_veiculo, [o.servico, r5(o.latitude), r5(o.longitude), Math.round(o.velocidade), o.datetime, o.id_veiculo, 'onibus']);
    }
  });
  await fonte('GPS BRT (Prefeitura do Rio)', 'https://dados.mobilidade.rio/gps/brt', async () => {
    const js = await buscar('https://dados.mobilidade.rio/gps/brt', 'json');
    for (const o of js.veiculos || []) {
      v.set('BRT' + o.codigo, [o.linha, r5(o.latitude), r5(o.longitude), Math.round(o.velocidade), new Date(o.dataHora).toISOString(), o.codigo, 'brt']);
    }
  });
  return [...v.values()];
}

async function veiculosBH() {
  const URL = 'https://temporeal.pbh.gov.br/?param=D';
  return fonte('Tempo Real BHTRANS (PBH)', URL, async () => {
    const js = await buscar(URL, 'json');
    const v = new Map();
    for (const o of js) {
      if (!o.LT || !o.LG || !o.NL || o.NL === '0') continue;
      const h = o.HR; // YYYYMMDDHHMMSS em horário de Brasília
      const iso = new Date(`${h.slice(0, 4)}-${h.slice(4, 6)}-${h.slice(6, 8)}T${h.slice(8, 10)}:${h.slice(10, 12)}:${h.slice(12, 14)}-03:00`).toISOString();
      const ant = v.get(o.NV);
      if (!ant || ant[4] < iso) v.set(o.NV, [o.NL, r5(+o.LT), r5(+o.LG), Number(o.VL), iso, o.NV, 'onibus']);
    }
    return [...v.values()];
  });
}
const r5 = n => Math.round(n * 1e5) / 1e5;

async function main() {
  const agora = new Date().toISOString();
  const status = await statusSP();
  fs.writeFileSync(path.join(DATA, 'status-trilhos.json'), JSON.stringify({ atualizadoEm: agora, linhas: status }));

  for (const [reg, fn] of [['rj', veiculosRJ], ['mg', veiculosBH]]) {
    const v = await fn();
    fs.mkdirSync(path.join(DATA, reg), { recursive: true });
    if (v) fs.writeFileSync(path.join(DATA, reg, 'veiculos.json'), JSON.stringify({ atualizadoEm: agora, v }));
    console.log(`${reg}: ${v ? v.length : 0} veículos`);
  }

  fs.writeFileSync(path.join(DATA, 'meta.json'), JSON.stringify({ atualizadoEm: agora, fontes }, null, 1));
  console.log(`status: ${status.filter(s => s.status !== 'sem_dados').length}/${status.length} linhas com dados`);
}

main().catch(e => { console.error(e); process.exit(1); });
