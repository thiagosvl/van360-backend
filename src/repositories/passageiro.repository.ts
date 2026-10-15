import { supabaseAdmin } from "../config/supabase.js";
import { isValidFilterValue } from "../utils/filter.utils.js";
import { TipoResponsavel } from "../types/enums.js";
import { ListPassageirosFiltersDTO } from "../types/dtos/passageiro.dto.js";
import { normalizePhone } from "../utils/string.utils.js";
import { getNowBR, parseMonthYearFromDateString } from "../utils/date.utils.js";

const PASSAGEIRO_RESPONSAVEIS_SELECT = `
  responsaveis:passageiro_responsaveis(
    id,
    tipo,
    parentesco,
    notificacoes_rota_habilitadas,
    created_at,
    responsavel:responsaveis(
      id,
      nome,
      telefone,
      cpf,
      email,
      pin_acesso,
      logradouro,
      numero,
      bairro,
      cidade,
      estado,
      cep,
      referencia,
      complemento
    )
  )
`;

const resolveMatriculaForYear = (matriculas: Record<string, any>[], targetYear?: number) => {
  if (!Array.isArray(matriculas) || matriculas.length === 0) return null;
  const currentYear = getNowBR().getFullYear();
  if (targetYear) {
    const exact = matriculas.find((m) => Number(m.ano_letivo) === Number(targetYear));
    if (exact) return exact;
  }
  const current = matriculas.find((m) => Number(m.ano_letivo) === currentYear);
  if (current) return current;
  const sorted = [...matriculas].sort((a, b) => Number(b.ano_letivo) - Number(a.ano_letivo));
  return sorted[0];
};

const overlayMatriculaOnPassageiro = <T extends Record<string, any>>(
  data: T,
  matricula: Record<string, any> | null,
  allMatriculas?: Record<string, any>[]
): T & { matricula_id?: string; anos_matriculados: number[] } => {
  const listMatriculas = allMatriculas || (Array.isArray(data.matriculas) ? data.matriculas : []);
  const anosMatriculados = Array.from(
    new Set(listMatriculas.map((m: Record<string, any>) => Number(m.ano_letivo)).filter((n: number) => !Number.isNaN(n)))
  ).sort((a, b) => a - b);

  if (!matricula) {
    return {
      ...data,
      anos_matriculados: anosMatriculados.length > 0 ? anosMatriculados : (data.ano_letivo ? [Number(data.ano_letivo)] : []),
    };
  }

  return {
    ...data,
    matricula_id: matricula.id,
    ano_letivo: matricula.ano_letivo,
    ativo: matricula.ativo,
    isento: matricula.isento,
    escola_id: matricula.escola_id,
    veiculo_id: matricula.veiculo_id,
    escola: matricula.escola ?? data.escola,
    veiculo: matricula.veiculo ?? data.veiculo,
    periodo: matricula.periodo,
    modalidade: matricula.modalidade,
    turma: matricula.turma,
    sala: matricula.sala,
    nome_professor: matricula.nome_professor,
    horario_entrada: matricula.horario_entrada,
    horario_saida: matricula.horario_saida,
    valor_cobranca: matricula.valor_cobranca,
    dia_vencimento: matricula.dia_vencimento,
    modo_cobranca: matricula.modo_cobranca,
    data_inicio_transporte: matricula.data_inicio_transporte,
    data_fim_transporte: matricula.data_fim_transporte,
    data_inicio_cobranca: matricula.data_inicio_cobranca,
    data_fim_cobranca: matricula.data_fim_cobranca,
    anos_matriculados: anosMatriculados.length > 0 ? anosMatriculados : [Number(matricula.ano_letivo)],
  };
};

