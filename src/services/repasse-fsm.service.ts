/** Repasse FSM Service */
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { RepasseState } from "../types/enums.js";

// =============================================
// Mapa de Transições Válidas (FSM)
// =============================================

const TRANSICOES_VALIDAS: Record<RepasseState, RepasseState[]> = {
  [RepasseState.CRIADO]:               [RepasseState.DECODIFICANDO, RepasseState.CANCELADO],
  [RepasseState.DECODIFICANDO]:        [RepasseState.DECODIFICADO, RepasseState.ERRO_DECODIFICACAO, RepasseState.CRIADO, RepasseState.CANCELADO],
  [RepasseState.DECODIFICADO]:         [RepasseState.SUBMETIDO, RepasseState.CANCELADO],
  [RepasseState.SUBMETIDO]:            [RepasseState.AGUARDANDO_APROVACAO, RepasseState.LIQUIDADO, RepasseState.ERRO_TRANSFERENCIA, RepasseState.CANCELADO],
  [RepasseState.AGUARDANDO_APROVACAO]: [RepasseState.EM_LIQUIDACAO, RepasseState.LIQUIDADO, RepasseState.EXPIRADO, RepasseState.ERRO_TRANSFERENCIA, RepasseState.CANCELADO],
  [RepasseState.EM_LIQUIDACAO]:        [RepasseState.LIQUIDADO, RepasseState.ERRO_TRANSFERENCIA, RepasseState.CANCELADO],
  [RepasseState.LIQUIDADO]:            [], // Terminal
  [RepasseState.EXPIRADO]:             [RepasseState.CRIADO, RepasseState.CANCELADO],
  [RepasseState.ERRO_DECODIFICACAO]:   [RepasseState.CRIADO, RepasseState.CANCELADO],
  [RepasseState.ERRO_TRANSFERENCIA]:   [RepasseState.CRIADO, RepasseState.CANCELADO],
  [RepasseState.CANCELADO]:            [], // Terminal
};

const ESTADOS_TERMINAIS: RepasseState[] = [
  RepasseState.LIQUIDADO,
  RepasseState.CANCELADO,
];

// =============================================
// Service
// =============================================

