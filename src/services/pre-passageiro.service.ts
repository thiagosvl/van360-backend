import { supabaseAdmin } from "../config/supabase.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";

export const prePassageiroService = {
  async listPrePassageiros(usuarioId: string, search?: string) {
    let query = supabaseAdmin
      .from("pre_passageiros")
      .select("*")
      .eq("usuario_id", usuarioId)
      .order("created_at");

    if (search?.trim().length) {
      query = query.or(
        `nome.ilike.%${search}%,nome_responsavel.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return data || [];
  },

  async createPrePassageiro(payload: any) {
    // Processa valor_cobranca: converte string para number se necessário (mesma lógica do serviço de passageiros)
    let valorCobranca = null;
    if (payload.valor_cobranca !== undefined && payload.valor_cobranca !== null && payload.valor_cobranca !== "") {
      valorCobranca = typeof payload.valor_cobranca === "string" 
        ? moneyToNumber(payload.valor_cobranca)
        : Number(payload.valor_cobranca);
      
      // Valida se é um número válido e maior que zero
      if (isNaN(valorCobranca) || valorCobranca <= 0) {
        valorCobranca = null;
      }
    }

    // Processa dia_vencimento: valida se está entre 1 e 31
    let diaVencimento = null;
    if (payload.dia_vencimento !== undefined && payload.dia_vencimento !== null && payload.dia_vencimento !== "") {
      diaVencimento = Number(payload.dia_vencimento);
      // Valida se é um número válido entre 1 e 31
      if (isNaN(diaVencimento) || diaVencimento < 1 || diaVencimento > 31) {
        diaVencimento = null;
      }
    }

    const prePassageiroData = {
      usuario_id: payload.usuario_id,
      nome: cleanString(payload.nome, true),
      nome_responsavel: cleanString(payload.nome_responsavel, true),
      email_responsavel: cleanString(payload.email_responsavel),
      cpf_responsavel: onlyDigits(payload.cpf_responsavel),
      telefone_responsavel: onlyDigits(payload.telefone_responsavel),
      escola_id: payload.escola_id || null,
      periodo: payload.periodo || null,
      valor_cobranca: valorCobranca,
      dia_vencimento: diaVencimento,
      logradouro: payload.logradouro || null,
      numero: payload.numero || null,
      bairro: payload.bairro || null,
      cidade: payload.cidade || null,
      estado: payload.estado || null,
      cep: payload.cep || null,
      referencia: payload.referencia || null,
      observacoes: payload.observacoes || null,
      
      // Novos Campos
      modalidade: payload.modalidade || null,
      genero: payload.genero || null,
      parentesco_responsavel: payload.parentesco_responsavel || null,
      data_inicio_transporte: payload.data_inicio_transporte || null,
      data_nascimento: payload.data_nascimento || null
    };

    const { data, error } = await supabaseAdmin
      .from("pre_passageiros")
      .insert([prePassageiroData])
      .select()
      .single();

    if (error) throw error;

    // Notificar Motorista (Background)
    
    /* REMOVIDO TEMPORARIAMENTE PARA EVITAR SPAM (REQ. CLIENTE)
    (async () => {
      try {
        const motorista = await getUsuarioData(payload.usuario_id);
        if (motorista?.telefone) {
          await notificationService.notifyDriver(motorista.telefone, DRIVER_EVENT_PRE_PASSENGER_CREATED, {
            nomeMotorista: motorista.nome,
            nomePassageiro: data.nome,
            nomeResponsavel: data.nome_responsavel,
            // Campos obrigatórios do DriverContext (fallbacks)
            nomePlano: "",
            valor: 0,
            dataVencimento: ""
          });
        }
      } catch (err: any) {
        logger.error({ err: err.message, payload }, "Erro ao notificar motorista sobre pré-cadastro");
      }
    })();
    */

    return data;
  },

  async deletePrePassageiro(prePassageiroId: string) {
    const { error } = await supabaseAdmin
      .from("pre_passageiros")
      .delete()
      .eq("id", prePassageiroId);

    if (error) throw new Error("Falha ao excluir o pré-cadastro.");
    return true;
  },
};
