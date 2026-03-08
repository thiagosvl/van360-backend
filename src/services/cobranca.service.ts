import crypto from "node:crypto";
import { PASSENGER_EVENT_MANUAL } from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { addToPixQueue } from "../queues/pix.queue.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { toLocalDateString } from "../utils/date.utils.js";
import { notificationService } from "./notifications/notification.service.js";
import { paymentService } from "./payment.service.js";
import { planRules } from "./plan-rules.service.js";

import { CreateCobrancaDTO } from "../types/dtos/cobranca.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo, CobrancaOrigem, CobrancaStatus } from "../types/enums.js";
import { historicoService } from "./historico.service.js";

interface CreateCobrancaOptions {
  gerarPixAsync?: boolean; // Se true, apenas enfileira. Se false, gera na hora (síncrono).
  planoSlug?: string;      // Opcional: slug do plano do motorista para otimizar query
  skipLog?: boolean;       // Se true, não registra log individual de auditoria
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
    const todayStr = toLocalDateString(now);
    const isPastDue = data.data_vencimento < todayStr;
    const isPaid = data.status === CobrancaStatus.PAGO;

    // Regra 1: Passado não gera PIX (vencimento retroativo).
    // Regra 2: Pago não gera PIX (Baixa manual no ato da criação).
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
          
          // IDEMPOTÊNCIA STABLE: Usamos um hash do ID + valor + vencimento.
          // Se o valor ou data mudar, o txid muda e o provedor aceita a nova cobrança (atualizada).
          // Se for uma retentativa com mesmos dados, o txid se mantém, garantindo status único no gateway.
          const txidToUse = crypto.createHash('md5').update(`${cobrancaId}-${valorNumerico}-${data.data_vencimento}`).digest('hex');

