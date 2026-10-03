import { StatusRepasseEnum, ProvedorPagamentoEnum } from "../enums.js";

export interface AdminRepasseMotoristaDTO {
  id: string;
  nome: string;
  apelido: string | null;
  telefone: string | null;
  cpfcnpj: string | null;
}

export interface AdminRepassePassageiroDTO {
  id: string;
  nome: string;
}

export interface AdminRepasseCobrancaDTO {
  id: string;
  valor: number;
  status: string;
  mes: number;
  ano: number;
  data_vencimento: string;
}

export interface AdminRepasseItemDTO {
  id: string;
  cobranca_id: string;
  motorista_id: string;
  passageiro_id: string;
  provedor: ProvedorPagamentoEnum;
  valor_bruto: number;
  taxa_plataforma: number;
  tarifa_gateway_pix_in: number;
  tarifa_gateway_saque: number;
  valor_liquido_motorista: number;
  transacao_provedor_id: string;
  saque_provedor_id: string | null;
  end_to_end_id_in: string | null;
  end_to_end_id_out: string | null;
  status_repasse: StatusRepasseEnum;
  tentativas: number;
  ultimo_erro: string | null;
  data_pagamento_pai: string | null;
  data_repasse_motorista: string | null;
  created_at: string;
  updated_at: string;
  motorista: AdminRepasseMotoristaDTO;
  passageiro: AdminRepassePassageiroDTO;
  cobranca: AdminRepasseCobrancaDTO;
}

export interface AdminRepasseKpisDTO {
  total_repassado: number;
  total_taxa_plataforma: number;
  total_sucesso: number;
  total_falhas: number;
  total_pendentes: number;
}

export interface AdminRepasseListResponseDTO {
  data: AdminRepasseItemDTO[];
  total: number;
  page: number;
  limit: number;
}
