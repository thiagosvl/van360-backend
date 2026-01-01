export const PLANO_GRATUITO = "gratuito";
export const PLANO_ESSENCIAL = "essencial";
export const PLANO_PROFISSIONAL = "profissional"; 

export const ASSINATURA_COBRANCA_STATUS_PAGO = "pago";
export const ASSINATURA_COBRANCA_STATUS_PENDENTE_PAGAMENTO = "pendente_pagamento";
export const ASSINATURA_COBRANCA_STATUS_CANCELADA = "cancelada"

export const ASSINATURA_COBRANCA_TIPO_PAGAMENTO_PIX = "pix";

export const ASSINATURA_USUARIO_STATUS_ATIVA = "ativa";
export const ASSINATURA_USUARIO_STATUS_TRIAL = "trial";
export const ASSINATURA_USUARIO_STATUS_SUSPENSA = "suspensa";
export const ASSINATURA_USUARIO_STATUS_PENDENTE_PAGAMENTO = "pendente_pagamento";
export const ASSINATURA_USUARIO_STATUS_CANCELADA = "cancelada";

// PIX Constants
export const TipoChavePix = {
    CPF: "CPF",
    CNPJ: "CNPJ",
    TELEFONE: "TELEFONE",
    EMAIL: "EMAIL",
    ALEATORIA: "ALEATORIA"
} as const;

export const TIPOS_CHAVE_PIX_VALIDOS = Object.values(TipoChavePix);