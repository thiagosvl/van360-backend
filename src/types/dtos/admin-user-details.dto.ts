import { DispositivoCadastro } from "../enums.js";

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

export interface UltimoAcessoDispositivoDTO {
  dispositivo: DispositivoCadastro;
  data_hora: string;
}

export interface UltimoAcessoResumoDTO {
  data_hora: string;
  dispositivo: DispositivoCadastro;
  por_dispositivo: UltimoAcessoDispositivoDTO[];
}
