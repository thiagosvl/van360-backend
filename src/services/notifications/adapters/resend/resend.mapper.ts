import { logger } from "../../../../config/logger.js";
import {
    EVENTO_AUTH_RECUPERACAO_SENHA,
    EVENTO_AUTH_SENHA_ALTERADA,
    EVENTO_PASSAGEIRO_CONTRATO_DISPONIVEL,
    EVENTO_PASSAGEIRO_CONTRATO_ASSINADO,
    EVENTO_PASSAGEIRO_PIN_RESET,
    EVENTO_MOTORISTA_EQUIPE_CADASTRO,
    EVENTO_MOTORISTA_EQUIPE_RESET_SENHA,
    EVENTO_MOTORISTA_EQUIPE_STATUS_ALTERADO,
    EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
    EVENTO_MOTORISTA_ASSINATURA_VENCEU,
    EVENTO_MOTORISTA_RENOVACAO_LEMBRETE,
    EVENTO_MOTORISTA_RENOVACAO_URGENCIA,
    EVENTO_MOTORISTA_ASSINATURA_ATRASADA,
    EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO,
    EVENTO_MOTORISTA_ASSINATURA_PAGO,
    EVENTO_MOTORISTA_TESTE_BOAS_VINDAS,
    EVENTO_MOTORISTA_TESTE_ENCERRADO,
    EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO,
    EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1,
    EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2,
    EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_1,
    EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_FINAL,
    EVENTO_MOTORISTA_INDICACAO_BONUS
} from "../../../../config/constants.js";
import {
    ResendPassengerTemplates,
    ResendDriverTemplates,
    ResendTeamTemplates,
    ResendTemplatePayload,
    ResendTemplateContext
} from "./resend.template.js";

/**
 * ResendMapper (Router Limpo de E-mails)
 * Atua unicamente como roteador (switch-case) direcionando os eventos
 * para os modulos especializados (Passenger, Driver, Team).
 */
export class ResendMapper {
    static async getTemplate(eventName: string, contextData: ResendTemplateContext): Promise<ResendTemplatePayload | null> {
        try {
            switch (eventName) {
                // 🔑 AUTENTICAÇÃO
                case EVENTO_AUTH_RECUPERACAO_SENHA:
                    return ResendDriverTemplates.authRecovery(contextData);

                case EVENTO_AUTH_SENHA_ALTERADA:
                    return ResendDriverTemplates.passwordChanged(contextData);

                // 📄 PAIS E CONTRATOS
                case EVENTO_PASSAGEIRO_CONTRATO_DISPONIVEL:
                    return ResendPassengerTemplates.contractAvailable(contextData);

                case EVENTO_PASSAGEIRO_CONTRATO_ASSINADO:
                    return ResendPassengerTemplates.contractSigned(contextData);

                case EVENTO_PASSAGEIRO_PIN_RESET:
                    return ResendPassengerTemplates.responsavelPinReset(contextData);

                // 🚌 EQUIPE E AJUDANTES
                case EVENTO_MOTORISTA_EQUIPE_CADASTRO:
                    return ResendTeamTemplates.teamMemberCreated(contextData);

                case EVENTO_MOTORISTA_EQUIPE_RESET_SENHA:
                    return ResendTeamTemplates.teamMemberResetPassword(contextData);

                case EVENTO_MOTORISTA_EQUIPE_STATUS_ALTERADO:
                    return ResendTeamTemplates.teamMemberStatusChanged(contextData);

                // 💳 ASSINATURA SAAS MOTORISTA
                case EVENTO_MOTORISTA_ASSINATURA_PAGO:
                    return ResendDriverTemplates.subscriptionPaid(contextData);

                case EVENTO_MOTORISTA_ASSINATURA_VENCENDO:
                    return await ResendDriverTemplates.subscriptionDueSoon(contextData);

                case EVENTO_MOTORISTA_ASSINATURA_VENCEU:
                case EVENTO_MOTORISTA_RENOVACAO_LEMBRETE:
                case EVENTO_MOTORISTA_RENOVACAO_URGENCIA:
                    return await ResendDriverTemplates.subscriptionDueToday(contextData);

                case EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO:
                    return await ResendDriverTemplates.subscriptionFailedCC(contextData);

                case EVENTO_MOTORISTA_ASSINATURA_ATRASADA:
                    return await ResendDriverTemplates.subscriptionOverdue(contextData);

                case EVENTO_MOTORISTA_TESTE_BOAS_VINDAS:
                    return ResendDriverTemplates.welcomeTrial(contextData);

                case EVENTO_MOTORISTA_TESTE_ENCERRADO:
                    return await ResendDriverTemplates.trialEnded(contextData);

                case EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO:
                    return await ResendDriverTemplates.trialLastCall(contextData);

                case EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1:
                case EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2:
                case EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_1:
                case EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_FINAL:
                    return await ResendDriverTemplates.trialRecovery(contextData);

                case EVENTO_MOTORISTA_INDICACAO_BONUS:
                    return ResendDriverTemplates.referralBonus(contextData);

                default:
                    logger.warn({ eventName }, "[ResendMapper] Template não encontrado para o evento.");
                    return null;
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage, eventName }, "[ResendMapper] Erro ao montar template do Resend.");
            return null;
        }
    }
}
