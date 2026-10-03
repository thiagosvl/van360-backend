import { FINANCEIRO_CONFIG } from "../config/constants.js";
import { ModalidadeCobrancaEnum } from "../types/enums.js";
import type { Tables } from "../types/database.types.js";

export interface ParametrosCalculoDivisao {
  valorMensalidade: number;
  taxaPlataforma: number;
  repassarAoPai: boolean;
}

export interface ResultadoCalculoDivisao {
  valorCobrancaPai: number;
  taxaPlataforma: number;
  valorLiquidoMotorista: number;
  repassarAoPai: boolean;
  tarifaGatewayPixIn: number;
  tarifaGatewaySaque: number;
}

export interface ParametrosElegibilidade {
  motoristaConfig?: Tables<"motorista_configuracoes_financeiras"> | null;
  passageiroOverrideCobrancaAtiva?: boolean | null;
  statusCobranca?: string;
}

export const cobrancaCalculoService = {
  resolverTaxaPlataforma(taxaPersonalizada?: number | null, taxaPadraoGlobal?: number | null): number {
    if (taxaPersonalizada !== null && taxaPersonalizada !== undefined) {
      return Number(taxaPersonalizada);
    }
    if (taxaPadraoGlobal !== null && taxaPadraoGlobal !== undefined) {
      return Number(taxaPadraoGlobal);
    }
    return FINANCEIRO_CONFIG.TAXA_PLATAFORMA_PADRAO;
  },

  resolverRepasseAoPai(repassarPaiOverride?: boolean | null, repassarPadraoMotorista?: boolean | null): boolean {
    if (repassarPaiOverride !== null && repassarPaiOverride !== undefined) {
      return Boolean(repassarPaiOverride);
    }
    return Boolean(repassarPadraoMotorista);
  },

  calcularDivisaoCobranca({
    valorMensalidade,
    taxaPlataforma,
    repassarAoPai
  }: ParametrosCalculoDivisao): ResultadoCalculoDivisao {
    const valorOriginal = Number(valorMensalidade) || 0;
    const taxa = Number(taxaPlataforma) || 0;

    if (repassarAoPai) {
      return {
        valorCobrancaPai: Number((valorOriginal + taxa).toFixed(2)),
        taxaPlataforma: taxa,
        valorLiquidoMotorista: Number(valorOriginal.toFixed(2)),
        repassarAoPai: true,
        tarifaGatewayPixIn: FINANCEIRO_CONFIG.TARIFA_GATEWAY_PIX_IN,
        tarifaGatewaySaque: FINANCEIRO_CONFIG.TARIFA_GATEWAY_SAQUE
      };
    }

    return {
      valorCobrancaPai: Number(valorOriginal.toFixed(2)),
      taxaPlataforma: taxa,
      valorLiquidoMotorista: Number(Math.max(0, valorOriginal - taxa).toFixed(2)),
      repassarAoPai: false,
      tarifaGatewayPixIn: FINANCEIRO_CONFIG.TARIFA_GATEWAY_PIX_IN,
      tarifaGatewaySaque: FINANCEIRO_CONFIG.TARIFA_GATEWAY_SAQUE
    };
  },

  verificarElegibilidadeCobrancaAutomatica({
    motoristaConfig,
    passageiroOverrideCobrancaAtiva,
    statusCobranca
  }: ParametrosElegibilidade): boolean {
    if (!motoristaConfig) return false;
    if (!motoristaConfig.cobranca_automatica_ativa) return false;
    if (motoristaConfig.modalidade_cobranca === ModalidadeCobrancaEnum.MANUAL) return false;
    if (!motoristaConfig.chave_pix_repasse || !motoristaConfig.chave_pix_repasse.trim()) return false;
    if (passageiroOverrideCobrancaAtiva === false) return false;
    if (statusCobranca && (statusCobranca === "pago" || statusCobranca === "cancelada")) return false;

    return true;
  }
};
