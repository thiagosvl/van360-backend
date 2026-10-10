import { RastreamentoModo } from "../enums.js";

export interface ConfiguracoesUsuarioDTO {
  cobranca_aviso_previo_ativo: boolean;
  cobranca_aviso_previo_whatsapp_ativo: boolean;
  cobranca_dias_aviso_previo: number | null;
  cobranca_vencimento_hoje_ativo: boolean;
  cobranca_atraso_3_dias_ativo: boolean;
  cobranca_atraso_5_dias_ativo: boolean;
  cobranca_atraso_7_dias_ativo: boolean;
  dias_aviso_vencimento_padrao_sistema: number;
  notificar_motorista_parcelas: boolean;
  notificar_motorista_aniversarios: boolean;
  notificar_inicio_rota: boolean;
  notificar_proxima_parada: boolean;
  notificar_conclusao_parada: boolean;
  rastreamento_ativo: boolean;
  rastreamento_modo: RastreamentoModo;
  formato_nome_responsavel: "primeiro_nome" | "completo";
  exibir_telefone_lista_alunos: boolean;
  chave_pix: string | null;
  tipo_chave_pix: string | null;
}

export interface UpdateConfiguracoesDTO {
  cobranca_aviso_previo_ativo?: boolean;
  cobranca_dias_aviso_previo?: number | null;
  cobranca_vencimento_hoje_ativo?: boolean;
  cobranca_atraso_3_dias_ativo?: boolean;
  cobranca_atraso_5_dias_ativo?: boolean;
  cobranca_atraso_7_dias_ativo?: boolean;
  notificar_motorista_parcelas?: boolean;
  notificar_motorista_aniversarios?: boolean;
  notificar_inicio_rota?: boolean;
  notificar_proxima_parada?: boolean;
  notificar_conclusao_parada?: boolean;
  rastreamento_ativo?: boolean;
  rastreamento_modo?: RastreamentoModo;
  formato_nome_responsavel?: "primeiro_nome" | "completo";
  exibir_telefone_lista_alunos?: boolean;
}


