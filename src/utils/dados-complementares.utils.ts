import {
  CamposFormularioExternoDTO,
  DEFAULT_CAMPOS_FORMULARIO_EXTERNO,
  DEFAULT_PERGUNTAS_PERSONALIZADAS,
  PerguntaPersonalizadaConfigDTO,
  RespostaComplementarItemDTO,
} from "../types/dtos/configuracoes.dto.js";
import { TipoPerguntaPersonalizadaEnum } from "../types/enums.js";
import { cleanString } from "./string.utils.js";

export function resolvePerguntasPersonalizadas(
  rawPerguntas?: unknown
): PerguntaPersonalizadaConfigDTO[] {
  if (!Array.isArray(rawPerguntas)) {
    return DEFAULT_PERGUNTAS_PERSONALIZADAS.map((item) => ({ ...item }));
  }

  const sanitizedList: PerguntaPersonalizadaConfigDTO[] = [];
  const seenIds = new Set<string>();

  for (const raw of rawPerguntas) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const pergunta = typeof item.pergunta === "string" ? item.pergunta.trim() : "";
    if (!id || !pergunta || seenIds.has(id)) continue;

    const defaultMatch = DEFAULT_PERGUNTAS_PERSONALIZADAS.find((d) => d.id === id);
    const tipo =
      item.tipo === TipoPerguntaPersonalizadaEnum.TEXTO_LIVRE
        ? TipoPerguntaPersonalizadaEnum.TEXTO_LIVRE
        : TipoPerguntaPersonalizadaEnum.SIM_NAO_TEXTO;

    seenIds.add(id);
    sanitizedList.push({
      id,
      pergunta,
      tipo,
      placeholder_detalhe:
        typeof item.placeholder_detalhe === "string"
          ? item.placeholder_detalhe.trim()
          : (defaultMatch?.placeholder_detalhe ?? null),
      obrigatorio:
        typeof item.obrigatorio === "boolean"
          ? item.obrigatorio
          : (defaultMatch?.obrigatorio ?? true),
      ativo: Boolean(item.ativo),
      is_padrao: defaultMatch ? true : Boolean(item.is_padrao),
    });
  }

  for (const padrao of DEFAULT_PERGUNTAS_PERSONALIZADAS) {
    if (!seenIds.has(padrao.id)) {
      sanitizedList.push({ ...padrao });
    }
  }

  return sanitizedList;
}

export function resolveCamposFormularioExterno(
  rawConfig?: unknown
): CamposFormularioExternoDTO {
  const obj =
    typeof rawConfig === "object" && rawConfig !== null
      ? (rawConfig as Record<string, unknown>)
      : {};

  return {
    turma: typeof obj.turma === "boolean" ? obj.turma : DEFAULT_CAMPOS_FORMULARIO_EXTERNO.turma,
    data_nascimento:
      typeof obj.data_nascimento === "boolean"
        ? obj.data_nascimento
        : DEFAULT_CAMPOS_FORMULARIO_EXTERNO.data_nascimento,
    genero:
      typeof obj.genero === "boolean" ? obj.genero : DEFAULT_CAMPOS_FORMULARIO_EXTERNO.genero,
    periodo:
      typeof obj.periodo === "boolean" ? obj.periodo : DEFAULT_CAMPOS_FORMULARIO_EXTERNO.periodo,
    modalidade:
      typeof obj.modalidade === "boolean"
        ? obj.modalidade
        : DEFAULT_CAMPOS_FORMULARIO_EXTERNO.modalidade,
    parentesco_responsavel:
      typeof obj.parentesco_responsavel === "boolean"
        ? obj.parentesco_responsavel
        : DEFAULT_CAMPOS_FORMULARIO_EXTERNO.parentesco_responsavel,
    email_responsavel:
      typeof obj.email_responsavel === "boolean"
        ? obj.email_responsavel
        : DEFAULT_CAMPOS_FORMULARIO_EXTERNO.email_responsavel,
    perguntas_personalizadas: resolvePerguntasPersonalizadas(obj.perguntas_personalizadas),
  };
}

export function sanitizeDadosComplementares(
  rawList?: unknown
): RespostaComplementarItemDTO[] {
  if (!Array.isArray(rawList)) return [];

  const result: RespostaComplementarItemDTO[] = [];
  const seenIds = new Set<string>();

  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const pergunta = typeof raw.pergunta === "string" ? cleanString(raw.pergunta) : "";
    if (!id || !pergunta || seenIds.has(id)) continue;

    const tipo =
      raw.tipo === TipoPerguntaPersonalizadaEnum.TEXTO_LIVRE
        ? TipoPerguntaPersonalizadaEnum.TEXTO_LIVRE
        : TipoPerguntaPersonalizadaEnum.SIM_NAO_TEXTO;

    const respostaBooleana =
      typeof raw.resposta_booleana === "boolean" ? raw.resposta_booleana : null;
    const textoLimpo =
      typeof raw.resposta_texto === "string" && raw.resposta_texto.trim() !== ""
        ? cleanString(raw.resposta_texto)
        : null;

    if (tipo === TipoPerguntaPersonalizadaEnum.SIM_NAO_TEXTO) {
      if (respostaBooleana === null) continue;
      seenIds.add(id);
      result.push({
        id,
        pergunta,
        tipo,
        resposta_booleana: respostaBooleana,
        resposta_texto: respostaBooleana ? textoLimpo : null,
      });
    } else {
      if (!textoLimpo) continue;
      seenIds.add(id);
      result.push({
        id,
        pergunta,
        tipo,
        resposta_booleana: null,
        resposta_texto: textoLimpo,
      });
    }
  }

  return result;
}

export function formatRespostaComplementarParaContrato(
  item: RespostaComplementarItemDTO
): string {
  if (item.tipo === TipoPerguntaPersonalizadaEnum.SIM_NAO_TEXTO) {
    if (item.resposta_booleana === true) {
      return item.resposta_texto ? `Sim — ${item.resposta_texto}` : "Sim";
    }
    return "Não";
  }
  return item.resposta_texto || "-";
}

export function buildMockDadosComplementaresForPreview(
  rawCamposFormulario?: unknown
): RespostaComplementarItemDTO[] {
  const campos = resolveCamposFormularioExterno(rawCamposFormulario);
  const ativas = (campos.perguntas_personalizadas || []).filter((p) => p.ativo);
  if (ativas.length === 0) return [];

  return ativas.map((p) => {
    if (p.tipo === TipoPerguntaPersonalizadaEnum.SIM_NAO_TEXTO) {
      return {
        id: p.id,
        pergunta: p.pergunta,
        tipo: p.tipo,
        resposta_booleana: false,
        resposta_texto: null,
      };
    }
    return {
      id: p.id,
      pergunta: p.pergunta,
      tipo: p.tipo,
      resposta_booleana: null,
      resposta_texto: "Informação preenchida no cadastro",
    };
  });
}
