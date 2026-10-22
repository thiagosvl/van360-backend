import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { TipoChavePix } from "../types/enums.js";
import { isValidPixKey } from "../utils/validators.js";
import { maskCpf, maskCnpj, maskPhone } from "../utils/format.js";

export type PixEscopo = "CONTA" | "VEICULO" | "ALUNO";

export interface ValidarChavePixParams {
  chavePix: string;
  tipoChavePix: TipoChavePix;
  usuarioId: string;
  escopo?: PixEscopo;
  entidadeId?: string;
  veiculoId?: string | null;
}

export function chavesPixSaoEquivalentes(chaveA?: string | null, chaveB?: string | null): boolean {
  if (!chaveA || !chaveB) return false;
  const a = chaveA.trim().toLowerCase();
  const b = chaveB.trim().toLowerCase();
  if (a === b) return true;

  if (a.includes("@") || b.includes("@")) {
    return a === b;
  }

  const digA = a.replace(/\D/g, "");
  const digB = b.replace(/\D/g, "");
  if (!digA || !digB) return false;
  if (digA === digB) return true;

  if ((digA.length === 10 || digA.length === 11) && digB === `55${digA}`) return true;
  if ((digB.length === 10 || digB.length === 11) && digA === `55${digB}`) return true;

  return false;
}

function gerarVariantesBusca(chave: string, tipo: TipoChavePix): string[] {
  const limpa = chave.trim();
  const variantes = new Set<string>();
  variantes.add(limpa);
  variantes.add(limpa.toLowerCase());

  const digitos = limpa.replace(/\D/g, "");

  if (tipo === TipoChavePix.CPF && digitos.length === 11) {
    variantes.add(digitos);
    variantes.add(maskCpf(digitos));
  } else if (tipo === TipoChavePix.CNPJ && digitos.length === 14) {
    variantes.add(digitos);
    variantes.add(maskCnpj(digitos));
  } else if (tipo === TipoChavePix.TELEFONE) {
    const numNacional = (digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")
      ? digitos.slice(2)
      : digitos;

    if (numNacional.length === 10 || numNacional.length === 11) {
      variantes.add(numNacional);
      variantes.add(maskPhone(numNacional));
      variantes.add(`+55${numNacional}`);
      variantes.add(`55${numNacional}`);
      variantes.add(`+55 ${maskPhone(numNacional)}`);
    }
  }

  return Array.from(variantes);
}

export const pixValidationService = {
  chavesPixSaoEquivalentes,

  async validarDisponibilidadeChavePix(params: ValidarChavePixParams): Promise<void> {
    const { chavePix, tipoChavePix, usuarioId } = params;

    const chaveTrim = chavePix.trim();
    if (!chaveTrim) return;

    const formatoValido = isValidPixKey(tipoChavePix, chaveTrim);
    if (!formatoValido) {
      throw new AppError("Formato de chave Pix inválido para o tipo selecionado.", 400);
    }

    const variantes = gerarVariantesBusca(chaveTrim, tipoChavePix);

    const [motoristasRes, veiculosRes, passageirosRes] = await Promise.all([
      supabaseAdmin
        .from("motorista_configuracoes_financeiras")
        .select("usuario_id, chave_pix_repasse")
        .in("chave_pix_repasse", variantes),
      supabaseAdmin
        .from("veiculos")
        .select("id, usuario_id, chave_pix")
        .in("chave_pix", variantes),
      supabaseAdmin
        .from("passageiros")
        .select("id, usuario_id, chave_pix")
        .in("chave_pix", variantes)
    ]);

    const candidatosMotoristas = motoristasRes.data || [];
    for (const c of candidatosMotoristas) {
      if (chavesPixSaoEquivalentes(c.chave_pix_repasse, chaveTrim) && c.usuario_id !== usuarioId) {
        throw new AppError("Esta chave Pix já está em uso por outro motorista na plataforma.", 400);
      }
    }

    const candidatosVeiculos = veiculosRes.data || [];
    for (const v of candidatosVeiculos) {
      if (chavesPixSaoEquivalentes(v.chave_pix, chaveTrim) && v.usuario_id !== usuarioId) {
        throw new AppError("Esta chave Pix já está em uso por outro motorista na plataforma.", 400);
      }
    }

    const candidatosPassageiros = passageirosRes.data || [];
    for (const p of candidatosPassageiros) {
      if (chavesPixSaoEquivalentes(p.chave_pix, chaveTrim) && p.usuario_id !== usuarioId) {
        throw new AppError("Esta chave Pix já está em uso por outro motorista na plataforma.", 400);
      }
    }
  }
};
