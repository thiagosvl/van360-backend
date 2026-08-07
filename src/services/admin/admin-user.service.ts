import { NotificationChannelEnum } from '../../types/enums.js';
import { logger } from "../../config/logger.js";
import { adminUserRepository } from "../../repositories/admin/admin-user.repository.js";
import { userRepository } from "../../repositories/user.repository.js";
import { invoiceRepository } from "../../repositories/invoice.repository.js";
import { authProvider } from "../providers/auth.provider.js";
import {
  SubscriptionStatus,
  UserType,
  AtividadeAcao,
  AtividadeEntidadeTipo,
  CanalAquisicao,
  DispositivoCadastro,
  EvolutionConnectionStatus,
  ContratoStatus,
  DriverContractConfigStatus,
  IndicacaoStatus,
} from "../../types/enums.js";
import { historicoService } from "../historico.service.js";
import { getNowBR, parseBrazilianDateToISO } from "../../utils/date.utils.js";
import { onlyDigits, cleanString } from "../../utils/string.utils.js";
import type { UpdateUserAdminDTO, UpdateSubscriptionAdminDTO, ListUsersQuery, CreateUserAdminDTO } from "../../schemas/admin.schema.js";
import { subscriptionService } from "../subscriptions/subscription.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { EVENTO_MOTORISTA_CADASTRO_ADMIN, EVENTO_MOTORISTA_RESET_SENHA_ADMIN } from "../../config/constants.js";
import { adminPassageiroService } from "./admin-passageiro.service.js";
import { adminVeiculoService } from "./admin-veiculo.service.js";
import { adminEscolaService } from "./admin-escola.service.js";
import { subscriptionReferralService } from "../subscriptions/subscription-referral.service.js";

