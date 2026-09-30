# Rotas Brasil

Um modelo de simulador de itinerários de ônibus, metrô e trem em cidades brasileiras, feito só com **dados abertos**.

🔗 **Site:** https://fau009.github.io/rotas-brasil/

## O que tem

- **Estado → Cidade**: escolha o estado, e a capital vem selecionada. Dá para trocar para qualquer cidade atendida pelas linhas. O botão ⌖ reposiciona o mapa na cidade.
- **Mapa navegável** (Leaflet) em 4 modelos: **Detalhado** (OpenStreetMap), **Claro**, **Escuro** (Esri) e **Branco** (só as linhas e o contorno das cidades). Mostra as linhas de trilhos do estado e as paradas ao aproximar.
- **Linhas municipais e intermunicipais**: cada parada é associada ao seu município (contornos do IBGE). Numa cidade, o filtro separa as linhas que só circulam nela das que a ligam a outras cidades (ex.: *Guarulhos → São Paulo*), e o itinerário marca onde a linha entra em cada cidade.
- **Tema claro/escuro** da interface (automático pelo sistema, ou escolhido no botão ◐).
- **Linhas e itinerários**: busca por número, nome ou destino. Mostra trajeto, paradas com tempo previsto, horários de partida por tipo de dia (útil, sábado, domingo), primeira e última partida e intervalo médio.
- **Status dos trilhos** (Grande São Paulo): situação de cada linha do Metrô, ViaQuatro, ViaMobilidade, CPTM e TIC Trens.
- **Simulador**: anima os veículos ao longo do trajeto a partir do quadro de horários, para uma linha ou para todos os trilhos da região. Controle de horário, dia e velocidade.
- **Ônibus (última posição)**: Rio de Janeiro (ônibus municipais + BRT) e Belo Horizonte.
- **Estações OSM**: busca estações e terminais do OpenStreetMap na área visível.
- **Última atualização + botão Recarregar** no topo. Não é tempo real: os dados são coletados periodicamente.

## Estados e cidades

| Estado | Itinerários (GTFS) | Cidades atendidas | Status trilhos | Posição dos ônibus |
|---|---|---|---|---|
| São Paulo | SPTrans (ônibus, metrô, CPTM) | 29 (capital + Grande SP) | ✅ | — (Olho Vivo exige chave) |
| Rio de Janeiro | SMTR Rio + Angra dos Reis | 5 | — | ✅ |
| Minas Gerais | BHTRANS (convencional + suplementar) | 8 | — | ✅ |
| Rio Grande do Sul | EPTC Porto Alegre + Bagé | 5 | — | — |
| Paraná | URBS Curitiba | 7 | — | — |
| Ceará | Etufor + Metrofor + ARCE (metropolitano) | 26 | — | — |

## Como funciona

O site é estático e fica no GitHub Pages. O workflow [`publicar.yml`](.github/workflows/publicar.yml) roda **a cada 30 minutos**, ou manualmente pela aba *Actions*, e faz três coisas:

1. **Itinerários**: baixa os feeds GTFS da [Mobility Database](https://mobilitydatabase.org) e converte para JSON compacto. Isso é refeito uma vez por semana e fica em cache.
2. **Status e veículos**: coleta o status das linhas de trilhos e a última posição dos ônibus.
3. **Publicação**: publica tudo no GitHub Pages.

Como os dados passam pela automação, o navegador não esbarra em bloqueio de CORS e nenhuma chave fica exposta.

```
scripts/regioes.mjs          # regiões e fontes
scripts/baixar-gtfs.mjs      # baixa os GTFS
scripts/build-gtfs.mjs       # GTFS + IBGE → data/<uf>/{linhas,paradas,cidades}.json + l/<linha>.json
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
- Municípios: [IBGE – malhas e localidades](https://servicodados.ibge.gov.br/api/docs)
- Mapa: © [OpenStreetMap](https://www.openstreetmap.org/copyright) · Esri Light/Dark Gray Canvas · Estações: Overpass API

**Limitações:** as linhas 8 e 9 (ViaMobilidade) não têm status público. Os feeds de Porto Alegre e Fortaleza estão marcados como inativos na Mobility Database, então os horários podem estar desatualizados. Curitiba não tem traçado no GTFS, e o trajeto liga as paradas. Em BH, o número da linha no GPS é o código interno da BHTRANS.
