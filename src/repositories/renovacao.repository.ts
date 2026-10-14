import { supabaseAdmin } from "../config/supabase.js";
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
    const anoOrigem = anoDestino - 1;

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
        sala,
        nome_professor,
        horario_entrada,
        horario_saida,
        modo_cobranca,
        data_inicio_transporte,
        data_fim_transporte,
        data_inicio_cobranca,
        data_fim_cobranca,
        ano_letivo,
        created_at,
        matriculas:passageiro_matriculas!inner(
          id,
          ano_letivo,
          ativo,
          isento,
          valor_cobranca,
          dia_vencimento,
          escola_id,
          veiculo_id,
          periodo,
          modalidade,
          turma,
          sala,
          nome_professor,
          horario_entrada,
          horario_saida,
          modo_cobranca,
          data_inicio_transporte,
          data_fim_transporte,
          data_inicio_cobranca,
          data_fim_cobranca,
          escola:escolas(id, nome),
          veiculo:veiculos(id, placa, modelo)
        ),
        responsaveis:passageiro_responsaveis(
          id,
          tipo,
          parentesco,
          responsavel:responsaveis(id, nome, telefone, cpf, email)
        )
      `)
      .eq("usuario_id", usuarioId)
      .eq("matriculas.ano_letivo", anoOrigem)
      .eq("matriculas.ativo", true)
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

    return (passageiros as Record<string, any>[]).map((rawP) => {
      const matList = (rawP.matriculas as Record<string, any>[]) || [];
      const mat = matList[0];
      const mergedPassageiro: Record<string, any> = {
        ...rawP,
        ano_letivo: mat ? mat.ano_letivo : rawP.ano_letivo,
        ativo: mat ? mat.ativo : rawP.ativo,
        isento: mat ? mat.isento : rawP.isento,
        valor_cobranca: mat ? mat.valor_cobranca : rawP.valor_cobranca,
        dia_vencimento: mat ? mat.dia_vencimento : rawP.dia_vencimento,
        escola_id: mat ? mat.escola_id : rawP.escola_id,
        veiculo_id: mat ? mat.veiculo_id : rawP.veiculo_id,
        periodo: mat ? mat.periodo : rawP.periodo,
        modalidade: mat ? mat.modalidade : rawP.modalidade,
        turma: mat ? mat.turma : rawP.turma,
        sala: mat ? mat.sala : rawP.sala,
        nome_professor: mat ? mat.nome_professor : rawP.nome_professor,
        horario_entrada: mat ? mat.horario_entrada : rawP.horario_entrada,
        horario_saida: mat ? mat.horario_saida : rawP.horario_saida,
        modo_cobranca: mat ? mat.modo_cobranca : rawP.modo_cobranca,
        data_inicio_transporte: mat ? mat.data_inicio_transporte : rawP.data_inicio_transporte,
        data_fim_transporte: mat ? mat.data_fim_transporte : rawP.data_fim_transporte,
        data_inicio_cobranca: mat ? mat.data_inicio_cobranca : rawP.data_inicio_cobranca,
        data_fim_cobranca: mat ? mat.data_fim_cobranca : rawP.data_fim_cobranca,
        escola: mat?.escola ?? rawP.escola ?? null,
        veiculo: mat?.veiculo ?? rawP.veiculo ?? null,
      };
      delete mergedPassageiro.matriculas;

      const res = renovacoesMap.get(rawP.id);
      return {
        passageiro: mergedPassageiro as PassageiroComRenovacaoItem["passageiro"],
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
          veiculo_id,
          isento,
          modo_cobranca,
          horario_entrada,
          horario_saida,
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
          matriculas:passageiro_matriculas(
            *,
            escola:escolas(id, nome)
          ),
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
    if (!data || !data.passageiro) return null;

    const rawPass = data.passageiro as Record<string, any>;
    const matList = (rawPass.matriculas as Record<string, any>[]) || [];
    const matOrigem = matList.find((m) => Number(m.ano_letivo) === Number(data.ano_origem)) || matList[0];

    if (matOrigem) {
      rawPass.ano_letivo = matOrigem.ano_letivo;
      rawPass.valor_cobranca = matOrigem.valor_cobranca;
      rawPass.dia_vencimento = matOrigem.dia_vencimento;
      rawPass.escola_id = matOrigem.escola_id;
      rawPass.veiculo_id = matOrigem.veiculo_id;
      rawPass.isento = matOrigem.isento;
      rawPass.modo_cobranca = matOrigem.modo_cobranca;
      rawPass.horario_entrada = matOrigem.horario_entrada;
      rawPass.horario_saida = matOrigem.horario_saida;
      rawPass.periodo = matOrigem.periodo;
      rawPass.modalidade = matOrigem.modalidade;
      rawPass.turma = matOrigem.turma;
      rawPass.sala = matOrigem.sala;
      rawPass.nome_professor = matOrigem.nome_professor;
      rawPass.data_inicio_transporte = matOrigem.data_inicio_transporte;
      rawPass.data_fim_transporte = matOrigem.data_fim_transporte;
      rawPass.data_inicio_cobranca = matOrigem.data_inicio_cobranca;
      rawPass.data_fim_cobranca = matOrigem.data_fim_cobranca;
      if (matOrigem.escola) rawPass.escola = matOrigem.escola;
    }

    return data as unknown as PublicPropostaQueryResult;
  },

  async upsertReserva(reserva: Record<string, unknown>) {
    const { data, error } = await supabaseAdmin
      .from("passageiro_renovacoes")
      .upsert(reserva as unknown as import("../types/database.types.js").TablesInsert<"passageiro_renovacoes">, { onConflict: "passageiro_id,ano_destino" })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async upsertLote(reservas: Record<string, unknown>[]) {
    if (reservas.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from("passageiro_renovacoes")
      .upsert(reservas as unknown as import("../types/database.types.js").TablesInsert<"passageiro_renovacoes">[], { onConflict: "passageiro_id,ano_destino" })
      .select();

    if (error) throw error;
    return data;
  },

  async atualizarDadosPublicos(
    reservaId: string,
    passageiroId: string,
    anoDestino: number,
    responsavelId: string | null,
    parentesco: string | null | undefined,
    dadosResponsavel: Record<string, unknown>,
    dadosPassageiro: Record<string, unknown>,
    dadosReserva: Record<string, unknown>,
    dadosMatriculaDestino: Record<string, unknown>
  ) {
    if (responsavelId && Object.keys(dadosResponsavel).length > 0) {
      const { error: respError } = await supabaseAdmin
        .from("responsaveis")
        .update(dadosResponsavel)
        .eq("id", responsavelId);
      if (respError) throw respError;
    }

    if (responsavelId && parentesco !== undefined) {
      await supabaseAdmin
        .from("passageiro_responsaveis")
        .update({ parentesco, updated_at: new Date().toISOString() })
        .eq("passageiro_id", passageiroId)
        .eq("responsavel_id", responsavelId);
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

    if (Object.keys(dadosMatriculaDestino).length > 0) {
      await supabaseAdmin
        .from("passageiro_matriculas")
        .update(dadosMatriculaDestino)
        .eq("passageiro_id", passageiroId)
        .eq("ano_letivo", anoDestino);
    }
  }
};
