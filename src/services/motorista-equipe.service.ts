import { authProvider } from "./providers/auth.provider.js";
import { motoristaEquipeRepository } from "../repositories/motorista-equipe.repository.js";
import { veiculoRepository } from "../repositories/veiculo.repository.js";
import { authRepository } from "../repositories/auth.repository.js";
import { CreateMembroEquipeDTO, UpdateMembroEquipeDTO } from "../types/dtos/motorista-equipe.dto.js";
import { AppError } from "../errors/AppError.js";
import { NotificationChannelEnum, AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";
import { logger } from "../config/logger.js";
import { notificationService } from "./notifications/notification.service.js";
import { historicoService } from "./historico.service.js";
import { calculateAuditDiff } from "../utils/audit-diff.util.js";
import {
  EVENTO_MOTORISTA_EQUIPE_CADASTRO,
  EVENTO_MOTORISTA_EQUIPE_RESET_SENHA,
} from "../config/constants.js";

export const motoristaEquipeService = {
  async listMembros(gestorId: string, veiculoIdFilter?: string) {
    const { data, error } = await motoristaEquipeRepository.listByGestor(gestorId, veiculoIdFilter);
    if (error) {
      logger.error(error, "Erro ao listar membros da equipe");
      throw new AppError("Erro ao listar membros da equipe", 500);
    }
    return data;
  },

  async createMembro(gestorId: string, dto: CreateMembroEquipeDTO) {
    const veiculo = await veiculoRepository.getById(dto.veiculo_id);
    if (!veiculo.data || veiculo.data.usuario_id !== gestorId) {
      throw new AppError("Veículo inválido ou não pertencente à sua frota", 400);
    }

    const { data: existingUsers } = await authRepository.checkUserStatus(
      dto.cpf,
      dto.email,
      dto.telefone
    );

    if (existingUsers && existingUsers.length > 0) {
      const existing = existingUsers[0];
      if (existing.email && existing.email.toLowerCase() === dto.email.toLowerCase()) {
        throw new AppError("O E-mail informado já está cadastrado no sistema", 400);
      }
      if (existing.cpfcnpj && existing.cpfcnpj === dto.cpf) {
        throw new AppError("O CPF/CNPJ informado já está cadastrado no sistema", 400);
      }
      if (existing.telefone && existing.telefone === dto.telefone) {
        throw new AppError("O Telefone informado já está cadastrado no sistema", 400);
      }
    }

    const { data: authUser, error: authError } = await authProvider.createUser({
      email: dto.email,
      password: dto.senha,
      email_confirm: true,
      user_metadata: {
        nome: dto.nome,
        role: dto.tipo,
      }
    });

    if (authError || !authUser.user) {
      const rawMsg = (authError?.message || "").toLowerCase();
      if (rawMsg.includes("email") || rawMsg.includes("already been registered")) {
        throw new AppError("O E-mail informado já está cadastrado no sistema", 400);
      }
      if (rawMsg.includes("phone") || rawMsg.includes("telefone")) {
        throw new AppError("O Telefone informado já está cadastrado no sistema", 400);
      }
      const msg = authError?.message || "Erro ao criar conta de autenticação";
      throw new AppError(msg, 400);
    }

    const userId = authUser.user.id;

    try {
      const { data: profile, error: profileError } = await motoristaEquipeRepository.createProfile({
        id: userId,
        nome: dto.nome,
        apelido: dto.apelido,
        razao_social: dto.razao_social,
        email: dto.email,
        telefone: dto.telefone,
        cpfcnpj: dto.cpf,
        tipo: dto.tipo,
        conta_pai_id: gestorId,
        veiculo_id: dto.veiculo_id,
      });

      if (profileError) {
        logger.error({ profileError, dto }, "Erro ao inserir perfil do membro da equipe na tabela usuarios");

        try {
          await authProvider.deleteUser(userId);
        } catch (delErr) {
          logger.error({ delErr, userId }, "Erro ao realizar rollback de usuario no Auth");
        }

        if (profileError.code === "23505") {
          const details = (profileError.details || profileError.message || "").toLowerCase();
          if (details.includes("cpfcnpj")) {
            throw new AppError("O CPF/CNPJ informado já está cadastrado no sistema", 400);
          }
          if (details.includes("email")) {
            throw new AppError("O E-mail informado já está cadastrado no sistema", 400);
          }
          if (details.includes("telefone")) {
            throw new AppError("O Telefone informado já está cadastrado no sistema", 400);
          }
          throw new AppError("Este usuário (CPF, e-mail ou telefone) já possui cadastro no sistema", 400);
        }

        throw new AppError(profileError.message || "Erro ao criar perfil da equipe no banco de dados", 400);
      }

      if (dto.email || dto.telefone) {
        notificationService.notifyDriver(
          dto.telefone || "",
          EVENTO_MOTORISTA_EQUIPE_CADASTRO,
          {
            nomeMotorista: dto.nome,
            cpfLogin: dto.cpf,
            senhaTemporaria: dto.senha,
            email: dto.email,
          },
          { channels: [NotificationChannelEnum.RESEND], email: dto.email, usuarioId: userId }
        ).catch((err) => logger.warn({ err, userId }, "[MotoristaEquipeService] Falha ao enviar mensagem de boas-vindas"));
      }

      const cargoDescCriado = dto.tipo === "monitor" ? "Monitor(a)" : "Motorista auxiliar";
      historicoService.log({
        usuario_id: gestorId,
        entidade_tipo: AtividadeEntidadeTipo.EQUIPE,
        entidade_id: userId,
        acao: AtividadeAcao.EQUIPE_MEMBRO_CRIADO,
        descricao: `${cargoDescCriado} ${dto.nome} cadastrado(a) na equipe.`,
        meta: {
          membro_id: userId,
          nome: dto.nome,
          tipo: dto.tipo,
          email: dto.email,
          telefone: dto.telefone,
          cpf: dto.cpf,
          veiculo_id: dto.veiculo_id,
        }
      });

      return profile;
    } catch (err: any) {
      try {
        await authProvider.deleteUser(userId);
      } catch { }
      throw err;
    }
  },

  async updateMembro(id: string, gestorId: string, dto: UpdateMembroEquipeDTO) {
    const membroAnterior = await motoristaEquipeRepository.getById(id, gestorId);
    if (membroAnterior.error || !membroAnterior.data) {
      throw new AppError("Membro da equipe não encontrado", 404);
    }

    if (dto.veiculo_id) {
      const veiculo = await veiculoRepository.getById(dto.veiculo_id);
      if (!veiculo.data || veiculo.data.usuario_id !== gestorId) {
        throw new AppError("Veículo inválido ou não pertencente à sua frota", 400);
      }
    }

    const { data, error } = await motoristaEquipeRepository.updateProfile(id, gestorId, dto);
    if (error || !data) {
      throw new AppError("Membro da equipe não encontrado ou falha ao atualizar", 404);
    }

    if (dto.nome || dto.tipo) {
      await authProvider.updateUserById(id, {
        user_metadata: {
          ...(dto.nome ? { nome: dto.nome } : {}),
          ...(dto.tipo ? { role: dto.tipo } : {}),
        }
      });
    }

    const diff = calculateAuditDiff(membroAnterior.data, dto);

    if (diff.hasChanges) {
      const cargoDescEditado = (data.tipo || membroAnterior.data.tipo) === "monitor" ? "Monitor(a)" : "Motorista auxiliar";
      historicoService.log({
        usuario_id: gestorId,
        entidade_tipo: AtividadeEntidadeTipo.EQUIPE,
        entidade_id: id,
        acao: AtividadeAcao.EQUIPE_MEMBRO_EDITADO,
        descricao: `Dados do(a) ${cargoDescEditado.toLowerCase()} ${data.nome} foram atualizados.`,
        meta: {
          membro_id: id,
          nome: data.nome,
          tipo: data.tipo,
          campos_alterados: diff.campos,
          campos: diff.campos,
          alteracoes: diff.alteracoes
        }
      });
    }

    return data;
  },

  async redefinirSenha(id: string, gestorId: string, novaSenha: string) {
    const membro = await motoristaEquipeRepository.getById(id, gestorId);
    if (membro.error || !membro.data) {
      throw new AppError("Membro da equipe não encontrado", 404);
    }

    const { error } = await authProvider.updateUserById(id, {
      password: novaSenha
    });

    if (error) {
      throw new AppError("Erro ao redefinir a senha do membro da equipe", 500);
    }

    if (membro.data.telefone) {
      notificationService.notifyDriver(
        membro.data.telefone,
        EVENTO_MOTORISTA_EQUIPE_RESET_SENHA,
        {
          nomeMotorista: membro.data.nome,
          senhaTemporaria: novaSenha,
        },
        { channels: [NotificationChannelEnum.RESEND], usuarioId: gestorId, email: membro.data.email }
      ).catch((err) => logger.warn({ err, id }, "[MotoristaEquipeService] Falha ao enviar mensagem de redefinição de senha"));
    }

    const cargoDescSenha = membro.data.tipo === "monitor" ? "Monitor(a)" : "Motorista auxiliar";
    historicoService.log({
      usuario_id: gestorId,
      entidade_tipo: AtividadeEntidadeTipo.EQUIPE,
      entidade_id: id,
      acao: AtividadeAcao.EQUIPE_SENHA_RESETADA,
      descricao: `Senha do(a) ${cargoDescSenha.toLowerCase()} ${membro.data.nome} foi redefinida.`,
      meta: {
        membro_id: id,
        nome: membro.data.nome,
        tipo: membro.data.tipo,
      }
    });

    return { message: "Senha redefinida com sucesso!" };
  },

  async desativarMembro(id: string, gestorId: string) {
    const membro = await motoristaEquipeRepository.getById(id, gestorId);
    if (membro.error || !membro.data) {
      throw new AppError("Membro da equipe não encontrado", 404);
    }

    const novoStatus = !membro.data.ativo;
    const { data, error } = await motoristaEquipeRepository.updateProfile(id, gestorId, { ativo: novoStatus });
    if (error || !data) {
      throw new AppError("Falha ao atualizar status do membro da equipe", 500);
    }

    const cargoDescStatus = membro.data.tipo === "monitor" ? "Monitor(a)" : "Motorista auxiliar";
    historicoService.log({
      usuario_id: gestorId,
      entidade_tipo: AtividadeEntidadeTipo.EQUIPE,
      entidade_id: id,
      acao: AtividadeAcao.EQUIPE_MEMBRO_STATUS,
      descricao: `${cargoDescStatus} ${data.nome} foi ${novoStatus ? "ativado(a)" : "desativado(a)"}.`,
      meta: {
        membro_id: id,
        nome: data.nome,
        tipo: data.tipo,
        ativo: novoStatus,
        alteracoes: [{
          campo: "ativo",
          de: membro.data.ativo,
          para: novoStatus
        }],
        campos: ["ativo"]
      }
    });

    return data;
  },

  async deleteMembro(id: string, gestorId: string) {
    const membro = await motoristaEquipeRepository.getById(id, gestorId);
    if (membro.error || !membro.data) {
      throw new AppError("Funcionário não encontrado", 404);
    }

    await motoristaEquipeRepository.reassignRecordsToGestor(id, gestorId);

    const { error: deleteError } = await motoristaEquipeRepository.hardDeleteProfile(id, gestorId);
    if (deleteError) {
      logger.error({ deleteError, id }, "Erro ao deletar perfil do usuário no banco de dados");
      throw new AppError("Erro ao remover usuário do banco de dados", 500);
    }

    try {
      await authProvider.deleteUser(id);
    } catch (authErr) {
      logger.error({ authErr, id }, "Erro ao remover usuário do Supabase Auth após exclusão do perfil");
    }

    const cargoDescExcluido = membro.data.tipo === "monitor" ? "Monitor(a)" : "Motorista auxiliar";
    historicoService.log({
      usuario_id: gestorId,
      entidade_tipo: AtividadeEntidadeTipo.EQUIPE,
      entidade_id: id,
      acao: AtividadeAcao.EQUIPE_MEMBRO_EXCLUIDO,
      descricao: `${cargoDescExcluido} ${membro.data.nome} foi excluído(a) da equipe.`,
      meta: {
        membro_id: id,
        nome: membro.data.nome,
        tipo: membro.data.tipo,
        email: membro.data.email,
        telefone: membro.data.telefone,
      }
    });

    return { message: "Funcionário excluído com sucesso e histórico preservado" };
  }
};
