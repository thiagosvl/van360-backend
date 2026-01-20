import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { cobrancaService } from "../services/cobranca.service.js";
import { onlyDigits } from "../utils/string.utils.js";

export const ResponsavelController = {
  async getCobrancas(request: FastifyRequest, reply: FastifyReply) {
    const { passageiroId } = request.params as { passageiroId: string };
    const { ano } = request.query as { ano?: string };
    const cpfResponsavel = request.headers["x-responsavel-cpf"] as string;
    const emailResponsavel = request.headers["x-responsavel-email"] as string;

    if (!passageiroId || !cpfResponsavel || !emailResponsavel) {
        return reply.status(400).send({ error: "Dados de identificação insuficientes." });
    }

    // 1. Validar Acesso (O passageiro pertence a este Responsavel?)
    const { data: passageiro, error } = await supabaseAdmin
        .from("passageiros")
        .select("id")
        .eq("id", passageiroId)
        .eq("cpf_responsavel", onlyDigits(cpfResponsavel))
        .eq("email_responsavel", emailResponsavel)
        .single();

    if (error || !passageiro) {
        logger.warn({ passageiroId, cpfResponsavel }, "Tentativa de acesso não autorizado a cobranças do passageiro.");
        return reply.status(403).send({ error: "Acesso negado." });
    }

    try {        
        let query = supabaseAdmin
            .from("cobrancas")
            .select(`*, passageiros:passageiro_id (nome, nome_responsavel)`)
            .eq("passageiro_id", passageiroId);

        if (ano) {
            query = query.eq("ano", parseInt(ano));
        }

        query = query.order("mes", { ascending: false });

        const { data: cobrancas, error: cobError } = await query;
        
        if (cobError) throw cobError;

        return reply.status(200).send(cobrancas);
    } catch (err: any) {
        logger.error({ err }, "Erro ao buscar cobranças para responsável.");
        throw new AppError("Erro ao buscar cobranças.", 500);
    }
  },

  async getAnosAvailable(request: FastifyRequest, reply: FastifyReply) {
    const { passageiroId } = request.params as { passageiroId: string };
    
    // Validar acesso (mesma lógica)
    // Para simplificar, poderíamos extrair middleware, mas aqui é específico.
    const cpfResponsavel = request.headers["x-responsavel-cpf"] as string;
    // ... validação igual acima ...
     const { data: passageiro } = await supabaseAdmin
        .from("passageiros")
        .select("id")
        .eq("id", passageiroId)
        .eq("cpf_responsavel", onlyDigits(cpfResponsavel || ""))
        .maybeSingle();

    if (!passageiro) return reply.status(403).send({ error: "Acesso negado" });

    const anos = await cobrancaService.listAvailableYearsByPassageiro(passageiroId);
    return reply.status(200).send(anos);
  }
};
