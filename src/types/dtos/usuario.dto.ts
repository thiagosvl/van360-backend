import { AtualizarUsuarioInput } from "../../schemas/usuario.schema.js";
import { CamposFormularioExternoDTO } from "./configuracoes.dto.js";

export type AtualizarUsuarioDTO = AtualizarUsuarioInput;

export interface PublicMotoristaDTO {
    id: string;
    nome: string;
    apelido: string | null;
    logo_url: string | null;
    display_name: string;
    campos_formulario_externo: CamposFormularioExternoDTO;
}
