import { CompositeMessagePart } from "../../../types/dtos/evolution.dto.js";
import { getFirstName } from "../../../utils/format.js";

export interface RouteContext {
  nomeResponsavel: string;
  nomePassageiro: string;
  nomeMotorista: string;
  apelidoMotorista?: string;
  telefoneMotorista?: string;
}

const textPart = (text: string): CompositeMessagePart[] => {
  return [{ type: "text", content: text }];
};

const getSystemFooter = (ctx: RouteContext) => {
  const phoneLink = ctx.telefoneMotorista
    ? `\n📞 Fale com o motorista: https://wa.me/55${ctx.telefoneMotorista.replace(/\D/g, "")}`
    : "";

  const nomeExibicao = ctx.apelidoMotorista || getFirstName(ctx.nomeMotorista);

  return `\n\n_________________\n🤖 *Sistema Van360*\nEnviada em nome de: *${nomeExibicao}*${phoneLink}`;
};

export const RouteTemplates = {
  /**
   * 1. Ida - Van a caminho da residência para buscar a criança
   */
  enRouteIda: (ctx: RouteContext): CompositeMessagePart[] => {
    const text = `🚌 *Van a Caminho!*\n\n` +
      `A van está a caminho da sua residência para buscar *${ctx.nomePassageiro}*. 🎒\n\n` +
      `Por favor, certifique-se de que ele(a) esteja pronto(a) para o embarque!${getSystemFooter(ctx)}`;

    return textPart(text);
  },

  /**
   * 2. Ida - Confirmação de Embarque na porta de casa
   */
  boardedIda: (ctx: RouteContext): CompositeMessagePart[] => {
    const text = `✅ *Embarque Confirmado*\n\n` +
      `O passageiro *${ctx.nomePassageiro}* já embarcou na van a caminho da escola! 🎒🚌${getSystemFooter(ctx)}`;

    return textPart(text);
  },

  /**
   * 3. Volta - Van a caminho da residência para entregar a criança
   */
  enRouteVolta: (ctx: RouteContext): CompositeMessagePart[] => {
    const text = `🏡 *Passageiro Chegando!*\n\n` +
      `A van está a caminho da sua residência para entregar *${ctx.nomePassageiro}*. 🚌\n\n` +
      `Logo mais chegaremos ao destino!${getSystemFooter(ctx)}`;

    return textPart(text);
  },

  /**
   * 4. Volta - Confirmação de Entrega na residência
   */
  deliveredVolta: (ctx: RouteContext): CompositeMessagePart[] => {
    const text = `✅ *Entrega Confirmada*\n\n` +
      `Confirmamos que o passageiro *${ctx.nomePassageiro}* foi entregue em segurança na sua residência! 🏡🚌${getSystemFooter(ctx)}`;

    return textPart(text);
  },
};
