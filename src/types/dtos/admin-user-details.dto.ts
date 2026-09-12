export interface DispositivoConectadoDTO {
  id: string;
  plataforma: string;
  criado_em: string | null;
  atualizado_em: string | null;
}

export interface DispositivosUsuarioResumoDTO {
  total: number;
  itens: DispositivoConectadoDTO[];
}
