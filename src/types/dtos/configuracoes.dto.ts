import { RastreamentoModo, TipoPerguntaPersonalizadaEnum } from "../enums.js";

export interface PerguntaPersonalizadaConfigDTO {
  id: string;
  pergunta: string;
  tipo: TipoPerguntaPersonalizadaEnum;
  placeholder_detalhe?: string | null;
  obrigatorio: boolean;
  ativo: boolean;
  is_padrao?: boolean;
}

export interface RespostaComplementarItemDTO {
  id: string;
  pergunta: string;
  tipo: TipoPerguntaPersonalizadaEnum;
  resposta_booleana?: boolean | null;
  resposta_texto?: string | null;
}

export const DEFAULT_PERGUNTAS_PERSONALIZADAS: PerguntaPersonalizadaConfigDTO[] = [
  {
    id: "saude_doenca",
    pergunta: "A criança possui ou já teve alguma doença ou condição médica?",
    tipo: TipoPerguntaPersonalizadaEnum.SIM_NAO_TEXTO,
    placeholder_detalhe: "Informe qual doença ou condição médica",
    obrigatorio: true,
    ativo: false,
    is_padrao: true,
  },
  {
    id: "saude_medicamento",
    pergunta: "Toma algum remédio regularmente?",
    tipo: TipoPerguntaPersonalizadaEnum.SIM_NAO_TEXTO,
    placeholder_detalhe: "Informe qual remédio e o horário",
    obrigatorio: true,
    ativo: false,
    is_padrao: true,
  },
  {
    id: "saude_alergia",
    pergunta: "Sofre de algum tipo de alergia (medicamento, alimento, etc.)?",
    tipo: TipoPerguntaPersonalizadaEnum.SIM_NAO_TEXTO,
    placeholder_detalhe: "Informe qual alergia e os cuidados necessários",
    obrigatorio: true,
    ativo: false,
    is_padrao: true,
  },
  {
    id: "saude_convenio",
    pergunta: "Possui convênio médico / plano de saúde?",
    tipo: TipoPerguntaPersonalizadaEnum.SIM_NAO_TEXTO,
    placeholder_detalhe: "Informe o nome do convênio e o nº do cartão",
    obrigatorio: true,
    ativo: false,
    is_padrao: true,
  },
  {
    id: "saude_tipo_sanguineo",
    pergunta: "Qual é o tipo sanguíneo e fator RH da criança?",
    tipo: TipoPerguntaPersonalizadaEnum.TEXTO_LIVRE,
    placeholder_detalhe: "Ex: O+, A-, Não sei informar",
    obrigatorio: false,
    ativo: false,
    is_padrao: true,
  },
  {
    id: "autorizado_receber",
    pergunta: "Se não tiver ninguém em casa, quem pode receber a criança?",
    tipo: TipoPerguntaPersonalizadaEnum.TEXTO_LIVRE,
    placeholder_detalhe: "Informe Nome, Parentesco e Telefone(s)",
    obrigatorio: true,
    ativo: false,
    is_padrao: true,
  },
];

export interface CamposFormularioExternoDTO {
  turma: boolean;
  data_nascimento: boolean;
  genero: boolean;
  periodo: boolean;
  modalidade: boolean;
  parentesco_responsavel: boolean;
  email_responsavel: boolean;
  perguntas_personalizadas?: PerguntaPersonalizadaConfigDTO[];
}

export const DEFAULT_CAMPOS_FORMULARIO_EXTERNO: CamposFormularioExternoDTO = {
  turma: false,
  data_nascimento: true,
  genero: true,
  periodo: true,
  modalidade: true,
  parentesco_responsavel: true,
  email_responsavel: true,
  perguntas_personalizadas: DEFAULT_PERGUNTAS_PERSONALIZADAS,
};

export interface ConfiguracoesUsuarioDTO {
  cobranca_aviso_previo_ativo: boolean;
  cobranca_aviso_previo_whatsapp_ativo: boolean;
  cobranca_dias_aviso_previo: number | null;
  cobranca_vencimento_hoje_ativo: boolean;
  cobranca_atraso_3_dias_ativo: boolean;
  cobranca_atraso_5_dias_ativo: boolean;
  cobranca_atraso_7_dias_ativo: boolean;
  dias_aviso_vencimento_padrao_sistema: number;
  notificar_motorista_parcelas: boolean;
  notificar_motorista_aniversarios: boolean;
  notificar_inicio_rota: boolean;
  notificar_proxima_parada: boolean;
  notificar_conclusao_parada: boolean;
  rastreamento_ativo: boolean;
  rastreamento_modo: RastreamentoModo;
  formato_nome_aluno: "curto" | "completo";
  formato_nome_responsavel: "primeiro_nome" | "completo";
  exibir_telefone_lista_alunos: boolean;
  contrato_exibir_dados_veiculo: boolean;
  campos_formulario_externo: CamposFormularioExternoDTO;
  chave_pix: string | null;
  tipo_chave_pix: string | null;
}

export interface UpdateConfiguracoesDTO {
  cobranca_aviso_previo_ativo?: boolean;
  cobranca_dias_aviso_previo?: number | null;
  cobranca_vencimento_hoje_ativo?: boolean;
  cobranca_atraso_3_dias_ativo?: boolean;
  cobranca_atraso_5_dias_ativo?: boolean;
  cobranca_atraso_7_dias_ativo?: boolean;
  notificar_motorista_parcelas?: boolean;
  notificar_motorista_aniversarios?: boolean;
  notificar_inicio_rota?: boolean;
  notificar_proxima_parada?: boolean;
  notificar_conclusao_parada?: boolean;
  rastreamento_ativo?: boolean;
  rastreamento_modo?: RastreamentoModo;
  formato_nome_aluno?: "curto" | "completo";
  formato_nome_responsavel?: "primeiro_nome" | "completo";
  exibir_telefone_lista_alunos?: boolean;
  contrato_exibir_dados_veiculo?: boolean;
  campos_formulario_externo?: Partial<CamposFormularioExternoDTO>;
}
