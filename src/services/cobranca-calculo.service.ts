import { FINANCEIRO_CONFIG } from "../config/constants.js";
import { ModoCobrancaEnum, ContractMultaTipo, CobrancaStatus, ProvedorPagamentoEnum } from "../types/enums.js";
import type { Tables, Database } from "../types/database.types.js";

export type ModoCobrancaTipo = ModoCobrancaEnum | Database["public"]["Enums"]["modo_cobranca_enum"];

export type PixOrigem = "ALUNO" | "VEICULO" | "MOTORISTA" | "NENHUMA";

export interface PixResolvido {
  chave: string | null;
  tipo: string | null;
  origem: PixOrigem;
}

export interface ParametrosResolucaoPix {
  passageiro?: {
    chave_pix?: string | null;
    tipo_chave_pix?: string | null;
    veiculo?: {
      chave_pix?: string | null;
      tipo_chave_pix?: string | null;
    } | Array<{
      chave_pix?: string | null;
      tipo_chave_pix?: string | null;
    }> | null;
  } | Record<string, unknown> | null;
  veiculo?: {
    chave_pix?: string | null;
    tipo_chave_pix?: string | null;
  } | Record<string, unknown> | null;
  motoristaConfig?: {
    chave_pix_repasse?: string | null;
    tipo_chave_pix?: string | null;
  } | Record<string, unknown> | null;
  cobrancaSnapshotPix?: string | null;
}

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
  chavePixEfetiva?: string | null;
}

export interface ParametrosDecomposicaoEncargos {
  valorOriginal: number;
  valorRealPago: number;
  motoristaConfig?: Tables<"motorista_configuracoes_financeiras"> | null;
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
    statusCobranca,
    chavePixEfetiva
  }: ParametrosElegibilidade): boolean {
    if (!motoristaConfig) return false;
    if (statusCobranca && (statusCobranca === CobrancaStatus.PAGO || statusCobranca === CobrancaStatus.CANCELADA)) return false;
    if (passageiroModoCobranca === ModoCobrancaEnum.DESATIVADO || passageiroModoCobranca === ModoCobrancaEnum.LEMBRETES) return false;

    const isBB = motoristaConfig.provedor_ativo === ProvedorPagamentoEnum.BANCO_DO_BRASIL;
    if (!isBB) {
      const chavePix = chavePixEfetiva || motoristaConfig.chave_pix_repasse;
      if (!chavePix || !chavePix.trim()) return false;
    }

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

  resolverPixEfetivo({
    passageiro,
    veiculo,
    motoristaConfig,
    cobrancaSnapshotPix
  }: ParametrosResolucaoPix): PixResolvido {
    if (cobrancaSnapshotPix && typeof cobrancaSnapshotPix === "string" && cobrancaSnapshotPix.trim().length > 0) {
      const snapChave = cobrancaSnapshotPix.trim();
      const snapTipo = (passageiro as Record<string, unknown> | null | undefined)?.tipo_chave_pix as string | null
        || (veiculo as Record<string, unknown> | null | undefined)?.tipo_chave_pix as string | null
        || (motoristaConfig as Record<string, unknown> | null | undefined)?.tipo_chave_pix as string | null
        || null;
      return {
        chave: snapChave,
        tipo: snapTipo,
        origem: "MOTORISTA"
      };
    }

    const passageiroRecord = passageiro as Record<string, unknown> | null | undefined;
    const chavePassageiro = passageiroRecord?.chave_pix;
    if (typeof chavePassageiro === "string" && chavePassageiro.trim().length > 0) {
      return {
        chave: chavePassageiro.trim(),
        tipo: (passageiroRecord?.tipo_chave_pix as string) || null,
        origem: "ALUNO"
      };
    }

    const rawVeiculoDireto = Array.isArray(veiculo) ? veiculo[0] : veiculo;
    const veiculoDireto = rawVeiculoDireto as Record<string, unknown> | null | undefined;
    const veiculoDoPassageiroRaw = passageiroRecord?.veiculo;
    const veiculoDoPassageiro = Array.isArray(veiculoDoPassageiroRaw)
      ? (veiculoDoPassageiroRaw[0] as Record<string, unknown> | undefined)
      : (veiculoDoPassageiroRaw as Record<string, unknown> | undefined);

    const veiculoEfetivo = veiculoDireto || veiculoDoPassageiro;
    const chaveVeiculo = veiculoEfetivo?.chave_pix;
    if (typeof chaveVeiculo === "string" && chaveVeiculo.trim().length > 0) {
      return {
        chave: chaveVeiculo.trim(),
        tipo: (veiculoEfetivo?.tipo_chave_pix as string) || null,
        origem: "VEICULO"
      };
    }

    const motoristaRecord = motoristaConfig as Record<string, unknown> | null | undefined;
    const chaveMotorista = motoristaRecord?.chave_pix_repasse;
    if (typeof chaveMotorista === "string" && chaveMotorista.trim().length > 0) {
      return {
        chave: chaveMotorista.trim(),
        tipo: (motoristaRecord?.tipo_chave_pix as string) || null,
        origem: "MOTORISTA"
      };
    }

    return {
      chave: null,
      tipo: null,
      origem: "NENHUMA"
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
  }
};