const isMatriculaCoveringMonthYear = (m: Record<string, any>, targetMonth: number, targetYear: number): boolean => {
  const targetNum = targetYear * 12 + (targetMonth - 1);
  const anoLetivo = Number(m.ano_letivo);

  let startYear = anoLetivo;
  let startMonth = 1;
  if (m.data_inicio_cobranca) {
    const parsedStart = parseMonthYearFromDateString(String(m.data_inicio_cobranca));
    if (parsedStart) {
      startYear = parsedStart.year;
      startMonth = parsedStart.month;
    }
  } else if (m.created_at) {
    const parsedCreated = parseMonthYearFromDateString(String(m.created_at));
    if (parsedCreated && parsedCreated.year === anoLetivo) {
      startYear = parsedCreated.year;
      startMonth = parsedCreated.month;
    }
  }

  let endYear = anoLetivo;
  let endMonth = 12;
  if (m.data_fim_cobranca) {
    const parsedEnd = parseMonthYearFromDateString(String(m.data_fim_cobranca));
    if (parsedEnd) {
      endYear = parsedEnd.year;
      endMonth = parsedEnd.month;
    }
  }

  const startNum = startYear * 12 + (startMonth - 1);
  const endNum = endYear * 12 + (endMonth - 1);

  return targetNum >= startNum && targetNum <= endNum;
};

