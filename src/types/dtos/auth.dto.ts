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

export interface LoginBodyDTO {
  identifier: string;
  password?: string;
}

export interface UpdatePasswordBodyDTO {
  password?: string;
  oldPassword?: string;
}

export interface RefreshTokenBodyDTO {
  refresh_token?: string;
}

export interface SolicitarRecuperacaoBodyDTO {
  cpf?: string;
  cpfcnpj?: string;
  documento?: string;
}

export interface ValidarCodigoBodyDTO {
  cpf?: string;
  cpfcnpj?: string;
  documento?: string;
  codigo?: string;
}

export interface ConfirmarResetBodyDTO {
  recoveryId?: string;
  password?: string;
}
