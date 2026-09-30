// Regiões atendidas e as fontes de dados de cada uma.
// gtfs: id do feed na Mobility Database (espelho público, sem chave).
export const REGIOES = [
  {
    id: 'sp', nome: 'São Paulo', uf: 'SP', centro: [-23.55, -46.63], zoom: 11,
    gtfs: ['mdb-8'], veiculos: null, statusTrilhos: true,
    obs: 'Ônibus em tempo real da SPTrans (Olho Vivo) exige chave de API; não incluído.'
  },
  {
    id: 'rj', nome: 'Rio de Janeiro', uf: 'RJ', centro: [-22.91, -43.30], zoom: 11,
    gtfs: ['mdb-1791'], veiculos: 'rj', statusTrilhos: false,
    obs: 'SuperVia e MetrôRio não publicam status em API aberta.'
  },
  {
    id: 'bh', nome: 'Belo Horizonte', uf: 'MG', centro: [-19.92, -43.94], zoom: 12,
    gtfs: ['mdb-9'], veiculos: 'bh', statusTrilhos: false,
    obs: 'Metrô BH não publica status em API aberta.'
  },
  {
    id: 'poa', nome: 'Porto Alegre', uf: 'RS', centro: [-30.03, -51.21], zoom: 12,
    gtfs: ['mdb-7'], veiculos: null, statusTrilhos: false,
    obs: 'Feed GTFS marcado como inativo pela Mobility Database: horários podem estar desatualizados.'
  },
  {
    id: 'cwb', nome: 'Curitiba', uf: 'PR', centro: [-25.43, -49.27], zoom: 12,
    gtfs: ['mdb-3225'], veiculos: null, statusTrilhos: false, obs: ''
  },
  {
    id: 'for', nome: 'Fortaleza', uf: 'CE', centro: [-3.76, -38.53], zoom: 12,
    gtfs: ['mdb-2934', 'mdb-2367'], veiculos: null, statusTrilhos: false,
    obs: 'Feeds GTFS marcados como inativos pela Mobility Database: horários podem estar desatualizados.'
  }
];
