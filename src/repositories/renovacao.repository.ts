import { supabaseAdmin } from "../config/supabase.js";
import { RenovacaoStatus } from "../types/enums.js";
import type { Tables } from "../types/database.types.js";

export type PassageiroComRenovacaoItem = {
  passageiro: Tables<"passageiros"> & {
    escola?: { id: string; nome: string } | null;
    veiculo?: { id: string; placa: string; modelo: string } | null;
    responsaveis?: Array<{
      id: string;
      tipo: string;
      parentesco?: string | null;
      responsavel: {
        id: string;
        nome: string;
        telefone: string;
        cpf?: string | null;
        email?: string | null;
        cep?: string | null;
        logradouro?: string | null;
        numero?: string | null;
        bairro?: string | null;
        cidade?: string | null;
        estado?: string | null;
        complemento?: string | null;
        referencia?: string | null;
      } | null;
    }>;
  };
  renovacao: (Tables<"passageiro_renovacoes"> & {
    nova_escola?: { id: string; nome: string } | null;
    novo_veiculo?: { id: string; placa: string; modelo: string } | null;
  }) | null;
};

export type PublicPropostaQueryResult = Tables<"passageiro_renovacoes"> & {
  nova_escola?: { id: string; nome: string } | null;
  passageiro: Tables<"passageiros"> & {
    escola?: { id: string; nome: string } | null;
    responsaveis?: Array<{
      id: string;
      tipo: string;
      parentesco?: string | null;
      responsavel: {
        id: string;
        nome: string;
        telefone: string;
        cpf?: string | null;
        email?: string | null;
        cep?: string | null;
        logradouro?: string | null;
        numero?: string | null;
        bairro?: string | null;
        cidade?: string | null;
        estado?: string | null;
        complemento?: string | null;
        referencia?: string | null;
      } | null;
    }>;
  };
  motorista: Tables<"usuarios"> & {
    config_contrato?: {
      usar_contratos?: boolean;
    } | null;
  };
};

