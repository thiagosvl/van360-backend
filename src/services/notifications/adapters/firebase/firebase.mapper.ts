import { logger } from "../../../../config/logger.js";
import {
    EVENTO_MOTORISTA_TESTE_BOAS_VINDAS,
    EVENTO_ROTA_INICIADA_IDA,
    EVENTO_ROTA_A_CAMINHO_IDA,
    EVENTO_ROTA_EMBARCOU_IDA,
    EVENTO_ROTA_DESFEITO_EMBARQUE_IDA,
    EVENTO_ROTA_INICIADA_VOLTA,
    EVENTO_ROTA_A_CAMINHO_VOLTA,
    EVENTO_ROTA_DESEMBARCOU_VOLTA,
    EVENTO_ROTA_DESFEITO_DESEMBARQUE_VOLTA,
    EVENTO_ROTA_REORDENADA,
    EVENTO_PASSAGEIRO_CONTRATO_ASSINADO,
    EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO,
    EVENTO_PASSAGEIRO_VENCIMENTO_HOJE,
    EVENTO_PASSAGEIRO_ATRASADO,
    EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO,
    EVENTO_MOTORISTA_CONTRATO_ASSINADO,

    EVENTO_MOTORISTA_ASSINATURA_PAGO,
    EVENTO_MOTORISTA_ASSINATURA_VENCEU,
    EVENTO_MOTORISTA_ASSINATURA_ATRASADA,
    EVENTO_MOTORISTA_RENOVACAO_LEMBRETE,
    EVENTO_MOTORISTA_RENOVACAO_URGENCIA,
    EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_1,
    EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_FINAL,
    EVENTO_MOTORISTA_TESTE_ENCERRADO,
    EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS,
    EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA,
    EVENTO_MOTORISTA_INDICACAO_BONUS,
    EVENTO_MOTORISTA_INDICACAO_CADASTRO,
    EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO,
    EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1,
    EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2,
    EVENTO_MOTORISTA_NOVO_PRE_CADASTRO,
    EVENTO_MOTORISTA_AUSENCIA_REGISTRADA,
    EVENTO_MOTORISTA_AUSENCIA_REMOVIDA
} from "../../../../config/constants.js";
import { FirebaseDriverTemplates, FirebasePassengerTemplates, FirebaseMessagePayload } from "./firebase.template.js";

export class FirebaseMapper {
    static getTemplate(eventName: string, contextData: Record<string, unknown>): FirebaseMessagePayload | null {
        try {
            switch (eventName) {
                // MOTORISTA TEMPLATES
                case EVENTO_MOTORISTA_TESTE_BOAS_VINDAS: return FirebaseDriverTemplates.welcomeTrial(contextData);
                case EVENTO_MOTORISTA_TESTE_ENCERRADO: return FirebaseDriverTemplates.trialEnded(contextData);
                case EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO: return FirebaseDriverTemplates.trialLastCall(contextData);
                case EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1: return FirebaseDriverTemplates.trialRecovery1(contextData);
                case EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2: return FirebaseDriverTemplates.trialRecovery2(contextData);
                case EVENTO_MOTORISTA_NOVO_PRE_CADASTRO: return FirebaseDriverTemplates.newPassengerPreRegistration(contextData);
                case EVENTO_MOTORISTA_AUSENCIA_REGISTRADA: return FirebaseDriverTemplates.absenceRegisteredByParent(contextData);
                case EVENTO_MOTORISTA_AUSENCIA_REMOVIDA: return FirebaseDriverTemplates.absenceRemovedByParent(contextData);
                case EVENTO_MOTORISTA_CONTRATO_ASSINADO: return FirebaseDriverTemplates.contractSignedDriver(contextData);
                case EVENTO_MOTORISTA_ASSINATURA_PAGO: return FirebaseDriverTemplates.subscriptionPaid(contextData);
                case EVENTO_MOTORISTA_ASSINATURA_VENCEU: return FirebaseDriverTemplates.subscriptionDueToday(contextData);
                case EVENTO_MOTORISTA_ASSINATURA_ATRASADA: return FirebaseDriverTemplates.subscriptionOverdue(contextData);
                case EVENTO_MOTORISTA_RENOVACAO_LEMBRETE: return FirebaseDriverTemplates.renewalReminder(contextData);
                case EVENTO_MOTORISTA_RENOVACAO_URGENCIA: return FirebaseDriverTemplates.renewalUrgency(contextData);
                case EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_1: return FirebaseDriverTemplates.renewalRecovery1(contextData);
                case EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_FINAL: return FirebaseDriverTemplates.renewalRecoveryFinal(contextData);
                case EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS: return FirebaseDriverTemplates.weeklySummary(contextData);
                case EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA: return FirebaseDriverTemplates.birthdayReminder(contextData);
                case EVENTO_MOTORISTA_INDICACAO_BONUS: return FirebaseDriverTemplates.referralBonus(contextData);
                case EVENTO_MOTORISTA_INDICACAO_CADASTRO: return FirebaseDriverTemplates.referralRegistered(contextData);

                // PASSAGEIRO / RESPONSÁVEL TEMPLATES
                case EVENTO_PASSAGEIRO_CONTRATO_ASSINADO: return FirebasePassengerTemplates.contractSignedParent(contextData);
                case EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO: return FirebasePassengerTemplates.dueSoonParent(contextData);
                case EVENTO_PASSAGEIRO_VENCIMENTO_HOJE: return FirebasePassengerTemplates.dueTodayParent(contextData);
                case EVENTO_PASSAGEIRO_ATRASADO: return FirebasePassengerTemplates.overdueParent(contextData);
                case EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO: return FirebasePassengerTemplates.paymentReceiptParent(contextData);
                case EVENTO_ROTA_INICIADA_IDA: return FirebasePassengerTemplates.routeStartedIda(contextData);
                case EVENTO_ROTA_A_CAMINHO_IDA: return FirebasePassengerTemplates.routeEnRouteIda(contextData);
                case EVENTO_ROTA_EMBARCOU_IDA: return FirebasePassengerTemplates.routeBoardedIda(contextData);
                case EVENTO_ROTA_DESFEITO_EMBARQUE_IDA: return FirebasePassengerTemplates.routeBoardingCancelledIda(contextData);
                case EVENTO_ROTA_INICIADA_VOLTA: return FirebasePassengerTemplates.routeStartedVolta(contextData);
                case EVENTO_ROTA_A_CAMINHO_VOLTA: return FirebasePassengerTemplates.routeEnRouteVolta(contextData);
                case EVENTO_ROTA_DESEMBARCOU_VOLTA: return FirebasePassengerTemplates.routeDisembarkedVolta(contextData);
                case EVENTO_ROTA_DESFEITO_DESEMBARQUE_VOLTA: return FirebasePassengerTemplates.routeDisembarkingCancelledVolta(contextData);
                case EVENTO_ROTA_REORDENADA: return FirebasePassengerTemplates.routeReordered(contextData);
                
                default:
                    logger.warn({ eventName }, "[FirebaseMapper] Template não encontrado para o evento.");
                    return null;
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message, eventName }, "[FirebaseMapper] Erro ao montar template do Firebase.");
            return null;
        }
    }
}
