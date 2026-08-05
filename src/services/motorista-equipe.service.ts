import { authProvider } from "./providers/auth.provider.js";
import { motoristaEquipeRepository } from "../repositories/motorista-equipe.repository.js";
import { veiculoRepository } from "../repositories/veiculo.repository.js";
import { authRepository } from "../repositories/auth.repository.js";
import { CreateMembroEquipeDTO, UpdateMembroEquipeDTO } from "../types/dtos/motorista-equipe.dto.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../config/logger.js";
import { notificationService } from "./notifications/notification.service.js";
import {
  EVENTO_MOTORISTA_EQUIPE_CADASTRO,
  EVENTO_MOTORISTA_EQUIPE_RESET_SENHA,
  EVENTO_MOTORISTA_EQUIPE_STATUS_ALTERADO,
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
    // 1. Validar se o veículo pertence ao Gestor
    const veiculo = await veiculoRepository.getById(dto.veiculo_id);
    if (!veiculo.data || veiculo.data.usuario_id !== gestorId) {
      throw new AppError("Veículo inválido ou não pertencente à sua frota", 400);
    }

    // 1.5 Checagem prévia na tabela usuarios para E-mail, CPF/CNPJ ou Telefone duplicados
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

    // 2. Criar no Supabase Auth Admin
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

    // 3. Criar Perfil na Tabela `usuarios`
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
        
        // Rollback Auth user if profile creation failed
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

      // Disparar notificação via WhatsApp (em segundo plano)
      if (dto.telefone) {
        notificationService.notifyDriver(
          dto.telefone,
          EVENTO_MOTORISTA_EQUIPE_CADASTRO,
          {
            nomeMotorista: dto.nome,
            cpfLogin: dto.cpf,
            senhaTemporaria: dto.senha,
          },
          { usuarioId: gestorId }
        ).catch((err) => logger.warn({ err, userId }, "[MotoristaEquipeService] Falha ao enviar WhatsApp de boas-vindas"));
      }

      return profile;
    } catch (err: any) {
      try {
        await authProvider.deleteUser(userId);
      } catch {}
      throw err;
    }
  },

  async updateMembro(id: string, gestorId: string, dto: UpdateMembroEquipeDTO) {
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

    // Se o nome ou tipo foi atualizado, sincronizar no app_metadata do Auth
    if (dto.nome || dto.tipo) {
      await authProvider.updateUserById(id, {
        user_metadata: {
          ...(dto.nome ? { nome: dto.nome } : {}),
          ...(dto.tipo ? { role: dto.tipo } : {}),
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
        { usuarioId: gestorId }
      ).catch((err) => logger.warn({ err, id }, "[MotoristaEquipeService] Falha ao enviar WhatsApp de redefinição de senha"));
    }

    return { message: "Senha redefinida com sucesso!" };
  },

  async desativarMembro(id: string, gestorId: string) {
    const { data, error } = await motoristaEquipeRepository.softDelete(id, gestorId);
    if (error || !data) {
      throw new AppError("Membro da equipe não encontrado", 404);
    }

    if (data.telefone) {
      notificationService.notifyDriver(
        data.telefone,
        EVENTO_MOTORISTA_EQUIPE_STATUS_ALTERADO,
        {
          nomeMotorista: data.nome,
          isEngaged: data.ativo !== false,
        },
        { usuarioId: gestorId }
      ).catch((err) => logger.warn({ err, id }, "[MotoristaEquipeService] Falha ao enviar WhatsApp de status alterado"));
    }

    return data;
  },

  async deleteMembro(id: string, gestorId: string) {
    const membro = await motoristaEquipeRepository.getById(id, gestorId);
    if (membro.error || !membro.data) {
      throw new AppError("Funcionário não encontrado", 404);
    }

    // 1. Reatribuir histórico (gastos, execuções de rota, presenças, ausências) para o gestor
    await motoristaEquipeRepository.reassignRecordsToGestor(id, gestorId);

    // 2. Apagar registro em public.usuarios
    const { error: deleteError } = await motoristaEquipeRepository.hardDeleteProfile(id, gestorId);
    if (deleteError) {
      logger.error({ deleteError, id }, "Erro ao deletar perfil do usuário no banco de dados");
      throw new AppError("Erro ao remover usuário do banco de dados", 500);
    }

    // 3. Apagar conta no Supabase Auth
    try {
      await authProvider.deleteUser(id);
    } catch (authErr) {
      logger.error({ authErr, id }, "Erro ao remover usuário do Supabase Auth após exclusão do perfil");
    }

    return { message: "Funcionário excluído com sucesso e histórico preservado" };
  }
};
