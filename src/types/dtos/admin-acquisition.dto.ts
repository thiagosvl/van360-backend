export interface CanalAquisicaoAgrupadoDTO {
  origem: string;
  categoria: "meta_ads" | "google_ads" | "tiktok_ads" | "play_store" | "site_organico" | "indicacao" | "direto";
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
