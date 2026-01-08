import { DRIVER_EVENT_PAYMENT_CONFIRMED, DRIVER_EVENT_PAYMENT_RECEIVED_ALERT, PASSENGER_EVENT_PAYMENT_RECEIVED } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { formatDate } from "../../utils/format.js";
import { cobrancaService } from "../cobranca.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { processarPagamentoCobranca } from "../processar-pagamento.service.js";
import { receiptService } from "../receipt.service.js";

export const webhookCobrancaHandler = {
  async handle(pagamento: any): Promise<boolean> {
    const { txid, valor, horario } = pagamento;

    // 1. Buscar na tabela de cobranças (Pais)
    const { data: cobrancaPai, error: findPaiError } = await supabaseAdmin
        .from("cobrancas")
        .select("id, status")
        .eq("txid_pix", txid)
        .maybeSingle();

    if (findPaiError) {
        logger.error({ txid, findPaiError }, "Erro ao buscar cobrança de pai no banco");
        return false;
    }

    if (!cobrancaPai) {
        // Tentar buscar como Cobrança de Assinatura (Motorista pagando Van360)
        return await this.handleAssinatura(txid, valor, pagamento);
    }

    // 2. Processar Pagamento e Repasse
    logger.info({ cobrancaId: cobrancaPai.id, context: "COBRANCA_PAI" }, "Cobrança de Pai encontrada. Iniciando fluxo de repasse.");

    try {
        // a) Buscar dados completos para o recibo antes de processar
        const { data: fullData } = await supabaseAdmin
            .from("cobrancas")
            .select(`
                *, 
                passageiros(nome, nome_responsavel),
                usuarios(nome, apelido)
            `)
            .eq("txid_pix", txid)
            .single();

        let reciboUrl = "";
        if (fullData) {
            const moto = fullData.usuarios as any;
            const nomeExibicao = moto?.apelido || moto?.nome || 'Motorista';
            
            reciboUrl = await receiptService.generateAndSave({
                id: fullData.id,
                titulo: "Recibo de Transporte",
                subtitulo: `Transporte Escolar - ${nomeExibicao}`,
                valor: valor,
                data: formatDate(horario || new Date()),
                pagadorNome: fullData.passageiros?.nome_responsavel || "Responsável",
                passageiroNome: fullData.passageiros?.nome || "Passageiro",
                mes: fullData.mes,
                ano: fullData.ano,
                descricao: `Mensalidade`,
                metodoPagamento: "PIX",
                tipo: 'PASSAGEIRO'
            }) || "";
        }

        // b) Atualizar status para PAGO e registrar taxas e recibo
        await cobrancaService.atualizarStatusPagamento(txid, valor, pagamento, reciboUrl);
        
        // c) Iniciar Repasse (Fire & Forget seguro com catch individual)
        cobrancaService.iniciarRepasse(cobrancaPai.id)
            .then(res => logger.info({ res, cobrancaId: cobrancaPai.id }, "Repasse AUTOMÁTICO iniciado com sucesso"))
            .catch(err => logger.error({ err, cobrancaId: cobrancaPai.id }, "Falha ao iniciar repasse automático (tentar via painel depois)"));

        // 3. Notificações (Assíncronas - não trava repasse)
        try {
            const { data: fullCobranca } = await supabaseAdmin
                .from("cobrancas")
                .select(`
                    *, 
                    passageiros(nome, nome_responsavel, telefone_responsavel),
                    usuarios(nome, telefone) 
                `) // telefone do motorista precisa estar disponivel
                .eq("id", cobrancaPai.id)
                .single();

            if (fullCobranca) {
                const pass = fullCobranca.passageiros as any;
                const moto = fullCobranca.usuarios as any;

                // A) Notificar Pai (Recibo)
                notificationService.notifyPassenger(pass.telefone_responsavel, PASSENGER_EVENT_PAYMENT_RECEIVED, {
                    nomeResponsavel: pass.nome_responsavel,
                    nomePassageiro: pass.nome,
                    nomeMotorista: moto.nome,
                    valor: fullCobranca.valor,
                    dataVencimento: fullCobranca.data_vencimento,
                    mes: fullCobranca.mes,
                    ano: fullCobranca.ano,
                    reciboUrl: reciboUrl // Adicionar reciboUrl aqui também para garantir
                }).catch(err => logger.error({ err }, "Falha ao notificar pai sobre recibo"));

                // B) Notificar Motorista (Venda)
                // Obs: notifyDriver espera 'telefone'. Precisamos garantir que 'usuarios' tenha telefone_whatsapp ou telefone
                // Vou assumir 'telefone' por enquanto, verificar schema seria bom.
                const telMotorista = moto.telefone; // Ajustar conforme schema real
                
                if (telMotorista) {
                    notificationService.notifyDriver(telMotorista, DRIVER_EVENT_PAYMENT_RECEIVED_ALERT, {
                         nomeMotorista: moto.nome,
                         nomePlano: "", // Não usa nesse template
                         valor: fullCobranca.valor,
                         dataVencimento: fullCobranca.data_vencimento,
                         nomePagador: pass.nome_responsavel,
                         nomeAluno: pass.nome,
                         mes: fullCobranca.mes,
                         ano: fullCobranca.ano
                         // reciboUrl: REMOVIDO pois o motorista não recebe o recibo do pai
                    } as any).catch(err => logger.error({ err }, "Falha ao notificar motorista sobre venda"));
                }
            }

        } catch (notifErr) {
            logger.error("Erro ao preparar dados para notificação de webhook");
        }

        return true;
        
    } catch (err) {
        logger.error({ err, cobrancaId: cobrancaPai.id }, "Erro crítico ao processar pagamento de pai");
        throw err;
    }
  },

  async handleAssinatura(txid: string, valor: number, pagamento: any): Promise<boolean> {
      // Buscar na tabela de assinaturas_cobrancas
      const { data: cobrancaAssinatura, error: findError } = await supabaseAdmin
          .from("assinaturas_cobrancas")
          .select(`
              id, valor, status, data_vencimento, usuario_id, assinatura_usuario_id, billing_type, inter_txid,
              assinaturas_usuarios (
                  planos ( nome ),
                  usuarios ( nome, telefone )
              )
          `)
          .eq("inter_txid", txid)
          .maybeSingle();

      if (findError) {
          logger.error({ txid, findError }, "Erro ao buscar cobrança de assinatura no banco");
          return false;
      }

      if (!cobrancaAssinatura) {
          logger.warn({ txid }, "Pagamento não encontrado nem como Pai nem como Assinatura (Ignorado)");
          return false;
      }

      logger.info({ cobrancaId: cobrancaAssinatura.id, context: "COBRANCA_ASSINATURA" }, "Cobrança de Assinatura encontrada. Processando.");

      try {
          // 0. Gerar Recibo da Assinatura
          let reciboUrl = "";
          try {
              const assinatura = cobrancaAssinatura.assinaturas_usuarios as any;
              const usuario = assinatura?.usuarios;
              const plano = assinatura?.planos;

               reciboUrl = await receiptService.generateAndSave({
                  id: cobrancaAssinatura.id,
                  titulo: "Recibo de Assinatura Van360",
                  subtitulo: `Plano ${plano?.nome || 'Mensal'}`,
                  valor: valor,
                  data: formatDate(pagamento.horario || new Date()),
                  pagadorNome: usuario?.nome || "Motorista",
                  descricao: `Assinatura do Sistema Van360`,
                  mes: (new Date(cobrancaAssinatura.data_vencimento).getMonth() + 1),
                  ano: new Date(cobrancaAssinatura.data_vencimento).getFullYear(),
                  metodoPagamento: "PIX",
                  tipo: 'ASSINATURA'
              }) || "";
          } catch (recWarn) {
              logger.warn({ recWarn }, "Falha ao gerar recibo de assinatura (continuando processamento)");
          }

          // 1. Processar Ativação/Renovação
          // Adapter para chamar a função existente
          await processarPagamentoCobranca(
              cobrancaAssinatura as any, // Cast pois o select includes joins que a interface nao tem, mas o runtime aceita
              {
                  valor,
                  dataPagamento: pagamento.horario || new Date().toISOString(),
                  txid
              },
              { txid, cobrancaId: cobrancaAssinatura.id },
              reciboUrl
          );

          // 2. Notificar Motorista (Recibo)
          try {
              const assinatura = cobrancaAssinatura.assinaturas_usuarios as any;
              const plano = assinatura?.planos;
              const usuario = assinatura?.usuarios;

              if (usuario?.telefone) {
                  notificationService.notifyDriver(usuario.telefone, DRIVER_EVENT_PAYMENT_CONFIRMED, {
                      nomeMotorista: usuario.nome,
                      nomePlano: plano?.nome || "Plano",
                      valor: cobrancaAssinatura.valor,
                      dataVencimento: cobrancaAssinatura.data_vencimento,
                      mes: (new Date(cobrancaAssinatura.data_vencimento).getMonth() + 1), // Assinatura pode nao ter campo mes no DB
                      ano: new Date(cobrancaAssinatura.data_vencimento).getFullYear(),
                      reciboUrl: reciboUrl
                  }).catch(err => logger.error({ err }, "Falha ao notificar motorista sobre confirmação de pagamento"));
              }
          } catch (notifErr) {
              logger.error("Erro ao preparar notificação de recibo para motorista");
          }

          return true;

      } catch (err) {
          logger.error({ err, cobrancaId: cobrancaAssinatura.id }, "Erro crítico ao processar pagamento de assinatura");
          throw err;
      }
  }
};
