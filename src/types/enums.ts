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
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  UNKNOWN = "UNKNOWN",
  NOT_FOUND = "NOT_FOUND"
}





export enum ConfigKey {
  DIA_GERACAO_MENSALIDADES = "DIA_GERACAO_MENSALIDADES",
  DIAS_ANTECEDENCIA_AVISO_VENCIMENTO = "DIAS_ANTECEDENCIA_AVISO_VENCIMENTO",
  DIAS_COBRANCA_POS_VENCIMENTO = "DIAS_COBRANCA_POS_VENCIMENTO"
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

export enum PaymentProvider {
  DUMMY = "dummy",
  ASAAS = "asaas",
  INTER = "inter",
  EFI = "efi"
}

export enum SubscriptionStatus {
  TRIAL = "trial",
  ACTIVE = "active",
  PAST_DUE = "past_due",
  CANCELED = "canceled",
  EXPIRED = "expired"
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



// InterTransferStatus removido

export enum AtividadeEntidadeTipo {
  COBRANCA = "COBRANCA",
  PASSAGEIRO = "PASSAGEIRO",
  USUARIO = "USUARIO",
  GASTO = "GASTO",
  VEICULO = "VEICULO",
  ESCOLA = "ESCOLA",
  CONTRATO = "CONTRATO",
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
  LOG_LIMPEZA = "LOG_LIMPEZA"
}
