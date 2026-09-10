export interface CanalContadoresDTO {
  waba: number;
  resend: number;
  firebase: number;
  custoEstimadoWabaBrl: number;
}

export interface RegraDisparoItemDTO {
  titulo: string;
  descricao: string;
  totalFaturas: number;
  canais: CanalContadoresDTO;
}

export interface DisparosHojeResumoDTO {
  totalFaturasHoje: number;
  totalNotificacoesPrevistas: number;
  totalJaEnviadasHoje: number;
  totalAguardandoEnvioHoje: number;
  canaisConsolidados: CanalContadoresDTO;
  reguas: {
    vencendoHoje: RegraDisparoItemDTO;
    avisoPrevio: RegraDisparoItemDTO;
    atraso3Dias: RegraDisparoItemDTO;
    atraso5Dias: RegraDisparoItemDTO;
    atraso7Dias: RegraDisparoItemDTO;
    atrasados?: RegraDisparoItemDTO;
  };
}

export interface CarteiraDiaResumoDTO {
  dia: number;
  totalAlunos: number;
  faturasPagas: number;
  faturasPendentes: number;
  valorPrevistoTotal: number;
  valorPagoTotal: number;
  valorPendenteTotal: number;
  canaisDisponiveis: CanalContadoresDTO;
  diagnostico: {
    comTelefoneValido: number;
    comEmailValido: number;
    semResponsavelPrincipal: number;
    semContato: number;
    notificacoesDesativadasMotorista: number;
    lembretesDesativadosAluno: number;
  };
}

export interface VencimentoDetalhesResponseDTO {
  dia: number;
  mes: number;
  ano: number;
  isHoje: boolean;
  carteira: CarteiraDiaResumoDTO;
  disparosHoje: DisparosHojeResumoDTO | null;
}
