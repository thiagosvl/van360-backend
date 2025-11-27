import { PLANO_COMPLETO } from "../config/contants";
import { supabaseAdmin } from "../config/supabase";
import { cleanString, moneyToNumber, onlyDigits, toLocalDateString } from "../utils/utils";
import { cobrancaService } from "./cobranca.service";

// Métodos privados auxiliares
const _preparePassageiroData = (data: any, usuarioId: string, ativoDefault: boolean = true): any => {
    // Remover campos que não pertencem à tabela passageiros
    const { emitir_cobranca_mes_atual: _, ...pureData } = data;

    return {
        ...pureData,
        nome: cleanString(pureData.nome, true),
        nome_responsavel: cleanString(pureData.nome_responsavel, true),
        email_responsavel: cleanString(pureData.email_responsavel),
        logradouro: cleanString(pureData.logradouro, true),
        bairro: cleanString(pureData.bairro, true),
        cidade: cleanString(pureData.cidade, true),
        referencia: cleanString(pureData.referencia, true),
        observacoes: cleanString(pureData.observacoes, true),
        valor_cobranca: typeof pureData.valor_cobranca === "string" ? moneyToNumber(pureData.valor_cobranca) : pureData.valor_cobranca,
        dia_vencimento: Number(pureData.dia_vencimento),
        escola_id: pureData.escola_id || null,
        ativo: pureData.ativo ?? ativoDefault,
        usuario_id: usuarioId,
        cpf_responsavel: pureData.cpf_responsavel ? onlyDigits(pureData.cpf_responsavel) : null,
        telefone_responsavel: pureData.telefone_responsavel ? onlyDigits(pureData.telefone_responsavel) : null,
        enviar_cobranca_automatica: pureData.enviar_cobranca_automatica || false,
    };
};

const _createCobrancaMesAtual = async (
    passageiroId: string,
    passageiroData: any,
    usuarioId: string
): Promise<any> => {
    const currentDate = new Date();
    const mes = currentDate.getMonth() + 1;
    const ano = currentDate.getFullYear();
    const diaInformado = passageiroData.dia_vencimento;
    const hoje = currentDate.getDate();
    const vencimentoAjustado = diaInformado < hoje ? hoje : diaInformado;
    const dataVencimento = new Date(ano, mes - 1, vencimentoAjustado);

    return await cobrancaService.createCobranca({
        passageiro_id: passageiroId,
        mes,
        ano,
        valor: passageiroData.valor_cobranca,
        data_vencimento: toLocalDateString(dataVencimento),
        status: "pendente",
        usuario_id: usuarioId,
        origem: "automatica",
    });
};

