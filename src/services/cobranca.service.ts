import { randomUUID } from "crypto";
import { COBRANCA_STATUS_PAGA, CONFIG_KEY_TAXA_INTERMEDIACAO_PIX, STATUS_CHAVE_PIX_VALIDADA, STATUS_REPASSE_FALHA, STATUS_REPASSE_PENDENTE, STATUS_REPASSE_PROCESSANDO, STATUS_REPASSE_REPASSADO, STATUS_TRANSACAO_PROCESSANDO, STATUS_TRANSACAO_SUCESSO } from "../config/constants.js";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { moneyToNumber } from "../utils/utils.js";
import { getConfigNumber } from "./configuracao.service.js";
import { interService } from "./inter.service.js";

export const cobrancaService = {
  async createCobranca(data: any): Promise<any> {
    if (!data.passageiro_id || !data.usuario_id) throw new Error("Campos obrigatórios ausentes");

    // Buscar dados do passageiro para gerar PIX (CPF e Nome do Responsável)
    const { data: passageiro, error: passError } = await supabaseAdmin
        .from("passageiros")
        .select("cpf_responsavel, nome_responsavel")
        .eq("id", data.passageiro_id)
        .single();
    
    if (passError || !passageiro) throw new Error("Passageiro não encontrado para gerar cobrança");

    // Gerar ID preliminar para usar no txid (ou gerar UUID manual)
    const cobrancaId = crypto.randomUUID();

    let pixData: any = {};
    const valorNumerico = typeof data.valor === "string" ? moneyToNumber(data.valor) : data.valor;

    // Se tiver dados para PIX, gera
    if (passageiro.cpf_responsavel && passageiro.nome_responsavel) {
        try {
            const pixResult = await interService.criarCobrancaComVencimentoPix(supabaseAdmin, {
                cobrancaId: cobrancaId,
                valor: valorNumerico,
                cpf: passageiro.cpf_responsavel,
                nome: passageiro.nome_responsavel,
                dataVencimento: data.data_vencimento // YYYY-MM-DD
            });
            
            pixData = {
                txid_pix: pixResult.interTransactionId,
                qr_code_payload: pixResult.qrCodePayload,
                url_qr_code: pixResult.location
            };
        } catch (error: any) {
            logger.error({ error: error.message, passageiroId: data.passageiro_id }, "Falha Crítica ao gerar PIX. Abortando criação da cobrança.");
            throw new Error(`Falha ao gerar PIX: ${error.message}`);
        }
    }

    const cobrancaData: any = {
      id: cobrancaId,
      ...data,
      valor: valorNumerico,
      ...pixData
    };

    const { data: inserted, error } = await supabaseAdmin
      .from("cobrancas")
      .insert([cobrancaData])
      .select()
      .single();

    if (error) throw error;
    return inserted;
  },

  async updateCobranca(id: string, data: Partial<any>, cobrancaOriginal?: any): Promise<any> {
    if (!id) throw new Error("ID da cobrança é obrigatório");

    // Buscar cobrança original se não foi fornecida
    if (!cobrancaOriginal) {
      cobrancaOriginal = await this.getCobranca(id);
    }

    const isPaga = cobrancaOriginal?.status === "pago";

    const cobrancaData: any = {};

    // Campos que podem ser atualizados sempre
    if (data.valor !== undefined) cobrancaData.valor = data.valor;
    if (data.data_vencimento !== undefined) cobrancaData.data_vencimento = data.data_vencimento;
    if (data.status !== undefined) cobrancaData.status = data.status;
    if (data.pagamento_manual !== undefined) cobrancaData.pagamento_manual = data.pagamento_manual;
    if (data.tipo_pagamento !== undefined) cobrancaData.tipo_pagamento = data.tipo_pagamento;
    
    // Permite alterar data_pagamento se fornecida
    if (data.data_pagamento !== undefined) {
      cobrancaData.data_pagamento = data.data_pagamento;
    }

    // Permite alterar valor_pago se fornecido
    if (data.valor_pago !== undefined) {
      cobrancaData.valor_pago = moneyToNumber(data.valor_pago);
    }

    // 3. Verificação de necessidade de atualização do PIX (Antes de salvar no banco)
    const houveMudancaCritica =
      (data.valor !== undefined && data.valor !== cobrancaOriginal.valor) ||
      (data.data_vencimento !== undefined && data.data_vencimento !== cobrancaOriginal.data_vencimento);

    // Se houve mudança crítica e já existe PIX gerado
    if (houveMudancaCritica && cobrancaOriginal.txid_pix) {
       logger.info({ cobrancaId: id }, "Alteração crítica detectada. Cancelando e Regenerando PIX...");
       
       // a) Cancelar PIX Antigo
       try {
          await interService.cancelarCobrancaPix(supabaseAdmin, cobrancaOriginal.txid_pix, "cobv");
       } catch (err) {
          logger.warn({ err, txid: cobrancaOriginal.txid_pix }, "Falha ao cancelar PIX antigo (ignorado para prosseguir)");
       }

       // b) Regenerar Novo PIX
       let nomeResponsavel = cobrancaOriginal.passageiros?.nome_responsavel;
       let cpfResponsavel = cobrancaOriginal.passageiros?.cpf_responsavel;

       if (!nomeResponsavel || !cpfResponsavel) {
          const { data: pass } = await supabaseAdmin
             .from("passageiros")
             .select("cpf_responsavel, nome_responsavel")
             .eq("id", cobrancaOriginal.passageiro_id)
             .single();
          if (pass) {
             nomeResponsavel = pass.nome_responsavel;
             cpfResponsavel = pass.cpf_responsavel;
          }
       }

       if (nomeResponsavel && cpfResponsavel) {
          try {
             const novoValor = data.valor !== undefined ? moneyToNumber(data.valor) : cobrancaOriginal.valor;
             const novoVencimento = data.data_vencimento || cobrancaOriginal.data_vencimento;

             // Gerar sufixo único para o novo TXID (evitar colisão com o antigo)
             const cobrancaIdSuffixed = id + "R" + Math.floor(Math.random() * 1000);

             const pixResult = await interService.criarCobrancaComVencimentoPix(supabaseAdmin, {
                 cobrancaId: cobrancaIdSuffixed, 
                 valor: novoValor,
                 cpf: cpfResponsavel,
                 nome: nomeResponsavel,
                 dataVencimento: novoVencimento
             });

             cobrancaData.txid_pix = pixResult.interTransactionId;
             cobrancaData.qr_code_payload = pixResult.qrCodePayload;
             cobrancaData.url_qr_code = pixResult.location;
             
             logger.info("Novo PIX gerado com sucesso na edição.");

          } catch (error: any) {
            logger.error({ 
                error: error.message || error, 
                stack: error.stack,
                data 
            }, "Falha ao regenerar PIX na edição.");
            cobrancaData.txid_pix = null;
            cobrancaData.qr_code_payload = null;
            cobrancaData.url_qr_code = null;
          }
       }
    }

    const { data: updated, error } = await supabaseAdmin
      .from("cobrancas")
      .update(cobrancaData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return updated;
  },

  async deleteCobranca(id: string): Promise<void> {
    if (!id) throw new Error("ID da cobrança é obrigatório");
    const { error } = await supabaseAdmin.from("cobrancas").delete().eq("id", id);
    if (error) throw error;
  },

  async getCobranca(id: string): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from("cobrancas")
      .select("*, passageiros:passageiro_id (*, escolas:escola_id (*), veiculos:veiculo_id (*))")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async listCobrancasByPassageiro(passageiroId: string, ano?: string): Promise<any[]> {
    let query = supabaseAdmin
      .from("cobrancas")
      .select("*, passageiros:passageiro_id (nome, nome_responsavel)")
      .eq("passageiro_id", passageiroId)
      .order("mes", { ascending: false });

    if (ano) query = query.eq("ano", ano);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async listCobrancasWithFilters(filtros: {
    mes?: string;
    ano?: string;
    passageiroId?: string;
    usuarioId?: string;
    status?: string;
  }): Promise<any[]> {
    let query = supabaseAdmin.from("cobrancas").select("*, passageiros(*)")
      .order("data_vencimento", { ascending: true })
      .order("passageiros(nome)", { ascending: true });

    if (filtros.passageiroId) query = query.eq("passageiro_id", filtros.passageiroId);
    if (filtros.usuarioId) query = query.eq("usuario_id", filtros.usuarioId);
    if (filtros.ano) query = query.eq("ano", filtros.ano);
    if (filtros.mes) query = query.eq("mes", filtros.mes);
    if (filtros.status) query = query.eq("status", filtros.status);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async countByPassageiro(passageiroId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from("cobrancas")
      .select("id", { count: "exact", head: true })
      .eq("passageiro_id", passageiroId);

    if (error) throw new Error(error.message || "Erro ao contar cobranças");
    return count || 0;
  },

  async listAvailableYearsByPassageiro(passageiroId: string): Promise<string[]> {
    if (!passageiroId) throw new Error("ID do passageiro é obrigatório");

    const { data, error } = await supabaseAdmin
      .from('cobrancas')
      .select('ano')
      .eq('passageiro_id', passageiroId)
      .order('ano', { ascending: false });

    if (error) throw error;

    const uniqueYears = Array.from(new Set(data.map(item => item.ano.toString())));
    const currentYear = new Date().getFullYear().toString();

    if (!uniqueYears.includes(currentYear)) {
      uniqueYears.unshift(currentYear);
    } else {
      const index = uniqueYears.indexOf(currentYear);
      if (index !== 0) {
        uniqueYears.splice(index, 1);
        uniqueYears.unshift(currentYear);
      }
    }

    return uniqueYears;
  },

  async toggleNotificacoes(cobrancaId: string, novoStatus: boolean): Promise<boolean> {

    const { error } = await supabaseAdmin
      .from("cobrancas")
      .update({ desativar_lembretes: novoStatus })
      .eq("id", cobrancaId);

    if (error) {
      throw new Error(`Falha ao ${novoStatus ? "ativar" : "desativar"} as notificações.`);
    }

    return novoStatus;
  },

  async atualizarStatusPagamento(txid: string, valorPagoReal?: number, payload?: any, reciboUrl?: string): Promise<any> {
    // 1. Buscar cobrança pelo TXID
    const { data: cobranca, error: fetchError } = await supabaseAdmin
        .from("cobrancas")
        .select("*")
        .eq("txid_pix", txid)
        .single();

    if (fetchError || !cobranca) throw new Error("Cobrança não encontrada para o TXID informado");

    if (cobranca.status === COBRANCA_STATUS_PAGA) {
        logger.info({ cobrancaId: cobranca.id }, "Cobrança já está paga, ignorando atualização.");
        return cobranca;
    }

    // 2. Calcular valores
    const taxaIntermediacao = await getConfigNumber(CONFIG_KEY_TAXA_INTERMEDIACAO_PIX, 0.99);
    const valorPago = valorPagoReal || cobranca.valor;
    const valorRepassar = valorPago; // Regra: Motorista recebe valor cheio

    // 3. Atualizar Cobrança
    const { data: updated, error: updateError } = await supabaseAdmin
        .from("cobrancas")
        .update({
            status: COBRANCA_STATUS_PAGA,
            data_pagamento: new Date(),
            valor_pago: valorPago,
            taxa_intermediacao_banco: taxaIntermediacao,
            valor_a_repassar: valorRepassar,
            status_repasse: STATUS_REPASSE_PENDENTE, // Pronto para repasse
            dados_auditoria_pagamento: payload || {},
            recibo_url: reciboUrl || null
        })
        .eq("id", cobranca.id)
        .select()
        .single();

    if (updateError) throw updateError;
    return updated;
  },

  async iniciarRepasse(cobrancaId: string): Promise<any> {
      // 1. Buscar dados da cobrança e do motorista
      const { data: cobranca, error: cobError } = await supabaseAdmin
          .from("cobrancas")
          .select("*, usuarios:usuario_id (chave_pix, status_chave_pix)")
          .eq("id", cobrancaId)
          .single();

      if (cobError || !cobranca) throw new Error("Cobrança não encontrada");
      
      const motorista = cobranca.usuarios;

      // 2. Validações
      if (cobranca.status !== COBRANCA_STATUS_PAGA) throw new Error("Cobrança não está paga, impossível repassar.");
      if (cobranca.status_repasse === STATUS_REPASSE_REPASSADO || cobranca.status_repasse === STATUS_REPASSE_PROCESSANDO) {
          return { status: "JA_REPASSADO", message: "Repasse já efetuado ou em andamento" };
      }

      if (motorista.status_chave_pix !== STATUS_CHAVE_PIX_VALIDADA || !motorista.chave_pix) {
          // Marca falha mas não trava processo (pode tentar depois)
          await supabaseAdmin.from("cobrancas").update({ status_repasse: STATUS_REPASSE_FALHA }).eq("id", cobrancaId);
          throw new Error("Chave PIX do motorista não validada ou ausente.");
      }

      // 3. Executar Repasse via Inter
      const valorRepasse = cobranca.valor_a_repassar || cobranca.valor;
      const idempotencyKey = randomUUID();

      // Atualiza para PROCESSANDO antes de chamar API (evitar race condition)
      await supabaseAdmin.from("cobrancas").update({ status_repasse: STATUS_REPASSE_PROCESSANDO }).eq("id", cobrancaId);

      try {
          // (Opcional) Criar registro na tabela transacoes_repasse
          const { data: transacao, error: transError } = await supabaseAdmin
            .from("transacoes_repasse")
            .insert([{
                usuario_id: cobranca.usuario_id,
                cobranca_id: cobrancaId,
                valor_repassado: valorRepasse,
                status: STATUS_TRANSACAO_PROCESSANDO
            }])
            .select() // Retorna inserido para pegar ID se precisar
            .single(); 

          const pixResponse = await interService.realizarPixRepasse(supabaseAdmin, {
              valor: valorRepasse,
              chaveDestino: motorista.chave_pix,
              xIdIdempotente: idempotencyKey,
              descricao: `Repasse Van360 #${cobrancaId.substring(0,8)}`
          });

          // 4. Sucesso
          const updatePayload: any = { 
              status_repasse: STATUS_REPASSE_REPASSADO, 
              data_repasse: new Date(), 
              id_transacao_repasse: transacao?.id 
          };
          
          await supabaseAdmin.from("cobrancas").update(updatePayload).eq("id", cobrancaId);
          
          if (transacao?.id) {
              await supabaseAdmin.from("transacoes_repasse")
                .update({ status: STATUS_TRANSACAO_SUCESSO, txid_pix_repasse: pixResponse.endToEndId, data_conclusao: new Date() })
                .eq("id", transacao.id);
          }

          return { success: true, endToEndId: pixResponse.endToEndId };

      } catch (error: any) {
          logger.error({ error, cobrancaId }, "Erro no processamento do repasse");
          
          await supabaseAdmin.from("cobrancas").update({ status_repasse: STATUS_REPASSE_FALHA }).eq("id", cobrancaId);
          
          // Tentar atualizar tabela de transacao se foi criada (precisaria do ID, mas aqui simplificamos)
          // Em um cenario real, usariamos transacao.id se dispovivel no escopo superior ou fariamos query.
          
          throw error;
      }
  }

};
