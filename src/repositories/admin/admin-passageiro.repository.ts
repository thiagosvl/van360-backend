import { supabaseAdmin } from "../../config/supabase.js";

export const adminPassageiroRepository = {
  async listPassageirosByUserId(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("passageiros")
      .select(`
        *,
        escolas(nome),
        veiculos(modelo, placa),
        responsaveis:passageiro_responsaveis(
          tipo,
          parentesco,
          responsavel:responsaveis(id, nome, telefone, cpf, email)
        )
      `)
      .eq("usuario_id", userId)
      .order("nome", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async listCobrancasDoMesByUserId(userId: string, mes: number, ano: number) {
    const { data, error } = await supabaseAdmin
      .from("cobrancas")
      .select("id, passageiro_id, usuario_id, mes, ano, valor, status, data_vencimento, data_envio_ultima_notificacao, desativar_lembretes")
      .eq("usuario_id", userId)
      .eq("mes", mes)
      .eq("ano", ano);

    if (error) throw error;
    return data || [];
  },

  async getPassageiroParaNotificacao(passageiroId: string) {
    const { data, error } = await supabaseAdmin
      .from("passageiros")
      .select(`
        id,
        nome,
        ativo,
        dia_vencimento,
        valor_cobranca,
        enviar_notificacoes,
        usuario_id,
        motorista:usuarios!passageiros_usuario_id_fkey(
          id,
          nome,
          apelido,
          telefone,
          chave_pix,
          tipo_chave_pix
        ),
        responsaveis:passageiro_responsaveis(
          tipo,
          parentesco,
          responsavel:responsaveis(id, nome, telefone, cpf, email)
        )
      `)
      .eq("id", passageiroId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async listPrePassageirosByUserId(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("pre_passageiros")
      .select("*, escolas(nome)")
      .eq("usuario_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },
};

