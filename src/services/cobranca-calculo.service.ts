import { FINANCEIRO_CONFIG } from "../config/constants.js";
import { ModoCobrancaEnum, ContractMultaTipo, CobrancaStatus } from "../types/enums.js";
import type { Tables, Database } from "../types/database.types.js";

export type ModoCobrancaTipo = ModoCobrancaEnum | Database["public"]["Enums"]["modo_cobranca_enum"];

export interface RegraEncargoResolvido {
  value: number;
  tipo: ContractMultaTipo;
}

export interface EncargosAtrasoResolvidos {
  fines?: RegraEncargoResolvido;
  interests?: RegraEncargoResolvido;
  daysAfterDueDate: number;
  hasOverdueRules: boolean;
}

export interface ParametrosCalculoDivisao {
  valorMensalidade: number;
  taxaPlataforma: number;
}

export interface ResultadoCalculoDivisao {
  valorCobrancaPai: number;
  taxaPlataforma: number;
  valorLiquidoMotorista: number;
  tarifaGatewayPixIn: number;
  tarifaGatewaySaque: number;
}

export interface ParametrosElegibilidade {
  motoristaConfig?: Tables<"motorista_configuracoes_financeiras"> | null;
  passageiroModoCobranca?: ModoCobrancaTipo | null;
  statusCobranca?: string;
}

export interface ParametrosDecomposicaoEncargos {
  valorOriginal: number;
  valorRealPago: number;
  motoristaConfig?: Tables<"motorista_configuracoes_financeiras"> | null;
}

export interface ParametrosCalculoRetroativo {
  valorOriginal: number;
  diasAtraso: number;
  encargos: EncargosAtrasoResolvidos;
}

export interface ResultadoCalculoRetroativo {
  multaRetroativa: number;
  jurosRetroativos: number;
  totalEncargos: number;
  valorAtualizado: number;
}

export interface ResultadoDecomposicaoEncargos {
  valorOriginal: number;
  valorRealPago: number;
  valorMulta: number;
  valorJuros: number;
  totalEncargos: number;
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

  calcularDivisaoCobranca({
    valorMensalidade,
    taxaPlataforma
  }: ParametrosCalculoDivisao): ResultadoCalculoDivisao {
    const valorOriginal = Number(valorMensalidade) || 0;
    const taxa = Number(taxaPlataforma) || 0;

    return {
      valorCobrancaPai: Number(valorOriginal.toFixed(2)),
      taxaPlataforma: taxa,
      valorLiquidoMotorista: Number(Math.max(0, valorOriginal - taxa).toFixed(2)),
      tarifaGatewayPixIn: FINANCEIRO_CONFIG.TARIFA_GATEWAY_PIX_IN,
      tarifaGatewaySaque: FINANCEIRO_CONFIG.TARIFA_GATEWAY_SAQUE
    };
  },

  resolverModoEfetivo({
    motoristaModoCobranca,
    passageiroModoCobranca
  }: {
    motoristaModoCobranca?: ModoCobrancaTipo | null;
    passageiroModoCobranca?: ModoCobrancaTipo | null;
  }): ModoCobrancaTipo {
    if (passageiroModoCobranca) {
      return passageiroModoCobranca;
    }
    return motoristaModoCobranca || ModoCobrancaEnum.DESATIVADO;
  },

  verificarElegibilidadeLembretes({
    motoristaConfig,
    passageiroModoCobranca,
    statusCobranca
  }: ParametrosElegibilidade): boolean {
    if (statusCobranca && (statusCobranca === CobrancaStatus.PAGO || statusCobranca === CobrancaStatus.CANCELADA)) return false;

    const modoEfetivo = this.resolverModoEfetivo({
      motoristaModoCobranca: motoristaConfig?.modo_cobranca,
      passageiroModoCobranca
    });

    return modoEfetivo === ModoCobrancaEnum.LEMBRETES || modoEfetivo === ModoCobrancaEnum.AUTOMATICA;
  },

  verificarElegibilidadeCobrancaAutomatica({
    motoristaConfig,
    passageiroModoCobranca,
    statusCobranca
  }: ParametrosElegibilidade): boolean {
    if (!motoristaConfig) return false;
    if (statusCobranca && (statusCobranca === CobrancaStatus.PAGO || statusCobranca === CobrancaStatus.CANCELADA)) return false;
    if (passageiroModoCobranca === ModoCobrancaEnum.DESATIVADO || passageiroModoCobranca === ModoCobrancaEnum.LEMBRETES) return false;

    if (!motoristaConfig.chave_pix_repasse || !motoristaConfig.chave_pix_repasse.trim()) return false;

    if (passageiroModoCobranca === ModoCobrancaEnum.AUTOMATICA) return true;

    return motoristaConfig.modo_cobranca === ModoCobrancaEnum.AUTOMATICA;
  },

