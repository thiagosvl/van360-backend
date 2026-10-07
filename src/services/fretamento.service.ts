import crypto from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import type {
  CriarFretamentoDTO,
  AtualizarFretamentoDTO,
  RegistrarPagamentoFretamentoDTO,
  AdicionarParticipanteDTO,
  AtualizarStatusParticipanteDTO,
  FretamentoDetalhesDTO,
  ResumoFinanceiroFretamentosDTO,
  FretamentoRow,
  FretamentoPagamentoStatus,
  FretamentoTipo,
  FretamentoStatus,
} from "../types/dtos/fretamento.dto.js";
import type { Tables } from "../types/database.types.js";

type PagamentoRel = Tables<"fretamento_pagamentos">;
type ParticipanteRel = Tables<"fretamento_participantes">;
type VeiculoRel = Tables<"fretamento_veiculos"> & {
  veiculos?: Pick<Tables<"veiculos">, "placa" | "modelo"> | null;
};
type UsuarioRel = Pick<Tables<"usuarios">, "nome" | "telefone">;

const gerarSlug = (titulo: string): string => {
  const base = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const hash = crypto.randomBytes(3).toString("hex");
  return `${base || "passeio"}-${hash}`;
};

const recalcularStatusPagamento = (
  valorTotal: number,
  totalPago: number
): FretamentoPagamentoStatus => {
  if (valorTotal <= 0) return "quitado";
  if (totalPago <= 0) return "pendente";
  if (totalPago >= valorTotal) return "quitado";
  return "pago_parcial";
};

