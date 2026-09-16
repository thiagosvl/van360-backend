export interface ProjecaoMesValorDTO {
  total: number;
  pix: number;
  cartao: number;
}

export interface AdminFinancialKpisDTO {
  mrr: number;
  arr: number;
  receitaRealizadaMes: number;
  receitaRealizadaMesAnterior: number;
  projecaoProximoMes: ProjecaoMesValorDTO;
  projecaoCaixaRealProximoMes: ProjecaoMesValorDTO;
  taxaConversaoTrial: number;
  trialsAtivosCount: number;
  trialsReceitaPotencial: number;
}

export interface Projecao12MesesItemDTO {
  chaveMes: string;
  labelMes: string;
  mensal: number;
  anual: number;
  trialPotencial: number;
  totalVencimento: number;
  totalCaixaReal: number;
  quantidadeRenovacoes: number;
}

export interface DistribuicaoDiaMesItemDTO {
  dia: number;
  valor: number;
  quantidade: number;
  isHoje: boolean;
}

export interface MeioPagamentoItemDTO {
  count: number;
  total: number;
  pct: number;
}

export interface MeiosPagamentoBreakdownDTO {
  pix: MeioPagamentoItemDTO;
  cartao: MeioPagamentoItemDTO;
  outros: MeioPagamentoItemDTO;
}

export interface ProximaRenovacaoItemDTO {
  id: string;
  usuarioId: string;
  motoristaNome: string;
  motoristaTelefone: string;
  planoNome: string;
  tipoPlano: "MONTHLY" | "YEARLY";
  metodoPagamento: string | null;
  dataVencimento: string;
  dataLiquidacaoPrevista: string;
  valor: number;
}

export interface AdminFinancialStatsResponseDTO {
  kpis: AdminFinancialKpisDTO;
  projecao12Meses: Projecao12MesesItemDTO[];
  distribuicaoDiasMes: DistribuicaoDiaMesItemDTO[];
  meiosPagamento: MeiosPagamentoBreakdownDTO;
  proximasRenovacoes: ProximaRenovacaoItemDTO[];
  diasRetencaoCartao: number;
}

export interface FaixaEtariaItemDTO {
  faixa: string;
  quantidade: number;
  porcentagem: number;
}

export interface FunilConversaoDTO {
  cadastrados: number;
  trialsIniciados: number;
  convertidosPagantes: number;
  assinantesAtivos: number;
  expiradosOuCancelados: number;
  taxaConversaoTrial: number;
  taxaRetencaoAtiva: number;
}

export interface EvolucaoMensalUsuarioItemDTO {
  chaveMes: string;
  labelMes: string;
  novosCadastros: number;
  novosAssinantes: number;
  cancelados: number;
}

export interface AdminDemographicsStatsResponseDTO {
  faixasEtarias: FaixaEtariaItemDTO[];
  funil: FunilConversaoDTO;
  evolucaoMensal: EvolucaoMensalUsuarioItemDTO[];
}
