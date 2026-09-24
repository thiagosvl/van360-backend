import { AtribuicaoCategoria } from "../enums.js";

export interface CanalAquisicaoAgrupadoDTO {
  origem: string;
  categoria: AtribuicaoCategoria;
  quantidade: number;
  porcentagem: number;
  em_trial: number;
  ativos_pagantes: number;
  taxa_conversao: number;
}

export interface CampanhaAquisicaoDTO {
  nome: string;
  origem: string;
  criativo?: string;
  conjunto?: string;
  quantidade: number;
  em_trial: number;
  ativos_pagantes: number;
  taxa_conversao: number;
}

export interface DispositivoAquisicaoDTO {
  dispositivo: string;
  label: string;
  quantidade: number;
  porcentagem: number;
}

export interface AdminAcquisitionStatsDTO {
  periodo: {
    data_inicio?: string;
    data_fim?: string;
  };
  resumo: {
    total_leads: number;
    em_trial: number;
    ativos_pagantes: number;
    vitalicios: number;
    taxa_conversao: number;
    com_alunos_cadastrados: number;
  };
  canais: CanalAquisicaoAgrupadoDTO[];
  campanhas: CampanhaAquisicaoDTO[];
  dispositivos: DispositivoAquisicaoDTO[];
  canais_autodeclarados: Record<string, number>;
}
