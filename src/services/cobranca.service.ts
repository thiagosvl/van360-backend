import { JOB_ORIGIN_MANUAL, PASSENGER_EVENT_MANUAL } from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { addToPixQueue } from "../queues/pix.queue.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { cobrancaNotificacaoService } from "./cobranca-notificacao.service.js";
import { notificationService } from "./notifications/notification.service.js";
import { paymentService } from "./payment.service.js";
import { planRules } from "./plan-rules.service.js";

import { CreateCobrancaDTO } from "../types/dtos/cobranca.dto.js";
import { CobrancaOrigem, CobrancaStatus } from "../types/enums.js";

interface CreateCobrancaOptions {
  gerarPixAsync?: boolean; // Se true, apenas enfileira. Se false, gera na hora (síncrono).
  planoSlug?: string;      // Opcional: slug do plano do motorista para otimizar query
}

export const cobrancaService = {
  async countByPassageiro(passageiroId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from("cobrancas")
      .select("id", { count: "exact", head: true })
      .eq("passageiro_id", passageiroId);

    if (error) throw error;
    return count || 0;
  },

  async createCobranca(data: CreateCobrancaDTO, options: CreateCobrancaOptions = { gerarPixAsync: false }): Promise<any> {
    if (!data.passageiro_id || !data.usuario_id) throw new AppError("Campos obrigatórios ausentes (passageiro_id, usuario_id).", 400);

    // Buscar dados do passageiro para gerar PIX (CPF e Nome do Responsável)
    const { data: passageiro, error: passError } = await supabaseAdmin
      .from("passageiros")
      .select("cpf_responsavel, nome_responsavel")
      .eq("id", data.passageiro_id)
      .single();

    if (passError || !passageiro) throw new AppError("Passageiro não encontrado para gerar cobrança.", 404);

    // Gerar ID preliminar
    const cobrancaId = crypto.randomUUID();

    let pixData: any = {};
    const valorNumerico = typeof data.valor === "string" ? moneyToNumber(data.valor) : data.valor;

    // --- Lógica de Geração PIX ---
    const now = new Date();
    // FIX: Ajuste para Fuso Horário do Brasil (UTC-3)
    // Isso garante que cobranças geradas à noite (ex: 22h) sejam consideradas "hoje" e não "amanhã"
    const diffBrasilia = -3;
    const nowBrasilia = new Date(now.getTime() + (diffBrasilia * 60 * 60 * 1000));
    const todayStr = nowBrasilia.toISOString().split('T')[0];
    const isPastDue = data.data_vencimento < todayStr;
    // status não existe no DTO de criação, assumimos pendente por padrão se não for passado explicitamente
    // mas aqui estamos validando regras de negócio
    const isPaid = false; // Na criação, nunca é pago por padrão via API

    // Regra 1: Passado não gera PIX.
    // Regra 2: Pago não gera PIX (Pagamento Manual Externo).
    // Regra 3: Se não tiver CPF/Nome, não gera.
    // REQUISITO: Centralizado no planRules

    let canGeneratePix = false;
    if (options.planoSlug) {
      canGeneratePix = planRules.canGeneratePix(options.planoSlug);
    } else {
      // Buscar assinatura ativa se não informada
      const { data: assinatura } = await supabaseAdmin
        .from("assinaturas_usuarios")
        .select("planos(slug, parent:parent_id(slug))")
        .eq("usuario_id", data.usuario_id)
        .eq("ativo", true)
        .maybeSingle();

      const planoData = assinatura?.planos as any;
      const slugBase = planoData?.parent?.slug ?? planoData?.slug;
      canGeneratePix = planRules.canGeneratePix(slugBase);
    }

    const shouldGeneratePix =
      canGeneratePix &&
      !isPaid &&
      passageiro.cpf_responsavel &&
      passageiro.nome_responsavel;

    if (shouldGeneratePix) {
      if (options.gerarPixAsync) {
        // MODO BATCH (ASSÍNCRONO)
        // Enfileira e deixa o Worker registrar depois.
        // O registro nasce sem PIX, o worker atualiza.
        logger.info({ cobrancaId }, "Enfileirando geração de PIX (Async)...");
        await addToPixQueue({
          cobrancaId,
          valor: valorNumerico,
          cpf: passageiro.cpf_responsavel,
          nome: passageiro.nome_responsavel,
          dataVencimento: data.data_vencimento
        });
        // Não preenche pixData agora
      } else {
        // MODO MANUAL (SÍNCRONO) - Padrão
        // Tenta gerar na hora. Se falhar, estoura erro pro usuário ver.
        try {
          const provider = paymentService.getProvider();
          const pixResult = await provider.criarCobrancaComVencimento({
            cobrancaId: cobrancaId,
            valor: valorNumerico,
            cpf: passageiro.cpf_responsavel,
            nome: passageiro.nome_responsavel,
            dataVencimento: data.data_vencimento // YYYY-MM-DD
          });

          pixData = {
            gateway_txid: pixResult.gatewayTransactionId,
            qr_code_payload: pixResult.qrCodePayload,
            location_url: pixResult.location
          };
        } catch (error: any) {
          logger.error({ error: error.message, passageiroId: data.passageiro_id }, "Falha ao gerar PIX Síncrono.");
          throw new AppError(`Falha ao gerar PIX (Banco): ${error.message}`, 502); // 502 Bad Gateway (Upstream error)
        }
      }
    } else {
      logger.info({ cobrancaId, isPastDue, isPaid, hasCpf: !!passageiro.cpf_responsavel }, "PIX ignorado (Regras de Negócio: Vencida/Paga/SemCPF)");
    }

    // Inserir no Banco
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { gerarPixAsync, enviar_notificacao_agora, tipo, cpf, nome, ...cobrancaCleanData } = data;

    const cobrancaData: any = {
      id: cobrancaId,
      ...cobrancaCleanData,
      valor: valorNumerico,
      ...pixData
    };

    const { data: inserted, error } = await supabaseAdmin
      .from("cobrancas")
      .insert([cobrancaData])
      .select()
      .single();

    if (error) throw new AppError(`Erro ao criar cobrança no banco: ${error.message}`, 500);

    // Enviar notificação imediata se solicitado
    if (data.enviar_notificacao_agora) {
      // Roda em background para não travar response
      this.enviarNotificacaoManual(inserted.id).catch(err => {
        logger.error({ err, cobrancaId: inserted.id }, "Falha ao enviar notificação imediata após criação.");
      });
    }

    return inserted;
  },



  async updateCobranca(id: string, data: Partial<any>, cobrancaOriginal?: any): Promise<any> {
    if (!id) throw new AppError("ID da cobrança é obrigatório", 400);

    // Buscar cobrança original se não foi fornecida
    if (!cobrancaOriginal) {
      cobrancaOriginal = await this.getCobranca(id);
    }

    const cobrancaData: any = {};

    // Mapeamento de campos
    if (data.valor !== undefined) cobrancaData.valor = data.valor;
    if (data.data_vencimento !== undefined) cobrancaData.data_vencimento = data.data_vencimento;
    if (data.status !== undefined) cobrancaData.status = data.status;
    if (data.pagamento_manual !== undefined) cobrancaData.pagamento_manual = data.pagamento_manual;
    if (data.tipo_pagamento !== undefined) cobrancaData.tipo_pagamento = data.tipo_pagamento;
    if (data.data_pagamento !== undefined) cobrancaData.data_pagamento = data.data_pagamento;
    if (data.valor_pago !== undefined) cobrancaData.valor_pago = moneyToNumber(data.valor_pago);

    // --- LÓGICA DE REGENERAÇÃO DE PIX ---
    let shouldResendNotification = false;

    // Verificar se houve mudança crítica (Valor ou Vencimento)
    const valorChanged = data.valor !== undefined && moneyToNumber(data.valor) !== cobrancaOriginal.valor;
    const vencimentoChanged = data.data_vencimento !== undefined && data.data_vencimento !== cobrancaOriginal.data_vencimento;

    if ((valorChanged || vencimentoChanged) && cobrancaOriginal.gateway_txid) {
      logger.info({ cobrancaId: id, valorChanged, vencimentoChanged }, "Alteração crítica detectada. Regenerando PIX...");

      // 1. Cancelar PIX Antigo (Best effort - não trava se falhar cancelamento, mas loga)
      try {
        const provider = paymentService.getProvider();
        await provider.cancelarCobranca(cobrancaOriginal.gateway_txid, 'cobv');
      } catch (ignore) {
        logger.warn({ cobrancaId: id, txid: cobrancaOriginal.gateway_txid }, "Falha ao cancelar PIX antigo (ignorado para prossegue).");
      }

      // 2. Gerar Novo PIX
      try {
        const passageiro = cobrancaOriginal.passageiro || cobrancaOriginal.passageiros;

        if (!passageiro?.cpf_responsavel) {
          logger.warn({ cobrancaId: id }, "Impossível regenerar PIX: Dados do responsável ausentes. O PIX será removido.");
          cobrancaData.gateway_txid = null;
          cobrancaData.qr_code_payload = null;
          cobrancaData.location_url = null;
        } else {
          const novoValor = data.valor !== undefined ? moneyToNumber(data.valor) : cobrancaOriginal.valor;
          const novoVencimento = data.data_vencimento !== undefined ? data.data_vencimento : cobrancaOriginal.data_vencimento;

          const provider = paymentService.getProvider();
          const pixResult = await provider.criarCobrancaComVencimento({
            cobrancaId: id,
            valor: novoValor,
            cpf: passageiro.cpf_responsavel,
            nome: passageiro.nome_responsavel || "Responsável Financeiro",
            dataVencimento: novoVencimento
          });

          // Atualizar payload do update
          cobrancaData.gateway_txid = pixResult.gatewayTransactionId;
          cobrancaData.qr_code_payload = pixResult.qrCodePayload;
          cobrancaData.location_url = pixResult.location;

          // 3. Verificar necessidade de Reenvio de Notificação
          const notificacoesAnteriores = await cobrancaNotificacaoService.listByCobrancaId(id);
          if (notificacoesAnteriores && notificacoesAnteriores.length > 0) {
            shouldResendNotification = true;
            logger.info({ cobrancaId: id }, "Cobrança já notificada anteriormente. Agendando reenvio.");
          }
        }
      } catch (err: any) {
        logger.error({ err, cobrancaId: id }, "Erro crítico ao regenerar PIX durante edição.");
        throw new AppError("Não foi possível atualizar o PIX da cobrança. Verifique os dados e tente novamente.", 502);
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from("cobrancas")
      .update(cobrancaData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new AppError(`Erro ao atualizar cobrança: ${error.message}`, 500);

    // 4. Reenviar notificação se necessário (Após save do DB para garantir leitura correta)
    if (shouldResendNotification) {
      // Executar em background para não travar a resposta HTTP
      this.enviarNotificacaoManual(id).catch(err => {
        logger.error({ err, cobrancaId: id }, "Falha ao reenviar notificação automática pós-edição.");
      });
    }

    return updated;
  },

  async getCobranca(id: string): Promise<any> {
    const { data, error } = await supabaseAdmin.from("cobrancas").select("*, passageiro:passageiros(*, escola:escolas(nome), veiculo:veiculos(placa))").eq("id", id).single();
    if (error) throw new AppError("Cobrança não encontrada.", 404);
    return data;
  },

  async deleteCobranca(id: string): Promise<void> {
    // 1. Buscar gateway_txid antes de deletar
    const { data: cobranca, error: fetchError } = await supabaseAdmin
      .from("cobrancas")
      .select("gateway_txid")
      .eq("id", id)
      .single();

    if (fetchError) {
      logger.error({ error: fetchError.message, cobrancaId: id }, "Erro ao buscar cobrança para exclusão.");
      throw new AppError("Erro ao buscar cobrança para exclusão.", 500);
    }

    // 2. Se tiver PIX, cancelar no Provedor (Best effort)
    if (cobranca?.gateway_txid) {
      try {
        logger.info({ txid: cobranca.gateway_txid, cobrancaId: id }, "Cancelando PIX no Provedor antes de excluir...");
        const provider = paymentService.getProvider();
        await provider.cancelarCobranca(cobranca.gateway_txid, 'cobv');
      } catch (err: any) {
        logger.warn({ error: err.message, txid: cobranca.gateway_txid }, "Falha ao cancelar PIX no Provedor durante exclusão (ignorado para prosseguir).");
      }
    }

    // 3. Deletar do Banco
    const { error } = await supabaseAdmin.from("cobrancas").delete().eq("id", id);
    if (error) throw new AppError("Erro ao excluir cobrança no banco de dados.", 500);
  },

  async listCobrancasWithFilters(filtros: any): Promise<any[]> {
    let query = supabaseAdmin
      .from("cobrancas")
      .select("*, passageiro:passageiros!inner(nome, nome_responsavel)")
      .order("data_vencimento", { ascending: false });

    if (filtros.usuarioId) query = query.eq("usuario_id", filtros.usuarioId);
    if (filtros.passageiroId) query = query.eq("passageiro_id", filtros.passageiroId);
    if (filtros.status) query = query.eq("status", filtros.status);
    if (filtros.dataInicio) query = query.gte("data_vencimento", filtros.dataInicio);
    if (filtros.dataFim) query = query.lte("data_vencimento", filtros.dataFim);

    if (filtros.mes && filtros.ano) {
      const start = new Date(filtros.ano, filtros.mes - 1, 1);
      const endObj = new Date(filtros.ano, filtros.mes, 0);
      const startStr = start.toISOString().split("T")[0];
      const endStr = endObj.toISOString().split("T")[0];

      query = query.gte("data_vencimento", startStr);
      query = query.lte("data_vencimento", endStr);
    }

    if (filtros.search) {
      query = query.or(`nome.ilike.%${filtros.search}%,nome_responsavel.ilike.%${filtros.search}%`, { foreignTable: 'passageiro' });
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async listCobrancasByPassageiro(passageiroId: string, ano?: string): Promise<any[]> {
    let query = supabaseAdmin
      .from("cobrancas")
      .select("*, passageiro:passageiros!inner(nome, nome_responsavel)")
      .eq("passageiro_id", passageiroId)
      .order("data_vencimento", { ascending: false });

    if (ano) {
      query = query.eq("ano", parseInt(ano));
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async listAvailableYearsByPassageiro(passageiroId: string): Promise<number[]> {
    const { data, error } = await supabaseAdmin
      .from("cobrancas")
      .select("ano")
      .eq("passageiro_id", passageiroId)
      .order("ano", { ascending: false });

    if (error) throw error;

    // Extrair anos únicos
    const anos = Array.from(new Set(data?.map((c: any) => c.ano) || [])).sort((a, b) => b - a) as number[];
    return anos;
  },

  async toggleNotificacoes(cobrancaId: string, novoStatus: boolean): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from("cobrancas")
      .update({ desativar_lembretes: novoStatus })
      .eq("id", cobrancaId)
      .select("desativar_lembretes")
      .single();

    if (error) {
      logger.error({ error, cobrancaId }, "Erro ao alterar status de notificação da cobrança");
      throw new AppError("Erro ao alterar notificações.", 500);
    }

    return data.desativar_lembretes;
  },

  async gerarCobrancasMensaisParaMotorista(motoristaId: string, targetMonth: number, targetYear: number, planoSlug?: string): Promise<{ created: number, skipped: number }> {
    let created = 0;
    let skipped = 0;

    // 1. Buscar Passageiros Ativos do Motorista
    const { data: passageiros, error: passError } = await supabaseAdmin
      .from("passageiros")
      .select("id, nome, valor_mensalidade, dia_vencimento, cpf_responsavel, nome_responsavel")
      .eq("usuario_id", motoristaId)
      .eq("ativo", true)
      .eq("enviar_cobranca_automatica", true);

    if (passError) throw passError;
    if (!passageiros) return { created, skipped };

    // 2. Iterar por Passageiro e Gerar Cobrança
    for (const passageiro of passageiros) {
      // Verificar se já existe cobrança para este mês/ano/passageiro
      const { count } = await supabaseAdmin
        .from("cobrancas")
        .select("id", { count: "exact", head: true })
        .eq("passageiro_id", passageiro.id)
        .eq("mes", targetMonth)
        .eq("ano", targetYear);

      if (count && count > 0) {
        skipped++;
        continue;
      }

      // Calcular Vencimento
      const diaVencimento = passageiro.dia_vencimento || 10;
      const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();
      const diaFinal = Math.min(diaVencimento, lastDayOfMonth);
      const dataVencimentoStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`;

      const valorCobranca = passageiro.valor_mensalidade;
      if (!valorCobranca || valorCobranca <= 0) continue;

      try {
        await this.createCobranca({
          usuario_id: motoristaId,
          passageiro_id: passageiro.id,
          valor: valorCobranca,
          data_vencimento: dataVencimentoStr,
          origem: CobrancaOrigem.AUTOMATICA,
          gerarPixAsync: true
        }, { gerarPixAsync: true, planoSlug });

        created++;
      } catch (e) {
        logger.error({ error: e, passageiroId: passageiro.id }, "Erro ao gerar cobrança automática no loop");
      }
    }

    return { created, skipped };
  },

  async enviarNotificacaoManual(cobrancaId: string): Promise<boolean> {
    // 1. Buscar Cobrança Completa
    const { data: cobranca, error } = await supabaseAdmin
      .from("cobrancas")
      .select(`
              id, valor, data_vencimento, qr_code_payload, usuario_id,
              passageiros!inner (
                  id, nome, nome_responsavel, telefone_responsavel
              ),
              usuarios!inner ( nome, apelido )
          `)
      .eq("id", cobrancaId)
      .single();

    if (error || !cobranca) throw new Error("Cobrança não encontrada.");

    const passageiro = cobranca.passageiros as any;
    const motorista = cobranca.usuarios as any;

    if (!passageiro.telefone_responsavel) throw new Error("Telefone do responsável não cadastrado.");

    // 2. Enviar Notificação (Manual)
    const success = await notificationService.notifyPassenger(
      passageiro.telefone_responsavel,
      PASSENGER_EVENT_MANUAL,
      {
        nomeResponsavel: passageiro.nome_responsavel || "Responsável",
        nomePassageiro: passageiro.nome || "Passageiro",
        nomeMotorista: motorista.nome || "Motorista",
        apelidoMotorista: motorista.apelido,
        valor: cobranca.valor,
        dataVencimento: cobranca.data_vencimento,
        pixPayload: cobranca.qr_code_payload,
        usuarioId: cobranca.usuario_id
      }
    );

    // 3. Log de Histórico e Atualizar Tabela Mestra
    if (success) {
      // Atualizar data da última notificação na cobrança
      await supabaseAdmin
        .from("cobrancas")
        .update({ data_envio_ultima_notificacao: new Date() })
        .eq("id", cobrancaId);

      // Gravar log detalhado
      await cobrancaNotificacaoService.create(cobrancaId, {
        tipo_origem: JOB_ORIGIN_MANUAL,
        tipo_evento: PASSENGER_EVENT_MANUAL,
        canal: "whatsapp"
      });
    }

    return success;
  },

  // Métodos auxiliares necessários para updateCobranca...


  /**
   * Gera PIX retroativo para cobranças pendentes de um usuário (motorista).
   * Geralmente chamado após upgrade para PLANO_PROFISSIONAL.
   */
  async gerarPixRetroativo(usuarioId: string): Promise<any> {
    logger.info({ usuarioId }, "[CobrancaService] Iniciando geração de PIX retroativo...");

    const todayStr = new Date().toISOString().split("T")[0];

    // 1. Buscar cobranças pendentes sem PIX que não venceram, incluindo dados do passageiro
    const { data: cobrancas, error: cobError } = await supabaseAdmin
      .from("cobrancas")
      .select(`
        id, valor, data_vencimento,
        passageiros!inner (
          nome_responsavel,
          cpf_responsavel
        )
      `)
      .eq("usuario_id", usuarioId)
      .eq("status", CobrancaStatus.PENDENTE)
      .is("gateway_txid", null);

    if (cobError) {
      logger.error({ error: cobError.message, usuarioId }, "Erro ao buscar cobranças para PIX retroativo");
      throw new Error("Erro ao buscar cobranças para PIX retroativo.");
    }

    if (!cobrancas || cobrancas.length === 0) {
      logger.info({ usuarioId }, "Nenhuma cobrança elegível para PIX retroativo encontrada.");
      return { totalEnfileirados: 0 };
    }

    logger.info({ usuarioId, count: cobrancas.length }, "Enfileirando cobranças para geração de PIX retroativo");

    // 2. Adicionar à PixQueue
    const promises = cobrancas.map(async (cob) => {
      const passageiro = cob.passageiros as any;

      // Validar se tem dados básicos
      if (!passageiro?.cpf_responsavel || !passageiro?.nome_responsavel) {
        logger.warn({ cobrancaId: cob.id }, "Ignorando cobrança retroativa: Passageiro sem CPF/Nome do responsável.");
        return;
      }

      try {
        await addToPixQueue({
          cobrancaId: cob.id,
          valor: cob.valor,
          cpf: passageiro.cpf_responsavel,
          nome: passageiro.nome_responsavel,
          dataVencimento: cob.data_vencimento
        });
      } catch (err: any) {
        logger.error({ cobrancaId: cob.id, error: err.message }, "Falha ao enfileirar PIX retroativo");
      }
    });

    await Promise.all(promises);

    return { totalEnfileirados: cobrancas.length };
  }
};
