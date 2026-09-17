import { supabaseAdmin } from "../../config/supabase.js";
import { usuarioPushTokenRepository } from "../../repositories/usuario-push-token.repository.js";
import { usuarioConfiguracoesRepository } from "../../repositories/usuario-configuracoes.repository.js";
import { motoristaEquipeRepository } from "../../repositories/motorista-equipe.repository.js";
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
  DriverContractConfigStatus,
  CobrancaStatus,
  TipoResponsavel,
  NotificationQueueStatus,
} from "../../types/enums.js";
import {
  EVENTO_PASSAGEIRO_VENCIMENTO_HOJE,
  EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO,
  EVENTO_PASSAGEIRO_ATRASADO,
  CUSTO_ESTIMADO_WABA_UNITARIO,
} from "../../config/constants.js";
import { historicoService } from "../historico.service.js";
import { getNowBR, parseLocalDate, parseBrazilianDateToISO, toPersistenceString, addDays, diffInDays } from "../../utils/date.utils.js";
import type { VencimentoDiaItemDTO, VencimentosPassageirosResponseDTO } from "../../types/dtos/admin-vencimento.dto.js";
import type {
  VencimentoDetalhesResponseDTO,
  CarteiraDiaResumoDTO,
  DisparosHojeResumoDTO,
} from "../../types/dtos/admin-vencimento-detalhes.dto.js";
import { onlyDigits, cleanString, buildAccentInsensitiveRegex } from "../../utils/string.utils.js";
import { subscriptionService } from "../subscriptions/subscription.service.js";
import type {
  UpdateUserAdminDTO,
  UpdateSubscriptionAdminDTO,
  ListUsersQuery,
  CreateUserAdminDTO,
  ListUsersLatestActivityQuery,
  MotoristaLatestActivityDTO,
  MotoristasLatestActivityResponseDTO,
  MotoristasRadarStatsDTO,
  GetMotoristasRadarStatsQuery,
} from "../../schemas/admin.schema.js";


