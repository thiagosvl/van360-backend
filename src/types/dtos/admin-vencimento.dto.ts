export interface VencimentoDiaItemDTO {
  dia: number;
  quantidade: number;
  isHoje: boolean;
  percentual: number;
}

export interface VencimentosPassageirosResponseDTO {
  totalPassageirosAtivosComVencimento: number;
  vencimentosHoje: number;
  diaComPico: { dia: number; quantidade: number } | null;
  diaAtual: number;
  dias: VencimentoDiaItemDTO[];
}
