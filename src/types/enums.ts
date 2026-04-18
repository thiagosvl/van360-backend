export enum CobrancaStatus {
  PAGO = "pago",
  PENDENTE = "pendente"
}

export enum CobrancaTipoPagamento {
  DINHEIRO = "dinheiro",
  CARTAO_CREDITO = "cartao-credito",
  CARTAO_DEBITO = "cartao-debito",
  TRANSFERENCIA = "transferencia",
  PIX = "PIX",
  BOLETO = "boleto"
}

export enum CobrancaOrigem {
  MANUAL = "manual",
  AUTOMATICA = "automatica",
}

export enum CobrancaTipo {
  MENSALIDADE = "mensalidade",
  AVULSA = "avulsa"
}

export enum PassageiroDesativacaoCobrancaAutomaticaMotivo {
  MANUAL = "manual",
  AUTOMATICA = "automatica",
}

export enum UserType {
  ADMIN = "admin",
  MOTORISTA = "motorista",
}

export enum WhatsappStatus {
  // Estados Legados/Gerais
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",

  // Estados Oficiais Evolution v2
  OPEN = "open",
  CLOSE = "close",

  // Estados Internos do Sistema
  UNKNOWN = "UNKNOWN",
  NOT_FOUND = "NOT_FOUND"
}

export enum EvolutionEvent {
  // Eventos recebidos no Webhook (Lowercase/Dot notation)
  CONNECTION_UPDATE = "connection.update",
  MESSAGES_UPSERT = "messages.upsert",      // Novo na v2 para novas mensagens
  MESSAGES_UPDATE = "messages.update",      // Status da mensagem
  SEND_MESSAGE = "send.message",
  QRCODE_UPDATED = "qrcode.updated",
  LOGOUT_INSTANCE = "logout.instance",

  // Eventos para Configuração (Uppercase/Underscore - para setWebhook)
  _CONNECTION_UPDATE = "CONNECTION_UPDATE",
  _MESSAGES_UPSERT = "MESSAGES_UPSERT",
  _MESSAGES_UPDATE = "MESSAGES_UPDATE",
  _SEND_MESSAGE = "SEND_MESSAGE",
  _QRCODE_UPDATED = "QRCODE_UPDATED",
  _LOGOUT_INSTANCE = "LOGOUT_INSTANCE",
}

export enum WhatsappMediaType {
  TEXT = "text",
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
  DOCUMENT = "document"
}

export enum EvolutionIntegration {
  BAILEYS = "WHATSAPP-BAILEYS"
}





export enum ConfigKey {
  DIA_GERACAO_MENSALIDADES = "DIA_GERACAO_MENSALIDADES",
  DIAS_ANTECEDENCIA_AVISO_VENCIMENTO = "DIAS_ANTECEDENCIA_AVISO_VENCIMENTO",
  DIAS_COBRANCA_POS_VENCIMENTO = "DIAS_COBRANCA_POS_VENCIMENTO",
  TAXA_SERVICO_PADRAO = "TAXA_SERVICO_PADRAO",
  TAXA_BANCARIA_PIX_ENTRADA = "TAXA_BANCARIA_PIX_ENTRADA",
  TAXA_BANCARIA_PIX_SAIDA = "TAXA_BANCARIA_PIX_SAIDA",
  TAXA_BANCARIA_SPLIT = "TAXA_BANCARIA_SPLIT",
  DIAS_VENCIMENTO_COBRANCA = "DIAS_VENCIMENTO_COBRANCA",
  SAAS_DIAS_VENCIMENTO = "SAAS_DIAS_VENCIMENTO",
  SAAS_DIAS_CARENCIA = "SAAS_DIAS_CARENCIA",
  SAAS_DIAS_AVISO_TRIAL = "SAAS_DIAS_AVISO_TRIAL",
  SAAS_PROMOCAO_ATIVA = "SAAS_PROMOCAO_ATIVA",
  SAAS_MAX_TENTATIVAS_CARTAO = "SAAS_MAX_TENTATIVAS_CARTAO",
  PIX_EXPIRACAO_SEGUNDOS = "PIX_EXPIRACAO_SEGUNDOS",
  PIX_VALIDADE_APOS_VENCIMENTO = "PIX_VALIDADE_APOS_VENCIMENTO",
}



export enum ContratoStatus {
  PENDENTE = "pendente",
  ASSINADO = "assinado",
  SUBSTITUIDO = "substituido"
}

export enum PassageiroModalidade {
  IDA = "ida",
  VOLTA = "volta",
  IDA_VOLTA = "ida_volta"
}

export enum PassageiroGenero {
  MASCULINO = "masculino",
  FEMININO = "feminino",
  PREFIRO_NAO_INFORMAR = "prefiro_nao_informar"
}

export enum ParentescoResponsavel {
  PAI = "pai",
  MAE = "mae",
  AVO = "avo",
  TIO = "tio",
  IRMAO = "irmao",
  PRIMO = "primo",
  PADRASTRO = "padrastro",
  MADRASTA = "madrasta",
  RESPONSAVEL_LEGAL = "responsavel_legal",
  OUTRO = "outro"
}

