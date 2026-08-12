import { logger } from "../../../../config/logger.js";
import { EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO, EVENTO_PASSAGEIRO_VENCIMENTO_HOJE, EVENTO_PASSAGEIRO_ATRASADO, EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO, EVENTO_PASSAGEIRO_CONTRATO_DISPONIVEL, EVENTO_MOTORISTA_ASSINATURA_VENCENDO, EVENTO_MOTORISTA_ASSINATURA_VENCEU, EVENTO_MOTORISTA_ASSINATURA_ATRASADA, EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, EVENTO_AUTH_RECUPERACAO_SENHA, EVENTO_AUTH_SENHA_ALTERADA, EVENTO_MOTORISTA_CADASTRO_ADMIN, EVENTO_MOTORISTA_RESET_SENHA_ADMIN, EVENTO_MOTORISTA_EQUIPE_CADASTRO, EVENTO_MOTORISTA_EQUIPE_RESET_SENHA, EVENTO_MOTORISTA_EQUIPE_STATUS_ALTERADO } from "../../../../config/constants.js";
import { DriverTemplates } from "./templates/driver.template.js";
import { PassengerTemplates } from "./templates/passenger.template.js";

import { CompositeMessagePart } from "../../../../types/dtos/evolution.dto.js";

export class EvolutionMapper {
    static getTemplate(eventName: string, contextData: Record<string, unknown>): CompositeMessagePart[] | null {
        try {
            switch (eventName) {
                // PASSAGEIRO
                case EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO: return PassengerTemplates.dueSoon(contextData as never);
                case EVENTO_PASSAGEIRO_VENCIMENTO_HOJE: return PassengerTemplates.dueToday(contextData as never);
                case EVENTO_PASSAGEIRO_ATRASADO: return PassengerTemplates.overdue(contextData as never);
                case EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO: return PassengerTemplates.paymentReceipt(contextData as never);
                case EVENTO_PASSAGEIRO_CONTRATO_DISPONIVEL: return PassengerTemplates.contractAvailable(contextData as never);

                // MOTORISTA - FATURAMENTO E CONTRATO
                case EVENTO_MOTORISTA_ASSINATURA_VENCENDO: return DriverTemplates.dueSoon(contextData as never);
                case EVENTO_MOTORISTA_ASSINATURA_VENCEU: return DriverTemplates.dueToday(contextData as never);
                case EVENTO_MOTORISTA_ASSINATURA_ATRASADA: return DriverTemplates.overdue(contextData as never);
                case EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO: return DriverTemplates.failedCC(contextData as never);
                
                // MOTORISTA - AUTH
                case EVENTO_MOTORISTA_CADASTRO_ADMIN: return DriverTemplates.welcomeAdminCreated(contextData as never);
                case EVENTO_MOTORISTA_RESET_SENHA_ADMIN: return DriverTemplates.adminResetPassword(contextData as never);
                // MOTORISTA - TRIAL
                // (Eventos de Trial migrados para o App)

                // MOTORISTA - EXTRAS
                case EVENTO_MOTORISTA_EQUIPE_CADASTRO: return DriverTemplates.teamMemberCreated(contextData as never);
                case EVENTO_MOTORISTA_EQUIPE_RESET_SENHA: return DriverTemplates.teamMemberResetPassword(contextData as never);
                case EVENTO_MOTORISTA_EQUIPE_STATUS_ALTERADO: return DriverTemplates.teamMemberStatusChanged(contextData as never);

                default:
                    logger.warn({ eventName }, "[EvolutionMapper] Template não encontrado para o evento.");
                    return null;
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage, eventName }, "[EvolutionMapper] Erro ao montar template da Evolution.");
            return null;
        }
    }
}