export const repasseFsmService = {

  /**
   * Cria um novo repasse com estado CRIADO.
   */
  async criarRepasse(params: {
    cobrancaId: string;
    usuarioId: string;
    valor: number;
    gateway: string;
  }): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from("repasses")
      .insert({
        cobranca_id: params.cobrancaId,
        usuario_id: params.usuarioId,
        valor: params.valor,
        estado: RepasseState.CRIADO,
        gateway: params.gateway,
        versao: 1,
        tentativa: 1,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505" && error.message?.includes("idx_repasse_ativo_cobranca")) {
        logger.warn({ cobrancaId: params.cobrancaId }, "[FSM] Repasse ativo já existe para esta cobrança");
        throw new Error("REPASSE_ATIVO_EXISTENTE");
      }
      logger.error({ error, params }, "[FSM] Erro ao criar repasse");
      throw error;
    }

    await this._registrarTransicao(data.id, RepasseState.CRIADO, RepasseState.CRIADO, {
      motivo: "Repasse criado",
      ator: "sistema",
      metadata: params // Armazena os dados de criação no metadata
    });

    logger.info({ repasseId: data.id, cobrancaId: params.cobrancaId }, "[FSM] Repasse criado");
    return data;
  },

  /**
   * Busca o último repasse (qualquer estado) de uma cobrança.
   */
  async buscarUltimoRepasse(cobrancaId: string): Promise<any | null> {
    const { data, error } = await supabaseAdmin
      .from("repasses")
      .select("*")
      .eq("cobranca_id", cobrancaId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error({ cobrancaId, error }, "[FSM] Erro ao buscar último repasse");
      throw error;
    }

    return data;
  },

  /**
   * Atalho para cancelar um repasse.
   */
  async cancelarRepasse(repasseId: string, motivo: string): Promise<any> {
    return this.transicionar(repasseId, RepasseState.CANCELADO, {
      motivo,
      ator: "sistema",
    });
  },

  /**
   * Transiciona o estado de um repasse com lock otimista.
   */
  async transicionar(
    repasseId: string,
    novoEstado: RepasseState,
    opts: { motivo?: string; ator: string; metadata?: Record<string, any> }
  ): Promise<any> {
    const { data: repasse, error: fetchError } = await supabaseAdmin
      .from("repasses")
      .select("*")
      .eq("id", repasseId)
      .single();

    if (fetchError || !repasse) {
      logger.error({ repasseId, fetchError }, "[FSM] Repasse não encontrado para transição");
      throw new Error("REPASSE_NAO_ENCONTRADO");
    }

    const estadoAtual = repasse.estado as RepasseState;
    const versaoAtual = repasse.versao;

    const permitidos = TRANSICOES_VALIDAS[estadoAtual];
    if (!permitidos || !permitidos.includes(novoEstado)) {
      logger.error({
        repasseId,
        de: estadoAtual,
        para: novoEstado,
        permitidos,
        ator: opts.ator,
      }, "[FSM] Transição inválida");
      throw new Error(`TRANSICAO_INVALIDA: ${estadoAtual} → ${novoEstado}`);
    }

    const updateData: Record<string, any> = {
      estado: novoEstado,
      versao: versaoAtual + 1,
    };

    if (novoEstado === RepasseState.CRIADO) {
      updateData.tentativa = repasse.tentativa + 1;
      updateData.gateway_group_id = null;
      updateData.gateway_item_id = null;
      updateData.gateway_raw_status = null;
      updateData.erro_mensagem = null;
      updateData.erro_codigo = null;
    }

    if (novoEstado === RepasseState.LIQUIDADO) {
      updateData.liquidado_at = new Date().toISOString();
    }

    if (
      novoEstado === RepasseState.ERRO_DECODIFICACAO ||
      novoEstado === RepasseState.ERRO_TRANSFERENCIA
    ) {
      if (opts.motivo) {
        updateData.erro_mensagem = opts.motivo;
      }
      if (opts.metadata?.erro_codigo) {
        updateData.erro_codigo = opts.metadata.erro_codigo;
      }
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("repasses")
      .update(updateData)
      .eq("id", repasseId)
      .eq("versao", versaoAtual)
      .select()
      .single();

    if (updateError || !updated) {
      logger.error({
        repasseId,
        versaoEsperada: versaoAtual,
        updateError,
      }, "[FSM] Conflito de concorrência (lock otimista) ou erro no update");
      throw new Error("CONFLITO_CONCORRENCIA");
    }

    await this._registrarTransicao(repasseId, estadoAtual, novoEstado, opts);

    logger.info({
      repasseId,
      de: estadoAtual,
      para: novoEstado,
      versao: updated.versao,
      ator: opts.ator,
      motivo: opts.motivo,
    }, `[FSM] Transição: ${estadoAtual} → ${novoEstado}`);

    return updated;
  },

  async buscarRepasseAtivo(cobrancaId: string): Promise<any | null> {
    const { data, error } = await supabaseAdmin
      .from("repasses")
      .select("*")
      .eq("cobranca_id", cobrancaId)
      .not("estado", "in", `(${ESTADOS_TERMINAIS.join(",")})`)
      .maybeSingle();

    if (error) {
      logger.error({ cobrancaId, error }, "[FSM] Erro ao buscar repasse ativo");
      throw error;
    }

    return data;
  },

  async buscarPorEstados(
    estados: RepasseState[],
    limiteHoras?: number
  ): Promise<any[]> {
    let query = supabaseAdmin
      .from("repasses")
      .select("*")
      .in("estado", estados);

    if (limiteHoras) {
      const dataLimite = new Date();
      dataLimite.setHours(dataLimite.getHours() - limiteHoras);
      query = query.gte("created_at", dataLimite.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ estados, error }, "[FSM] Erro ao buscar repasses por estados");
      throw error;
    }

    return data || [];
  },

  async atualizarGatewayInfo(repasseId: string, info: {
    gateway_group_id?: string;
    gateway_item_id?: string;
    gateway_raw_status?: string;
  }): Promise<void> {
    const { error } = await supabaseAdmin
      .from("repasses")
      .update(info)
      .eq("id", repasseId);

    if (error) {
      logger.error({ repasseId, info, error }, "[FSM] Erro ao atualizar info do gateway");
      throw error;
    }
  },

  async _registrarTransicao(
    repasseId: string,
    estadoDe: RepasseState,
    estadoPara: RepasseState,
    opts: { motivo?: string; ator: string; metadata?: Record<string, any> }
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from("repasse_transicoes")
      .insert({
        repasse_id: repasseId,
        estado_de: estadoDe,
        estado_para: estadoPara,
        motivo: opts.motivo || null,
        ator: opts.ator,
        metadata: opts.metadata ? JSON.parse(JSON.stringify(opts.metadata)) : {},
      });

    if (error) {
      logger.error({ repasseId, estadoDe, estadoPara, error }, "[FSM] Erro ao registrar transição (audit trail)");
    }
  },
};