          const pixResult = await provider.criarCobrancaComVencimento({
            cobrancaId: txidToUse,
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
      .select("*, passageiros(nome)")
      .single();

    if (error) throw new AppError(`Erro ao criar cobrança no banco: ${error.message}`, 500);

    // --- LOG DE AUDITORIA ---
    if (!options.skipLog) {
      historicoService.log({
        usuario_id: inserted.usuario_id,
        entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
        entidade_id: inserted.id,
        acao: AtividadeAcao.COBRANCA_CRIADA,
        descricao: `Cobrança de ${inserted.mes}/${inserted.ano} do passageiro ${(inserted as any).passageiros?.nome} criada (${inserted.origem === 'automatica' ? 'Automática' : 'Manual'}).`,
        meta: {
          valor: inserted.valor,
          vencimento: inserted.data_vencimento,
          origem: inserted.origem,
          passageiro: (inserted as any).passageiros?.nome
        }
      });
    }

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

    // Mapeamento de campos permitidos para edição de metadados
    if (data.valor !== undefined) cobrancaData.valor = data.valor;
    if (data.data_vencimento !== undefined) cobrancaData.data_vencimento = data.data_vencimento;
    
    // Bloqueio de transição de status via PUT (Diretrizes de Arquitetura)
    if (data.status !== undefined && data.status !== cobrancaOriginal.status) {
      logger.warn({ cobrancaId: id, from: cobrancaOriginal.status, to: data.status }, "Tentativa de alteração de status via PUT (updateCobranca) ignorada. Use os endpoints especializados.");
    }

    if (data.tipo_pagamento !== undefined) cobrancaData.tipo_pagamento = data.tipo_pagamento;
    if (data.data_pagamento !== undefined) cobrancaData.data_pagamento = data.data_pagamento;
    if (data.valor_pago !== undefined) cobrancaData.valor_pago = moneyToNumber(data.valor_pago);

    // --- LÓGICA DE REGENERAÇÃO DE PIX ---
    let shouldResendNotification = false;

    // Verificar se houve mudança crítica (Valor ou Vencimento)
    const valorChanged = data.valor !== undefined && moneyToNumber(data.valor) !== cobrancaOriginal.valor;
    const vencimentoChanged = data.data_vencimento !== undefined && data.data_vencimento !== cobrancaOriginal.data_vencimento;

    let shouldGenerateNewPix = false;

    // 1. Mudança Crítica num PIX existente
    if ((valorChanged || vencimentoChanged) && cobrancaOriginal.gateway_txid) {
      shouldGenerateNewPix = true;
    }

    // 2. Não tinha PIX, mas editou cobrança (PIX Tardio)
    if (!cobrancaOriginal.gateway_txid && (valorChanged || vencimentoChanged)) {
      // Checar se o motorista agora tem permissão para PIX
      const { data: assinatura } = await supabaseAdmin
        .from("assinaturas_usuarios")
        .select("planos(slug, parent:parent_id(slug))")
        .eq("usuario_id", cobrancaOriginal.usuario_id)
        .eq("ativo", true)
        .maybeSingle();

      const planoData = assinatura?.planos as any;
      const slugBase = planoData?.parent?.slug ?? planoData?.slug;
      const canGeneratePixNow = planRules.canGeneratePix(slugBase);

      const passageiro = cobrancaOriginal.passageiro || cobrancaOriginal.passageiros;
      const isStillPending = (data.status || cobrancaOriginal.status) !== CobrancaStatus.PAGO;
      
      if (canGeneratePixNow && passageiro?.cpf_responsavel && passageiro?.nome_responsavel && isStillPending) {
        shouldGenerateNewPix = true;
      }
    }

    if (shouldGenerateNewPix) {
      logger.info({ cobrancaId: id }, "Alteração crítica ou evento detectado. Gerando/Regenerando PIX...");

      // 1. Cancelar PIX Antigo (Best effort - não trava se falhar cancelamento, mas loga)
      if (cobrancaOriginal.gateway_txid) {
        try {
          const provider = paymentService.getProvider();
          await provider.cancelarCobranca(cobrancaOriginal.gateway_txid, 'cobv');
        } catch (ignore) {
          logger.warn({ cobrancaId: id, txid: cobrancaOriginal.gateway_txid }, "Falha ao cancelar PIX antigo (ignorado para prosseguir).");
        }
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
          
          // Como cancelamos o PIX anterior no provedor, gerar uma nova ID para ele não entrar em conflito
          // de txid (bancos recusam o mesmo ID de um PIX já deletado).
          const novoIdProvedor = crypto.randomUUID();

          const pixResult = await provider.criarCobrancaComVencimento({
            cobrancaId: novoIdProvedor,
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
          const historico = await historicoService.listByEntidade(AtividadeEntidadeTipo.COBRANCA, id);
          const jaNotificado = historico.some(h => h.acao === AtividadeAcao.NOTIFICACAO_WHATSAPP);

          if (jaNotificado) {
            shouldResendNotification = true;
            logger.info({ cobrancaId: id }, "Cobrança já notificada anteriormente (log historico). Agendando reenvio.");
          }
        }
      } catch (err: any) {
        logger.error({ err, cobrancaId: id }, "Erro crítico ao regenerar PIX durante edição/desfazer.");
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

    // --- LOG DE AUDITORIA ---
    historicoService.log({
      usuario_id: cobrancaOriginal.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: id,
      acao: AtividadeAcao.COBRANCA_EDITADA,
      descricao: `Cobrança de ${cobrancaOriginal.mes}/${cobrancaOriginal.ano} do passageiro ${cobrancaOriginal.passageiros?.nome || cobrancaOriginal.passageiro?.nome} editada pelo motorista.`,
      meta: {
        antes: { valor: cobrancaOriginal.valor, vencimento: cobrancaOriginal.data_vencimento },
        depois: { valor: updated.valor, vencimento: updated.data_vencimento },
        passageiro: cobrancaOriginal.passageiros?.nome || cobrancaOriginal.passageiro?.nome
      }
    });

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
    const { data, error } = await supabaseAdmin
      .from("cobrancas")
      .select("*, passageiro:passageiros(*, escola:escolas(nome), veiculo:veiculos(placa)), repasses(estado, created_at)")
      .eq("id", id)
      .single();

    if (error) throw new AppError("Cobrança não encontrada.", 404);

    const repasses = data.repasses || [];
    const ultimoRepasse = repasses.sort((a: any, b: any) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    return {
      ...data,
      status_repasse: ultimoRepasse?.estado ?? null,
      repasse: ultimoRepasse || null,
      repasses: undefined
    };
  },

  async deleteCobranca(id: string): Promise<void> {
    // 1. Buscar dados antes de deletar (p/ log e cancelamento)
    const { data: cobranca, error: fetchError } = await supabaseAdmin
      .from("cobrancas")
      .select("*, passageiros(nome)")
      .eq("id", id)
      .single();

    if (fetchError || !cobranca) {
      logger.error({ error: fetchError?.message, cobrancaId: id }, "Erro ao buscar cobrança para exclusão.");
      throw new AppError("Erro ao buscar cobrança para exclusão.", 500);
    }

    // 2. Se tiver PIX, cancelar no Provedor (Bloqueio rigoroso se falhar)
    if (cobranca.gateway_txid) {
      try {
        logger.info({ txid: cobranca.gateway_txid, cobrancaId: id }, "Cancelando PIX no Provedor antes de excluir...");
        const provider = paymentService.getProvider();
        await provider.cancelarCobranca(cobranca.gateway_txid, 'cobv');
      } catch (err: any) {
        logger.error({ error: err.message, txid: cobranca.gateway_txid }, "Falha ao cancelar PIX no Provedor durante exclusão. Abortando exclusão.");
        throw new AppError("Não foi possível cancelar o registro bancário no sistema do C6 Bank no momento. Por favor, tente novamente em alguns minutos.", 502);
      }
    }

    // 3. Deletar do Banco
    const { error } = await supabaseAdmin.from("cobrancas").delete().eq("id", id);
    if (error) throw new AppError("Erro ao excluir cobrança no banco de dados.", 500);

    // --- LOG DE AUDITORIA ---
    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: id,
      acao: AtividadeAcao.COBRANCA_EXCLUIDA,
      descricao: `Mensalidade de ${cobranca.mes}/${cobranca.ano} do passageiro ${(cobranca as any).passageiros?.nome} foi removida.`,
      meta: {
        valor: cobranca.valor,
        mes: cobranca.mes,
        ano: cobranca.ano,
        backup: cobranca // Guarda o estado final antes da deleção física
      }
    });
  },

  async listCobrancasWithFilters(filtros: any): Promise<any[]> {
    let query = supabaseAdmin
      .from("cobrancas")
      .select("*, passageiro:passageiros!inner(nome, nome_responsavel), repasses(estado, created_at)")
      .order("data_vencimento", { ascending: false });

    if (filtros.usuarioId) query = query.eq("usuario_id", filtros.usuarioId);
    if (filtros.passageiroId) query = query.eq("passageiro_id", filtros.passageiroId);
    if (filtros.status) query = query.eq("status", filtros.status);
    if (filtros.dataInicio) query = query.gte("data_vencimento", filtros.dataInicio);
    if (filtros.dataFim) query = query.lte("data_vencimento", filtros.dataFim);

    if (filtros.mes && filtros.ano) {
      const start = new Date(filtros.ano, filtros.mes - 1, 1);
      const endObj = new Date(filtros.ano, filtros.mes, 0);
      const startStr = toLocalDateString(start);
      const endStr = toLocalDateString(endObj);

      query = query.gte("data_vencimento", startStr);
      query = query.lte("data_vencimento", endStr);
    }

    if (filtros.search) {
      query = query.or(`nome.ilike.%${filtros.search}%,nome_responsavel.ilike.%${filtros.search}%`, { foreignTable: 'passageiro' });
    }

    const { data, error } = await query;
    if (error) throw error;
    
    // Mapear o status do repasse para manter compatibilidade com o frontend
    const mappedData = (data || []).map((cobranca: any) => {
      const repasses = cobranca.repasses || [];
      // Pegar o último repasse criado
      const ultimoRepasse = repasses.sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      
      return {
        ...cobranca,
        status_repasse: ultimoRepasse?.estado ?? null,
        repasse: ultimoRepasse || null, // Disponibiliza o objeto completo conforme plano
        repasses: undefined 
      };
    });

    return mappedData;
  },

  async listCobrancasByPassageiro(passageiroId: string, ano?: string): Promise<any[]> {
    let query = supabaseAdmin
      .from("cobrancas")
      .select("*, passageiro:passageiros!inner(nome, nome_responsavel), repasses(estado, created_at)")
      .eq("passageiro_id", passageiroId)
      .order("data_vencimento", { ascending: false });

    if (ano) {
      query = query.eq("ano", parseInt(ano));
    }

    const { data, error } = await query;
    if (error) throw error;

    const mappedData = (data || []).map((cobranca: any) => {
      const repasses = cobranca.repasses || [];
      const ultimoRepasse = repasses.sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      
      return {
        ...cobranca,
        status_repasse: ultimoRepasse?.estado ?? null,
        repasse: ultimoRepasse || null,
        repasses: undefined
      };
    });

    return mappedData;
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
      .select("desativar_lembretes, usuario_id")
      .single();

    if (error) {
      logger.error({ error, cobrancaId }, "Erro ao alterar status de notificação da cobrança");
      throw new AppError("Erro ao alterar notificações.", 500);
    }

    // --- LOG DE AUDITORIA ---
    historicoService.log({
      usuario_id: data.usuario_id, // Precisamos garantir que usuario_id esteja disponível ou buscar
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: cobrancaId,
      acao: AtividadeAcao.CONFIG_LEMBRETE,
      descricao: `Lembretes automáticos para esta mensalidade foram ${novoStatus ? 'DESATIVADOS' : 'REATIVADOS'}.`,
      meta: { desativar_lembretes: novoStatus }
    });

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
      .eq("ativo", true);

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
      const diaVencimento = passageiro.dia_vencimento;
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
        }, { gerarPixAsync: true, planoSlug, skipLog: true });

        created++;
      } catch (e) {
        logger.error({ error: e, passageiroId: passageiro.id }, "Erro ao gerar cobrança automática no loop");
      }
    }

