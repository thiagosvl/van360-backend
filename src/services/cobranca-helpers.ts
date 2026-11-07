import { TipoResponsavel } from "../types/enums.js";

export interface ResponsavelContactInfo {
  id?: string;
  nome?: string;
  telefone?: string;
  cpf?: string;
  email?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  parentesco?: string | null;
}

export interface ResponsavelLinkInfo {
  id?: string;
  tipo?: string;
  parentesco?: string | null;
  responsavel?: ResponsavelContactInfo | ResponsavelContactInfo[];
}

export interface PassageiroCobrancaInfo {
  id?: string;
  nome?: string;
  genero?: string | null;
  isento?: boolean | null;
  enviar_notificacoes?: boolean | null;
  modo_cobranca?: string | null;
  chave_pix?: string | null;
  tipo_chave_pix?: string | null;
  responsaveis?: ResponsavelLinkInfo[];
  responsavel_principal?: ResponsavelContactInfo | null;
}

export interface CreateCobrancaOptions {
  skipLog?: boolean;
}

export const getResponsavelFromPassageiro = (
  passageiroInfo?: PassageiroCobrancaInfo | Record<string, unknown> | null
): {
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  raw?: ResponsavelContactInfo;
} => {
  if (!passageiroInfo) return { nome: "", telefone: "", email: "", cpf: "" };
  const typed = passageiroInfo as PassageiroCobrancaInfo;
  const respLink = Array.isArray(typed.responsaveis)
    ? (typed.responsaveis.find((r) => r.tipo === TipoResponsavel.PRINCIPAL) || typed.responsaveis[0])
    : null;
  const rawResp =
    typed.responsavel_principal ||
    (respLink ? (Array.isArray(respLink.responsavel) ? respLink.responsavel[0] : respLink.responsavel) : null);
  const resp = Array.isArray(rawResp) ? rawResp[0] : rawResp;
  return {
    nome: resp?.nome || "",
    telefone: resp?.telefone || "",
    email: resp?.email || "",
    cpf: resp?.cpf || "",
    raw: resp || undefined,
  };
};

export const enrichCobrancaWithResponsavelPrincipal = <T extends Record<string, unknown>>(
  cobranca: T
): T & { passageiro?: Record<string, unknown> } => {
  if (!cobranca || !cobranca.passageiro || typeof cobranca.passageiro !== "object") {
    return cobranca;
  }

  const p = cobranca.passageiro as PassageiroCobrancaInfo & Record<string, unknown>;
  const links = Array.isArray(p.responsaveis) ? p.responsaveis : [];
  const principalLink = links.find((l) => l.tipo === TipoResponsavel.PRINCIPAL) || links[0];
  const rawResp = p.responsavel_principal || principalLink?.responsavel;
  const resp = Array.isArray(rawResp) ? rawResp[0] : rawResp;

  const enrichedPassageiro: Record<string, unknown> = {
    ...p,
    responsavel_principal:
      (principalLink && resp) || p.responsavel_principal
        ? {
            id: resp?.id || null,
            nome: resp?.nome || null,
            telefone: resp?.telefone || null,
            cpf: resp?.cpf || null,
            email: resp?.email || null,
            parentesco: principalLink?.parentesco || p.responsavel_principal?.parentesco || null,
          }
        : null,
  };

  delete enrichedPassageiro.responsaveis;

  return {
    ...cobranca,
    passageiro: enrichedPassageiro,
  };
};

const normalizeText = (text?: string | null): string => {
  if (!text) return "";
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

export const filterCobrancasBySearchTerm = <T extends Record<string, unknown>>(
  cobrancas: T[],
  searchTerm?: string
): T[] => {
  if (!searchTerm || !searchTerm.trim()) return cobrancas;
  const term = normalizeText(searchTerm);
  return cobrancas.filter((c) => {
    const passageiro = c.passageiro as PassageiroCobrancaInfo | undefined;
    const nomePassageiro = normalizeText(passageiro?.nome);
    const nomeRespPrincipal = normalizeText(passageiro?.responsavel_principal?.nome);
    return nomePassageiro.includes(term) || nomeRespPrincipal.includes(term);
  });
};
