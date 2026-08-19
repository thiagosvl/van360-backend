import { AppError } from "../errors/AppError.js";
import { userRepository } from "../repositories/user.repository.js";
import { usuarioConfiguracoesRepository } from "../repositories/usuario-configuracoes.repository.js";
import { historicoService } from "./historico.service.js";
import { ConfiguracoesUsuarioDTO, UpdateConfiguracoesDTO } from "../types/dtos/configuracoes.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";

export async function obterConfiguracoesUsuario(usuarioId: string): Promise<ConfiguracoesUsuarioDTO> {
  const { data: usuario, error: userError } = await userRepository.getById(usuarioId);

  if (userError || !usuario) {
    throw new AppError("Usuário não encontrado.", 404);
  }

  const config = await usuarioConfiguracoesRepository.getByUsuarioId(usuarioId);

  return {
    notificar_pais_cobrancas: config?.notificar_pais_cobrancas ?? true,
    notificar_motorista_parcelas: config?.notificar_motorista_parcelas ?? true,
    notificar_motorista_aniversarios: config?.notificar_motorista_aniversarios ?? true,
    notificar_inicio_rota: config?.notificar_inicio_rota ?? true,
    notificar_proxima_parada: config?.notificar_proxima_parada ?? true,
    notificar_conclusao_parada: config?.notificar_conclusao_parada ?? true,
    rastreamento_ativo: config?.rastreamento_ativo ?? true,
    rastreamento_modo: config?.rastreamento_modo ?? "completo",
    chave_pix: usuario.chave_pix ?? null,
    tipo_chave_pix: usuario.tipo_chave_pix ?? null,
  };
}

export async function atualizarConfiguracoesUsuario(
  usuarioId: string,
  payload: UpdateConfiguracoesDTO
): Promise<ConfiguracoesUsuarioDTO> {
  try {
    await usuarioConfiguracoesRepository.update(usuarioId, payload);

    historicoService.log({
      usuario_id: usuarioId,
      entidade_tipo: AtividadeEntidadeTipo.USUARIO,
      entidade_id: usuarioId,
      acao: AtividadeAcao.CONFIGURACES_EDITADAS,
      descricao: "Preferências de notificação do motorista alteradas.",
      meta: payload,
    });

    return await obterConfiguracoesUsuario(usuarioId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`Erro ao atualizar configurações: ${msg}`, 500);
  }
}