export const passageiroRepository = {
  async getByIdCompleto(id: string, usuarioId?: string, anoLetivo?: number) {
    let query = supabaseAdmin
      .from("passageiros")
      .select(`
        *,
        escola:escolas(*),
        veiculo:veiculos(*),
        matriculas:passageiro_matriculas(
          *,
          escola:escolas(*),
          veiculo:veiculos(*)
        ),
        contratos(id, ano, status, provider, created_at, minuta_url, contrato_final_url, token_acesso),
        renovacoes:passageiro_renovacoes(id, ano_origem, ano_destino, status),
        ${PASSAGEIRO_RESPONSAVEIS_SELECT}
      `)
      .eq("id", id);

    if (isValidFilterValue(usuarioId)) {
      query = query.eq("usuario_id", usuarioId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const matriculas = (data.matriculas as Record<string, any>[]) || [];
    const targetMatricula = resolveMatriculaForYear(matriculas, anoLetivo);
    return overlayMatriculaOnPassageiro(data, targetMatricula, matriculas);
  },

  async insert(data: Record<string, unknown>) {
    return supabaseAdmin
      .from("passageiros")
      .insert([data as unknown as import("../types/database.types.js").TablesInsert<"passageiros">])
      .select()
      .single();
  },

  async upsertMatricula(data: Record<string, unknown>) {
    return supabaseAdmin
      .from("passageiro_matriculas")
      .upsert(data as unknown as import("../types/database.types.js").TablesInsert<"passageiro_matriculas">, { onConflict: "passageiro_id,ano_letivo" })
      .select()
      .single();
  },

  async updateMatricula(passageiroId: string, anoLetivo: number, data: Record<string, unknown>) {
    if (!data || Object.keys(data).length === 0) {
      return { data: null, error: null };
    }
    return supabaseAdmin
      .from("passageiro_matriculas")
      .update(data as unknown as import("../types/database.types.js").TablesUpdate<"passageiro_matriculas">)
      .eq("passageiro_id", passageiroId)
      .eq("ano_letivo", anoLetivo)
      .select()
      .maybeSingle();
  },

  async deleteMatricula(passageiroId: string, anoLetivo: number) {
    return supabaseAdmin
      .from("passageiro_matriculas")
      .delete()
      .eq("passageiro_id", passageiroId)
      .eq("ano_letivo", anoLetivo);
  },

  async getMatriculasByPassageiro(passageiroId: string) {
    return supabaseAdmin
      .from("passageiro_matriculas")
      .select(`
        *,
        escola:escolas(id, nome),
        veiculo:veiculos(id, placa, modelo)
      `)
      .eq("passageiro_id", passageiroId)
      .order("ano_letivo", { ascending: true });
  },

  async update(id: string, data: Record<string, unknown>) {
    if (!data || Object.keys(data).length === 0) {
      return { data: null, error: null };
    }
    return supabaseAdmin
      .from("passageiros")
      .update(data)
      .eq("id", id)
      .select()
      .maybeSingle();
  },

  async delete(id: string) {
    return supabaseAdmin.from("passageiros").delete().eq("id", id);
  },

  async findByIds(ids: string[]) {
    return supabaseAdmin
      .from("passageiros")
      .select("id, usuario_id, veiculo_id")
      .in("id", ids);
  },

  async getSummaryForDashboard(usuarioId: string, veiculoId?: string) {
    let query = supabaseAdmin
      .from("passageiro_matriculas")
      .select("passageiro_id, ativo, isento, valor_cobranca, dia_vencimento, data_inicio_cobranca, data_fim_cobranca, created_at, ano_letivo")
      .eq("usuario_id", usuarioId);

    if (isValidFilterValue(veiculoId)) {
      query = query.eq("veiculo_id", veiculoId);
    }

    const { data, error } = await query;
    if (error) return { data: null, error };

    const mapped = (data || []).map((m) => ({
      id: m.passageiro_id,
      ativo: m.ativo,
      isento: m.isento,
      valor_cobranca: m.valor_cobranca,
      dia_vencimento: m.dia_vencimento,
      data_inicio_cobranca: m.data_inicio_cobranca,
      data_fim_cobranca: m.data_fim_cobranca,
      created_at: m.created_at,
      ano_letivo: m.ano_letivo,
    }));

    return { data: mapped, error: null };
  },

  async getById(id: string, usuarioId?: string, anoLetivo?: number) {
    let query = supabaseAdmin
      .from("passageiros")
      .select(`
        *,
        escola:escolas(id, nome),
        veiculo:veiculos(id, placa, modelo),
        matriculas:passageiro_matriculas(
          *,
          escola:escolas(id, nome),
          veiculo:veiculos(id, placa, modelo)
        ),
        contratos(id, ano, status, provider, created_at, minuta_url, contrato_final_url, token_acesso),
        renovacoes:passageiro_renovacoes(id, ano_origem, ano_destino, status),
        ${PASSAGEIRO_RESPONSAVEIS_SELECT}
      `)
      .eq("id", id);

    if (isValidFilterValue(usuarioId)) {
      query = query.eq("usuario_id", usuarioId);
    }

    const { data, error } = await query
      .order("created_at", { foreignTable: "contratos", ascending: false })
      .maybeSingle();

    if (error || !data) return { data: null, error };

    const matriculas = (data.matriculas as Record<string, any>[]) || [];
    const targetMatricula = resolveMatriculaForYear(matriculas, anoLetivo);
    const overlaid = overlayMatriculaOnPassageiro(data, targetMatricula, matriculas);

    return { data: overlaid, error: null };
  },

  async list(usuarioId: string, filtros?: ListPassageirosFiltersDTO) {
    const hasPagination = Boolean((filtros?.page && filtros.page > 0) || (filtros?.limit && filtros.limit > 0));
    const page = filtros?.page && filtros.page > 0 ? Math.floor(filtros.page) : 1;
    const limit = filtros?.limit && filtros.limit > 0 ? Math.floor(filtros.limit) : 50;
    const targetAno = isValidFilterValue(filtros?.ano_letivo)
      ? Number(filtros?.ano_letivo)
      : getNowBR().getFullYear();

    let query = supabaseAdmin
      .from("passageiros")
      .select(`
        id, usuario_id, nome, ativo, isento, data_nascimento, genero, modalidade, periodo, turma, sala, nome_professor, observacoes, valor_cobranca, dia_vencimento, data_inicio_cobranca, data_fim_cobranca, data_inicio_transporte, data_fim_transporte, horario_entrada, horario_saida, enviar_notificacoes, modo_cobranca, escola_id, veiculo_id, ano_letivo, created_at, updated_at,
        matriculas:passageiro_matriculas!inner(
          id, ano_letivo, ativo, isento, modalidade, periodo, turma, sala, nome_professor, valor_cobranca, dia_vencimento, data_inicio_cobranca, data_fim_cobranca, data_inicio_transporte, data_fim_transporte, horario_entrada, horario_saida, modo_cobranca, escola_id, veiculo_id, created_at, updated_at,
          escola:escolas(id, nome),
          veiculo:veiculos(id, placa, modelo)
        ),
        todas_matriculas:passageiro_matriculas(ano_letivo),
        contratos(id, ano, status, provider, token_acesso, created_at),
        responsaveis:passageiro_responsaveis(
          id, tipo, parentesco,
          responsavel:responsaveis(id, nome, telefone, cpf, email, logradouro, numero, bairro, cidade, estado, cep, referencia, complemento)
        )
      `, hasPagination ? { count: "exact" } : undefined)
      .eq("usuario_id", usuarioId)
      .eq("matriculas.ano_letivo", targetAno)
      .order("nome", { ascending: true })
      .order("created_at", { foreignTable: "contratos", ascending: false });

    if (isValidFilterValue(filtros?.search)) {
      const sanitizedSearch = filtros.search.replace(/[,()%\\]/g, "").trim();
      if (sanitizedSearch) {
        query = query.or(`nome.ilike.%${sanitizedSearch}%`);
      }
    }

    if (isValidFilterValue(filtros?.escola)) query = query.eq("matriculas.escola_id", filtros.escola);
    if (isValidFilterValue(filtros?.veiculo)) query = query.eq("matriculas.veiculo_id", filtros.veiculo);
    if (isValidFilterValue(filtros?.periodo)) query = query.eq("matriculas.periodo", filtros.periodo.toLowerCase());

    const rawAtivo = filtros?.ativo ?? filtros?.status;
    if (isValidFilterValue(rawAtivo)) {
      const isAtivoBool = rawAtivo === "true" || rawAtivo === "ativo";
      query = query.eq("matriculas.ativo", isAtivoBool);
    }

    if (hasPagination) {
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);
    }

    const { data, count, error } = await query;
    if (error || !data) return { data: null, count: 0, error };

    const mapped = (data as Record<string, any>[]).map((p) => {
      const matList = (p.matriculas as Record<string, any>[]) || [];
      const todasMatList = (p.todas_matriculas as Record<string, any>[]) || matList;
      const mat = matList[0] || null;
      const overlaid = overlayMatriculaOnPassageiro(p, mat, todasMatList);
      delete (overlaid as Record<string, any>).matriculas;
      delete (overlaid as Record<string, any>).todas_matriculas;
      return overlaid;
    });

    return { data: mapped, count, error: null };
  },

  async updateAtivo(id: string, ativo: boolean, anoLetivo?: number) {
    const targetAno = anoLetivo || getNowBR().getFullYear();
    const res = await supabaseAdmin
      .from("passageiro_matriculas")
      .update({ ativo })
      .eq("passageiro_id", id)
      .eq("ano_letivo", targetAno);

    if (targetAno === getNowBR().getFullYear()) {
      await supabaseAdmin
        .from("passageiros")
        .update({ ativo })
        .eq("id", id);
    }

    return res;
  },

  async getUsuarioIdAndNome(id: string) {
    return supabaseAdmin
      .from("passageiros")
      .select("usuario_id, nome")
      .eq("id", id)
      .single();
  },

  async countByUsuario(usuarioId: string, filtros?: { ativo?: string; veiculo?: string; ano_letivo?: number | string }) {
    const targetAno = isValidFilterValue(filtros?.ano_letivo)
      ? Number(filtros?.ano_letivo)
      : getNowBR().getFullYear();

    let query = supabaseAdmin
      .from("passageiro_matriculas")
      .select("id", { count: "exact", head: true })
      .eq("usuario_id", usuarioId)
      .eq("ano_letivo", targetAno);

    if (isValidFilterValue(filtros?.ativo)) query = query.eq("ativo", filtros.ativo === "true");
    if (isValidFilterValue(filtros?.veiculo)) query = query.eq("veiculo_id", filtros.veiculo);

    return query;
  },

  async lookupResponsavel(usuarioId: string, termoLimpo: string) {
    let query = supabaseAdmin
      .from("responsaveis")
      .select("id, nome, telefone, email, cpf, logradouro, numero, bairro, cidade, estado, cep, referencia, complemento");

    const clean = normalizePhone(termoLimpo) || termoLimpo;

    if (clean.length === 11) {
      query = query.or(`cpf.eq.${clean},telefone.eq.${clean}`);
    } else if (clean.length === 10) {
      query = query.eq("telefone", clean);
    } else {
      return { data: null, error: null };
    }

    const { data: responsavel, error } = await query.limit(1).maybeSingle();

    if (error || !responsavel) return { data: null, error };
    return {
      data: {
        id: responsavel.id,
        nome: responsavel.nome,
        telefone: responsavel.telefone,
        email: responsavel.email,
        cpf: responsavel.cpf,
        logradouro: responsavel.logradouro,
        numero: responsavel.numero,
        bairro: responsavel.bairro,
        cidade: responsavel.cidade,
        estado: responsavel.estado,
        cep: responsavel.cep,
        referencia: responsavel.referencia,
        complemento: responsavel.complemento,
      },
      error: null
    };
  },

  async getResponsavelInfo(id: string, anoLetivo?: number) {
    const { data, error } = await supabaseAdmin
      .from("passageiros")
      .select(`
        id, nome, isento, genero, ano_letivo,
        matriculas:passageiro_matriculas(ano_letivo, isento),
        ${PASSAGEIRO_RESPONSAVEIS_SELECT}
      `)
      .eq("id", id)
      .single();

    if (error) throw error;

    const matriculas = (data.matriculas as Record<string, any>[]) || [];
    const targetMat = resolveMatriculaForYear(matriculas, anoLetivo);

    const respLink = (data.responsaveis as any[])?.find((r: any) => r.tipo === TipoResponsavel.PRINCIPAL) || (data.responsaveis as any[])?.[0];
    const resp = Array.isArray(respLink?.responsavel) ? respLink.responsavel[0] : (respLink?.responsavel || null);

    return {
      id: data.id,
      nome: data.nome,
      isento: targetMat ? targetMat.isento : data.isento,
      genero: (data.genero as string | null) || null,
      ano_letivo: targetMat ? targetMat.ano_letivo : (data.ano_letivo ?? null),
      responsavel_principal: resp?.id ? {
        id: resp.id,
        nome: resp.nome || null,
        cpf: resp.cpf || null,
        telefone: resp.telefone || null,
        email: resp.email || null,
        parentesco: respLink?.parentesco || null,
        logradouro: resp.logradouro || null,
        numero: resp.numero || null,
        bairro: resp.bairro || null,
        cidade: resp.cidade || null,
        estado: resp.estado || null,
        cep: resp.cep || null,
        referencia: resp.referencia || null,
        complemento: resp.complemento || null,
        notificacoes_rota_habilitadas: respLink?.notificacoes_rota_habilitadas ?? true,
      } : null
    };
  },

  async getResponsaveisNotificacaoRota(passageiroId: string): Promise<Array<{ id: string; nome: string; telefone: string; tipo: string; parentesco: string | null }>> {
    const { data, error } = await supabaseAdmin
      .from("passageiros")
      .select(`
        id,
        enviar_notificacoes,
        ${PASSAGEIRO_RESPONSAVEIS_SELECT}
      `)
      .eq("id", passageiroId)
      .single();

    if (error || !data) return [];
    if (data.enviar_notificacoes === false) return [];

    const rawLinks = (data.responsaveis as any[]) || [];
    const habilitados = rawLinks.filter((l: any) => l.notificacoes_rota_habilitadas !== false);

    const result: Array<{ id: string; nome: string; telefone: string; tipo: string; parentesco: string | null }> = [];

    for (const link of habilitados) {
      const resp = Array.isArray(link.responsavel) ? link.responsavel[0] : link.responsavel;
      if (resp?.telefone && resp.telefone.trim() !== "") {
        result.push({
          id: resp.id,
          nome: resp.nome || "Responsável",
          telefone: resp.telefone.trim(),
          tipo: link.tipo,
          parentesco: link.parentesco || null,
        });
      }
    }

    return result;
  },

  async listParaCobrancaAutomatica(usuarioId: string, targetMonth?: number, targetYear?: number) {
    let query = supabaseAdmin
      .from("passageiro_matriculas")
      .select(`
        id, passageiro_id, valor_cobranca, dia_vencimento, created_at, data_inicio_cobranca, data_fim_cobranca, isento, ano_letivo, modo_cobranca, ativo,
        passageiro:passageiros!inner(
          id,
          nome,
          created_at,
          ${PASSAGEIRO_RESPONSAVEIS_SELECT}
        )
      `)
      .eq("usuario_id", usuarioId)
      .eq("ativo", true)
      .or("isento.eq.false,isento.is.null");

    if (targetYear) {
      query = query.in("ano_letivo", [targetYear - 1, targetYear, targetYear + 1]);
    }

    const { data, error } = await query.order("ano_letivo", { ascending: true });
    if (error || !data) return { data: null, error };

    const selectedByPassageiro = new Map<string, Record<string, any>>();
    for (const row of data as Record<string, any>[]) {
      const p = Array.isArray(row.passageiro) ? row.passageiro[0] : row.passageiro;
      if (!p) continue;

      if (targetMonth && targetYear) {
        if (!isMatriculaCoveringMonthYear(row, targetMonth, targetYear)) {
          continue;
        }
      }

      if (!selectedByPassageiro.has(row.passageiro_id) || Number(row.ano_letivo) === targetYear) {
        selectedByPassageiro.set(row.passageiro_id, {
          id: row.passageiro_id,
          nome: p.nome,
          valor_cobranca: row.valor_cobranca,
          dia_vencimento: row.dia_vencimento,
          created_at: row.created_at || p.created_at,
          data_inicio_cobranca: row.data_inicio_cobranca,
          data_fim_cobranca: row.data_fim_cobranca,
          isento: row.isento,
          ano_letivo: row.ano_letivo,
          modo_cobranca: row.modo_cobranca,
          responsaveis: p.responsaveis,
        });
      }
    }

    return { data: Array.from(selectedByPassageiro.values()), error: null };
  },

  async listAtivosParaProjecao(usuarioId: string, veiculoId?: string, targetMonth?: number, targetYear?: number) {
    let query = supabaseAdmin
      .from("passageiro_matriculas")
      .select(`
        id, passageiro_id, valor_cobranca, dia_vencimento, created_at, data_inicio_cobranca, data_fim_cobranca, isento, ativo, veiculo_id, ano_letivo, modo_cobranca,
        passageiro:passageiros!inner(
          id,
          nome,
          created_at,
          responsaveis:passageiro_responsaveis(
            id, tipo, parentesco,
            responsavel:responsaveis(id, nome, telefone, cpf, email)
          )
        )
      `)
      .eq("usuario_id", usuarioId)
      .eq("ativo", true)
      .or("isento.eq.false,isento.is.null");

    if (isValidFilterValue(veiculoId)) {
      query = query.eq("veiculo_id", veiculoId);
    }

    if (targetYear) {
      query = query.in("ano_letivo", [targetYear - 1, targetYear, targetYear + 1]);
    }

    const { data, error } = await query.order("ano_letivo", { ascending: true });
    if (error || !data) return { data: null, error };

    const selectedByPassageiro = new Map<string, Record<string, any>>();
    for (const row of data as Record<string, any>[]) {
      const p = Array.isArray(row.passageiro) ? row.passageiro[0] : row.passageiro;
      if (!p) continue;

      if (targetMonth && targetYear) {
        if (!isMatriculaCoveringMonthYear(row, targetMonth, targetYear)) {
          continue;
        }
      }

      if (!selectedByPassageiro.has(row.passageiro_id) || Number(row.ano_letivo) === targetYear) {
        selectedByPassageiro.set(row.passageiro_id, {
          id: row.passageiro_id,
          nome: p.nome,
          valor_cobranca: row.valor_cobranca,
          dia_vencimento: row.dia_vencimento,
          created_at: row.created_at || p.created_at,
          data_inicio_cobranca: row.data_inicio_cobranca,
          data_fim_cobranca: row.data_fim_cobranca,
          isento: row.isento,
          ativo: row.ativo,
          veiculo_id: row.veiculo_id,
          ano_letivo: row.ano_letivo,
          modo_cobranca: row.modo_cobranca,
          responsaveis: p.responsaveis,
        });
      }
    }

    return { data: Array.from(selectedByPassageiro.values()), error: null };
  },

  async listAniversariantesInfo(usuarioId: string, veiculoId?: string) {
    const currentYear = getNowBR().getFullYear();
    let query = supabaseAdmin
      .from("passageiro_matriculas")
      .select(`
        passageiro_id,
        veiculo:veiculos(id, placa, modelo),
        escola:escolas(id, nome),
        passageiro:passageiros!inner(
          id,
          nome,
          data_nascimento
        )
      `)
      .eq("usuario_id", usuarioId)
      .eq("ano_letivo", currentYear)
      .eq("ativo", true);

    if (isValidFilterValue(veiculoId)) {
      query = query.eq("veiculo_id", veiculoId);
    }

    const { data, error } = await query;
    if (error || !data) return { data: null, error };

    const mapped = (data as Record<string, any>[])
      .map((row) => {
        const p = Array.isArray(row.passageiro) ? row.passageiro[0] : row.passageiro;
        return {
          id: row.passageiro_id,
          nome: p?.nome || "",
          data_nascimento: p?.data_nascimento || null,
          veiculo: row.veiculo,
          escola: row.escola,
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));

    return { data: mapped, error: null };
  },

  async upsertResponsavel(data: {
    telefone: string;
    nome: string;
    cpf?: string | null;
    email?: string | null;
    pin_acesso?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    estado?: string | null;
    cep?: string | null;
    referencia?: string | null;
    complemento?: string | null;
  }) {
    const targetPhone = normalizePhone(data.telefone) || data.telefone;

    const { data: existing } = await supabaseAdmin
      .from("responsaveis")
      .select("*")
      .eq("telefone", targetPhone)
      .maybeSingle();

    if (existing) {
      const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
      if (!existing.nome && data.nome) updatePayload.nome = data.nome;
      if (!existing.cpf && data.cpf) updatePayload.cpf = data.cpf;
      if (!existing.email && data.email) updatePayload.email = data.email;
      if (!existing.pin_acesso && data.pin_acesso) updatePayload.pin_acesso = data.pin_acesso;
      if (!existing.logradouro && data.logradouro) updatePayload.logradouro = data.logradouro;
      if (!existing.numero && data.numero) updatePayload.numero = data.numero;
      if (!existing.bairro && data.bairro) updatePayload.bairro = data.bairro;
      if (!existing.cidade && data.cidade) updatePayload.cidade = data.cidade;
      if (!existing.estado && data.estado) updatePayload.estado = data.estado;
      if (!existing.cep && data.cep) updatePayload.cep = data.cep;
      if (!existing.referencia && data.referencia) updatePayload.referencia = data.referencia;
      if (!existing.complemento && data.complemento) updatePayload.complemento = data.complemento;

      if (Object.keys(updatePayload).length > 1) {
        const { data: updated, error } = await supabaseAdmin
          .from("responsaveis")
          .update(updatePayload)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return updated;
      }

      return existing;
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("responsaveis")
      .insert([{
        telefone: targetPhone,
        nome: data.nome,
        cpf: data.cpf || null,
        email: data.email || null,
        pin_acesso: data.pin_acesso || null,
        logradouro: data.logradouro || null,
        numero: data.numero || null,
        bairro: data.bairro || null,
        cidade: data.cidade || null,
        estado: data.estado || null,
        cep: data.cep || null,
        referencia: data.referencia || null,
        complemento: data.complemento || null,
      }])
      .select()
      .single();

    if (error) throw error;
    return inserted;
  },

  async linkPassageiroResponsavel(passageiroId: string, responsavelId: string, tipo: string = TipoResponsavel.PRINCIPAL, parentesco?: string | null, notificacoes_rota_habilitadas?: boolean) {
    if (tipo === TipoResponsavel.PRINCIPAL) {
      await supabaseAdmin
        .from("passageiro_responsaveis")
        .update({ tipo: TipoResponsavel.ADICIONAL, updated_at: new Date().toISOString() })
        .eq("passageiro_id", passageiroId)
        .eq("tipo", TipoResponsavel.PRINCIPAL);
    }

    const { data: link, error } = await supabaseAdmin
      .from("passageiro_responsaveis")
      .upsert({
        passageiro_id: passageiroId,
        responsavel_id: responsavelId,
        tipo,
        parentesco: parentesco !== undefined ? (parentesco || null) : undefined,
        notificacoes_rota_habilitadas: notificacoes_rota_habilitadas !== undefined ? notificacoes_rota_habilitadas : true,
        updated_at: new Date().toISOString()
      }, { onConflict: "passageiro_id,responsavel_id" })
      .select()
      .single();

    if (error) throw error;
    return link;
  },

  async removePassageiroResponsavelLink(passageiroId: string, responsavelId: string) {
    const { error } = await supabaseAdmin
      .from("passageiro_responsaveis")
      .delete()
      .eq("passageiro_id", passageiroId)
      .eq("responsavel_id", responsavelId);

    if (error) throw error;
    return true;
  },

  async insertResponsavelAdicional(data: Record<string, any>) {
    return this.upsertResponsavel({
      telefone: String(data.telefone || "").replace(/\D/g, ""),
      nome: data.nome,
      cpf: data.cpf,
      email: data.email,
      logradouro: data.logradouro,
      numero: data.numero,
      bairro: data.bairro,
      cidade: data.cidade,
      estado: data.estado,
      cep: data.cep,
      referencia: data.referencia,
      complemento: data.complemento,
    });
  },

  async updateResponsavelAdicional(id: string, data: Record<string, any>) {
    const { data: updated, error } = await supabaseAdmin
      .from("responsaveis")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    return { data: updated, error };
  },

  async deleteResponsavelAdicional(id: string, passageiroId?: string) {
    const { responsavelRepository } = await import("./responsavel.repository.js");
    await responsavelRepository.deleteResponsavelAdicional(id, passageiroId);
    return { error: null };
  },

  async getResponsavelAdicionalById(id: string) {
    const { data, error } = await supabaseAdmin
      .from("responsaveis")
      .select("*")
      .eq("id", id)
      .single();
    return { data, error };
  },

  async getContagemPassageirosAtivosPorMotorista(usuarioIds: string[]): Promise<Map<string, number>> {
    if (!usuarioIds.length) return new Map();

    const currentYear = getNowBR().getFullYear();
    const BATCH_SIZE = 100;
    const contagemPorMotorista = new Map<string, number>();

    for (let i = 0; i < usuarioIds.length; i += BATCH_SIZE) {
      const chunk = usuarioIds.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabaseAdmin
        .from("passageiro_matriculas")
        .select("usuario_id")
        .in("usuario_id", chunk)
        .eq("ano_letivo", currentYear)
        .eq("ativo", true);

      if (error) {
        throw error;
      }

      for (const p of data || []) {
        if (!p.usuario_id) continue;
        contagemPorMotorista.set(p.usuario_id, (contagemPorMotorista.get(p.usuario_id) || 0) + 1);
      }
    }

    return contagemPorMotorista;
  },

  async getMotoristasComPassageirosAtivos(usuarioIds: string[]): Promise<Set<string>> {
    const contagem = await this.getContagemPassageirosAtivosPorMotorista(usuarioIds);
    const ativos = new Set<string>();
    for (const [id, count] of contagem.entries()) {
      if (count > 0) ativos.add(id);
    }
    return ativos;
  }
};