import { adminPassageiroService } from "./admin-passageiro.service.js";
import { adminVeiculoService } from "./admin-veiculo.service.js";
import { adminEscolaService } from "./admin-escola.service.js";
import { subscriptionReferralService } from "../subscriptions/subscription-referral.service.js";
import {
  referralRepository,
  type ReferralWithIndicadorRow,
  type ReferredUserRow,
} from "../../repositories/referral.repository.js";
import { AppError } from "../../errors/AppError.js";
import { NotificationUrlBuilder } from "../notifications/utils/notification-url.builder.js";
import type { ImpersonateUserResponseDto } from "../../types/dtos/admin-impersonate.dto.js";
import type { DispositivosUsuarioResumoDTO } from "../../types/dtos/admin-user-details.dto.js";

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
    const [kpisRpcRes, recentUsersRes] = await adminUserRepository.getDashboardStats();
    if (kpisRpcRes.error) throw kpisRpcRes.error;
    const kpis = (kpisRpcRes.data as any) || {};

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
      ...(kpis.canaisAquisicao || {}),
    };

    const dispositivosCadastro: Record<string, number> = {
      [DispositivoCadastro.APP_ANDROID]: 0,
      [DispositivoCadastro.APP_IOS]: 0,
      [DispositivoCadastro.WEB_MOBILE_ANDROID]: 0,
      [DispositivoCadastro.WEB_MOBILE_IOS]: 0,
      [DispositivoCadastro.WEB_DESKTOP]: 0,
      NAO_INFORMADO: 0,
      ...(kpis.dispositivosCadastro || {}),
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
      totalMotoristas: kpis.totalMotoristas || 0,
      totalPassageiros: kpis.totalPassageiros || 0,
      receitaTotal: Number(kpis.receitaTotal) || 0,
      assinaturas: kpis.assinaturas || {
        trial: 0,
        active: 0,
        vitalicio: 0,
        past_due: 0,
        expired: 0,
        canceled: 0,
      },
      contratosStats: kpis.contratosStats || {
        totalContratos: 0,
        contratosAssinados: 0,
        contratosPendentes: 0,
        contratosSubstituidos: 0,
        valorTotalContratos: 0,
        motoristasConfigurados: 0,
        motoristasAtivos: 0,
        motoristasPausados: 0,
        motoristasNaoConfigurados: 0,
        motoristasConfig: { ativo: 0, inativo: 0, nao_configurado: 0 },
      },
      indicacoesStats: kpis.indicacoesStats || {
        total: 0,
        concluidas: 0,
        pendentes: 0,
        taxaConversao: 0,
        diasBonusConcedidos: 0,
        motoristasIndicados: 0,
      },
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

    let searchClean: string | undefined = undefined;
    let regexPattern: string | undefined = undefined;
    let isId = false;

    if (search) {
      searchClean = cleanString(search);

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(searchClean)) {
        isId = true;
      } else {
        regexPattern = buildAccentInsensitiveRegex(searchClean);
      }
    }

    const { data, error, count } = await adminUserRepository.listUsers({
      from,
      to,
      searchClean,
      regexPattern,
      isId,
      status: status?.trim() || undefined,
      tipo: query.tipo?.trim() || undefined,
    });

    if (error) {
      logger.error({ error }, "[AdminUserService] Erro ao listar usuários.");
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
    const [
      [
        userReq,
        assinaturaReq,
        faturasReq,
        kpisRpcRes,
        pushTokensReq,
        configReq,
      ],
      referralWithIndicadorRes,
    ] = await Promise.all([
      adminUserRepository.getUserDetails(userId),
      referralRepository.getReferralWithIndicador(userId).catch(() => ({ data: null })),
    ]);

    if (userReq.error || !userReq.data) throw new Error("Usuário não encontrado.");

    const userData = userReq.data;
    const statusConfiguracaoContrato = resolveDriverContractConfigStatus(
      userData.assinatura_digital_url,
      userData.config_contrato
    );

    const kpisData = (kpisRpcRes?.data as any) || {};

    const tokensList = pushTokensReq?.data || [];
    const dispositivos: DispositivosUsuarioResumoDTO = {
      total: tokensList.length,
      itens: tokensList.map((t: any) => ({
        id: t.id,
        plataforma: t.platform,
        criado_em: t.created_at,
        atualizado_em: t.updated_at,
      })),
    };

    const planos = await adminUserRepository.getPlanos();

    const referralData = referralWithIndicadorRes?.data as unknown as ReferralWithIndicadorRow | null;
    const indicadorData = referralData?.indicador;
    const indicador = (referralData && indicadorData) ? {
      id: indicadorData.id,
      nome: indicadorData.nome,
      telefone: indicadorData.telefone,
      email: indicadorData.email,
      cpfcnpj: indicadorData.cpfcnpj,
      status: referralData.status,
      created_at: referralData.created_at,
      fatura_origem_id: referralData.fatura_origem_id,
    } : null;

    if (indicador && (!userData.canal_aquisicao || userData.canal_aquisicao.trim() === "")) {
      userData.canal_aquisicao = CanalAquisicao.INDICACAO;
    }

    return {
      user: userData,
      assinatura: assinaturaReq.data,
      faturas: faturasReq.data || [],
      planos: planos.data || [],
      kpis: {
        veiculosCount: kpisData.veiculosCount ?? 0,
        escolasCount: kpisData.escolasCount ?? 0,
        passageirosCount: kpisData.passageirosCount ?? 0,
        solicitacoesPendentesCount: kpisData.solicitacoesPendentesCount ?? 0,
        contratosCount: kpisData.contratosCount ?? 0,
        contratosAssinadosCount: kpisData.contratosAssinadosCount ?? 0,
        contratosPendentesCount: kpisData.contratosPendentesCount ?? 0,
        valorTotalContratos: Number(kpisData.valorTotalContratos) || 0,
        statusConfiguracaoContrato,
      },
      referralSummary: null,
      indicador,
      referredUsers: [],
      passageiros: [],
      prePassageiros: [],
      veiculos: [],
      escolas: [],
      contratos: [],
      dispositivos,
      configuracoes: configReq?.data || null,
    };
  },

  async getUserContratos(userId: string) {
    const { data, error } = await adminUserRepository.getUserContratos(userId);
    if (error) throw error;
    return data || [];
  },

  async getUserPassageiros(userId: string) {
    return adminPassageiroService.getPassageirosByUserId(userId);
  },

  async getUserPrePassageiros(userId: string) {
    return adminPassageiroService.getPrePassageirosByUserId(userId);
  },

  async getUserVeiculos(userId: string) {
    return adminVeiculoService.getVeiculosByUserId(userId);
  },

  async getUserEscolas(userId: string) {
    return adminEscolaService.getEscolasByUserId(userId);
  },

  async getUserReferral(userId: string) {
    const [referralSummary, referralWithIndicadorRes, referredUsersRes] = await Promise.all([
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
      referralRepository.getReferralWithIndicador(userId).catch(() => ({ data: null })),
      referralRepository.getReferredUsersByIndicadorId(userId).catch(() => ({ data: [] })),
    ]);

    const referralData = referralWithIndicadorRes?.data as unknown as ReferralWithIndicadorRow | null;
    const indicadorData = referralData?.indicador;
    const referredUsersList = (referredUsersRes?.data || []) as unknown as ReferredUserRow[];

    return {
      referralSummary,
      indicador: (referralData && indicadorData) ? {
        id: indicadorData.id,
        nome: indicadorData.nome,
        telefone: indicadorData.telefone,
        email: indicadorData.email,
        cpfcnpj: indicadorData.cpfcnpj,
        status: referralData.status,
        created_at: referralData.created_at,
        fatura_origem_id: referralData.fatura_origem_id,
      } : null,
      referredUsers: referredUsersList.map((r) => ({
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        indicado: r.indicado,
      })),
    };
  },

  async setReferralAdmin(indicadoId: string, indicadorId: string) {
    if (indicadoId === indicadorId) {
      throw new AppError("O usuário não pode indicar a si mesmo.", 400);
    }

    const { data: indicador, error: indicadorError } = await userRepository.getById(indicadorId);
    if (indicadorError || !indicador) {
      throw new AppError("Motorista indicador não encontrado.", 404);
    }

    if (indicador.tipo !== UserType.MOTORISTA) {
      throw new AppError("O usuário indicador deve ser do tipo motorista.", 400);
    }

    const { data: existingReferral } = await referralRepository.getReferralByIndicadoId(indicadoId);
    if (existingReferral) {
      await referralRepository.updateReferralIndicador(indicadoId, indicadorId);
    } else {
      await subscriptionReferralService.registerReferral(indicadorId, indicadoId);
    }

    await userRepository.update(indicadoId, {
      canal_aquisicao: CanalAquisicao.INDICACAO,
      updated_at: getNowBR().toISOString(),
    });

    await historicoService.log({
      usuario_id: indicadoId,
      entidade_tipo: AtividadeEntidadeTipo.USUARIO,
      entidade_id: indicadoId,
      acao: AtividadeAcao.PERFIL_EDITADO,
      descricao: `Indicador atribuído pelo administrador: ${indicador.nome} (${indicador.telefone}).`,
    });

    return { success: true };
  },

  async removeReferralAdmin(indicadoId: string) {
    await referralRepository.deleteReferralByIndicadoId(indicadoId);

    await historicoService.log({
      usuario_id: indicadoId,
      entidade_tipo: AtividadeEntidadeTipo.USUARIO,
      entidade_id: indicadoId,
      acao: AtividadeAcao.PERFIL_EDITADO,
      descricao: "Vínculo de indicação removido pelo administrador.",
    });

    return { success: true };
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

    if (data.cobranca_aviso_previo_whatsapp_ativo !== undefined) {
      await usuarioConfiguracoesRepository.update(userId, {
        cobranca_aviso_previo_whatsapp_ativo: data.cobranca_aviso_previo_whatsapp_ativo,
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

    return { success: true, senha: newPassword };
  },

  async impersonateUser(userId: string): Promise<ImpersonateUserResponseDto> {
    const { data: user, error: fetchError } = await userRepository.getById(userId);

    if (fetchError || !user) {
      throw new AppError("Usuário não encontrado.", 404);
    }

    if (!user.email) {
      throw new AppError("Usuário não possui e-mail cadastrado para gerar o link de acesso.", 400);
    }

    const baseUrl = NotificationUrlBuilder.getBaseAppUrl();
    const redirectTo = `${baseUrl}/impersonate-bridge`;

    const { data, error: authError } = await authProvider.generateLink({
      type: "magiclink",
      email: user.email,
      options: {
        redirectTo,
      },
    });

    if (authError || !data?.properties) {
      logger.error({ authError, userId }, "[AdminUserService] Falha ao gerar link mágico de impersonation.");
      throw new AppError("Falha ao gerar o link de acesso no serviço de autenticação.", 500);
    }

    const tokenHash = data.properties.hashed_token || "";
    const impersonateUrl = `${baseUrl}/impersonate-bridge?token_hash=${tokenHash}`;

    return {
      tokenHash,
      impersonateUrl,
    };
  },

  async deleteUser(userId: string) {
    const { data: user, error: fetchError } = await userRepository.getById(userId);

    if (fetchError || !user) {
      throw new Error("Usuário não encontrado.");
    }

    const { data: subContas } = await motoristaEquipeRepository.listByGestor(userId);
    if (subContas && subContas.length > 0) {
      for (const sub of subContas) {
        if (sub.id) {
          await authProvider.deleteUser(sub.id).catch((err: unknown) => {
            logger.warn({ err, subId: sub.id }, "[AdminUserService] Falha ao expurgar sub-conta no Auth");
          });
          await usuarioPushTokenRepository.deleteTokensByUsuarioId(sub.id);
          await supabaseAdmin.from("usuarios").delete().eq("id", sub.id);
        }
      }
    }

    const { error: authError } = await authProvider.deleteUser(userId);

    if (authError) {
      logger.error({ authError, userId }, "[AdminUserService] Erro ao deletar usuário no Supabase Auth.");
      throw authError;
    }

    await usuarioPushTokenRepository.deleteTokensByUsuarioId(userId);
    await supabaseAdmin.from("usuarios").delete().eq("id", userId);

    return { success: true };
  },

  async getUsersLatestActivity(query: ListUsersLatestActivityQuery): Promise<MotoristasLatestActivityResponseDTO> {
    const { search, sort, page, limit, healthStatus, subscriptionStatus } = query;
    const offset = (page - 1) * limit;

    const { data, error } = await adminUserRepository.getUsersLatestActivity({
      search,
      sort,
      limit,
      offset,
      healthStatus,
      subscriptionStatus,
    });

    if (error) {
      logger.error({ error }, "[AdminUserService] Erro ao buscar última atividade dos motoristas.");
      throw error;
    }

    const rows = (data || []) as (MotoristaLatestActivityDTO & { total_count: number | string })[];
    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

    const items: MotoristaLatestActivityDTO[] = rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      apelido: r.apelido,
      telefone: r.telefone,
      email: r.email,
      cadastrado_em: r.cadastrado_em,
      ultima_acao: r.ultima_acao,
      ultima_descricao: r.ultima_descricao,
      ultima_atividade_at: r.ultima_atividade_at,
      assinatura_status: r.assinatura_status,
      assinatura_vencimento: r.assinatura_vencimento,
      dias_inativo: Number(r.dias_inativo),
    }));

    return {
      data: items,
      total,
      page,
      limit,
    };
  },

  async getUsersRadarStats(query: GetMotoristasRadarStatsQuery): Promise<MotoristasRadarStatsDTO> {
    const { subscriptionStatus } = query;
    const { data, error } = await adminUserRepository.getUsersRadarStats(subscriptionStatus);

    if (error) {
      logger.error({ error }, "[AdminUserService] Erro ao buscar estatísticas do radar dos motoristas.");
      throw error;
    }

    const row = ((data || []) as Array<{
      total_motoristas: number | string;
      total_ativos: number | string;
      total_alerta: number | string;
      total_em_risco: number | string;
      total_sem_atividade: number | string;
    }>)[0];

    return {
      totalMotoristas: row ? Number(row.total_motoristas) : 0,
      totalAtivos: row ? Number(row.total_ativos) : 0,
      totalAlerta: row ? Number(row.total_alerta) : 0,
      totalEmRisco: row ? Number(row.total_em_risco) : 0,
      totalSemAtividade: row ? Number(row.total_sem_atividade) : 0,
    };
  },

  async getVencimentosPassageirosPorDia(): Promise<VencimentosPassageirosResponseDTO> {
    const [passageirosRes, motoristasRes] = await Promise.all([
      adminUserRepository.getPassageirosAtivosComVencimento(),
      adminUserRepository.getMotoristasComAssinaturas(),
    ]);

    if (passageirosRes.error) {
      logger.error({ error: passageirosRes.error }, "[AdminUserService] Erro ao buscar passageiros com vencimento.");
      throw passageirosRes.error;
    }

    if (motoristasRes.error) {
      logger.error({ error: motoristasRes.error }, "[AdminUserService] Erro ao buscar motoristas com assinaturas.");
      throw motoristasRes.error;
    }

    const nowBR = getNowBR();
    const motoristasValidosIds = new Set<string>();

    for (const m of (motoristasRes.data || [])) {
      const email = (m.email || "").toLowerCase();
      const isInternalTest = email.includes("teste-google") || email.includes("@van360.com.br") || email.includes("thiago-svl");
      if (isInternalTest) continue;

      const assinaturas = (m.assinaturas as Array<{ status: string | null; data_vencimento: string | null; trial_ends_at: string | null }>) || [];
      const sub = assinaturas[0];
      if (!sub) continue;

      let isMotoristaAtivo = false;
      if (sub.status === SubscriptionStatus.ACTIVE) {
        isMotoristaAtivo = true;
      } else if (sub.status === SubscriptionStatus.TRIAL) {
        if (!sub.trial_ends_at) {
          isMotoristaAtivo = true;
        } else {
          const trialLimit = parseLocalDate(sub.trial_ends_at);
          if (!isNaN(trialLimit.getTime()) && trialLimit >= nowBR) {
            isMotoristaAtivo = true;
          }
        }
      }

      if (isMotoristaAtivo) {
        motoristasValidosIds.add(m.id);
      }
    }

    const contagemPorDia: Record<number, number> = {};
    for (let i = 1; i <= 31; i++) {
      contagemPorDia[i] = 0;
    }

    let totalPassageirosAtivosComVencimento = 0;

    for (const p of (passageirosRes.data || [])) {
      if (!motoristasValidosIds.has(p.usuario_id)) continue;
      if (p.isento) continue;

      const dia = Number(p.dia_vencimento);
      if (dia >= 1 && dia <= 31) {
        contagemPorDia[dia] = (contagemPorDia[dia] || 0) + 1;
        totalPassageirosAtivosComVencimento++;
      }
    }

    const diaAtual = nowBR.getDate();
    const vencimentosHoje = contagemPorDia[diaAtual] || 0;

    let diaComPico: { dia: number; quantidade: number } | null = null;
    let maxQtd = 0;

    const dias: VencimentoDiaItemDTO[] = [];
    for (let d = 1; d <= 31; d++) {
      const qtd = contagemPorDia[d] || 0;
      if (qtd > maxQtd) {
        maxQtd = qtd;
        diaComPico = { dia: d, quantidade: qtd };
      }

      const percentual = totalPassageirosAtivosComVencimento > 0
        ? Number(((qtd / totalPassageirosAtivosComVencimento) * 100).toFixed(1))
        : 0;

      dias.push({
        dia: d,
        quantidade: qtd,
        isHoje: d === diaAtual,
        percentual,
      });
    }

    return {
      totalPassageirosAtivosComVencimento,
      vencimentosHoje,
      diaComPico,
      diaAtual,
      dias,
    };
  },

  async getVencimentoDetalhes(dia: number, mes?: number, ano?: number): Promise<VencimentoDetalhesResponseDTO> {
    const nowBR = getNowBR();
    const diaAtual = nowBR.getDate();
    const mesAtual = nowBR.getMonth() + 1;
    const anoAtual = nowBR.getFullYear();
    const mesAlvo = mes || mesAtual;
    const anoAlvo = ano || anoAtual;
    const isHoje = dia === diaAtual && mesAlvo === mesAtual && anoAlvo === anoAtual;
    const todayStr = toPersistenceString(nowBR);

    const isDriverEligible = (m: {
      ativo?: boolean | null;
      tipo?: string | null;
      email?: string | null;
      assinaturas?: Array<{ status: string | null; data_vencimento: string | null; trial_ends_at: string | null }> | null;
    }) => {
      if (!m || !m.ativo || m.tipo !== UserType.MOTORISTA) return false;
      const email = (m.email || "").toLowerCase();
      if (email.includes("teste-google") || email.includes("@van360.com.br") || email.includes("thiago-svl")) {
        return false;
      }
      const assinaturas = m.assinaturas || [];
      const sub = assinaturas[0];
      if (!sub) return false;

      if (sub.status === SubscriptionStatus.ACTIVE) return true;
      if (sub.status === SubscriptionStatus.TRIAL) {
        if (!sub.trial_ends_at) return true;
        const trialLimit = parseLocalDate(sub.trial_ends_at);
        return !isNaN(trialLimit.getTime()) && trialLimit >= nowBR;
      }
      return false;
    };

    const dataReferencia = new Date(anoAlvo, mesAlvo - 1, dia);
    const dataRefStr = toPersistenceString(dataReferencia);
    const isPassado = dataRefStr < todayStr;
    const isFuturo = dataRefStr > todayStr;

    const targetDates = [dataRefStr];
    for (let adv = 1; adv <= 5; adv++) {
      targetDates.push(toPersistenceString(addDays(dataReferencia, adv)));
    }
    for (const diasAtraso of [3, 5, 7]) {
      targetDates.push(toPersistenceString(addDays(dataReferencia, -diasAtraso)));
    }

    const [passageirosDiaRes, cobrancasDiaRes, cobrancasReguasRes, historicoNotifsRes] = await Promise.all([
      adminUserRepository.getPassageirosAtivosDoDia(dia),
      adminUserRepository.getCobrancasDoDiaNoMes(dia, mesAlvo, anoAlvo),
      !isPassado ? adminUserRepository.getCobrancasPendentesParaReguas(targetDates) : Promise.resolve({ data: null, error: null }),
      isPassado ? adminUserRepository.getHistoricoNotificacoesCobrancaDoDia(dataRefStr) : Promise.resolve({ data: null, error: null }),
    ]);

    if (passageirosDiaRes.error) {
      logger.error({ error: passageirosDiaRes.error }, "[AdminUserService] Erro ao buscar passageiros do dia.");
      throw passageirosDiaRes.error;
    }

    if (cobrancasDiaRes.error) {
      logger.error({ error: cobrancasDiaRes.error }, "[AdminUserService] Erro ao buscar cobranças do dia.");
      throw cobrancasDiaRes.error;
    }

    if (cobrancasReguasRes.error) {
      logger.error({ error: cobrancasReguasRes.error }, "[AdminUserService] Erro ao buscar cobranças para réguas.");
      throw cobrancasReguasRes.error;
    }

    if (historicoNotifsRes.error) {
      logger.error({ error: historicoNotifsRes.error }, "[AdminUserService] Erro ao buscar histórico de notificações do dia.");
      throw historicoNotifsRes.error;
    }

    const passageirosDia = (passageirosDiaRes.data || []).filter((p) => isDriverEligible(p.motorista as Parameters<typeof isDriverEligible>[0]));
    const cobrancasDia = (cobrancasDiaRes.data || []).filter((c) => isDriverEligible(c.motorista as Parameters<typeof isDriverEligible>[0]));

    const cobrancasByPassageiroId = new Map<string, typeof cobrancasDia[0]>();
    for (const c of cobrancasDia) {
      if (c.passageiro_id) {
        cobrancasByPassageiroId.set(c.passageiro_id, c);
      }
    }

    let faturasPagas = 0;
    let faturasPendentes = 0;
    let faturasNaoGeradas = 0;
    let valorPrevistoTotal = 0;
    let valorPagoTotal = 0;
    let valorPendenteTotal = 0;

    let comTelefoneValido = 0;
    let comEmailValido = 0;
    let semResponsavelPrincipal = 0;
    let semContato = 0;
    let notificacoesDesativadasMotorista = 0;
    let lembretesDesativadosAluno = 0;

    let wabaCarteira = 0;
    let resendCarteira = 0;
    let firebaseCarteira = 0;

    for (const p of passageirosDia) {
      const c = cobrancasByPassageiroId.get(p.id);

      if (c) {
        const valor = Number(c.valor) || 0;
        valorPrevistoTotal += valor;

        if (c.status === CobrancaStatus.PAGO) {
          faturasPagas++;
          valorPagoTotal += Number(c.valor_pago || c.valor) || 0;
        } else if (c.status === CobrancaStatus.PENDENTE) {
          faturasPendentes++;
          valorPendenteTotal += valor;
        }
      } else {
        faturasNaoGeradas++;
        valorPrevistoTotal += Number(p.valor_cobranca) || 0;
      }

      const rawResponsaveis = (p as unknown as { responsaveis?: Array<{ tipo: string; responsavel: { id: string; nome: string | null; telefone: string | null; email: string | null } | Array<{ id: string; nome: string | null; telefone: string | null; email: string | null }> | null }> })?.responsaveis || [];
      const principalLink = rawResponsaveis.find((r) => r.tipo?.toLowerCase() === TipoResponsavel.PRINCIPAL);
      const rawResp = principalLink?.responsavel;
      const resp = Array.isArray(rawResp) ? rawResp[0] : rawResp;

      const rawMotorista = p.motorista as unknown as { usuario_configuracoes?: Array<{ notificar_pais_cobrancas: boolean; cobranca_vencimento_hoje_ativo: boolean }> } | Array<{ usuario_configuracoes?: Array<{ notificar_pais_cobrancas: boolean; cobranca_vencimento_hoje_ativo: boolean }> }> | null;
      const motoristaObj = Array.isArray(rawMotorista) ? rawMotorista[0] : rawMotorista;
      const motoristaConfigs = motoristaObj?.usuario_configuracoes?.[0];

      if (!principalLink || !resp) {
        semResponsavelPrincipal++;
        semContato++;
      } else {
        const hasPhone = Boolean(resp.telefone && resp.telefone.replace(/\D/g, "").length >= 8);
        const hasEmail = Boolean(resp.email && resp.email.includes("@"));

        if (hasPhone) comTelefoneValido++;
        if (hasEmail) comEmailValido++;

        if (!hasPhone && !hasEmail) {
          semContato++;
        }

        const motoristaAtivoEnvio = motoristaConfigs?.notificar_pais_cobrancas !== false;
        if (!motoristaAtivoEnvio) {
          notificacoesDesativadasMotorista++;
        }

        const alunoAtivoEnvio = p.enviar_notificacoes !== false && (!c || c.desativar_lembretes !== true);
        if (!alunoAtivoEnvio) {
          lembretesDesativadosAluno++;
        }

        if ((!c || c.status === CobrancaStatus.PENDENTE) && motoristaAtivoEnvio && alunoAtivoEnvio) {
          if (hasPhone) wabaCarteira++;
          if (hasEmail) resendCarteira++;
          firebaseCarteira++;
        }
      }
    }

    const totalAlunos = passageirosDia.length || cobrancasDia.length;

    const carteira: CarteiraDiaResumoDTO = {
      dia,
      totalAlunos,
      faturasPagas,
      faturasPendentes,
      faturasNaoGeradas,
      valorPrevistoTotal: Number(valorPrevistoTotal.toFixed(2)),
      valorPagoTotal: Number(valorPagoTotal.toFixed(2)),
      valorPendenteTotal: Number(valorPendenteTotal.toFixed(2)),
      canaisDisponiveis: {
        waba: wabaCarteira,
        resend: resendCarteira,
        firebase: firebaseCarteira,
        custoEstimadoWabaBrl: Number((wabaCarteira * CUSTO_ESTIMADO_WABA_UNITARIO).toFixed(2)),
      },
      diagnostico: {
        comTelefoneValido,
        comEmailValido,
        semResponsavelPrincipal,
        semContato,
        notificacoesDesativadasMotorista,
        lembretesDesativadosAluno,
      },
    };

    let disparosHoje: DisparosHojeResumoDTO | null = null;

    if (isPassado) {
      const historicoItems = (historicoNotifsRes.data || []) as Array<{
        id: string;
        evento: string;
        canal: string;
        status: string;
        payload: Record<string, unknown> | null;
        created_at: string;
      }>;

      const cobrancasUnicasSet = new Set<string>();
      let wabaSent = 0;
      let resendSent = 0;
      let firebaseSent = 0;

      let vencendoHojeFaturas = 0;
      let vencendoHojeWaba = 0;
      let vencendoHojeResend = 0;
      let vencendoHojeFirebase = 0;

      let avisoPrevioFaturas = 0;
      let avisoPrevioResend = 0;
      let avisoPrevioFirebase = 0;

      let atraso3DiasFaturas = 0;
      let atraso3DiasWaba = 0;
      let atraso3DiasResend = 0;
      let atraso3DiasFirebase = 0;

      const vencendoIds = new Set<string>();
      const avisoIds = new Set<string>();
      const atraso3Ids = new Set<string>();

      for (const item of historicoItems) {
        const cobrancaId = (item.payload?.cobrancaId || (item.payload?.metadata as Record<string, unknown> | undefined)?.cobrancaId) as string | undefined;
        if (cobrancaId) cobrancasUnicasSet.add(cobrancaId);

        const isSent = item.status === NotificationQueueStatus.SENT;

        if (item.evento === EVENTO_PASSAGEIRO_VENCIMENTO_HOJE) {
          if (cobrancaId) vencendoIds.add(cobrancaId);
          if (item.canal === NotificationChannelEnum.WABA && isSent) {
            wabaSent++;
            vencendoHojeWaba++;
          } else if (item.canal === NotificationChannelEnum.RESEND && isSent) {
            resendSent++;
            vencendoHojeResend++;
          } else if (item.canal === NotificationChannelEnum.FIREBASE && isSent) {
            firebaseSent++;
            vencendoHojeFirebase++;
          }
        } else if (item.evento === EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO) {
          if (cobrancaId) avisoIds.add(cobrancaId);
          if (item.canal === NotificationChannelEnum.RESEND && isSent) {
            resendSent++;
            avisoPrevioResend++;
          } else if (item.canal === NotificationChannelEnum.FIREBASE && isSent) {
            firebaseSent++;
            avisoPrevioFirebase++;
          }
        } else if (item.evento === EVENTO_PASSAGEIRO_ATRASADO) {
          if (cobrancaId) atraso3Ids.add(cobrancaId);
          if (item.canal === NotificationChannelEnum.WABA && isSent) {
            wabaSent++;
            atraso3DiasWaba++;
          } else if (item.canal === NotificationChannelEnum.RESEND && isSent) {
            resendSent++;
            atraso3DiasResend++;
          } else if (item.canal === NotificationChannelEnum.FIREBASE && isSent) {
            firebaseSent++;
            atraso3DiasFirebase++;
          }
        }
      }

      vencendoHojeFaturas = vencendoIds.size || vencendoHojeWaba || vencendoHojeResend || vencendoHojeFirebase;
      avisoPrevioFaturas = avisoIds.size || avisoPrevioResend || avisoPrevioFirebase;
      atraso3DiasFaturas = atraso3Ids.size || atraso3DiasWaba || atraso3DiasResend || atraso3DiasFirebase;

      const totalFaturasProcessadas = cobrancasUnicasSet.size || (vencendoHojeFaturas + avisoPrevioFaturas + atraso3DiasFaturas);
      const totalEnviadas = totalFaturasProcessadas;

      disparosHoje = {
        totalFaturasHoje: totalFaturasProcessadas,
        totalNotificacoesPrevistas: totalFaturasProcessadas,
        totalJaEnviadasHoje: totalEnviadas,
        totalAguardandoEnvioHoje: 0,
        canaisConsolidados: {
          waba: wabaSent,
          resend: resendSent,
          firebase: firebaseSent,
          custoEstimadoWabaBrl: Number((wabaSent * CUSTO_ESTIMADO_WABA_UNITARIO).toFixed(2)),
        },
        reguas: {
          vencendoHoje: {
            titulo: `Vencendo no Dia (${dia.toString().padStart(2, "0")}/${mesAlvo.toString().padStart(2, "0")})`,
            descricao: `Faturas com vencimento no dia executado (${dia.toString().padStart(2, "0")}/${mesAlvo.toString().padStart(2, "0")})`,
            totalFaturas: vencendoHojeFaturas,
            canais: {
              waba: vencendoHojeWaba,
              resend: vencendoHojeResend,
              firebase: vencendoHojeFirebase,
              custoEstimadoWabaBrl: Number((vencendoHojeWaba * CUSTO_ESTIMADO_WABA_UNITARIO).toFixed(2)),
            },
          },
          avisoPrevio: {
            titulo: "Avisos Prévios",
            descricao: "Faturas que vencerão nos próximos dias (D+1 a D+5)",
            totalFaturas: avisoPrevioFaturas,
            canais: {
              waba: 0,
              resend: avisoPrevioResend,
              firebase: avisoPrevioFirebase,
              custoEstimadoWabaBrl: 0,
            },
          },
          atraso3Dias: {
            titulo: "Cobrança 3 Dias em Atraso (D-3)",
            descricao: "Faturas vencidas há 3 dias (com disparo de WhatsApp WABA)",
            totalFaturas: atraso3DiasFaturas,
            canais: {
              waba: atraso3DiasWaba,
              resend: atraso3DiasResend,
              firebase: atraso3DiasFirebase,
              custoEstimadoWabaBrl: Number((atraso3DiasWaba * CUSTO_ESTIMADO_WABA_UNITARIO).toFixed(2)),
            },
          },
          atraso5Dias: {
            titulo: "Cobrança 5 Dias em Atraso (D-5)",
            descricao: "Faturas vencidas há 5 dias (E-mail e Push)",
            totalFaturas: 0,
            canais: {
              waba: 0,
              resend: 0,
              firebase: 0,
              custoEstimadoWabaBrl: 0,
            },
          },
          atraso7Dias: {
            titulo: "Cobrança 7 Dias em Atraso (D-7)",
            descricao: "Faturas vencidas há 7 dias (E-mail e Push)",
            totalFaturas: 0,
            canais: {
              waba: 0,
              resend: 0,
              firebase: 0,
              custoEstimadoWabaBrl: 0,
            },
          },
          atrasados: {
            titulo: "Cobranças em Atraso",
            descricao: "Faturas vencidas há 3, 5 ou 7 dias",
            totalFaturas: atraso3DiasFaturas,
            canais: {
              waba: atraso3DiasWaba,
              resend: atraso3DiasResend,
              firebase: atraso3DiasFirebase,
              custoEstimadoWabaBrl: Number((atraso3DiasWaba * CUSTO_ESTIMADO_WABA_UNITARIO).toFixed(2)),
            },
          },
        },
      };
    } else if (cobrancasReguasRes.data) {
      const cobrancasReguas = (cobrancasReguasRes.data || []).filter((c) => isDriverEligible(c.motorista as Parameters<typeof isDriverEligible>[0]));
      const pushTokenIdentifiers = await adminUserRepository.getIdentificadoresComPushToken();

      let vencendoHojeFaturas = 0;
      let vencendoHojeWaba = 0;
      let vencendoHojeResend = 0;
      let vencendoHojeFirebase = 0;

      let avisoPrevioFaturas = 0;
      let avisoPrevioWaba = 0;
      let avisoPrevioResend = 0;
      let avisoPrevioFirebase = 0;

      let atraso3DiasFaturas = 0;
      let atraso3DiasWaba = 0;
      let atraso3DiasResend = 0;
      let atraso3DiasFirebase = 0;

      let atraso5DiasFaturas = 0;
      let atraso5DiasResend = 0;
      let atraso5DiasFirebase = 0;

      let atraso7DiasFaturas = 0;
      let atraso7DiasResend = 0;
      let atraso7DiasFirebase = 0;

      let totalJaEnviadasHoje = 0;
      let totalAguardandoEnvioHoje = 0;

      for (const c of cobrancasReguas) {
        if (c.desativar_lembretes || (c.passageiro as { enviar_notificacoes?: boolean })?.enviar_notificacoes === false) continue;

        const responsaveisLinks = ((c.passageiro as { responsaveis?: Array<{ tipo: string; responsavel: { id: string; nome: string | null; telefone: string | null; email: string | null } | null }> })?.responsaveis || []);
        const principalLink = responsaveisLinks.find((r) => r.tipo?.toLowerCase() === TipoResponsavel.PRINCIPAL);
        const resp = principalLink?.responsavel;
        if (!resp) continue;

        const respPhoneClean = resp.telefone ? resp.telefone.replace(/\D/g, "") : "";
        const hasPhone = Boolean(respPhoneClean.length >= 8);
        const hasEmail = Boolean(resp.email && resp.email.includes("@"));
        const hasPush = Boolean(
          (resp.id && pushTokenIdentifiers.has(resp.id)) ||
          (respPhoneClean && (
            pushTokenIdentifiers.has(respPhoneClean) ||
            pushTokenIdentifiers.has(`55${respPhoneClean}`) ||
            (respPhoneClean.startsWith("55") && pushTokenIdentifiers.has(respPhoneClean.substring(2)))
          )) ||
          (resp.email && pushTokenIdentifiers.has(resp.email.trim().toLowerCase()))
        );
        if (!hasPhone && !hasEmail && !hasPush) continue;

        const motoristaConfig = (c.motorista as {
          usuario_configuracoes?: Array<{
            notificar_pais_cobrancas?: boolean;
            cobranca_aviso_previo_ativo?: boolean;
            cobranca_aviso_previo_whatsapp_ativo?: boolean;
            cobranca_dias_aviso_previo?: number;
            cobranca_vencimento_hoje_ativo?: boolean;
            cobranca_atraso_3_dias_ativo?: boolean;
            cobranca_atraso_5_dias_ativo?: boolean;
            cobranca_atraso_7_dias_ativo?: boolean;
          }>;
        })?.usuario_configuracoes?.[0];

        if (motoristaConfig?.notificar_pais_cobrancas === false) continue;

        const avisoPrevioAtivo = motoristaConfig?.cobranca_aviso_previo_ativo ?? true;
        const driverThresholdDays = Number(motoristaConfig?.cobranca_dias_aviso_previo) || 2;
        const vencimentoHojeAtivo = motoristaConfig?.cobranca_vencimento_hoje_ativo ?? true;
        const atraso3DiasAtivo = motoristaConfig?.cobranca_atraso_3_dias_ativo ?? true;
        const atraso5DiasAtivo = motoristaConfig?.cobranca_atraso_5_dias_ativo ?? true;
        const atraso7DiasAtivo = motoristaConfig?.cobranca_atraso_7_dias_ativo ?? true;

        const dataVencimentoStr = String(c.data_vencimento);
        const jaEnviado = isHoje && Boolean(c.data_envio_ultima_notificacao && toPersistenceString(c.data_envio_ultima_notificacao) >= todayStr);

        if (dataVencimentoStr === dataRefStr) {
          if (vencimentoHojeAtivo) {
            vencendoHojeFaturas++;
            if (hasPhone) vencendoHojeWaba++;
            if (hasEmail) vencendoHojeResend++;
            if (hasPush) vencendoHojeFirebase++;

            if (jaEnviado) totalJaEnviadasHoje++;
            else totalAguardandoEnvioHoje++;
          }
        } else if (dataVencimentoStr > dataRefStr) {
          if (avisoPrevioAtivo) {
            const diasAntecedencia = diffInDays(dataRefStr, dataVencimentoStr);
            if (diasAntecedencia === driverThresholdDays) {
              avisoPrevioFaturas++;
              if (motoristaConfig?.cobranca_aviso_previo_whatsapp_ativo && hasPhone) avisoPrevioWaba++;
              if (hasEmail) avisoPrevioResend++;
              if (hasPush) avisoPrevioFirebase++;

              if (jaEnviado) totalJaEnviadasHoje++;
              else totalAguardandoEnvioHoje++;
            }
          }
        } else {
          const diasAtraso = diffInDays(dataVencimentoStr, dataRefStr);
          if (diasAtraso === 3 && atraso3DiasAtivo) {
            atraso3DiasFaturas++;
            if (hasPhone) atraso3DiasWaba++;
            if (hasEmail) atraso3DiasResend++;
            if (hasPush) atraso3DiasFirebase++;

            if (jaEnviado) totalJaEnviadasHoje++;
            else totalAguardandoEnvioHoje++;
          } else if (diasAtraso === 5 && atraso5DiasAtivo) {
            atraso5DiasFaturas++;
            if (hasEmail) atraso5DiasResend++;
            if (hasPush) atraso5DiasFirebase++;

            if (jaEnviado) totalJaEnviadasHoje++;
            else totalAguardandoEnvioHoje++;
          } else if (diasAtraso === 7 && atraso7DiasAtivo) {
            atraso7DiasFaturas++;
            if (hasEmail) atraso7DiasResend++;
            if (hasPush) atraso7DiasFirebase++;

            if (jaEnviado) totalJaEnviadasHoje++;
            else totalAguardandoEnvioHoje++;
          }
        }
      }

      const totalWaba = vencendoHojeWaba + atraso3DiasWaba + avisoPrevioWaba;
      const totalResend = vencendoHojeResend + avisoPrevioResend + atraso3DiasResend + atraso5DiasResend + atraso7DiasResend;
      const totalFirebase = vencendoHojeFirebase + avisoPrevioFirebase + atraso3DiasFirebase + atraso5DiasFirebase + atraso7DiasFirebase;
      const totalFaturasHoje = vencendoHojeFaturas + avisoPrevioFaturas + atraso3DiasFaturas + atraso5DiasFaturas + atraso7DiasFaturas;
      const totalNotificacoesPrevistas = totalJaEnviadasHoje + totalAguardandoEnvioHoje;

      const atrasadosConsolidado = {
        titulo: "Cobranças em Atraso",
        descricao: "Faturas vencidas há 3, 5 ou 7 dias",
        totalFaturas: atraso3DiasFaturas + atraso5DiasFaturas + atraso7DiasFaturas,
        canais: {
          waba: atraso3DiasWaba,
          resend: atraso3DiasResend + atraso5DiasResend + atraso7DiasResend,
          firebase: atraso3DiasFirebase + atraso5DiasFirebase + atraso7DiasFirebase,
          custoEstimadoWabaBrl: Number((atraso3DiasWaba * CUSTO_ESTIMADO_WABA_UNITARIO).toFixed(2)),
        },
      };

      disparosHoje = {
        totalFaturasHoje,
        totalNotificacoesPrevistas,
        totalJaEnviadasHoje,
        totalAguardandoEnvioHoje,
        canaisConsolidados: {
          waba: totalWaba,
          resend: totalResend,
          firebase: totalFirebase,
          custoEstimadoWabaBrl: Number((totalWaba * CUSTO_ESTIMADO_WABA_UNITARIO).toFixed(2)),
        },
        reguas: {
          vencendoHoje: {
            titulo: isHoje ? "Vencendo Hoje" : `Vencendo no Dia (${dia.toString().padStart(2, "0")}/${mesAlvo.toString().padStart(2, "0")})`,
            descricao: isHoje
              ? `Faturas com vencimento no dia de hoje (${diaAtual}/${mesAtual})`
              : `Faturas com vencimento no dia selecionado (${dia.toString().padStart(2, "0")}/${mesAlvo.toString().padStart(2, "0")})`,
            totalFaturas: vencendoHojeFaturas,
            canais: {
              waba: vencendoHojeWaba,
              resend: vencendoHojeResend,
              firebase: vencendoHojeFirebase,
              custoEstimadoWabaBrl: Number((vencendoHojeWaba * CUSTO_ESTIMADO_WABA_UNITARIO).toFixed(2)),
            },
          },
          avisoPrevio: {
            titulo: "Avisos Prévios",
            descricao: "Faturas que vencerão nos próximos dias (D+1 a D+5)",
            totalFaturas: avisoPrevioFaturas,
            canais: {
              waba: avisoPrevioWaba,
              resend: avisoPrevioResend,
              firebase: avisoPrevioFirebase,
              custoEstimadoWabaBrl: Number((avisoPrevioWaba * CUSTO_ESTIMADO_WABA_UNITARIO).toFixed(2)),
            },
          },
          atraso3Dias: {
            titulo: "Cobrança 3 Dias em Atraso (D-3)",
            descricao: "Faturas vencidas há 3 dias (com disparo de WhatsApp WABA)",
            totalFaturas: atraso3DiasFaturas,
            canais: {
              waba: atraso3DiasWaba,
              resend: atraso3DiasResend,
              firebase: atraso3DiasFirebase,
              custoEstimadoWabaBrl: Number((atraso3DiasWaba * CUSTO_ESTIMADO_WABA_UNITARIO).toFixed(2)),
            },
          },
          atraso5Dias: {
            titulo: "Cobrança 5 Dias em Atraso (D-5)",
            descricao: "Faturas vencidas há 5 dias (E-mail e Push)",
            totalFaturas: atraso5DiasFaturas,
            canais: {
              waba: 0,
              resend: atraso5DiasResend,
              firebase: atraso5DiasFirebase,
              custoEstimadoWabaBrl: 0,
            },
          },
          atraso7Dias: {
            titulo: "Cobrança 7 Dias em Atraso (D-7)",
            descricao: "Faturas vencidas há 7 dias (E-mail e Push)",
            totalFaturas: atraso7DiasFaturas,
            canais: {
              waba: 0,
              resend: atraso7DiasResend,
              firebase: atraso7DiasFirebase,
              custoEstimadoWabaBrl: 0,
            },
          },
          atrasados: atrasadosConsolidado,
        },
      };
    }

    return {
      dia,
      mes: mesAlvo,
      ano: anoAlvo,
      isHoje,
      isPassado,
      isFuturo,
      carteira,
      disparosHoje,
      disparosDia: disparosHoje,
    };
  },

  async deleteInvoice(invoiceId: string) {
    const { data: fatura, error: fetchError } = await invoiceRepository.getById(invoiceId);
    if (fetchError || !fatura) {
      throw new AppError("Fatura não encontrada.", 404);
    }

    await referralRepository.nullifyFaturaOrigem(invoiceId).catch((err: unknown) => {
      logger.warn({ err, invoiceId }, "[AdminUserService] Falha não impeditiva ao desvincular fatura na indicação.");
    });

    const { error: deleteError } = await invoiceRepository.deleteInvoice(invoiceId);
    if (deleteError) {
      logger.error({ deleteError, invoiceId }, "[AdminUserService] Erro ao deletar fatura.");
      throw new AppError("Erro ao excluir fatura.", 500);
    }

    await historicoService.log({
      usuario_id: fatura.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.SAAS_FATURA,
      entidade_id: invoiceId,
      acao: AtividadeAcao.SAAS_FATURA_EXCLUIDA,
      descricao: `Fatura no valor de R$ ${Number(fatura.valor || 0).toFixed(2)} foi excluída pelo administrador.`,
    }).catch((err: unknown) => {
      logger.warn({ err, invoiceId }, "[AdminUserService] Falha não impeditiva ao registrar log de histórico da fatura.");
    });

    return { success: true, message: "Fatura excluída com sucesso." };
  },
};



