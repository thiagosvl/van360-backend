export interface ConfiguracoesUsuarioDTO {
  notificar_pais_cobrancas: boolean;
  notificar_motorista_parcelas: boolean;
  notificar_motorista_aniversarios: boolean;
  chave_pix: string | null;
  tipo_chave_pix: string | null;
}

export interface UpdateConfiguracoesDTO {
  notificar_pais_cobrancas?: boolean;
  notificar_motorista_parcelas?: boolean;
  notificar_motorista_aniversarios?: boolean;
}
