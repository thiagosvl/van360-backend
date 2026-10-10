export interface ResumoExcecoesModoCobrancaDTO {
  total_alunos: number;
  padrao_van: number;
  excecoes: {
    DESATIVADO: number;
    LEMBRETES: number;
    AUTOMATICA: number;
  };
  total_excecoes: number;
}
