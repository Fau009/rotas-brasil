# Rotas Brasil

Um modelo de simulador de itinerários de ônibus, metrô e trem em cidades brasileiras, feito só com **dados abertos**.

🔗 **Site:** https://fau009.github.io/rotas-brasil/

## O que tem

- **Mapa navegável** (Leaflet + OpenStreetMap) com as linhas de trilhos da região desenhadas e paradas visíveis ao aproximar.
- **Linhas e itinerários**: busca por número, nome ou destino. Mostra trajeto, paradas com tempo previsto, horários de partida por tipo de dia (útil, sábado, domingo), primeira e última partida e intervalo médio.
- **Status dos trilhos** (Grande São Paulo): situação de cada linha do Metrô, ViaQuatro, ViaMobilidade, CPTM e TIC Trens.
- **Simulador**: anima os veículos ao longo do trajeto a partir do quadro de horários, para uma linha ou para todos os trilhos da região. Controle de horário, dia e velocidade.
- **Ônibus (última posição)**: Rio de Janeiro (ônibus municipais + BRT) e Belo Horizonte.
- **Estações OSM**: busca estações e terminais do OpenStreetMap na área visível.
- **Última atualização + botão Recarregar** no topo. Não é tempo real: os dados são coletados periodicamente.

## Regiões

| Região | Itinerários (GTFS) | Status trilhos | Posição dos ônibus |
|---|---|---|---|
| São Paulo (SP) | ✅ SPTrans (ônibus, metrô, CPTM) | ✅ | — (Olho Vivo exige chave) |
| Rio de Janeiro (RJ) | ✅ SMTR | — | ✅ |
| Belo Horizonte (MG) | ✅ BHTRANS | — | ✅ |
| Porto Alegre (RS) | ✅ EPTC | — | — |
| Curitiba (PR) | ✅ URBS | — | — |
| Fortaleza (CE) | ✅ Etufor + Metrofor | — | — |

## Como funciona

O site é estático e fica no GitHub Pages. O workflow [`publicar.yml`](.github/workflows/publicar.yml) roda **a cada 30 minutos**, ou manualmente pela aba *Actions*, e faz três coisas:

1. **Itinerários**: baixa os feeds GTFS da [Mobility Database](https://mobilitydatabase.org) e converte para JSON compacto. Isso é refeito uma vez por semana e fica em cache.
2. **Status e veículos**: coleta o status das linhas de trilhos e a última posição dos ônibus.
3. **Publicação**: publica tudo no GitHub Pages.

Como os dados passam pela automação, o navegador não esbarra em bloqueio de CORS e nenhuma chave fica exposta.

```
scripts/regioes.mjs          # regiões e fontes
scripts/baixar-gtfs.mjs      # baixa os GTFS
scripts/build-gtfs.mjs       # GTFS → data/<regiao>/{linhas,paradas}.json + l/<linha>.json
scripts/atualizar-status.mjs # → data/status-trilhos.json, data/<regiao>/veiculos.json, data/meta.json
js/app.js, js/simulador.js   # front-end
```

### Rodar localmente

```bash
npm install
npm run dados    # baixa e processa tudo
npm run servir   # http://localhost:8080
```

## Fontes

- GTFS: [Mobility Database](https://mobilitydatabase.org) (SPTrans, SMTR Rio, BHTRANS, EPTC, URBS, Etufor, Metrofor)
- Status: [Direto do Metrô](https://www.metro.sp.gov.br/wp-content/themes/metrosp/direto-metro.php), [API CPTM](https://api.cptm.sp.gov.br/AppCPTM/v1/Linhas/ObterStatus), [TIC Trens](https://www.tictrens.com.br/)
- GPS: [Prefeitura do Rio (SPPO e BRT)](https://dados.mobilidade.rio/), [Tempo Real PBH](https://temporeal.pbh.gov.br/)
- Mapa: © [OpenStreetMap](https://www.openstreetmap.org/copyright) · Estações: Overpass API

**Limitações:** as linhas 8 e 9 (ViaMobilidade) não têm status público. Os feeds de Porto Alegre e Fortaleza estão marcados como inativos na Mobility Database, então os horários podem estar desatualizados. Curitiba não tem traçado no GTFS, e o trajeto liga as paradas. Em BH, o número da linha no GPS é o código interno da BHTRANS.
