// Estados atendidos e as fontes de dados de cada um.
// gtfs: ids de feeds na Mobility Database (espelho público, sem chave).
// ibge: código da UF, usado para associar cada parada ao seu município.
// Os ids antigos (por cidade) continuam aceitos no endereço via `antigo`.
export const REGIOES = [
  {
    id: 'sp', nome: 'São Paulo', uf: 'SP', ibge: 35, capital: 3550308, antigo: [],
    gtfs: ['mdb-8'], veiculos: null, statusTrilhos: true,
    obs: 'Ônibus em tempo real da SPTrans (Olho Vivo) exige chave de API; não incluído.'
  },
  {
    id: 'rj', nome: 'Rio de Janeiro', uf: 'RJ', ibge: 33, capital: 3304557, antigo: [],
    gtfs: ['mdb-1791', 'mdb-2632'], veiculos: 'rj', statusTrilhos: false,
    obs: 'SuperVia e MetrôRio não publicam status em API aberta. Angra dos Reis: feed inativo na Mobility Database.'
  },
  {
    id: 'mg', nome: 'Minas Gerais', uf: 'MG', ibge: 31, capital: 3106200, antigo: ['bh'],
    gtfs: ['mdb-9', 'mdb-687'], veiculos: 'mg', statusTrilhos: false,
    obs: 'Metrô BH não publica status em API aberta.'
  },
  {
    id: 'rs', nome: 'Rio Grande do Sul', uf: 'RS', ibge: 43, capital: 4314902, antigo: ['poa'],
    gtfs: ['mdb-7', 'mdb-930'], veiculos: null, statusTrilhos: false,
    obs: 'Feeds GTFS de Porto Alegre e Bagé marcados como inativos: horários podem estar desatualizados.'
  },
  {
    id: 'pr', nome: 'Paraná', uf: 'PR', ibge: 41, capital: 4106902, antigo: ['cwb'],
    gtfs: ['mdb-3225'], veiculos: null, statusTrilhos: false,
    obs: 'O GTFS de Curitiba não traz traçado: o trajeto liga as paradas.'
  },
  {
    id: 'ce', nome: 'Ceará', uf: 'CE', ibge: 23, capital: 2304400, antigo: ['for'],
    gtfs: ['mdb-2934', 'mdb-2367', 'mdb-2935'], veiculos: null, statusTrilhos: false,
    obs: 'Feeds GTFS marcados como inativos pela Mobility Database: horários podem estar desatualizados.'
  }
];
