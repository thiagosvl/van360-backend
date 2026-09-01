import { cobrancaService } from "../cobranca.service.js";
import { passageiroService } from "../passageiro.service.js";
import { userRepository } from "../../repositories/user.repository.js";
import { historicoService } from "../historico.service.js";
import { AtividadeAcao, AtividadeEntidadeTipo } from "../../types/enums.js";
import { AppError } from "../../errors/AppError.js";
import {
  EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS,
  EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA,
} from "../../config/constants.js";
import type { DispatchDriverNotificationDTO } from "../../schemas/admin.schema.js";

export interface DispatchNotificationResult {
  sent: boolean;
  message: string;
}

type NotificationHandler = (motoristaId: string) => Promise<DispatchNotificationResult>;

const notificationHandlers: Record<string, NotificationHandler> = {
  [EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS]: async (motoristaId: string): Promise<DispatchNotificationResult> => {
    const sent = await cobrancaService.processarResumoSemanalMotorista(motoristaId);
    if (!sent) {
      return {
        sent: false,
        message: "O motorista não possui cobranças pendentes ou a vencer nos próximos 7 dias para gerar o resumo.",
      };
    }
    return {
      sent: true,
      message: "Notificação de resumo semanal das parcelas enviada com sucesso.",
    };
  },

  [EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA]: async (motoristaId: string): Promise<DispatchNotificationResult> => {
    const result = await passageiroService.processarLembreteAniversarioMotorista({ motoristaId });
    if (!result.sent) {
      return {
        sent: false,
        message: result.reason || "Não há aniversariantes para a semana atual nos passageiros deste motorista.",
      };
    }
    return {
      sent: true,
      message: "Notificação de aniversariantes da semana enviada com sucesso.",
    };
  },
};

export const adminNotificationService = {
  async dispatchToDriver(
    motoristaId: string,
    data: DispatchDriverNotificationDTO,
    adminId?: string
  ): Promise<DispatchNotificationResult> {
    const { data: user } = await userRepository.getById(motoristaId);
    if (!user) {
      throw new AppError("Motorista não encontrado.", 404);
    }

    const handler = notificationHandlers[data.evento];
    if (!handler) {
      throw new AppError(`Evento de notificação '${data.evento}' não suportado para disparo manual.`, 400);
    }

    const result = await handler(motoristaId);

    if (result.sent) {
      await historicoService.log({
        usuario_id: motoristaId,
        entidade_tipo: AtividadeEntidadeTipo.USUARIO,
        entidade_id: motoristaId,
        acao: AtividadeAcao.CONFIGURACES_EDITADAS,
        descricao: `Disparo manual de notificação (${data.evento}) realizado pelo administrador.`,
        meta: {
          evento: data.evento,
          admin_id: adminId,
        },
      });
    }

    return result;
  },
};
