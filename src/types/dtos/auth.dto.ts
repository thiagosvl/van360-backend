import { DispositivoCadastro } from "../enums.js";

export interface MetadadosCadastroUtmDTO {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

export interface MetadadosCadastroDTO {
  ip?: string;
  user_agent?: string;
  referrer?: string;
  utm?: MetadadosCadastroUtmDTO;
}

export interface RegistrarUsuarioBodyDTO {
  nome: string;
  apelido?: string;
  cpfcnpj: string;
  email: string;
  telefone: string;
  senha: string;
  termos_aceitos: boolean;
  data_nascimento?: string;
  razao_social?: string;
  indicador_id?: string;
  dispositivo_cadastro?: DispositivoCadastro;
  metadados_cadastro?: MetadadosCadastroDTO;
}
