import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { SubscriptionStatus, UserType } from "../types/enums.js";
import { getNowBR, parseBrazilianDateToISO } from "../utils/date.utils.js";
import { onlyDigits, cleanString } from "../utils/string.utils.js";
import type { UpdateUserAdminDTO, UpdateSubscriptionAdminDTO, ListUsersQuery, UpdatePlanDTO, CreateUserAdminDTO } from "../schemas/admin.schema.js";
import { subscriptionService } from "./subscriptions/subscription.service.js";
import { notificationService } from "./notifications/notification.service.js";
import { EVENTO_MOTORISTA_CADASTRO_ADMIN, EVENTO_MOTORISTA_RESET_SENHA_ADMIN } from "../config/constants.js";

function maskCpfHidden(cpf: string): string {
  const cleaned = cpf.replace(/\D/g, "");
  if (cleaned.length !== 11) return cpf;
  return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 4)}**.***-${cleaned.slice(9, 11)}`;
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let pwd = "Van@";
  for (let i = 0; i < 6; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

export const adminService = {

  async getDashboardStats() {
    const [
      motoristasRes,
      passageirosRes,
      assinaturasRes,
      receitaRes,
      recentUsersRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("usuarios")
        .select("id, ativo", { count: "exact", head: true })
        .eq("tipo", UserType.MOTORISTA),
      supabaseAdmin
        .from("passageiros")
        .select("id", { count: "exact", head: true })
        .eq("ativo", true),
      supabaseAdmin
        .from("assinaturas")
        .select("status"),
      supabaseAdmin
        .from("assinatura_faturas")
        .select("valor, status")
        .eq("status", "PAID"),
      supabaseAdmin
        .from("usuarios")
        .select("id, nome, email, created_at, tipo")
        .eq("tipo", UserType.MOTORISTA)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const totalMotoristas = motoristasRes.count ?? 0;
    const totalPassageiros = passageirosRes.count ?? 0;

    const statusCounts: Record<string, number> = {};
    if (assinaturasRes.data) {
      for (const sub of assinaturasRes.data) {
        statusCounts[sub.status] = (statusCounts[sub.status] || 0) + 1;
      }
    }

    let receitaTotal = 0;
    if (receitaRes.data) {
      for (const f of receitaRes.data) {
        receitaTotal += Number(f.valor) || 0;
      }
    }

    return {
      totalMotoristas,
      totalPassageiros,
      receitaTotal,
      assinaturas: {
        trial: statusCounts[SubscriptionStatus.TRIAL] || 0,
        active: statusCounts[SubscriptionStatus.ACTIVE] || 0,
        past_due: statusCounts[SubscriptionStatus.PAST_DUE] || 0,
        expired: statusCounts[SubscriptionStatus.EXPIRED] || 0,
        canceled: statusCounts[SubscriptionStatus.CANCELED] || 0,
      },
      recentUsers: recentUsersRes.data || [],
    };
  },

  async listUsers(query: ListUsersQuery) {
    const { page, limit, search, status } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let q = supabaseAdmin
      .from("usuarios")
      .select("id, nome, apelido, email, cpfcnpj, telefone, ativo, tipo, created_at, data_nascimento, assinaturas(id, status, plano_id, data_vencimento, trial_ends_at, planos(id, nome, identificador))", { count: "exact" })
      .eq("tipo", UserType.MOTORISTA)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search) {
      const searchClean = search.trim();
      const digits = onlyDigits(searchClean);
      if (digits && digits.length >= 3) {
        q = q.or(`nome.ilike.%${searchClean}%,cpfcnpj.ilike.%${digits}%,email.ilike.%${searchClean}%,telefone.ilike.%${digits}%`);
      } else {
        q = q.or(`nome.ilike.%${searchClean}%,email.ilike.%${searchClean}%`);
      }
    }

    const { data, error, count } = await q;
    if (error) {
      logger.error({ error }, "[AdminService] Erro ao listar usuários.");
      throw error;
    }

    let filtered = data || [];

    if (status) {
      filtered = filtered.filter((u: any) => {
        const sub = Array.isArray(u.assinaturas) ? u.assinaturas[0] : u.assinaturas;
        return sub?.status === status;
      });
    }

    return {
      data: filtered,
      total: count ?? 0,
      page,
      limit,
    };
  },

  async getUserDetails(userId: string) {
    const { data: user, error } = await supabaseAdmin
      .from("usuarios")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !user) throw new Error("Usuário não encontrado.");

    const { data: assinatura } = await supabaseAdmin
      .from("assinaturas")
      .select("*, planos(*)")
      .eq("usuario_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: faturas } = await supabaseAdmin
      .from("assinatura_faturas")
      .select("*, planos(nome, identificador)")
      .eq("usuario_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: planos } = await supabaseAdmin
      .from("planos")
      .select("id, nome, identificador, valor, valor_promocional, ativo")
      .eq("ativo", true)
      .order("valor", { ascending: true });

    return {
      user,
      assinatura,
      faturas: faturas || [],
      planos: planos || [],
    };
  },

  async updateUser(userId: string, data: UpdateUserAdminDTO) {
    const updatePayload: Record<string, unknown> = {};

    if (data.nome !== undefined) updatePayload.nome = cleanString(data.nome, true);
    if (data.apelido !== undefined) updatePayload.apelido = data.apelido ? cleanString(data.apelido, true) : null;
    if (data.email !== undefined) updatePayload.email = data.email.toLowerCase().trim();
    if (data.telefone !== undefined) updatePayload.telefone = onlyDigits(data.telefone);
    if (data.cpfcnpj !== undefined) updatePayload.cpfcnpj = onlyDigits(data.cpfcnpj);
    if (data.ativo !== undefined) updatePayload.ativo = data.ativo;
    if (data.data_nascimento !== undefined) {
      updatePayload.data_nascimento = parseBrazilianDateToISO(data.data_nascimento);
    }

    updatePayload.updated_at = getNowBR().toISOString();

    const { error } = await supabaseAdmin
      .from("usuarios")
      .update(updatePayload)
      .eq("id", userId);

    if (error) {
      logger.error({ error, userId }, "[AdminService] Erro ao atualizar usuário.");
      throw error;
    }

    if (data.ativo !== undefined) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: data.ativo ? "none" : "876600h",
      });
    }

    if (data.email !== undefined) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: data.email.toLowerCase().trim(),
      });
    }

    return { success: true };
  },

  async updateSubscription(userId: string, data: UpdateSubscriptionAdminDTO) {
    const { data: sub, error: fetchError } = await supabaseAdmin
      .from("assinaturas")
      .select("id")
      .eq("usuario_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError || !sub) throw new Error("Assinatura não encontrada para este usuário.");

    const updatePayload: Record<string, unknown> = {};

    if (data.plano_id !== undefined) updatePayload.plano_id = data.plano_id;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.data_vencimento !== undefined) updatePayload.data_vencimento = data.data_vencimento;
    if (data.trial_ends_at !== undefined) updatePayload.trial_ends_at = data.trial_ends_at;

    updatePayload.updated_at = getNowBR().toISOString();

    const { error } = await supabaseAdmin
      .from("assinaturas")
      .update(updatePayload)
      .eq("id", sub.id);

    if (error) {
      logger.error({ error, userId, subId: sub.id }, "[AdminService] Erro ao atualizar assinatura.");
      throw error;
    }

    return { success: true };
  },

  async listConfigs() {
    const { data, error } = await supabaseAdmin
      .from("configuracao_interna")
      .select("*")
      .order("chave", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async updateConfig(chave: string, valor: string) {
    const { error } = await supabaseAdmin
      .from("configuracao_interna")
      .upsert({ chave, valor }, { onConflict: "chave" });

    if (error) {
      logger.error({ error, chave }, "[AdminService] Erro ao atualizar configuração.");
      throw error;
    }

    return { success: true };
  },

  async listPlans() {
    const { data, error } = await supabaseAdmin
      .from("planos")
      .select("*")
      .order("valor", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async updatePlan(id: string, data: UpdatePlanDTO) {
    const updatePayload: Record<string, unknown> = {};
    if (data.valor !== undefined) updatePayload.valor = data.valor;
    if (data.valor_promocional !== undefined) updatePayload.valor_promocional = data.valor_promocional;
    updatePayload.updated_at = getNowBR().toISOString();

    const { error } = await supabaseAdmin
      .from("planos")
      .update(updatePayload)
      .eq("id", id);

    if (error) {
      logger.error({ error, id }, "[AdminService] Erro ao atualizar plano.");
      throw error;
    }

    return { success: true };
  },

  async createUser(data: CreateUserAdminDTO) {
    const emailClean = data.email.toLowerCase().trim();
    const cpfcnpjClean = onlyDigits(data.cpfcnpj);

    const { data: existingEmail } = await supabaseAdmin
      .from("usuarios")
      .select("id")
      .eq("email", emailClean)
      .maybeSingle();

    if (existingEmail) {
      const error: any = new Error("Este e-mail já está cadastrado.");
      error.statusCode = 400;
      error.field = "email";
      throw error;
    }

    const { data: existingCpf } = await supabaseAdmin
      .from("usuarios")
      .select("id")
      .eq("cpfcnpj", cpfcnpjClean)
      .maybeSingle();

    if (existingCpf) {
      const error: any = new Error("Este CPF/CNPJ já está cadastrado.");
      error.statusCode = 400;
      error.field = "cpfcnpj";
      throw error;
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: emailClean,
      password: data.senha,
      email_confirm: true,
      user_metadata: {
        nome: cleanString(data.nome, true),
        tipo: UserType.MOTORISTA,
      },
    });

    if (authError || !authUser.user) {
      logger.error({ authError }, "[AdminService] Erro ao criar usuário no Supabase Auth.");
      throw authError || new Error("Erro ao criar credenciais de acesso.");
    }

    const userId = authUser.user.id;

    const { error: insertError } = await supabaseAdmin
      .from("usuarios")
      .insert({
        id: userId,
        nome: cleanString(data.nome, true),
        email: emailClean,
        telefone: onlyDigits(data.telefone),
        cpfcnpj: cpfcnpjClean,
        data_nascimento: parseBrazilianDateToISO(data.data_nascimento),
        tipo: UserType.MOTORISTA,
        ativo: true,
        created_at: getNowBR().toISOString(),
        updated_at: getNowBR().toISOString(),
      });

    if (insertError) {
      logger.error({ insertError, userId }, "[AdminService] Erro ao salvar dados cadastrais do usuário.");
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw insertError;
    }

    try {
      await subscriptionService.createTrial(userId);
    } catch (trialError) {
      logger.error({ trialError, userId }, "[AdminService] Erro não-bloqueante ao criar Trial inicial.");
    }

    if (data.telefone) {
      const maskedCpf = maskCpfHidden(cpfcnpjClean);
      notificationService.notifyDriver(data.telefone, EVENTO_MOTORISTA_CADASTRO_ADMIN, {
        nomeMotorista: data.nome,
        cpfLogin: maskedCpf,
        senhaTemporaria: data.senha
      }).catch(err => logger.error({ err, userId }, "[AdminService] Falha ao enviar WhatsApp de boas-vindas."));
    }

    return { id: userId, email: emailClean };
  },

  async resetUserPassword(userId: string) {
    const { data: user, error: fetchError } = await supabaseAdmin
      .from("usuarios")
      .select("nome, email, telefone, cpfcnpj")
      .eq("id", userId)
      .single();

    if (fetchError || !user) {
      throw new Error("Usuário não encontrado.");
    }

    const newPassword = generateTempPassword();

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (authError) {
      logger.error({ authError, userId }, "[AdminService] Erro ao atualizar senha no Supabase Auth.");
      throw authError;
    }

    if (user.telefone) {
      const maskedCpf = maskCpfHidden(user.cpfcnpj || "");
      notificationService.notifyDriver(user.telefone, EVENTO_MOTORISTA_RESET_SENHA_ADMIN, {
        nomeMotorista: user.nome,
        cpfLogin: maskedCpf,
        senhaTemporaria: newPassword
      }).catch(err => logger.error({ err, userId }, "[AdminService] Falha ao enviar WhatsApp de reset de senha."));
    }

    return { success: true, senha: newPassword };
  },
};
