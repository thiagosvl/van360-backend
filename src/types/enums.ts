


export enum SubscriptionBillingType {
  SUBSCRIPTION = "subscription",
  UPGRADE_PLAN = "upgrade_plan", // Código atual (Manter ou alinhar com DB se db tiver 'upgrade_plan') -> DB tem 'upgrade_plan'
  UPGRADE = "upgrade", // DB has 'upgrade'
  DOWNGRADE = "downgrade",
  ACTIVATION = "activation",
  EXPANSION = "expansion",
  RENEWAL = "renewal",
  SCHOOL_FEE = "school_fee"
}

export enum UserSubscriptionStatus {
  ATIVA = "ativa",
  TRIAL = "trial",
  SUSPENSA = "suspensa",
  PENDENTE_PAGAMENTO = "pendente_pagamento",
  CANCELADA = "cancelada"
}

export enum ChargeStatus {
  PAGO = "pago",
  PENDENTE = "pendente",
  ATRASADO = "atrasado"
}

export enum SubscriptionChargeStatus {
  PAGO = "pago",
  PENDENTE = "pendente_pagamento",
  CANCELADA = "cancelada"
}

export enum ChargePaymentType {
  DINHEIRO = "dinheiro",
  CARTAO_CREDITO = "cartao-credito",
  CARTAO_DEBITO = "cartao-debito",
  TRANSFERENCIA = "transferencia",
  PIX = "PIX",
  BOLETO = "boleto"
}

export enum CobrancaOrigem {
  INTER = "inter",
  MANUAL = "manual",
  AUTOMATICA = "automatica",
  JOB_RENOVACAO = "job_renovacao"
}

export enum CobrancaTipo {
  MENSALIDADE = "mensalidade",
  AVULSA = "avulsa"
}

export enum PaymentMethod {
  PIX = "PIX",
  BOLETO = "BOLETO",
  CARTAO = "CARTAO"
}

export enum PassageiroDesativacaoCobrancaAutomaticaMotivo {
  MANUAL = "manual",
  AUTOMATICO = "automatico",
}

export enum UserType {
  ADMIN = "admin",
  MOTORISTA = "motorista",
  RESPONSAVEL = "responsavel",
  ESCOLA = "escola"
}

export enum WhatsappStatus {
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  UNKNOWN = "UNKNOWN",
  NOT_FOUND = "NOT_FOUND"
}

export enum PixKeyStatus {
  VALIDADA = "VALIDADA",
  NAO_CADASTRADA = "NAO_CADASTRADA",
  INVALIDADA_POS_FALHA = "INVALIDADA_POS_FALHA",
  PENDENTE_VALIDACAO = "PENDENTE_VALIDACAO"
}

export enum TransactionStatus {
  SUCESSO = "SUCESSO",
  ERRO = "ERRO",
  PROCESSAMENTO = "PROCESSAMENTO",
  PENDENTE = "PENDENTE"
}

export enum RepasseStatus {
  PENDENTE = "PENDENTE",
  PROCESSANDO = "PROCESSANDO",
  REPASSADO = "REPASSADO",
  FALHA = "FALHA_REPASSE"
}

export enum PixKeyType {
  CPF = "CPF",
  CNPJ = "CNPJ",
  TELEFONE = "TELEFONE",
  EMAIL = "EMAIL",
  ALEATORIA = "ALEATORIA"
}

export enum ConfigKey {
  TAXA_INTERMEDIACAO_PIX = "TAXA_INTERMEDIACAO_PIX",
  PRO_RATA_DIAS_MES = "PRO_RATA_DIAS_MES",
  PRO_RATA_VALOR_MINIMO = "PRO_RATA_VALOR_MINIMO",
  VALOR_INCREMENTO_PASSAGEIRO_EXCESSO = "VALOR_INCREMENTO_PASSAGEIRO_EXCESSO",
  DIA_GERACAO_MENSALIDADES = "DIA_GERACAO_MENSALIDADES",
  DIAS_ANTECEDENCIA_AVISO_VENCIMENTO = "DIAS_ANTECEDENCIA_AVISO_VENCIMENTO",
  DIAS_ANTECEDENCIA_RENOVACAO = "DIAS_ANTECEDENCIA_RENOVACAO",
  TRIAL_DIAS_ESSENCIAL = "TRIAL_DIAS_ESSENCIAL",
  PIX_EXPIRACAO_SEGUNDOS = "PIX_EXPIRACAO_SEGUNDOS",
  PIX_VALIDADE_APOS_VENCIMENTO = "PIX_VALIDADE_APOS_VENCIMENTO"
}
