import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";
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
   * Ida - Van a caminho para buscar a criança
   */
  enRouteIda: (ctx: RouteContext): CompositeMessagePart[] => {
    const nomeResp = getFirstName(ctx.nomeResponsavel);
    const nomeExibicao = ctx.apelidoMotorista || getFirstName(ctx.nomeMotorista);
    const text = `🚌 *Van a Caminho!*\n\n` +
      `Olá *${nomeResp}*,\n` +
      `A van do *${nomeExibicao}* já está a caminho para buscar *${ctx.nomePassageiro}*. 🎒\n\n` +
      `Por favor, certifique-se de que ele(a) esteja pronto(a) para o embarque!${getSystemFooter(ctx)}`;

    return textPart(text);
  },

  /**
   * Volta - Van a caminho de trazer a criança para casa
   */
  enRouteVolta: (ctx: RouteContext): CompositeMessagePart[] => {
    const nomeResp = getFirstName(ctx.nomeResponsavel);
    const nomeExibicao = ctx.apelidoMotorista || getFirstName(ctx.nomeMotorista);
    const text = `🏡 *Van Trazendo para Casa!*\n\n` +
      `Olá *${nomeResp}*,\n` +
      `A van do *${nomeExibicao}* já iniciou o trajeto de retorno de *${ctx.nomePassageiro}* para casa. 🚌\n\n` +
      `Logo mais chegaremos ao destino!${getSystemFooter(ctx)}`;

    return textPart(text);
  },

  /**
   * Confirmação de Embarque
   */
  boarded: (ctx: RouteContext): CompositeMessagePart[] => {
    const nomeResp = getFirstName(ctx.nomeResponsavel);
    const nomeExibicao = ctx.apelidoMotorista || getFirstName(ctx.nomeMotorista);
    const text = `✅ *Embarque Confirmado*\n\n` +
      `Olá *${nomeResp}*,\n` +
      `Confirmamos que *${ctx.nomePassageiro}* embarcou com sucesso na van do *${nomeExibicao}*! 🎒🚌${getSystemFooter(ctx)}`;

    return textPart(text);
  },

  /**
   * Confirmação de Desembarque (Entrega)
   */
  delivered: (ctx: RouteContext): CompositeMessagePart[] => {
    const nomeResp = getFirstName(ctx.nomeResponsavel);
    const nomeExibicao = ctx.apelidoMotorista || getFirstName(ctx.nomeMotorista);
    const text = `✅ *Entrega Confirmada*\n\n` +
      `Olá *${nomeResp}*,\n` +
      `Confirmamos que *${ctx.nomePassageiro}* foi entregue em casa com segurança pelo *${nomeExibicao}*! 🏡🚌${getSystemFooter(ctx)}`;

    return textPart(text);
  }
};