function maskCpfCnpjHidden(cpfcnpj: string): string {
  const cleaned = cpfcnpj.replace(/\D/g, "");
  if (cleaned.length <= 11) {
    return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 4)}**.***-${cleaned.slice(9, 11)}`;
  }
  return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 3)}**.***/****-${cleaned.slice(12, 14)}`;
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let pwd = "Van@";
  for (let i = 0; i < 6; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

export function resolveDriverContractConfigStatus(
  assinaturaUrl?: string | null,
  configContrato?: any | null
): DriverContractConfigStatus {
  // Motorista só é considerado CONFIGURADO se possuir a assinatura digital cadastrada
  if (!assinaturaUrl) {
    return DriverContractConfigStatus.NAO_CONFIGURADO;
  }

  // Com assinatura cadastrada, o contrato está configurado: verifica se está ativo ou pausado
  if (configContrato?.usar_contratos === false) {
    return DriverContractConfigStatus.DESATIVADO;
  }

  return DriverContractConfigStatus.ATIVO;
}

export const adminUserService = {
  async getDashboardStats() {
    const [
      motoristasRes,
      passageirosRes,
      assinaturasRes,
      receitaRes,
      recentUsersRes,
      canaisRes,
      contratosRes,
      motoristasConfigsRes,
      indicacoesRes,
    ] = await adminUserRepository.getDashboardStats();

    const totalMotoristas = motoristasRes.count ?? 0;
    const totalPassageiros = passageirosRes.count ?? 0;

    const statusCounts: Record<string, number> = {};
    let vitalicios = 0;
    if (assinaturasRes.data) {
      for (const sub of assinaturasRes.data) {
        if (sub.status === SubscriptionStatus.ACTIVE && !sub.data_vencimento) {
          vitalicios++;
        } else {
          statusCounts[sub.status] = (statusCounts[sub.status] || 0) + 1;
        }
      }
    }

    let receitaTotal = 0;
    if (receitaRes.data) {
      for (const f of receitaRes.data) {
        receitaTotal += Number(f.valor) || 0;
      }
    }

    const canaisAquisicao: Record<string, number> = {
      [CanalAquisicao.PLAY_STORE]: 0,
      [CanalAquisicao.APP_STORE]: 0,
      [CanalAquisicao.INDICACAO]: 0,
      [CanalAquisicao.PANFLETO]: 0,
      [CanalAquisicao.INSTAGRAM]: 0,
      [CanalAquisicao.FACEBOOK]: 0,
      [CanalAquisicao.TIKTOK]: 0,
      [CanalAquisicao.YOUTUBE]: 0,
      [CanalAquisicao.GOOGLE]: 0,
      [CanalAquisicao.OUTROS]: 0,
      NAO_INFORMADO: 0,
    };

    const dispositivosCadastro: Record<string, number> = {
      [DispositivoCadastro.APP_ANDROID]: 0,
      [DispositivoCadastro.APP_IOS]: 0,
      [DispositivoCadastro.WEB_MOBILE_ANDROID]: 0,
      [DispositivoCadastro.WEB_MOBILE_IOS]: 0,
      [DispositivoCadastro.WEB_DESKTOP]: 0,
      NAO_INFORMADO: 0,
    };

    if (canaisRes.data) {
      for (const row of canaisRes.data) {
        const canal = row.canal_aquisicao;
        if (canal && canaisAquisicao[canal] !== undefined) {
          canaisAquisicao[canal]++;
        } else {
          canaisAquisicao.NAO_INFORMADO++;
        }

        const disp = (row as any).dispositivo_cadastro;
        if (disp && dispositivosCadastro[disp] !== undefined) {
          dispositivosCadastro[disp]++;
        } else {
          dispositivosCadastro.NAO_INFORMADO++;
        }
      }
    }

    // PROCESSAMENTO DE STATS DE CONTRATOS DIGITAIS
    let totalContratos = 0;
    let contratosAssinados = 0;
    let contratosPendentes = 0;
    let contratosSubstituidos = 0;
    let valorTotalContratos = 0;

    if (contratosRes?.data) {
      totalContratos = contratosRes.data.length;
      for (const c of contratosRes.data) {
        if (c.status === ContratoStatus.ASSINADO) {
          contratosAssinados++;
          valorTotalContratos += Number(c.valor_total) || 0;
        } else if (c.status === ContratoStatus.PENDENTE) {
          contratosPendentes++;
        } else if (c.status === ContratoStatus.SUBSTITUIDO) {
          contratosSubstituidos++;
        }
      }
    }

    const motoristasConfigContrato = {
      ativo: 0,
      inativo: 0,
      nao_configurado: 0,
    };

    if (motoristasConfigsRes?.data) {
      for (const m of motoristasConfigsRes.data) {
        const statusConfig = resolveDriverContractConfigStatus(m.assinatura_digital_url, m.config_contrato);

        if (statusConfig === DriverContractConfigStatus.NAO_CONFIGURADO) {
          motoristasConfigContrato.nao_configurado++;
        } else if (statusConfig === DriverContractConfigStatus.ATIVO) {
          motoristasConfigContrato.ativo++;
        } else {
          motoristasConfigContrato.inativo++;
        }
      }
    }

    let totalIndicacoes = 0;
    let indicacoesConcluidas = 0;
    let indicacoesPendentes = 0;

    if (indicacoesRes?.data) {
      totalIndicacoes = indicacoesRes.data.length;
      for (const ind of indicacoesRes.data) {
        if (ind.status === IndicacaoStatus.COMPLETED) {
          indicacoesConcluidas++;
        } else if (ind.status === IndicacaoStatus.PENDING) {
          indicacoesPendentes++;
        }
      }
    }

    const taxaConversaoIndicacao = totalIndicacoes > 0 ? Math.round((indicacoesConcluidas / totalIndicacoes) * 100) : 0;
    const diasBonusConcedidos = indicacoesConcluidas * 30;
    const motoristasIndicadosCount = canaisAquisicao[CanalAquisicao.INDICACAO] || totalIndicacoes;

    const indicacoesStats = {
      total: totalIndicacoes,
      concluidas: indicacoesConcluidas,
      pendentes: indicacoesPendentes,
      taxaConversao: taxaConversaoIndicacao,
      diasBonusConcedidos,
      motoristasIndicados: motoristasIndicadosCount,
    };

    const motoristasConfiguradosCount = motoristasConfigContrato.ativo + motoristasConfigContrato.inativo;

    const contratosStats = {
      totalContratos,
      contratosAssinados,
      contratosPendentes,
      contratosSubstituidos,
      valorTotalContratos,
      motoristasConfigurados: motoristasConfiguradosCount,
      motoristasAtivos: motoristasConfigContrato.ativo,
      motoristasPausados: motoristasConfigContrato.inativo,
      motoristasNaoConfigurados: motoristasConfigContrato.nao_configurado,
      motoristasConfig: motoristasConfigContrato,
    };

    let evolutionStatus: string = EvolutionConnectionStatus.UNKNOWN;
    try {
      const { EVOLUTION_GLOBAL_INSTANCE } = await import("../../config/constants.js");
      const { evolutionService } = await import("../evolution.service.js");
      const status = await evolutionService.getInstanceStatus(EVOLUTION_GLOBAL_INSTANCE);
      evolutionStatus = status.state;
    } catch (err) {
      logger.error({ err }, "[AdminUserService] Erro ao buscar status da Evolution");
    }

    return {
      totalMotoristas,
      totalPassageiros,
      receitaTotal,
      assinaturas: {
        trial: statusCounts[SubscriptionStatus.TRIAL] || 0,
        active: statusCounts[SubscriptionStatus.ACTIVE] || 0,
        vitalicio: vitalicios,
        past_due: statusCounts[SubscriptionStatus.PAST_DUE] || 0,
        expired: statusCounts[SubscriptionStatus.EXPIRED] || 0,
        canceled: statusCounts[SubscriptionStatus.CANCELED] || 0,
      },
      contratosStats,
      indicacoesStats,
      recentUsers: recentUsersRes.data || [],
      canaisAquisicao,
      dispositivosCadastro,
      evolutionStatus,
    };
  },

  async listUsers(query: ListUsersQuery) {
    const { page, limit, search, status } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let digits: string | undefined = undefined;
    let searchClean: string | undefined = undefined;
    let isId = false;

    if (search) {
      searchClean = search.trim();
      digits = onlyDigits(searchClean);

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(searchClean)) {
        isId = true;
      }
    }

    const { data, error, count } = await adminUserRepository.listUsers({ from, to, searchClean, digits, isId });
    if (error) {
      logger.error({ error }, "[AdminUserService] Erro ao listar usuários.");
      throw error;
    }

    let filtered = data || [];

    if (status) {
      filtered = filtered.filter((u: { assinaturas?: Array<{ status: string }> | { status: string } }) => {
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
    const [
      [userReq, assinaturaReq, faturasReq, planosReq, veiculosReq, escolasReq, passageirosReq, prePassageirosReq, contratosReq],
      passageirosList,
      prePassageirosList,
      veiculosList,
      escolasList,
      referralSummary,
    ] = await Promise.all([
      adminUserRepository.getUserDetails(userId),
      adminPassageiroService.getPassageirosByUserId(userId),
      adminPassageiroService.getPrePassageirosByUserId(userId),
      adminVeiculoService.getVeiculosByUserId(userId),
      adminEscolaService.getEscolasByUserId(userId),
      subscriptionReferralService.getReferralSummary(userId).catch(() => ({
        total: 0,
        completed: 0,
        pending: 0,
        referralCode: userId,
        referralLink: "",
        bonusDays: 30,
        discountPct: 10,
        hasActiveDiscount: false,
        hasIndicator: false,
      })),
    ]);

    if (userReq.error || !userReq.data) throw new Error("Usuário não encontrado.");

    const userData = userReq.data;
    const statusConfiguracaoContrato = resolveDriverContractConfigStatus(
      userData.assinatura_digital_url,
      userData.config_contrato
    );

    const contratosList = contratosReq.data || [];
    const contratosAssinadosCount = contratosList.filter((c: any) => c.status === ContratoStatus.ASSINADO).length;
    const contratosPendentesCount = contratosList.filter((c: any) => c.status === ContratoStatus.PENDENTE).length;
    const valorTotalContratos = contratosList
      .filter((c: any) => c.status === ContratoStatus.ASSINADO)
      .reduce((acc: number, c: any) => acc + (Number(c.valor_total) || 0), 0);

    return {
      user: userData,
      assinatura: assinaturaReq.data,
      faturas: faturasReq.data || [],
      planos: planosReq.data || [],
      kpis: {
        veiculosCount: veiculosReq.count ?? 0,
        escolasCount: escolasReq.count ?? 0,
        passageirosCount: passageirosReq.count ?? 0,
        solicitacoesPendentesCount: prePassageirosReq.count ?? 0,
        contratosCount: contratosList.length,
        contratosAssinadosCount,
        contratosPendentesCount,
        valorTotalContratos,
        statusConfiguracaoContrato,
      },
      referralSummary,
      passageiros: passageirosList,
      prePassageiros: prePassageirosList,
      veiculos: veiculosList,
      escolas: escolasList,
      contratos: contratosList,
    };
  },

  async updateUser(userId: string, data: UpdateUserAdminDTO) {
    const updatePayload: Record<string, unknown> = {};

    if (data.nome !== undefined) updatePayload.nome = cleanString(data.nome, true);
    if (data.razao_social !== undefined) updatePayload.razao_social = data.razao_social ? cleanString(data.razao_social, true) : null;
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
      logger.error({ error, userId }, "[AdminUserService] Erro ao atualizar usuário.");
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
    const { data: sub, error: fetchError } = await adminUserRepository.getSubscriptionForUser(userId);

    if (fetchError || !sub) throw new Error("Assinatura não encontrada para este usuário.");

    const updatePayload: Record<string, unknown> = {};

    if (data.plano_id !== undefined && data.plano_id !== sub.plano_id) {
      updatePayload.plano_id = data.plano_id;
    } else if (data.plano_id !== undefined) {
      updatePayload.plano_id = data.plano_id;
    }
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.data_vencimento !== undefined) updatePayload.data_vencimento = data.data_vencimento;
    if (data.trial_ends_at !== undefined) updatePayload.trial_ends_at = data.trial_ends_at;

    if (data.valor_base_mensal !== undefined) updatePayload.valor_base_mensal = data.valor_base_mensal;
    if (data.valor_base_anual !== undefined) updatePayload.valor_base_anual = data.valor_base_anual;
    if (data.valor_promocional_mensal !== undefined) updatePayload.valor_promocional_mensal = data.valor_promocional_mensal;
    if (data.valor_promocional_anual !== undefined) updatePayload.valor_promocional_anual = data.valor_promocional_anual;
    if (data.data_fim_promocao !== undefined) updatePayload.data_fim_promocao = data.data_fim_promocao;

    updatePayload.updated_at = getNowBR().toISOString();

    const { error } = await adminUserRepository.updateSubscription(sub.id, updatePayload);

    if (error) {
      logger.error({ error, userId, subId: sub.id }, "[AdminUserService] Erro ao atualizar assinatura.");
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
      logger.info({ userId }, "[AdminUserService] Assinatura cancelada, cancelando faturas pendentes...");
      await invoiceRepository.cancelIncompleteInvoicesByUserId(userId, getNowBR().toISOString());
    }

    return { success: true };
  },

  async createUser(data: CreateUserAdminDTO) {
    const emailClean = data.email.toLowerCase().trim();
    const cpfcnpjClean = onlyDigits(data.cpfcnpj);

    const { data: existingEmail } = await userRepository.getByEmail(emailClean);

    if (existingEmail) {
      const error = new Error("Este e-mail já está cadastrado.") as Error & { statusCode?: number; field?: string };
      error.statusCode = 400;
      error.field = "email";
      throw error;
    }

    const { data: existingCpf } = await userRepository.getByCpfcnpj(cpfcnpjClean);

    if (existingCpf) {
      const error = new Error("Este CPF/CNPJ já está cadastrado.") as Error & { statusCode?: number; field?: string };
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
      logger.error({ authError }, "[AdminUserService] Erro ao criar usuário no Supabase Auth.");
      throw authError || new Error("Erro ao criar credenciais de acesso.");
    }

    const userId = authUser.user.id;

    const { error: insertError } = await userRepository.insert({
      id: userId,
      nome: cleanString(data.nome, true),
      razao_social: data.razao_social ? cleanString(data.razao_social, true) : null,
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
      logger.error({ insertError, userId }, "[AdminUserService] Erro ao salvar dados cadastrais do usuário.");
      await authProvider.deleteUser(userId);
      throw insertError;
    }

    try {
      await subscriptionService.createTrial(userId);
    } catch (trialError) {
      logger.error({ trialError, userId }, "[AdminUserService] Erro não-bloqueante ao criar Trial inicial.");
    }

    if (data.telefone) {
      const maskedCpf = maskCpfCnpjHidden(cpfcnpjClean);
      notificationService.notifyDriver(data.telefone, EVENTO_MOTORISTA_CADASTRO_ADMIN, {
        nomeMotorista: data.nome,
        cpfLogin: maskedCpf,
        senhaTemporaria: data.senha
      }, { channels: [NotificationChannelEnum.EVOLUTION] }).catch(err => logger.error({ err, userId }, "[AdminUserService] Falha ao enviar mensagem de boas-vindas."));
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
      logger.error({ authError, userId }, "[AdminUserService] Erro ao atualizar senha no Supabase Auth.");
      throw authError;
    }

    if (user.telefone) {
      const maskedCpf = maskCpfCnpjHidden(user.cpfcnpj || "");
      notificationService.notifyDriver(user.telefone, EVENTO_MOTORISTA_RESET_SENHA_ADMIN, {
        nomeMotorista: user.nome,
        cpfLogin: maskedCpf,
        senhaTemporaria: newPassword
      }, { channels: [NotificationChannelEnum.EVOLUTION] }).catch(err => logger.error({ err, userId }, "[AdminUserService] Falha ao enviar mensagem de reset de senha."));
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
      logger.error({ authError, userId }, "[AdminUserService] Erro ao deletar usuário no Supabase Auth.");
      throw authError;
    }

    return { success: true };
  },
};
