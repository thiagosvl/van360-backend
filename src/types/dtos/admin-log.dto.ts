import type { Json } from "../database.types.js";

export interface AdminLogItemDTO {
  id: string;
  usuario_id: string;
  acao: string;
  descricao: string;
  entidade_tipo: string;
  entidade_id: string;
  created_at: string;
  meta: Json | null;
  ip_address: string | null;
  usuarios?: {
    id?: string;
    nome?: string | null;
    apelido?: string | null;
    telefone?: string | null;
  } | null;
}

export interface AdminUserGroupLogItemDTO {
  usuario_id: string;
  usuario_nome: string | null;
  usuario_apelido: string | null;
  usuario_telefone: string | null;
  usuario_email: string | null;
  usuario_logo_url: string | null;
  assinatura_status: string;
  tipo_usuario: string;
  cadastrado_em: string | null;
  total_atividades: number;
  primeira_atividade_em: string | null;
  ultima_atividade_em: string | null;
  ultimas_atividades: AdminLogItemDTO[];
}

export interface AdminLogsByUserResponseDTO {
  data: AdminUserGroupLogItemDTO[];
  total: number;
  total_novos: number;
  total_trial: number;
  total_ativos: number;
  total_vitalicios: number;
  total_recorrentes: number;
  page: number;
  limit: number;
}