  resolverEncargosAtraso(motoristaConfig?: Tables<"motorista_configuracoes_financeiras"> | null): EncargosAtrasoResolvidos {
    if (!motoristaConfig) {
      return { daysAfterDueDate: 30, hasOverdueRules: false };
    }

    const hasMulta = Boolean(
      motoristaConfig.cobrar_multa_atraso &&
      motoristaConfig.multa_atraso_valor &&
      Number(motoristaConfig.multa_atraso_valor) > 0
    );

    const hasJuros = Boolean(
      motoristaConfig.cobrar_juros_atraso &&
      motoristaConfig.juros_atraso_valor &&
      Number(motoristaConfig.juros_atraso_valor) > 0
    );

    const fines: RegraEncargoResolvido | undefined = hasMulta
      ? {
          value: Number(motoristaConfig.multa_atraso_valor),
          tipo: (motoristaConfig.multa_atraso_tipo as ContractMultaTipo) || ContractMultaTipo.PERCENTUAL
        }
      : undefined;

    const interests: RegraEncargoResolvido | undefined = hasJuros
      ? {
          value: Number(motoristaConfig.juros_atraso_valor),
          tipo: (motoristaConfig.juros_atraso_tipo as ContractMultaTipo) || ContractMultaTipo.PERCENTUAL
        }
      : undefined;

    const daysAfterDueDate = motoristaConfig.dias_validade_apos_vencimento || FINANCEIRO_CONFIG.DIAS_VALIDADE_APOS_VENCIMENTO_PADRAO;

    return {
      fines,
      interests,
      daysAfterDueDate,
      hasOverdueRules: hasMulta || hasJuros
    };
  },

  decomporEncargosPagamento({
    valorOriginal,
    valorRealPago,
    motoristaConfig
  }: ParametrosDecomposicaoEncargos): ResultadoDecomposicaoEncargos {
    const original = Number(Number(valorOriginal || 0).toFixed(2));
    const pago = Number(Number(valorRealPago || 0).toFixed(2));
    const totalEncargos = Math.max(0, Number((pago - original).toFixed(2)));

    if (totalEncargos <= 0) {
      return {
        valorOriginal: original,
        valorRealPago: pago,
        valorMulta: 0,
        valorJuros: 0,
        totalEncargos: 0
      };
    }

    let multaEstimada = 0;
    if (motoristaConfig?.cobrar_multa_atraso && motoristaConfig.multa_atraso_valor && Number(motoristaConfig.multa_atraso_valor) > 0) {
      const multaValor = Number(motoristaConfig.multa_atraso_valor);
      const isPercentual = motoristaConfig.multa_atraso_tipo !== ContractMultaTipo.FIXO;
      multaEstimada = isPercentual
        ? Number(((original * multaValor) / 100).toFixed(2))
        : Number(multaValor.toFixed(2));
    }

    const valorMulta = Math.min(totalEncargos, multaEstimada);
    const valorJuros = Number((totalEncargos - valorMulta).toFixed(2));

    return {
      valorOriginal: original,
      valorRealPago: pago,
      valorMulta,
      valorJuros,
      totalEncargos
    };
  },

  calcularEncargosRetroativos({
    valorOriginal,
    diasAtraso,
    encargos
  }: ParametrosCalculoRetroativo): ResultadoCalculoRetroativo {
    const original = Number(Number(valorOriginal || 0).toFixed(2));
    if (diasAtraso <= 0 || !encargos.hasOverdueRules) {
      return {
        multaRetroativa: 0,
        jurosRetroativos: 0,
        totalEncargos: 0,
        valorAtualizado: original
      };
    }

    let multaRetroativa = 0;
    if (encargos.fines) {
      multaRetroativa = encargos.fines.tipo === ContractMultaTipo.PERCENTUAL
        ? (original * encargos.fines.value) / 100
        : encargos.fines.value;
    }

    let jurosRetroativos = 0;
    if (encargos.interests) {
      const taxaDiaria = (encargos.interests.value / 30) / 100;
      jurosRetroativos = original * taxaDiaria * diasAtraso;
    }

    multaRetroativa = Number(multaRetroativa.toFixed(2));
    jurosRetroativos = Number(jurosRetroativos.toFixed(2));
    const totalEncargos = Number((multaRetroativa + jurosRetroativos).toFixed(2));
    const valorAtualizado = Number((original + totalEncargos).toFixed(2));

    return {
      multaRetroativa,
      jurosRetroativos,
      totalEncargos,
      valorAtualizado
    };
  }
};
