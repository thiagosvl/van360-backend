import type { Tables, TablesInsert, TablesUpdate, Enums } from "../database.types.js";

export type FretamentoRow = Tables<"fretamentos">;
export type FretamentoInsert = TablesInsert<"fretamentos">;
export type FretamentoUpdate = TablesUpdate<"fretamentos">;

export type FretamentoVeiculoRow = Tables<"fretamento_veiculos">;
export type FretamentoPagamentoRow = Tables<"fretamento_pagamentos">;
export type FretamentoParticipanteRow = Tables<"fretamento_participantes">;

export type FretamentoTipo = Enums<"fretamento_tipo_enum">;
export type FretamentoStatus = Enums<"fretamento_status_enum">;
export type FretamentoPagamentoStatus = Enums<"fretamento_pagamento_status_enum">;
export type ParticipantePagamentoStatus = Enums<"participante_pagamento_status_enum">;
export type TipoPagamento = Enums<"tipo_pagamento_enum">;

export interface CriarFretamentoDTO {
  tipo: FretamentoTipo;
  titulo: string;
  origem?: string | null;
  destino: string;
  data_inicio: string;
  data_fim?: string | null;
  contratante_nome?: string | null;
  contratante_telefone?: string | null;
  valor_total?: number;
  valor_por_pessoa?: number | null;
  vagas_totais?: number | null;
  chave_pix?: string | null;
  observacoes?: string | null;
  veiculos_ids?: string[];
  sinal_inicial?: {
    valor: number;
    tipo_pagamento: TipoPagamento;
    data_pagamento?: string;
  } | null;
}

export interface AtualizarFretamentoDTO {
  titulo?: string;
  origem?: string | null;
  destino?: string;
  data_inicio?: string;
  data_fim?: string | null;
  contratante_nome?: string | null;
  contratante_telefone?: string | null;
  valor_total?: number;
  valor_por_pessoa?: number | null;
  vagas_totais?: number | null;
  chave_pix?: string | null;
  observacoes?: string | null;
  status?: FretamentoStatus;
  veiculos_ids?: string[];
}

export interface RegistrarPagamentoFretamentoDTO {
  valor: number;
  tipo_pagamento: TipoPagamento;
  data_pagamento?: string;
  descricao?: string | null;
}

export interface AdicionarParticipanteDTO {
  passageiro_id?: string | null;
  nome: string;
  is_proprio_responsavel?: boolean;
  responsavel_nome?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  valor?: number;
  observacoes?: string | null;
}

export interface AtualizarStatusParticipanteDTO {
  status_pagamento: ParticipantePagamentoStatus;
  tipo_pagamento?: TipoPagamento | null;
}

export interface FretamentoDetalhesDTO extends FretamentoRow {
  veiculos: Array<{
    id: string;
    veiculo_id: string;
    placa?: string | null;
    modelo?: string | null;
    vagas_capacidade?: number | null;
  }>;
  pagamentos: FretamentoPagamentoRow[];
  participantes: FretamentoParticipanteRow[];
  total_pago: number;
  saldo_restante: number;
  vagas_ocupadas: number;
}

export interface ResumoFinanceiroFretamentosDTO {
  mes: number;
  ano: number;
  total_faturado_previsto: number;
  total_recebido: number;
  total_a_receber: number;
  quantidade_fretamentos: number;
  quantidade_passeios: number;
}
