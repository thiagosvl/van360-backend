import { userRepository } from "../repositories/user.repository.js";
import { escolaRepository } from "../repositories/escola.repository.js";
import { AppError } from "../errors/AppError.js";
import { getDriverDisplayName } from "../utils/format.js";
import { PublicMotoristaDTO } from "../types/dtos/usuario.dto.js";
import { ListEscolasFiltersDTO } from "../types/dtos/escola.dto.js";
import {
  CamposFormularioExternoDTO,
  DEFAULT_CAMPOS_FORMULARIO_EXTERNO,
} from "../types/dtos/configuracoes.dto.js";

export async function validateMotoristaPublic(motoristaId: string): Promise<PublicMotoristaDTO> {
    const { data, error } = await userRepository.getPublicData(motoristaId);

    if (error || !data) {
        throw new AppError("Motorista não encontrado ou link inválido.", 404);
    }

    const displayName = getDriverDisplayName(data);
    const rawConfig = Array.isArray(data.usuario_configuracoes)
      ? data.usuario_configuracoes[0]
      : data.usuario_configuracoes;

    const camposFormularioExterno: CamposFormularioExternoDTO = {
      ...DEFAULT_CAMPOS_FORMULARIO_EXTERNO,
      ...(typeof rawConfig?.campos_formulario_externo === "object" && rawConfig?.campos_formulario_externo !== null
        ? (rawConfig.campos_formulario_externo as unknown as Partial<CamposFormularioExternoDTO>)
        : {}),
    };

    return {
        id: data.id,
        nome: data.nome,
        apelido: data.apelido,
        logo_url: data.logo_url || null,
        display_name: displayName,
        campos_formulario_externo: camposFormularioExterno,
    };
}

export async function listEscolasPublic(motoristaId: string) {
    const filters: ListEscolasFiltersDTO = { ativo: "true" };
    const { data, error } = await escolaRepository.list(motoristaId, filters);

    if (error) {
        throw new AppError("Erro ao buscar escolas do motorista.", 400);
    }

    return data || [];
}