export enum ContratoProvider {
  INHOUSE = "inhouse",
  ASSINAFY = "assinafy",
  DOCUSIGN = "docusign"
}

export enum SubscriptionStatus {
  TRIAL = "TRIAL",
  ACTIVE = "ACTIVE",
  PAST_DUE = "PAST_DUE",
  CANCELED = "CANCELED",
  EXPIRED = "EXPIRED"
}

export enum SubscriptionInvoiceStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  CANCELED = "CANCELED",
  FAILED = "FAILED"
}

export enum SubscriptionIdentifer {
  MONTHLY = "MONTHLY",
  YEARLY = "YEARLY"
}

export enum IndicacaoStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  CANCELED = "CANCELED"
}

export enum CheckoutPaymentMethod {
  PIX = "pix",
  CREDIT_CARD = "credit_card"
}

export enum PaymentProvider {
  EFIPAY = "efipay",
  WOOVI = "woovi"
}

export enum ContractMultaTipo {
  PERCENTUAL = "percentual",
  FIXO = "fixo"
}

export enum PeriodoEnum {
  MANHA = "manha",
  TARDE = "tarde",
  NOITE = "noite",
  INTEGRAL = "integral"
}

export enum AtividadeEntidadeTipo {
  COBRANCA = "COBRANCA",
  PASSAGEIRO = "PASSAGEIRO",
  USUARIO = "USUARIO",
  GASTO = "GASTO",
  VEICULO = "VEICULO",
  ESCOLA = "ESCOLA",
  CONTRATO = "CONTRATO",
  SAAS_ASSINATURA = "SAAS_ASSINATURA",
  SAAS_FATURA = "SAAS_FATURA",
}

export enum AtividadeAcao {
  // Financeiro
  COBRANCA_CRIADA = "COBRANCA_CRIADA",
  COBRANCA_EDITADA = "COBRANCA_EDITADA",
  COBRANCA_EXCLUIDA = "COBRANCA_EXCLUIDA",
  PAGAMENTO_MANUAL = "PAGAMENTO_MANUAL",
  PAGAMENTO_REVERTIDO = "PAGAMENTO_REVERTIDO",
  NOTIFICACAO_WHATSAPP = "NOTIFICACAO_WHATSAPP",
  CONFIG_LEMBRETE = "CONFIG_LEMBRETE",

  // Passageiro
  PASSAGEIRO_CRIADO = "PASSAGEIRO_CRIADO",
  PASSAGEIRO_EDITADO = "PASSAGEIRO_EDITADO",
  PASSAGEIRO_STATUS = "PASSAGEIRO_STATUS",
  PASSAGEIRO_EXCLUIDO = "PASSAGEIRO_EXCLUIDO",
  PRE_CADASTRO_CONCLUIDO = "PRE_CADASTRO_CONCLUIDO",

  // Perfil / Sistema
  PERFIL_EDITADO = "PERFIL_EDITADO",
  CONTRATO_CONFIG_EDITADA = "CONTRATO_CONFIG_EDITADA",
  CONTRATO_GERADO = "CONTRATO_GERADO",
  CONTRATO_ASSINADO = "CONTRATO_ASSINADO",
  CONTRATO_EXCLUIDO = "CONTRATO_EXCLUIDO",
  USUARIO_SUSPENSO = "USUARIO_SUSPENSO",
  WHATSAPP_STATUS_ALTERADO = "WHATSAPP_STATUS_ALTERADO",
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  SENHA_ALTERADA = "SENHA_ALTERADA",
  RECUPERACAO_SENHA = "RECUPERACAO_SENHA",

  // Operacional
  GASTO_REGISTRADO = "GASTO_REGISTRADO",
  GASTO_EDITADO = "GASTO_EDITADO",
  GASTO_EXCLUIDO = "GASTO_EXCLUIDO",
  VEICULO_CRIADO = "VEICULO_CRIADO",
  VEICULO_EDITADO = "VEICULO_EDITADO",
  VEICULO_STATUS = "VEICULO_STATUS",
  VEICULO_EXCLUIDO = "VEICULO_EXCLUIDO",
  ESCOLA_CRIADA = "ESCOLA_CRIADA",
  ESCOLA_EDITADA = "ESCOLA_EDITADA",
  ESCOLA_STATUS = "ESCOLA_STATUS",
  ESCOLA_EXCLUIDA = "ESCOLA_EXCLUIDA",

  // Jobs
  COBRANCAS_GERADAS = "COBRANCAS_GERADAS",
  LOG_LIMPEZA = "LOG_LIMPEZA",

  // SaaS / Assinaturas
  SAAS_ASSINATURA_ATIVA = "SAAS_ASSINATURA_ATIVA",
  SAAS_ASSINATURA_CANCELADA = "SAAS_ASSINATURA_CANCELADA",
  SAAS_FATURA_GERADA = "SAAS_FATURA_GERADA",
  SAAS_PAGAMENTO_RECEBIDO = "SAAS_PAGAMENTO_RECEBIDO"
}
