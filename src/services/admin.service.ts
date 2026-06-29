import { logger } from "../config/logger.js";
import { adminRepository } from "../repositories/admin.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { invoiceRepository } from "../repositories/invoice.repository.js";
import { planRepository } from "../repositories/plan.repository.js";
import { authProvider } from "./providers/auth.provider.js";
import { SubscriptionStatus, UserType, AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";
import { historicoService } from "./historico.service.js";
import { getNowBR, parseBrazilianDateToISO } from "../utils/date.utils.js";
import { onlyDigits, cleanString } from "../utils/string.utils.js";
import type { UpdateUserAdminDTO, UpdateSubscriptionAdminDTO, ListUsersQuery, ListUserLogsQuery, UpdatePlanDTO, CreateUserAdminDTO, ListGlobalLogsQuery } from "../schemas/admin.schema.js";
import { subscriptionService } from "./subscriptions/subscription.service.js";
import { notificationService } from "./notifications/notification.service.js";
import { loginAttemptsRepository } from "../repositories/login-attempts.repository.js";
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
    ] = await adminRepository.getDashboardStats();

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

    let whatsappStatus = "UNKNOWN";
    try {
      const { GLOBAL_WHATSAPP_INSTANCE } = await import("../config/constants.js");
      const { whatsappService } = await import("./whatsapp.service.js");
      const status = await whatsappService.getInstanceStatus(GLOBAL_WHATSAPP_INSTANCE);
      whatsappStatus = status.state;
    } catch (err) {
      logger.error({ err }, "[AdminService] Erro ao buscar status do WhatsApp");
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
      whatsappStatus,
    };
  },

  async listUsers(query: ListUsersQuery) {
    const { page, limit, search, status } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let digits = null;
    let searchClean = null;
    let isId = false;

    if (search) {
      searchClean = search.trim();
      digits = onlyDigits(searchClean);

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(searchClean)) {
        isId = true;
      }
    }

    const { data, error, count } = await adminRepository.listUsers({ from, to, searchClean, digits, isId });
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

  async getUserLogs(userId: string, query: ListUserLogsQuery) {
    const { page, limit, dataInicio, dataFim, acao, entidade } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await adminRepository.getUserLogs(
      userId,
      from,
      to,
      { dataInicio, dataFim, acao, entidade }
    );

    if (error) {
      logger.error({ error, userId }, "[AdminService] Erro ao buscar logs de atividades do usuário.");
      throw error;
    }

    return {
      data: data || [],
      total: count ?? 0,
      page,
      limit,
    };
  },

  async getGlobalLogs(query: ListGlobalLogsQuery) {
    const { page, limit, dataInicio, dataFim, acao, entidade, search_cpf } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await adminRepository.getGlobalLogs(
      from,
      to,
      { dataInicio, dataFim, acao, entidade, search_cpf }
    );

    if (error) {
      logger.error({ error }, "[AdminService] Erro ao buscar logs globais.");
      throw error;
    }

    return {
      data: data || [],
      total: count ?? 0,
      page,
      limit,
    };
  },

  async getLoginAttempts(query: { page?: number; limit?: number; data_inicio?: string; data_fim?: string; search_cpf?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await loginAttemptsRepository.listAttempts(query, from, to);

    if (error) {
      logger.error({ error }, "[AdminService] Erro ao buscar tentativas de login.");
      throw error;
    }

    return {
      data: data || [],
      total: count ?? 0,
      page,
      limit,
    };
  },

  async getUserDetails(userId: string) {
    const [userReq, assinaturaReq, faturasReq, planosReq] = await adminRepository.getUserDetails(userId);

    if (userReq.error || !userReq.data) throw new Error("Usuário não encontrado.");

    return {
      user: userReq.data,
      assinatura: assinaturaReq.data,
      faturas: faturasReq.data || [],
      planos: planosReq.data || [],
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

    const { error } = await userRepository.update(userId, updatePayload);

    if (error) {
      logger.error({ error, userId }, "[AdminService] Erro ao atualizar usuário.");
      throw error;
    }

    if (data.ativo !== undefined) {
      await authProvider.updateUserById(userId, {
        ban_duration: data.ativo ? "none" : "876600h",
      });
      await historicoService.log({
        usuario_id: userId,
        entidade_tipo: AtividadeEntidadeTipo.USUARIO,
        entidade_id: userId,
        acao: AtividadeAcao.USUARIO_SUSPENSO,
        descricao: data.ativo ? "Acesso do usuário desbloqueado pelo administrador." : "Acesso do usuário suspenso pelo administrador.",
      });
    }

    if (data.email !== undefined) {
      await authProvider.updateUserById(userId, {
        email: data.email.toLowerCase().trim(),
      });
    }

    if (Object.keys(updatePayload).length > 1 || (Object.keys(updatePayload).length === 1 && data.ativo === undefined)) {
      await historicoService.log({
        usuario_id: userId,
        entidade_tipo: AtividadeEntidadeTipo.USUARIO,
        entidade_id: userId,
        acao: AtividadeAcao.PERFIL_EDITADO,
        descricao: "Dados cadastrais atualizados pelo administrador.",
      });
    }

    return { success: true };
  },

  async updateSubscription(userId: string, data: UpdateSubscriptionAdminDTO) {
    const { data: sub, error: fetchError } = await adminRepository.getSubscriptionForUser(userId);

    if (fetchError || !sub) throw new Error("Assinatura não encontrada para este usuário.");

    const updatePayload: Record<string, unknown> = {};

    if (data.plano_id !== undefined && data.plano_id !== sub.plano_id) {
        updatePayload.plano_id = data.plano_id;
        const { data: novoPlano } = await planRepository.getById(data.plano_id);
        if (novoPlano) updatePayload.valor_base = novoPlano.valor;
    } else if (data.plano_id !== undefined) {
        updatePayload.plano_id = data.plano_id;
    }
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.data_vencimento !== undefined) updatePayload.data_vencimento = data.data_vencimento;
    if (data.trial_ends_at !== undefined) updatePayload.trial_ends_at = data.trial_ends_at;
    
    // Novas colunas promocionais
    if (data.valor_promocional !== undefined) updatePayload.valor_promocional = data.valor_promocional;
    if (data.data_fim_promocao !== undefined) updatePayload.data_fim_promocao = data.data_fim_promocao;

    updatePayload.updated_at = getNowBR().toISOString();

    const { error } = await adminRepository.updateSubscription(sub.id, updatePayload);

    if (error) {
      logger.error({ error, userId, subId: sub.id }, "[AdminService] Erro ao atualizar assinatura.");
      throw error;
    }

    if (data.status !== undefined && data.status !== sub.status) {
      let acao = AtividadeAcao.SAAS_ASSINATURA_ATIVA;
      let desc = "Assinatura ativada pelo administrador.";

      if (data.status === SubscriptionStatus.CANCELED) {
        acao = AtividadeAcao.SAAS_ASSINATURA_CANCELADA;
        desc = "Assinatura cancelada pelo administrador.";
      } else if (data.status === SubscriptionStatus.EXPIRED) {
        acao = AtividadeAcao.SAAS_ASSINATURA_EXPIRADA;
        desc = "Assinatura marcada como expirada pelo administrador.";
      } else if (data.status === SubscriptionStatus.PAST_DUE) {
        acao = AtividadeAcao.SAAS_ASSINATURA_ATRASO;
        desc = "Assinatura marcada em atraso pelo administrador.";
      }

      await historicoService.log({
        usuario_id: userId,
        entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
        entidade_id: sub.id,
        acao,
        descricao: desc,
      });
    }

    if (data.status === SubscriptionStatus.CANCELED) {
      logger.info({ userId }, "[AdminService] Assinatura cancelada, cancelando faturas pendentes...");
      await invoiceRepository.cancelIncompleteInvoicesByUserId(userId, getNowBR().toISOString());
    }

    return { success: true };
  },

  async listConfigs() {
    const { data, error } = await adminRepository.listConfigs();

    if (error) throw error;
    return data || [];
  },

  async updateConfig(chave: string, valor: string) {
    const { error } = await adminRepository.updateConfig(chave, valor);

    if (error) {
      logger.error({ error, chave }, "[AdminService] Erro ao atualizar configuração.");
      throw error;
    }

    return { success: true };
  },

  async listPlans() {
    const { data, error } = await adminRepository.listPlanos();

    if (error) throw error;
    return data || [];
  },

  async updatePlan(id: string, data: UpdatePlanDTO) {
    const updatePayload: Record<string, unknown> = {};
    if (data.valor !== undefined) updatePayload.valor = data.valor;
    if (data.valor_promocional !== undefined) updatePayload.valor_promocional = data.valor_promocional;
    updatePayload.updated_at = getNowBR().toISOString();

    const { error } = await adminRepository.updatePlano(id, updatePayload);

    if (error) {
      logger.error({ error, id }, "[AdminService] Erro ao atualizar plano.");
      throw error;
    }

    return { success: true };
  },

  async createUser(data: CreateUserAdminDTO) {
    const emailClean = data.email.toLowerCase().trim();
    const cpfcnpjClean = onlyDigits(data.cpfcnpj);

    const { data: existingEmail } = await userRepository.getByEmail(emailClean);

    if (existingEmail) {
      const error: any = new Error("Este e-mail já está cadastrado.");
      error.statusCode = 400;
      error.field = "email";
      throw error;
    }

    const { data: existingCpf } = await userRepository.getByCpfcnpj(cpfcnpjClean);

    if (existingCpf) {
      const error: any = new Error("Este CPF/CNPJ já está cadastrado.");
      error.statusCode = 400;
      error.field = "cpfcnpj";
      throw error;
    }

    const { data: authUser, error: authError } = await authProvider.createUser({
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

    const { error: insertError } = await userRepository.insert({
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
      await authProvider.deleteUser(userId);
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
    const { data: user, error: fetchError } = await userRepository.getById(userId);

    if (fetchError || !user) {
      throw new Error("Usuário não encontrado.");
    }

    const newPassword = generateTempPassword();

    const { error: authError } = await authProvider.updateUserById(userId, {
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

  async deleteUser(userId: string) {
    const { data: user, error: fetchError } = await userRepository.getById(userId);

    if (fetchError || !user) {
      throw new Error("Usuário não encontrado.");
    }

    const { error: authError } = await authProvider.deleteUser(userId);

    if (authError) {
      logger.error({ authError, userId }, "[AdminService] Erro ao deletar usuário no Supabase Auth.");
      throw authError;
    }

    return { success: true };
  },
};