export const fretamentoService = {
  async listar(
    usuarioId: string,
    mes: number,
    ano: number,
    tipo?: FretamentoTipo,
    status?: FretamentoStatus
  ) {
    const dataInicioMes = new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0)).toISOString();
    const dataFimMes = new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999)).toISOString();

    let query = supabaseAdmin
      .from("fretamentos")
      .select(`
        *,
        fretamento_veiculos (
          id,
          veiculo_id,
          vagas_capacidade,
          veiculos (
            id,
            placa,
            modelo
          )
        ),
        fretamento_pagamentos (
          id,
          valor,
          tipo_pagamento,
          data_pagamento,
          descricao,
          created_at
        ),
        fretamento_participantes (
          id,
          valor,
          status_pagamento,
          data_pagamento
        )
      `)
      .eq("usuario_id", usuarioId)
      .gte("data_inicio", dataInicioMes)
      .lte("data_inicio", dataFimMes)
      .order("data_inicio", { ascending: true });

    if (tipo) {
      query = query.eq("tipo", tipo);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw new AppError(error.message, 500);

    return (data || []).map((item) => {
      const pagamentos = (item.fretamento_pagamentos as unknown as PagamentoRel[]) || [];
      const participantes = (item.fretamento_participantes as unknown as ParticipanteRel[]) || [];
      const veiculos = (item.fretamento_veiculos as unknown as VeiculoRel[]) || [];

      const totalPagoFretamento = pagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0);
      const totalPagoParticipantes = participantes
        .filter((p) => p.status_pagamento === "pago")
        .reduce((acc, p) => acc + Number(p.valor || 0), 0);

      const totalPago = item.tipo === "fretamento" ? totalPagoFretamento : totalPagoParticipantes;
      const valorTotal = Number(item.valor_total || 0);

      return {
        ...item,
        veiculos: veiculos.map((v) => ({
          id: v.id,
          veiculo_id: v.veiculo_id,
          placa: v.veiculos?.placa,
          modelo: v.veiculos?.modelo,
          vagas_capacidade: v.vagas_capacidade,
        })),
        total_pago: totalPago,
        saldo_restante: Math.max(0, valorTotal - totalPago),
        vagas_ocupadas: participantes.length,
      };
    });
  },

  async obterPorId(usuarioId: string, id: string): Promise<FretamentoDetalhesDTO> {
    const { data, error } = await supabaseAdmin
      .from("fretamentos")
      .select(`
        *,
        fretamento_veiculos (
          id,
          veiculo_id,
          vagas_capacidade,
          veiculos (
            id,
            placa,
            modelo
          )
        ),
        fretamento_pagamentos (
          id,
          fretamento_id,
          valor,
          tipo_pagamento,
          data_pagamento,
          descricao,
          created_at
        ),
        fretamento_participantes (
          id,
          fretamento_id,
          passageiro_id,
          nome,
          is_proprio_responsavel,
          responsavel_nome,
          telefone,
          endereco,
          valor,
          status_pagamento,
          tipo_pagamento,
          data_pagamento,
          observacoes,
          created_at,
          updated_at
        )
      `)
      .eq("id", id)
      .eq("usuario_id", usuarioId)
      .single();

    if (error || !data) throw new AppError("Registro não encontrado", 404);

    const pagamentos = (data.fretamento_pagamentos as unknown as PagamentoRel[]) || [];
    const participantes = (data.fretamento_participantes as unknown as ParticipanteRel[]) || [];
    const veiculos = (data.fretamento_veiculos as unknown as VeiculoRel[]) || [];

    const totalPagoFretamento = pagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0);
    const totalPagoParticipantes = participantes
      .filter((p) => p.status_pagamento === "pago")
      .reduce((acc, p) => acc + Number(p.valor || 0), 0);

    const totalPago = data.tipo === "fretamento" ? totalPagoFretamento : totalPagoParticipantes;
    const valorTotal = Number(data.valor_total || 0);

    return {
      ...(data as FretamentoRow),
      veiculos: veiculos.map((v) => ({
        id: v.id,
        veiculo_id: v.veiculo_id,
        placa: v.veiculos?.placa,
        modelo: v.veiculos?.modelo,
        vagas_capacidade: v.vagas_capacidade,
      })),
      pagamentos,
      participantes,
      total_pago: totalPago,
      saldo_restante: Math.max(0, valorTotal - totalPago),
      vagas_ocupadas: participantes.length,
    };
  },

  async obterPublicoPorSlug(slug: string) {
    const { data, error } = await supabaseAdmin
      .from("fretamentos")
      .select(`
        id,
        tipo,
        titulo,
        origem,
        destino,
        data_inicio,
        data_fim,
        valor_por_pessoa,
        vagas_totais,
        chave_pix,
        observacoes,
        status,
        usuarios (
          nome,
          telefone
        ),
        fretamento_participantes (
          id
        )
      `)
      .eq("slug_publico", slug)
      .single();

    if (error || !data) throw new AppError("Passeio não encontrado ou encerrado", 404);
    if (data.status === "cancelado") throw new AppError("Este passeio foi cancelado", 400);

    const participantes = (data.fretamento_participantes as unknown as ParticipanteRel[]) || [];
    const vagasOcupadas = participantes.length;
    const vagasTotais = data.vagas_totais || null;
    const vagasDisponiveis = vagasTotais !== null ? Math.max(0, vagasTotais - vagasOcupadas) : null;
    const usuario = data.usuarios as unknown as UsuarioRel | null;

    return {
      id: data.id,
      titulo: data.titulo,
      origem: data.origem,
      destino: data.destino,
      data_inicio: data.data_inicio,
      data_fim: data.data_fim,
      valor_por_pessoa: data.valor_por_pessoa,
      vagas_totais: vagasTotais,
      vagas_ocupadas: vagasOcupadas,
      vagas_disponiveis: vagasDisponiveis,
      chave_pix: data.chave_pix,
      observacoes: data.observacoes,
      motorista_nome: usuario?.nome || null,
      motorista_telefone: usuario?.telefone || null,
    };
  },

  async criar(usuarioId: string, dados: CriarFretamentoDTO) {
    const slug = dados.tipo === "passeio" ? gerarSlug(dados.titulo) : null;
    const valorTotal = Number(dados.valor_total || 0);

    const { data: fretamento, error: fretamentoError } = await supabaseAdmin
      .from("fretamentos")
      .insert({
        usuario_id: usuarioId,
        tipo: dados.tipo,
        titulo: dados.titulo.trim(),
        origem: dados.origem ? dados.origem.trim() : null,
        destino: dados.destino.trim(),
        data_inicio: dados.data_inicio,
        data_fim: dados.data_fim || null,
        contratante_nome: dados.contratante_nome ? dados.contratante_nome.trim() : null,
        contratante_telefone: dados.contratante_telefone ? dados.contratante_telefone.trim() : null,
        valor_total: valorTotal,
        valor_por_pessoa: dados.valor_por_pessoa || null,
        vagas_totais: dados.vagas_totais || null,
        chave_pix: dados.chave_pix ? dados.chave_pix.trim() : null,
        observacoes: dados.observacoes ? dados.observacoes.trim() : null,
        status: "confirmado",
        status_pagamento: "pendente",
        slug_publico: slug,
      })
      .select()
      .single();

    if (fretamentoError || !fretamento) throw new AppError(fretamentoError?.message || "Erro ao criar registro", 500);

    if (dados.veiculos_ids && dados.veiculos_ids.length > 0) {
      const veiculosInserts = dados.veiculos_ids.map((veiculoId) => ({
        fretamento_id: fretamento.id,
        veiculo_id: veiculoId,
      }));
      await supabaseAdmin.from("fretamento_veiculos").insert(veiculosInserts);
    }

    if (dados.tipo === "fretamento" && dados.sinal_inicial && dados.sinal_inicial.valor > 0) {
      const dataPagamento = dados.sinal_inicial.data_pagamento || new Date().toISOString().split("T")[0];
      await supabaseAdmin.from("fretamento_pagamentos").insert({
        fretamento_id: fretamento.id,
        valor: dados.sinal_inicial.valor,
        tipo_pagamento: dados.sinal_inicial.tipo_pagamento,
        data_pagamento: dataPagamento,
        descricao: "Sinal inicial",
      });

      const novoStatus = recalcularStatusPagamento(valorTotal, dados.sinal_inicial.valor);
      await supabaseAdmin
        .from("fretamentos")
        .update({ status_pagamento: novoStatus })
        .eq("id", fretamento.id);
    }

    return this.obterPorId(usuarioId, fretamento.id);
  },

  async atualizar(usuarioId: string, id: string, dados: AtualizarFretamentoDTO) {
    const fretamentoAtual = await this.obterPorId(usuarioId, id);

    const updatePayload: Record<string, unknown> = {};
    if (dados.titulo !== undefined) updatePayload.titulo = dados.titulo.trim();
    if (dados.origem !== undefined) updatePayload.origem = dados.origem ? dados.origem.trim() : null;
    if (dados.destino !== undefined) updatePayload.destino = dados.destino.trim();
    if (dados.data_inicio !== undefined) updatePayload.data_inicio = dados.data_inicio;
    if (dados.data_fim !== undefined) updatePayload.data_fim = dados.data_fim || null;
    if (dados.contratante_nome !== undefined) updatePayload.contratante_nome = dados.contratante_nome ? dados.contratante_nome.trim() : null;
    if (dados.contratante_telefone !== undefined) updatePayload.contratante_telefone = dados.contratante_telefone ? dados.contratante_telefone.trim() : null;
    if (dados.valor_total !== undefined) {
      updatePayload.valor_total = dados.valor_total;
      updatePayload.status_pagamento = recalcularStatusPagamento(dados.valor_total, fretamentoAtual.total_pago);
    }
    if (dados.valor_por_pessoa !== undefined) updatePayload.valor_por_pessoa = dados.valor_por_pessoa;
    if (dados.vagas_totais !== undefined) updatePayload.vagas_totais = dados.vagas_totais;
    if (dados.chave_pix !== undefined) updatePayload.chave_pix = dados.chave_pix ? dados.chave_pix.trim() : null;
    if (dados.observacoes !== undefined) updatePayload.observacoes = dados.observacoes ? dados.observacoes.trim() : null;
    if (dados.status !== undefined) updatePayload.status = dados.status;

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await supabaseAdmin
        .from("fretamentos")
        .update(updatePayload)
        .eq("id", id)
        .eq("usuario_id", usuarioId);

      if (error) throw new AppError(error.message, 500);
    }

    if (dados.veiculos_ids !== undefined) {
      await supabaseAdmin.from("fretamento_veiculos").delete().eq("fretamento_id", id);
      if (dados.veiculos_ids.length > 0) {
        const veiculosInserts = dados.veiculos_ids.map((veiculoId) => ({
          fretamento_id: id,
          veiculo_id: veiculoId,
        }));
        await supabaseAdmin.from("fretamento_veiculos").insert(veiculosInserts);
      }
    }

    return this.obterPorId(usuarioId, id);
  },

  async deletar(usuarioId: string, id: string) {
    await this.obterPorId(usuarioId, id);
    const { error } = await supabaseAdmin
      .from("fretamentos")
      .delete()
      .eq("id", id)
      .eq("usuario_id", usuarioId);

    if (error) throw new AppError(error.message, 500);
    return { success: true };
  },

  async registrarPagamento(usuarioId: string, fretamentoId: string, dados: RegistrarPagamentoFretamentoDTO) {
    const fretamento = await this.obterPorId(usuarioId, fretamentoId);
    if (fretamento.tipo !== "fretamento") {
      throw new AppError("Pagamentos avulsos são aplicáveis apenas à modalidade de fretamento", 400);
    }

    const dataPagamento = dados.data_pagamento || new Date().toISOString().split("T")[0];

    const { error: insertError } = await supabaseAdmin.from("fretamento_pagamentos").insert({
      fretamento_id: fretamentoId,
      valor: dados.valor,
      tipo_pagamento: dados.tipo_pagamento,
      data_pagamento: dataPagamento,
      descricao: dados.descricao ? dados.descricao.trim() : null,
    });

    if (insertError) throw new AppError(insertError.message, 500);

    const novoTotalPago = fretamento.total_pago + dados.valor;
    const novoStatus = recalcularStatusPagamento(Number(fretamento.valor_total || 0), novoTotalPago);

    await supabaseAdmin
      .from("fretamentos")
      .update({ status_pagamento: novoStatus })
      .eq("id", fretamentoId);

    return this.obterPorId(usuarioId, fretamentoId);
  },

  async deletarPagamento(usuarioId: string, fretamentoId: string, pagamentoId: string) {
    const fretamento = await this.obterPorId(usuarioId, fretamentoId);

    const pagamentoAlvo = fretamento.pagamentos.find((p) => p.id === pagamentoId);
    if (!pagamentoAlvo) throw new AppError("Pagamento não encontrado", 404);

    const { error } = await supabaseAdmin
      .from("fretamento_pagamentos")
      .delete()
      .eq("id", pagamentoId)
      .eq("fretamento_id", fretamentoId);

    if (error) throw new AppError(error.message, 500);

    const novoTotalPago = Math.max(0, fretamento.total_pago - Number(pagamentoAlvo.valor || 0));
    const novoStatus = recalcularStatusPagamento(Number(fretamento.valor_total || 0), novoTotalPago);

    await supabaseAdmin
      .from("fretamentos")
      .update({ status_pagamento: novoStatus })
      .eq("id", fretamentoId);

    return this.obterPorId(usuarioId, fretamentoId);
  },

  async adicionarParticipante(fretamentoId: string, dados: AdicionarParticipanteDTO, isPublico: boolean = false) {
    const { data: fretamento, error } = await supabaseAdmin
      .from("fretamentos")
      .select("id, tipo, status, vagas_totais, valor_por_pessoa, valor_total")
      .eq("id", fretamentoId)
      .single();

    if (error || !fretamento) throw new AppError("Passeio não encontrado", 404);
    if (fretamento.tipo !== "passeio") throw new AppError("Participantes só podem ser adicionados a passeios", 400);
    if (fretamento.status === "cancelado") throw new AppError("Este passeio foi cancelado", 400);

    const { count } = await supabaseAdmin
      .from("fretamento_participantes")
      .select("*", { count: "exact", head: true })
      .eq("fretamento_id", fretamentoId);

    const vagasTotais = fretamento.vagas_totais;
    if (vagasTotais !== null && vagasTotais !== undefined && (count || 0) >= vagasTotais) {
      throw new AppError("Vagas esgotadas para este passeio", 400);
    }

    const valorParticipante = dados.valor !== undefined ? dados.valor : Number(fretamento.valor_por_pessoa || 0);

    const { data: participante, error: insertError } = await supabaseAdmin
      .from("fretamento_participantes")
      .insert({
        fretamento_id: fretamentoId,
        passageiro_id: dados.passageiro_id || null,
        nome: dados.nome.trim(),
        is_proprio_responsavel: dados.is_proprio_responsavel || false,
        responsavel_nome: dados.is_proprio_responsavel ? dados.nome.trim() : (dados.responsavel_nome ? dados.responsavel_nome.trim() : null),
        telefone: dados.telefone ? dados.telefone.trim() : null,
        endereco: dados.endereco ? dados.endereco.trim() : null,
        valor: valorParticipante,
        status_pagamento: "pendente",
        observacoes: dados.observacoes ? dados.observacoes.trim() : null,
      })
      .select()
      .single();

    if (insertError || !participante) throw new AppError(insertError?.message || "Erro ao adicionar participante", 500);

    const novoValorTotal = Number(fretamento.valor_total || 0) + valorParticipante;
    await supabaseAdmin
      .from("fretamentos")
      .update({ valor_total: novoValorTotal })
      .eq("id", fretamentoId);

    return participante;
  },

  async atualizarStatusParticipante(
    usuarioId: string,
    fretamentoId: string,
    participanteId: string,
    dados: AtualizarStatusParticipanteDTO
  ) {
    await this.obterPorId(usuarioId, fretamentoId);

    const updatePayload: Record<string, unknown> = {
      status_pagamento: dados.status_pagamento,
    };

    if (dados.status_pagamento === "pago") {
      updatePayload.data_pagamento = new Date().toISOString();
      if (dados.tipo_pagamento) {
        updatePayload.tipo_pagamento = dados.tipo_pagamento;
      }
    } else {
      updatePayload.data_pagamento = null;
    }

    const { error } = await supabaseAdmin
      .from("fretamento_participantes")
      .update(updatePayload)
      .eq("id", participanteId)
      .eq("fretamento_id", fretamentoId);

    if (error) throw new AppError(error.message, 500);

    return this.obterPorId(usuarioId, fretamentoId);
  },

  async removerParticipante(usuarioId: string, fretamentoId: string, participanteId: string) {
    const fretamento = await this.obterPorId(usuarioId, fretamentoId);

    const participante = fretamento.participantes.find((p) => p.id === participanteId);
    if (!participante) throw new AppError("Participante não encontrado", 404);

    const { error } = await supabaseAdmin
      .from("fretamento_participantes")
      .delete()
      .eq("id", participanteId)
      .eq("fretamento_id", fretamentoId);

    if (error) throw new AppError(error.message, 500);

    const novoValorTotal = Math.max(0, Number(fretamento.valor_total || 0) - Number(participante.valor || 0));
    await supabaseAdmin
      .from("fretamentos")
      .update({ valor_total: novoValorTotal })
      .eq("id", fretamentoId);

    return this.obterPorId(usuarioId, fretamentoId);
  },

  async obterResumoFinanceiro(usuarioId: string, mes: number, ano: number): Promise<ResumoFinanceiroFretamentosDTO> {
    const dataInicioMesStr = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dataFimMesStr = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

    const dataInicioMesUtc = new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0)).toISOString();
    const dataFimMesUtc = new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999)).toISOString();

    const { data: fretamentosDoMes } = await supabaseAdmin
      .from("fretamentos")
      .select("id, tipo, valor_total, status")
      .eq("usuario_id", usuarioId)
      .gte("data_inicio", dataInicioMesUtc)
      .lte("data_inicio", dataFimMesUtc)
      .neq("status", "cancelado");

    const itens = fretamentosDoMes || [];
    const totalFaturadoPrevisto = itens.reduce((acc, f) => acc + Number(f.valor_total || 0), 0);
    const qtdFretamentos = itens.filter((f) => f.tipo === "fretamento").length;
    const qtdPasseios = itens.filter((f) => f.tipo === "passeio").length;

    const { data: pagamentosRecebidos } = await supabaseAdmin
      .from("fretamento_pagamentos")
      .select("valor, fretamentos!inner(usuario_id)")
      .eq("fretamentos.usuario_id", usuarioId)
      .gte("data_pagamento", dataInicioMesStr)
      .lte("data_pagamento", dataFimMesStr);

    const totalPagamentosRecebidos = (pagamentosRecebidos || []).reduce(
      (acc, p) => acc + Number(p.valor || 0),
      0
    );

    const { data: participantesRecebidos } = await supabaseAdmin
      .from("fretamento_participantes")
      .select("valor, fretamentos!inner(usuario_id)")
      .eq("fretamentos.usuario_id", usuarioId)
      .eq("status_pagamento", "pago")
      .gte("data_pagamento", dataInicioMesUtc)
      .lte("data_pagamento", dataFimMesUtc);

    const totalParticipantesRecebidos = (participantesRecebidos || []).reduce(
      (acc, p) => acc + Number(p.valor || 0),
      0
    );

    const totalRecebido = totalPagamentosRecebidos + totalParticipantesRecebidos;
    const totalAReceber = Math.max(0, totalFaturadoPrevisto - totalRecebido);

    return {
      mes,
      ano,
      total_faturado_previsto: totalFaturadoPrevisto,
      total_recebido: totalRecebido,
      total_a_receber: totalAReceber,
      quantidade_fretamentos: qtdFretamentos,
      quantidade_passeios: qtdPasseios,
    };
  },
};
