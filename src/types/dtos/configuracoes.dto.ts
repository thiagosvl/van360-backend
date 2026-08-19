import { RastreamentoModo } from "../enums.js";

export interface ConfiguracoesUsuarioDTO {
  notificar_pais_cobrancas: boolean;
  notificar_motorista_parcelas: boolean;
  notificar_motorista_aniversarios: boolean;
  notificar_inicio_rota: boolean;
  notificar_proxima_parada: boolean;
  notificar_conclusao_parada: boolean;
  rastreamento_ativo: boolean;
  rastreamento_modo: RastreamentoModo;
  chave_pix: string | null;
  tipo_chave_pix: string | null;
}

export interface UpdateConfiguracoesDTO {
  notificar_pais_cobrancas?: boolean;
  notificar_motorista_parcelas?: boolean;
  notificar_motorista_aniversarios?: boolean;
  notificar_inicio_rota?: boolean;
  notificar_proxima_parada?: boolean;
  notificar_conclusao_parada?: boolean;
  rastreamento_ativo?: boolean;
  rastreamento_modo?: RastreamentoModo;
}

