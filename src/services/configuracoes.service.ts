import { AppError } from "../errors/AppError.js";
import { userRepository } from "../repositories/user.repository.js";
import { usuarioConfiguracoesRepository } from "../repositories/usuario-configuracoes.repository.js";
import { motoristaFinanceiroRepository } from "../repositories/motorista-financeiro.repository.js";
import { historicoService } from "./historico.service.js";
import {
  ConfiguracoesUsuarioDTO,
  UpdateConfiguracoesDTO,
  CamposFormularioExternoDTO,
} from "../types/dtos/configuracoes.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo, ConfigKey } from "../types/enums.js";
import { getConfigNumber } from "./configuracao.service.js";
import { calculateAuditDiff } from "../utils/audit-diff.util.js";
import {
  resolveCamposFormularioExterno,
  resolvePerguntasPersonalizadas,
} from "../utils/dados-complementares.utils.js";

export async function obterConfiguracoesUsuario(usuarioId: string): Promise<ConfiguracoesUsuarioDTO> {
  const { data: usuario, error: userError } = await userRepository.getById(usuarioId);

  if (userError || !usuario) {
    throw new AppError("Usuário não encontrado.", 404);
  }

  const config = await usuarioConfiguracoesRepository.getByUsuarioId(usuarioId);
  const configFin = await motoristaFinanceiroRepository.getByUsuarioId(usuarioId);
  const diasPadrao = await getConfigNumber(ConfigKey.PASSAGEIRO_DIAS_AVISO_VENCIMENTO, 2);

  const camposFormularioExterno = resolveCamposFormularioExterno(config?.campos_formulario_externo);

  return {
    cobranca_aviso_previo_ativo: config?.cobranca_aviso_previo_ativo ?? true,
    cobranca_aviso_previo_whatsapp_ativo: config?.cobranca_aviso_previo_whatsapp_ativo ?? false,
    cobranca_dias_aviso_previo: config?.cobranca_dias_aviso_previo ?? null,
    cobranca_vencimento_hoje_ativo: config?.cobranca_vencimento_hoje_ativo ?? true,
    cobranca_atraso_3_dias_ativo: config?.cobranca_atraso_3_dias_ativo ?? true,
    cobranca_atraso_5_dias_ativo: config?.cobranca_atraso_5_dias_ativo ?? true,
    cobranca_atraso_7_dias_ativo: config?.cobranca_atraso_7_dias_ativo ?? true,
    dias_aviso_vencimento_padrao_sistema: diasPadrao,
    notificar_motorista_parcelas: config?.notificar_motorista_parcelas ?? true,
    notificar_motorista_aniversarios: config?.notificar_motorista_aniversarios ?? true,
    notificar_inicio_rota: config?.notificar_inicio_rota ?? true,
    notificar_proxima_parada: config?.notificar_proxima_parada ?? true,
    notificar_conclusao_parada: config?.notificar_conclusao_parada ?? true,
    rastreamento_ativo: config?.rastreamento_ativo ?? true,
    rastreamento_modo: config?.rastreamento_modo ?? "completo",
    formato_nome_responsavel: (config?.formato_nome_responsavel as "primeiro_nome" | "completo") ?? "primeiro_nome",
    formato_nome_aluno: (config?.formato_nome_aluno as "curto" | "completo") ?? "curto",
    exibir_telefone_lista_alunos: config?.exibir_telefone_lista_alunos ?? false,
    contrato_exibir_dados_veiculo: config?.contrato_exibir_dados_veiculo ?? true,
    campos_formulario_externo: camposFormularioExterno,
    chave_pix: configFin?.chave_pix_repasse ?? null,
    tipo_chave_pix: configFin?.tipo_chave_pix ?? null,
  };
}

export async function atualizarConfiguracoesUsuario(
  usuarioId: string,
  payload: UpdateConfiguracoesDTO
): Promise<ConfiguracoesUsuarioDTO> {
  try {
    const configAnterior = await usuarioConfiguracoesRepository.getByUsuarioId(usuarioId);

    const updateData: Record<string, unknown> = { ...payload };

    if (payload.campos_formulario_externo) {
      const camposAtuais = resolveCamposFormularioExterno(configAnterior?.campos_formulario_externo);
      const merged: CamposFormularioExternoDTO = {
        ...camposAtuais,
        ...payload.campos_formulario_externo,
        perguntas_personalizadas:
          payload.campos_formulario_externo.perguntas_personalizadas !== undefined
            ? resolvePerguntasPersonalizadas(payload.campos_formulario_externo.perguntas_personalizadas)
            : camposAtuais.perguntas_personalizadas,
      };

      updateData.campos_formulario_externo = merged;
    }

    await usuarioConfiguracoesRepository.update(usuarioId, updateData);

    const diff = calculateAuditDiff(
      configAnterior as Record<string, unknown> | null,
      updateData
    );

    if (diff.hasChanges) {
      historicoService.log({
        usuario_id: usuarioId,
        entidade_tipo: AtividadeEntidadeTipo.USUARIO,
        entidade_id: usuarioId,
        acao: AtividadeAcao.CONFIGURACES_EDITADAS,
        descricao: "Preferências de notificação do motorista alteradas.",
        meta: {
          campos_alterados: diff.campos,
          campos: diff.campos,
          alteracoes: diff.alteracoes,
        },
      });
    }

    return obterConfiguracoesUsuario(usuarioId);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("Erro ao salvar as configurações.", 500);
  }
}