export const passageiroService = {
    async createPassageiro(data: any): Promise<any> {
        if (!data.usuario_id) throw new Error("Usuário obrigatório");

        const emitir_cobranca_mes_atual = data.emitir_cobranca_mes_atual;
        const passageiroData = _preparePassageiroData(data, data.usuario_id, true);

        let newPassageiro: any = null;
        let payment: any = null;

        try {
            const { data: inserted, error } = await supabaseAdmin
                .from("passageiros")
                .insert([passageiroData])
                .select()
                .single();
            if (error) throw error;
            newPassageiro = inserted;

            if (emitir_cobranca_mes_atual) {
                payment = await _createCobrancaMesAtual(
                    newPassageiro.id,
                    passageiroData,
                    data.usuario_id
                );
            }

            return { newPassageiro, payment };
        } catch (err: any) {
            if (newPassageiro?.id) {
                await supabaseAdmin.from("passageiros").delete().eq("id", newPassageiro.id);
            }
            throw new Error(err.message || "Erro ao criar passageiro");
        }
    },

    async finalizePreCadastro(
        prePassageiroId: string,
        data: any,
        usuarioId: string,
        emitir_cobranca_mes_atual: boolean
    ): Promise<{ newPassageiro: any; payment?: any }> {
        if (!prePassageiroId) throw new Error("ID do pré-passageiro é obrigatório");
        if (!usuarioId) throw new Error("Usuário obrigatório");

        // Preparar dados do passageiro (sempre ativo para pré-cadastros finalizados)
        const passageiroData = _preparePassageiroData(data, usuarioId, true);

        let newPassageiro: any = null;
        let payment: any = null;

        try {
            // Criar passageiro
            const { data: inserted, error: insertPassageiroError } = await supabaseAdmin
                .from("passageiros")
                .insert([passageiroData])
                .select()
                .single();

            if (insertPassageiroError) throw insertPassageiroError;
            newPassageiro = inserted;

            // Criar cobrança do mês atual se necessário
            if (emitir_cobranca_mes_atual) {
                payment = await _createCobrancaMesAtual(
                    newPassageiro.id,
                    passageiroData,
                    usuarioId
                );
            }

            // Deletar pré-passageiro após sucesso
            const { error: deletePreError } = await supabaseAdmin
                .from("pre_passageiros")
                .delete()
                .eq("id", prePassageiroId);

            if (deletePreError) {
                throw new Error("Falha crítica ao finalizar o pré-cadastro. Acionando reversão.");
            }

            return { newPassageiro, payment };
        } catch (err: any) {
            // Rollback: deletar passageiro criado em caso de erro
            if (newPassageiro?.id) {
                await supabaseAdmin.from("passageiros").delete().eq("id", newPassageiro.id);
            }
            throw new Error(err.message || "Erro desconhecido ao processar o cadastro.");
        }
    },

    async updatePassageiro(id: string, data: Partial<any>): Promise<any> {
        if (!id) throw new Error("ID do passageiro é obrigatório");

        // Buscar passageiro para obter usuario_id
        const passageiro = await this.getPassageiro(id);
        if (!passageiro?.usuario_id) {
            throw new Error("Passageiro não encontrado ou sem usuário associado");
        }

        const passageiroData: any = { ...data };

        if (data.nome) passageiroData.nome = cleanString(data.nome, true);
        if (data.nome_responsavel) passageiroData.nome_responsavel = cleanString(data.nome_responsavel, true);
        if (data.email_responsavel) passageiroData.email_responsavel = cleanString(data.email_responsavel);
        if (data.logradouro) passageiroData.logradouro = cleanString(data.logradouro, true);
        if (data.bairro) passageiroData.bairro = cleanString(data.bairro, true);
        if (data.cidade) passageiroData.cidade = cleanString(data.cidade, true);
        if (data.referencia) passageiroData.referencia = cleanString(data.referencia, true);
        if (data.observacoes) passageiroData.observacoes = cleanString(data.observacoes, true);
        if (data.valor_cobranca !== undefined) passageiroData.valor_cobranca = moneyToNumber(data.valor_cobranca);
        if (data.dia_vencimento !== undefined) passageiroData.dia_vencimento = data.dia_vencimento;
        if (data.cpf_responsavel) passageiroData.cpf_responsavel = onlyDigits(data.cpf_responsavel);
        if (data.telefone_responsavel) passageiroData.telefone_responsavel = onlyDigits(data.telefone_responsavel);
        
        // Validar se pode ativar cobranças automáticas
        if (data.enviar_cobranca_automatica !== undefined) {
            // Se tentando ativar, validar se tem plano Completo
            if (data.enviar_cobranca_automatica === true) {
                // Buscar assinatura ativa do usuário
                const { data: assinaturas, error: assinaturaError } = await supabaseAdmin
                    .from("assinaturas_usuarios")
                    .select(`
                        *,
                        planos:plano_id (*, parent:parent_id (*))
                    `)
                    .eq("usuario_id", passageiro.usuario_id)
                    .eq("ativo", true)
                    .limit(1)
                    .single();
                
                if (assinaturaError || !assinaturas) {
                    throw new Error("Cobranças automáticas estão disponíveis apenas no plano Completo");
                }
                
                const plano = assinaturas.planos as any;
                const slugPlano = plano?.parent?.slug || plano?.slug;
                
                if (slugPlano !== PLANO_COMPLETO) {
                    throw new Error("Cobranças automáticas estão disponíveis apenas no plano Completo");
                }
                
                // Validar se ativar este passageiro excederia a franquia
                const franquiaContratada = assinaturas.franquia_contratada_cobrancas || 0;
                
                // Contar quantos passageiros já têm cobranças automáticas ativas
                const { count: passageirosAtivos } = await supabaseAdmin
                    .from("passageiros")
                    .select("id", { count: "exact", head: true })
                    .eq("usuario_id", passageiro.usuario_id)
                    .eq("ativo", true)
                    .eq("enviar_cobranca_automatica", true);
                
                const quantidadeAtiva = passageirosAtivos || 0;
                
                // Se o passageiro já estava ativo, não contar ele
                const quantidadeAposAtivacao = passageiro.enviar_cobranca_automatica === true 
                    ? quantidadeAtiva 
                    : quantidadeAtiva + 1;
                
                if (quantidadeAposAtivacao > franquiaContratada) {
                    throw new Error(`Ativar este passageiro excederia a franquia contratada de ${franquiaContratada} passageiros. Você já tem ${quantidadeAtiva} passageiros com cobranças automáticas ativas.`);
                }
            }
            
            passageiroData.enviar_cobranca_automatica = data.enviar_cobranca_automatica;
            
            if (data.enviar_cobranca_automatica === false) {
                passageiroData.motivo_desativacao = "manual";
            } else if (data.enviar_cobranca_automatica === true) {
                passageiroData.motivo_desativacao = null;
            }
        }

        const { data: updated, error } = await supabaseAdmin
            .from("passageiros")
            .update(passageiroData)
            .eq("id", id)
            .select()
            .single();
        if (error) throw error;

        return updated;
    },

    async deletePassageiro(id: string): Promise<void> {
        if (!id) throw new Error("ID do passageiro é obrigatório");

        const passageiro = await this.getPassageiro(id);

        if (passageiro?.id) {
            const { error } = await supabaseAdmin.from("passageiros").delete().eq("id", id);
            if (error) throw error;
        }
    },

    async getPassageiro(id: string): Promise<any> {
        const { data, error } = await supabaseAdmin
            .from("passageiros")
            .select("*, escolas(nome), veiculos(placa)")
            .eq("id", id)
            .single();

        if (error) throw error;
        return data;
    },

    async listPassageiros(
        usuarioId: string,
        filtros?: {
            search?: string;
            escola?: string;
            veiculo?: string;
            status?: string;
            periodo?: string;
        }
    ): Promise<any[]> {
        let query = supabaseAdmin
            .from("passageiros")
            .select(`
      *,
      escolas(nome),
      veiculos(placa)
    `)
            .eq("usuario_id", usuarioId)
            .order("nome");

        if (filtros?.search) {
            query = query.or(
                `nome.ilike.%${filtros.search}%,nome_responsavel.ilike.%${filtros.search}%`
            );
        }

        if (filtros?.escola) {
            query = query.eq("escola_id", filtros.escola);
        }

        if (filtros?.veiculo) {
            query = query.eq("veiculo_id", filtros.veiculo);
        }

        if (filtros?.periodo) {
            query = query.eq("periodo", filtros.periodo);
        }

        if (filtros?.status !== undefined) {
            query = query.eq("ativo", filtros.status === "true");
        }

        const { data, error } = await query;
        if (error) throw error;

        return data || [];
    },

    async toggleAtivo(passageiroId: string, novoStatus: boolean): Promise<boolean> {

        const { error } = await supabaseAdmin
            .from("passageiros")
            .update({ ativo: novoStatus })
            .eq("id", passageiroId);

        if (error) {
            throw new Error(`Falha ao ${novoStatus ? "ativar" : "desativar"} o passageiro.`);
        }

        return novoStatus;
    },

    async getNumeroCobrancas(passageiroId: string): Promise<number> {
        if (!passageiroId) throw new Error("ID do passageiro é obrigatório");

        const { count, error } = await supabaseAdmin
            .from("cobrancas")
            .select("id", { count: "exact", head: true })
            .eq("passageiro_id", passageiroId);

        if (error) throw new Error(error.message || "Erro ao contar cobranças");

        return count || 0;
    },

    async countListPassageirosByUsuario(usuarioId: string,
        filtros?: {
            ativo?: string;
            enviar_cobranca_automatica?: string;
        }): Promise<number> {
        let query = supabaseAdmin
            .from("passageiros")
            .select("id", { count: "exact", head: true })
            .eq("usuario_id", usuarioId);

        if (filtros?.ativo !== undefined) {
            query = query.eq("ativo", filtros.ativo === "true");
        }

        if (filtros?.enviar_cobranca_automatica !== undefined) {
            query = query.eq("enviar_cobranca_automatica", true);
        }

        const { count, error } = await query;

        if (error) throw new Error(error.message || "Erro ao contar passageiros");
        return count || 0;
    },

    async calcularPassageirosDisponiveis(
        usuarioId: string,
        franquiaNova: number
    ): Promise<{
        jaAtivos: number;
        disponiveisParaAtivar: number;
        totalPossivel: number;
        precisaSelecaoManual: boolean;
    }> {
        const { count: jaAtivos } = await supabaseAdmin
            .from("passageiros")
            .select("*", { count: "exact", head: true })
            .eq("usuario_id", usuarioId)
            .eq("ativo", true)
            .eq("enviar_cobranca_automatica", true);

        const { count: disponiveis } = await supabaseAdmin
            .from("passageiros")
            .select("*", { count: "exact", head: true })
            .eq("usuario_id", usuarioId)
            .eq("ativo", true)
            .eq("enviar_cobranca_automatica", false)
            .or("motivo_desativacao.is.null,motivo_desativacao.neq.manual");

        const jaAtivosCount = jaAtivos || 0;
        const disponiveisCount = disponiveis || 0;
        const totalPossivel = jaAtivosCount + disponiveisCount;
        
        // Só precisa seleção manual se o total de passageiros que PODEM ter cobrança automática
        // for MAIOR que a franquia. Se for igual ou menor, não precisa seleção manual.
        // Exemplo: franquia 10, já ativos 9, disponíveis 2 = total 11 > 10 = precisa seleção
        // Exemplo: franquia 10, já ativos 9, disponíveis 1 = total 10 = 10 = NÃO precisa seleção
        // Exemplo: franquia 10, já ativos 10, disponíveis 0 = total 10 = 10 = NÃO precisa seleção
        const precisaSelecaoManual = totalPossivel > franquiaNova;

        return {
            jaAtivos: jaAtivosCount,
            disponiveisParaAtivar: disponiveisCount,
            totalPossivel,
            precisaSelecaoManual,
        };
    },

    async ativarPassageirosAutomaticamente(
        usuarioId: string,
        franquia: number
    ): Promise<{ ativados: number; totalAtivos: number }> {
        const { data: jaAtivos, error: errorJaAtivos } = await supabaseAdmin
            .from("passageiros")
            .select("id")
            .eq("usuario_id", usuarioId)
            .eq("ativo", true)
            .eq("enviar_cobranca_automatica", true);

        if (errorJaAtivos) {
            throw new Error(`Erro ao buscar passageiros já ativos: ${errorJaAtivos.message}`);
        }

        const quantidadeJaAtiva = jaAtivos?.length || 0;
        const quantidadeParaAtivar = franquia - quantidadeJaAtiva;

        console.log(`[ativarPassageirosAutomaticamente] usuarioId: ${usuarioId}, franquia: ${franquia}, jaAtivos: ${quantidadeJaAtiva}, paraAtivar: ${quantidadeParaAtivar}`);

        if (quantidadeParaAtivar <= 0) {
            console.log(`[ativarPassageirosAutomaticamente] Nenhum passageiro para ativar (franquia já preenchida ou excedida)`);
            return { ativados: 0, totalAtivos: quantidadeJaAtiva };
        }

        const { data: disponiveis, error: errorDisponiveis } = await supabaseAdmin
            .from("passageiros")
            .select("id, nome, enviar_cobranca_automatica, motivo_desativacao")
            .eq("usuario_id", usuarioId)
            .eq("ativo", true)
            .eq("enviar_cobranca_automatica", false)
            .or("motivo_desativacao.is.null,motivo_desativacao.neq.manual")
            .order("nome", { ascending: true })
            .limit(quantidadeParaAtivar);

        if (errorDisponiveis) {
            throw new Error(`Erro ao buscar passageiros disponíveis: ${errorDisponiveis.message}`);
        }

        console.log(`[ativarPassageirosAutomaticamente] Passageiros disponíveis encontrados: ${disponiveis?.length || 0}`);

        if (!disponiveis || disponiveis.length === 0) {
            console.log(`[ativarPassageirosAutomaticamente] Nenhum passageiro disponível para ativar`);
            return { ativados: 0, totalAtivos: quantidadeJaAtiva };
        }

        const idsParaAtivar = disponiveis.map((p) => p.id);
        console.log(`[ativarPassageirosAutomaticamente] Ativando ${idsParaAtivar.length} passageiros:`, idsParaAtivar);
        
        const { error: updateError } = await supabaseAdmin
            .from("passageiros")
            .update({
                enviar_cobranca_automatica: true,
                motivo_desativacao: null,
            })
            .in("id", idsParaAtivar);

        if (updateError) {
            throw new Error(`Erro ao atualizar passageiros: ${updateError.message}`);
        }

        console.log(`[ativarPassageirosAutomaticamente] ${idsParaAtivar.length} passageiros ativados com sucesso`);

        return {
            ativados: idsParaAtivar.length,
            totalAtivos: quantidadeJaAtiva + idsParaAtivar.length,
        };
    },

    async listarPassageirosParaSelecao(
        usuarioId: string,
        tipo: "upgrade" | "downgrade",
        franquia: number
    ): Promise<any[]> {
        if (tipo === "upgrade") {
            const { data } = await supabaseAdmin
                .from("passageiros")
                .select("id, nome, nome_responsavel, email_responsavel, telefone_responsavel, enviar_cobranca_automatica")
                .eq("usuario_id", usuarioId)
                .eq("ativo", true)
                .or("motivo_desativacao.is.null,motivo_desativacao.neq.manual")
                .order("nome", { ascending: true });

            return data?.map((p) => ({
                ...p,
                selecionado: p.enviar_cobranca_automatica === true,
            })) || [];
        } else {
            const { data } = await supabaseAdmin
                .from("passageiros")
                .select("id, nome, nome_responsavel, email_responsavel, telefone_responsavel, enviar_cobranca_automatica")
                .eq("usuario_id", usuarioId)
                .eq("ativo", true)
                .eq("enviar_cobranca_automatica", true)
                .order("nome", { ascending: true });

            return data?.map((p) => ({
                ...p,
                selecionado: true,
            })) || [];
        }
    },

    async confirmarSelecaoPassageiros(
        usuarioId: string,
        passageiroIds: string[],
        franquia: number
    ): Promise<{ ativados: number; desativados: number }> {
        // Validações prévias
        if (passageiroIds.length > franquia) {
            throw new Error("Quantidade de passageiros selecionados excede a franquia");
        }

        const { data: todosPassageiros, error: passageirosError } = await supabaseAdmin
            .from("passageiros")
            .select("id, enviar_cobranca_automatica")
            .eq("usuario_id", usuarioId)
            .eq("ativo", true);

        if (passageirosError) {
            throw new Error("Erro ao buscar passageiros: " + passageirosError.message);
        }

        // Validar que todos os IDs passados pertencem ao usuário e estão ativos
        const idsValidos = todosPassageiros?.map(p => p.id) || [];
        const idsInvalidos = passageiroIds.filter(id => !idsValidos.includes(id));
        
        if (idsInvalidos.length > 0) {
            throw new Error(`Passageiros inválidos ou não pertencem ao usuário: ${idsInvalidos.join(", ")}`);
        }

        const idsParaAtivar = passageiroIds;
        const idsParaDesativar = todosPassageiros
            ?.filter((p) => !idsParaAtivar.includes(p.id) && p.enviar_cobranca_automatica === true)
            .map((p) => p.id) || [];

        if (idsParaAtivar.length > 0) {
            await supabaseAdmin
                .from("passageiros")
                .update({
                    enviar_cobranca_automatica: true,
                    motivo_desativacao: null,
                })
                .in("id", idsParaAtivar)
                .neq("motivo_desativacao", "manual");
        }

        if (idsParaDesativar.length > 0) {
            await supabaseAdmin
                .from("passageiros")
                .update({
                    enviar_cobranca_automatica: false,
                    motivo_desativacao: "automatico",
                })
                .in("id", idsParaDesativar);
        }

        return {
            ativados: idsParaAtivar.length,
            desativados: idsParaDesativar.length,
        };
    },

};