export const renovacaoRepository = {
  async listPassageirosComRenovacao(usuarioId: string, anoDestino: number) {
    const { data: passageiros, error: passError } = await supabaseAdmin
      .from("passageiros")
      .select(`
        id,
        usuario_id,
        nome,
        ativo,
        isento,
        valor_cobranca,
        dia_vencimento,
        escola_id,
        veiculo_id,
        periodo,
        modalidade,
        turma,
        nome_professor,
        data_inicio_transporte,
        data_fim_transporte,
        data_inicio_cobranca,
        data_fim_cobranca,
        ano_letivo,
        created_at,
        escola:escolas(id, nome),
        veiculo:veiculos(id, placa, modelo),
        responsaveis:passageiro_responsaveis(
          id,
          tipo,
          parentesco,
          responsavel:responsaveis(id, nome, telefone, cpf, email)
        )
      `)
      .eq("usuario_id", usuarioId)
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (passError) throw passError;
    if (!passageiros || passageiros.length === 0) return [];

    const passageiroIds = passageiros.map(p => p.id);

    const { data: renovacoes, error: renError } = await supabaseAdmin
      .from("passageiro_renovacoes")
      .select(`
        *,
        nova_escola:escolas(id, nome),
        novo_veiculo:veiculos(id, placa, modelo)
      `)
      .eq("usuario_id", usuarioId)
      .eq("ano_destino", anoDestino)
      .in("passageiro_id", passageiroIds);

    if (renError) throw renError;

    const renovacoesMap = new Map<string, NonNullable<PassageiroComRenovacaoItem["renovacao"]>>();
    (renovacoes || []).forEach(r => {
      renovacoesMap.set(r.passageiro_id, r as NonNullable<PassageiroComRenovacaoItem["renovacao"]>);
    });

    return (passageiros as unknown as Array<PassageiroComRenovacaoItem["passageiro"]>).map(p => {
      const res = renovacoesMap.get(p.id);
      return {
        passageiro: p,
        renovacao: res || null,
      };
    });
  },

  async getByPassageiroEAno(passageiroId: string, anoDestino: number) {
    const { data, error } = await supabaseAdmin
      .from("passageiro_renovacoes")
      .select("*")
      .eq("passageiro_id", passageiroId)
      .eq("ano_destino", anoDestino)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getByToken(token: string) {
    const { data, error } = await supabaseAdmin
      .from("passageiro_renovacoes")
      .select(`
        *,
        nova_escola:escolas!passageiro_renovacoes_nova_escola_id_fkey(id, nome),
        passageiro:passageiros!passageiro_renovacoes_passageiro_id_fkey(
          id,
          nome,
          data_nascimento,
          genero,
          observacoes,
          valor_cobranca,
          dia_vencimento,
          escola_id,
          periodo,
          modalidade,
          turma,
          sala,
          nome_professor,
          data_inicio_transporte,
          data_fim_transporte,
          data_inicio_cobranca,
          data_fim_cobranca,
          ano_letivo,
          escola:escolas(id, nome),
          responsaveis:passageiro_responsaveis(
            id,
            tipo,
            parentesco,
            responsavel:responsaveis(
              id,
              nome,
              telefone,
              cpf,
              email,
              cep,
              logradouro,
              numero,
              bairro,
              cidade,
              estado,
              complemento,
              referencia
            )
          )
        ),
        motorista:usuarios!passageiro_renovacoes_usuario_id_fkey(
          id,
          nome,
          apelido,
          telefone,
          logo_url,
          cpfcnpj,
          config_contrato
        )
      `)
      .eq("token_publico", token)
      .maybeSingle();

    if (error) throw error;
    return data as unknown as PublicPropostaQueryResult | null;
  },

  async upsertReserva(reserva: Record<string, unknown>) {
    const { data, error } = await supabaseAdmin
      .from("passageiro_renovacoes")
      .upsert(reserva, { onConflict: "passageiro_id,ano_destino" })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async upsertLote(reservas: Record<string, unknown>[]) {
    if (reservas.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from("passageiro_renovacoes")
      .upsert(reservas, { onConflict: "passageiro_id,ano_destino" })
      .select();

    if (error) throw error;
    return data;
  },

  async listConfirmadosParaVirada(usuarioId: string, anoDestino: number) {
    const { data, error } = await supabaseAdmin
      .from("passageiro_renovacoes")
      .select("*")
      .eq("usuario_id", usuarioId)
      .eq("ano_destino", anoDestino)
      .eq("status", RenovacaoStatus.CONFIRMADO);

    if (error) throw error;
    return data || [];
  },

  async listRecusadosParaVirada(usuarioId: string, anoDestino: number) {
    const { data, error } = await supabaseAdmin
      .from("passageiro_renovacoes")
      .select("passageiro_id")
      .eq("usuario_id", usuarioId)
      .eq("ano_destino", anoDestino)
      .eq("status", RenovacaoStatus.RECUSADO);

    if (error) throw error;
    return data || [];
  },

  async atualizarPassageiroNaVirada(passageiroId: string, updateData: Record<string, unknown>) {
    const { error } = await supabaseAdmin
      .from("passageiros")
      .update(updateData)
      .eq("id", passageiroId);

    if (error) throw error;
  },

  async inativarPassageirosNaVirada(passageiroIds: string[]) {
    if (passageiroIds.length === 0) return;
    const { error } = await supabaseAdmin
      .from("passageiros")
      .update({ ativo: false })
      .in("id", passageiroIds);

    if (error) throw error;
  },

  async marcarRenovacoesComoConcluidas(usuarioId: string, anoDestino: number) {
    const { error } = await supabaseAdmin
      .from("passageiro_renovacoes")
      .update({ status: RenovacaoStatus.CONCLUIDO })
      .eq("usuario_id", usuarioId)
      .eq("ano_destino", anoDestino)
      .in("status", [RenovacaoStatus.CONFIRMADO, RenovacaoStatus.RECUSADO]);

    if (error) throw error;
  },

  async atualizarDadosPublicos(
    reservaId: string,
    passageiroId: string,
    responsavelId: string | null,
    dadosResponsavel: Record<string, unknown>,
    dadosPassageiro: Record<string, unknown>,
    dadosReserva: Record<string, unknown>
  ) {
    if (responsavelId && Object.keys(dadosResponsavel).length > 0) {
      const { error: respError } = await supabaseAdmin
        .from("responsaveis")
        .update(dadosResponsavel)
        .eq("id", responsavelId);
      if (respError) throw respError;
    }

    if (Object.keys(dadosPassageiro).length > 0) {
      const { error: passError } = await supabaseAdmin
        .from("passageiros")
        .update(dadosPassageiro)
        .eq("id", passageiroId);
      if (passError) throw passError;
    }

    if (Object.keys(dadosReserva).length > 0) {
      const { error: resError } = await supabaseAdmin
        .from("passageiro_renovacoes")
        .update(dadosReserva)
        .eq("id", reservaId);
      if (resError) throw resError;
    }
  }
};