    if (created > 0) {
      // --- LOG DE AUDITORIA ---
      historicoService.log({
          usuario_id: motoristaId,
          entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
          entidade_id: motoristaId,
          acao: AtividadeAcao.COBRANCAS_GERADAS,
          descricao: `Geração automática de ${created} cobranças concluída para ${targetMonth}/${targetYear}.`,
          meta: { mes: targetMonth, ano: targetYear, criadas: created, puladas: skipped }
      });
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
    const nomeMotorista = motorista.apelido || motorista.nome;

    if (!passageiro.telefone_responsavel) throw new Error("Telefone do responsável não cadastrado.");

    // 2. Enviar Notificação (Manual)
    const success = await notificationService.notifyPassenger(
      passageiro.telefone_responsavel,
      PASSENGER_EVENT_MANUAL,
      {
        nomeResponsavel: passageiro.nome_responsavel || "Responsável",
        nomePassageiro: passageiro.nome || "Passageiro",
        nomeMotorista: nomeMotorista || "Motorista",
        apelidoMotorista: motorista.apelido,
        valor: cobranca.valor,
        dataVencimento: cobranca.data_vencimento,
        pixPayload: cobranca.qr_code_payload,
        usuarioId: cobranca.usuario_id
      }
    );

    // 3. Log de Histórico de Atividades
    if (success) {
      // Atualizar data da última notificação na cobrança
      await supabaseAdmin
        .from("cobrancas")
        .update({ data_envio_ultima_notificacao: new Date() })
        .eq("id", cobrancaId);

      // --- LOG DE AUDITORIA ---
      historicoService.log({
          usuario_id: cobranca.usuario_id,
          entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
          entidade_id: cobrancaId,
          acao: AtividadeAcao.NOTIFICACAO_WHATSAPP,
          descricao: `Lembrete de cobrança enviado manualmente via WhatsApp para ${passageiro.nome_responsavel}.`,
          meta: { telefone: passageiro.telefone_responsavel, passageiro: passageiro.nome }
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

    const todayStr = toLocalDateString(new Date());

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
