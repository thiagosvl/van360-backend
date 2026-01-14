import { DRIVER_EVENT_PAYMENT_RECEIVED_ALERT, PASSENGER_EVENT_PAYMENT_RECEIVED } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import { addToReceiptQueue } from "../../queues/receipt.queue.js";
import { AssinaturaTipoPagamento } from "../../types/enums.js";
import { formatDate } from "../../utils/format.js";
import { cobrancaPagamentoService } from "../cobranca-pagamento.service.js";
// Actually checking usages below.. notifications use cobrancaService? No, notificationService.
// Let's keep it safe, but looks like we might remove it if unused.
import { notificationService } from "../notifications/notification.service.js";
import { ReceiptData } from "../receipt.service.js";

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
        // Cobrança não encontrada nas cobranças 'filhas' (passengers).
        // Se for assinatura, o roteador deveria ter mandado para outro handler, 
        // ou o webhookInterController trata isso. 
        // Aqui retornamos false para indicar "não é minha responsabilidade".
        return false;
    }

    // 2. Processar Pagamento e Repasse
    logger.info({ cobrancaId: cobrancaPai.id, context: "COBRANCA_PAI" }, "Cobrança de Pai encontrada. Iniciando fluxo de repasse.");

    try {
        // b) Atualizar status para PAGO (Imediato)
        // Nota: O reciboUrl será atualizado depois pelo Worker
        const dataPagamento = horario || new Date().toISOString();
        await cobrancaPagamentoService.processarPagamento(txid, valor, pagamento, undefined); 
        
        // c) Iniciar Repasse (Fire & Forget seguro com catch individual)
        cobrancaPagamentoService.iniciarRepasse(cobrancaPai.id)
            .then(res => logger.info({ res, cobrancaId: cobrancaPai.id }, "Repasse AUTOMÁTICO iniciado com sucesso"))
            .catch(err => logger.error({ err, cobrancaId: cobrancaPai.id }, "Falha ao iniciar repasse automático (tentar via painel depois)"));


        // 3. Enfileirar Geração de Recibo + Notificação (Async)
        try {
            const { data: fullData } = await supabaseAdmin
                .from("cobrancas")
                .select(`
                    *, 
                    passageiros(nome, nome_responsavel, telefone_responsavel),
                    usuarios(nome, apelido, telefone)
                `)
                .eq("id", cobrancaPai.id)
                .single();

            if (fullData) {
                const moto = fullData.usuarios as any;
                const pass = fullData.passageiros as any;
                const nomeExibicao = moto?.apelido || moto?.nome || 'Motorista';
                
                // Preparar dados do Recibo
                const receiptData: ReceiptData = {
                    id: fullData.id,
                    titulo: "Recibo de Transporte",
                    subtitulo: `Transporte Escolar - ${nomeExibicao}`,
                    valor: valor,
                    data: formatDate(dataPagamento),
                    pagadorNome: pass?.nome_responsavel || "Responsável",
                    passageiroNome: pass?.nome || "Passageiro",
                    mes: fullData.mes,
                    ano: fullData.ano,
                    descricao: `Mensalidade`,
                    metodoPagamento: AssinaturaTipoPagamento.PIX,
                    tipo: 'PASSAGEIRO'
                };

                // Preparar contexto para Notificação (que o worker vai disparar)
                // Notificar Pai e Motorista
                await addToReceiptQueue({
                    receiptData,
                    notificationContext: {
                         phone: pass?.telefone_responsavel,
                         eventType: PASSENGER_EVENT_PAYMENT_RECEIVED,
                         userId: moto?.id, // Instância do motorista
                         templateData: {
                            nomeResponsavel: pass?.nome_responsavel,
                            nomePassageiro: pass?.nome,
                            nomeMotorista: moto?.nome,
                            dataVencimento: fullData.data_vencimento,
                            mes: fullData.mes,
                            ano: fullData.ano
                         }
                    }
                });

                // Notificar Motorista sobre recebimento (Separado, pode ser direto ou via fila tbm, mas vamos focar no fluxo principal do recibo)
                // A notificação do motorista NÃO precisa do recibo, então podemos manter síncrono ou criar outro job. 
                // Para simplificar, vou deixar a notificação do PAI via worker (pq precisa do recibo)
                // E a do MOTORISTA via notificationService direto (pq é só texto informativo).
                // ...pensando melhor, o NotificationService agora joga na fila, então é rápido.
                
                notificationService.notifyDriver(moto.telefone, DRIVER_EVENT_PAYMENT_RECEIVED_ALERT, {
                     nomeMotorista: moto.nome,
                     nomePagador: pass?.nome_responsavel,
                     nomeAluno: pass?.nome,
                     valor: valor,
                     mes: fullData.mes,
                     ano: fullData.ano,
                     nomePlano: "", // Not used in this template
                     dataVencimento: fullData.data_vencimento || ""
                }); 
               // Descomentar acima se quiser notificar motorista instantaneamente. O worker pode notificar o pai com o recibo.
            }

        } catch (queueErr) {
            logger.error({ queueErr }, "Erro ao enfileirar recibo (Notificação falhou, mas pagamento ok)");
        }

        return true;
    } catch (err) {
        logger.error({ err, cobrancaId: cobrancaPai.id }, "Erro crítico ao processar pagamento de pai");
        return false;
    }
  },


};
