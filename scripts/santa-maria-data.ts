export interface SantaMariaSchool {
  id: string;
  nome: string;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  latitude: number;
  longitude: number;
}

export interface SantaMariaStopData {
  ordem: number;
  tipo_no: "escola" | "passageiro";
  sentido: "indo" | "voltando" | null;
  escola?: {
    id: string;
    nome: string;
    logradouro: string;
    numero: string;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
    latitude: number;
    longitude: number;
  };
  passageiro?: {
    id: string;
    nome: string;
    data_nascimento: string | null;
    genero: "masculino" | "feminino";
    modalidade: "ida_volta" | "ida" | "volta";
    periodo: "manha" | "tarde";
    valor_cobranca: number;
    dia_vencimento: number;
    escola_id: string;
    latitude: number;
    longitude: number;
  };
  responsavel?: {
    id: string;
    nome: string;
    telefone: string;
    cpf: string | null;
    email: string | null;
    logradouro: string;
    numero: string;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
    complemento: string | null;
    parentesco: "mae" | "pai" | "avo" | "responsavel_legal";
  };
}

export const santaMariaEscolas: SantaMariaSchool[] = [
  {
    id: "567e57b5-c9bd-46cc-b605-614c8c2d0176",
    nome: "Jardim de Infância 116 de Santa Maria",
    logradouro: "Quadra QR 116 Conjunto H",
    numero: "9",
    bairro: "Santa Maria",
    cidade: "Brasília",
    estado: "DF",
    cep: "72546408",
    latitude: -16.01251,
    longitude: -47.98502
  },
  {
    id: "70246c2f-34f2-449e-8912-3810fa380a4f",
    nome: "Escola Classe 116 de Santa Maria",
    logradouro: "Quadra QR 116 Conjunto G",
    numero: "S/N",
    bairro: "Santa Maria",
    cidade: "Brasília",
    estado: "DF",
    cep: "72546407",
    latitude: -16.01183,
    longitude: -47.98421
  },
  {
    id: "8b20702a-003c-42d7-b950-1775f2646f9b",
    nome: "CEF Santos Dumont",
    logradouro: "QRC 17",
    numero: "1",
    bairro: "Residencial Santos Dumont (Santa Maria)",
    cidade: "Brasília",
    estado: "DF",
    cep: "72593270",
    latitude: -16.02298,
    longitude: -47.99812
  }
];

export const santaMariaStops: SantaMariaStopData[] = [
  {
    ordem: 1,
    tipo_no: "escola",
    sentido: null,
    escola: {
      id: "567e57b5-c9bd-46cc-b605-614c8c2d0176",
      nome: "Jardim de Infância 116 de Santa Maria",
      logradouro: "Quadra QR 116 Conjunto H",
      numero: "9",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546408",
      latitude: -16.01251,
      longitude: -47.98502
    }
  },
  {
    ordem: 2,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "b6ce0ec2-d109-44da-a29c-ea30fe4348dc",
      nome: "Heitor Cândido Diniz",
      data_nascimento: "2020-01-11",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 220,
      dia_vencimento: 25,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0135,
      longitude: -47.9831
    },
    responsavel: {
      id: "c488c95d-c4da-4394-8512-d8c040902087",
      nome: "Danielle Cândido",
      telefone: "61996768585",
      cpf: "03860092103",
      email: null,
      logradouro: "Quadra QR 117 Conjunto E",
      numero: "25",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72547405",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 3,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "a4fd6b7c-abe0-463a-864d-5e0c9411e09b",
      nome: "Pedro Henrique Ribeiro Corrêa da Conceição",
      data_nascimento: "2016-08-25",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 220,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0271,
      longitude: -47.9852
    },
    responsavel: {
      id: "b244dd3a-0de5-44bf-84a5-04781486eea8",
      nome: "David Ribeiro da Conceição",
      telefone: "61999538187",
      cpf: "73603830130",
      email: null,
      logradouro: "Quadra QR 417 Conjunto J",
      numero: "30",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72547710",
      complemento: null,
      parentesco: "pai"
    }
  },
  {
    ordem: 4,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "b5a77196-996d-4805-8463-066b94015b34",
      nome: "Anthony Gabriel Santos Nogueira",
      data_nascimento: "2017-11-24",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 240,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0236,
      longitude: -47.9871
    },
    responsavel: {
      id: "6d6ea497-494d-4c71-9803-c04fea3b3a62",
      nome: "Carmen Emanuelen Santos da Silva",
      telefone: "61981485999",
      cpf: "05539948165",
      email: null,
      logradouro: "Quadra QR 316 Conjunto O",
      numero: "12",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546615",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 5,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "5cd04efd-6710-4357-b045-15de51ac79a6",
      nome: "Arthur",
      data_nascimento: "2018-03-15",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 220,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0191,
      longitude: -47.9862
    },
    responsavel: {
      id: "4e213934-b7de-4f1d-a837-496aca75bcdf",
      nome: "Ellen",
      telefone: "61995685030",
      cpf: null,
      email: null,
      logradouro: "Quadra QR 216 Conjunto B",
      numero: "17",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546502",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 6,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "5e097853-9ac8-4e32-8210-b6d08a930b4e",
      nome: "Ariane Rebeca Farias Machado",
      data_nascimento: "2019-08-06",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 240,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0146,
      longitude: -47.9812
    },
    responsavel: {
      id: "3b4a2055-59fe-44eb-b0bb-ff08a0746485",
      nome: "Nariane Farias Machado",
      telefone: "61996496711",
      cpf: "02944988263",
      email: null,
      logradouro: "Quadra CL 118 Bloco H",
      numero: "Lote H-11",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548208",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 7,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "9f508836-b109-4cf7-a38a-2420f28a18f9",
      nome: "Isadora Maria dos Santos Paiva",
      data_nascimento: "2019-11-21",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 220,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0148,
      longitude: -47.9815
    },
    responsavel: {
      id: "e560df09-5659-4fdf-8a01-26b42d55b9ea",
      nome: "Ronaldo Delgado Paiva",
      telefone: "61998381501",
      cpf: "79581552120",
      email: null,
      logradouro: "Quadra QR 118 Conjunto K",
      numero: "24",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548411",
      complemento: null,
      parentesco: "pai"
    }
  },
  {
    ordem: 8,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "8b535455-df97-424d-9a46-9f14577089f7",
      nome: "Eduardo Martins Miranda",
      data_nascimento: "2017-05-31",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 240,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0138,
      longitude: -47.9834
    },
    responsavel: {
      id: "a55016eb-0854-4133-b0e2-a66cbcca1bbd",
      nome: "Janildes de Sousa Martins Miranda",
      telefone: "61984057006",
      cpf: "70408505168",
      email: null,
      logradouro: "Quadra QR 117 Conjunto L",
      numero: "15",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72547412",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 9,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "2d49382b-d785-4e98-b20c-8e5e3fdf237f",
      nome: "Maria Júlia de Sousa Nogueira",
      data_nascimento: "2019-02-08",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 230,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0176,
      longitude: -47.9752
    },
    responsavel: {
      id: "9f455d71-50c8-49e0-bb0a-80bd3e778847",
      nome: "Kelly Cristina de Sousa Pereira",
      telefone: "61982576935",
      cpf: "05454722375",
      email: null,
      logradouro: "Quadra QR 122 Conjunto G",
      numero: "03",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548382",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 10,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "3a05ab92-3cf9-4ac8-9227-2d50a79a426f",
      nome: "Miguel Lopes da Silva",
      data_nascimento: "2016-04-07",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 240,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0178,
      longitude: -47.9755
    },
    responsavel: {
      id: "4def306a-322c-431e-8cd3-a7ef01e940f8",
      nome: "Tayná Lopes Barroso",
      telefone: "61994063468",
      cpf: "05392076165",
      email: null,
      logradouro: "Quadra QR 122 Conjunto F",
      numero: "20",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548381",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 11,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "a18375a2-1e50-49ac-8617-9dfe7d8ed0e6",
      nome: "Ana Karolyne Barros Ribeiro",
      data_nascimento: "2018-05-10",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 240,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0179,
      longitude: -47.9758
    },
    responsavel: {
      id: "67079ee6-2220-4603-b789-baa57b5584b1",
      nome: "David Ribeiro da Silva",
      telefone: "61994066528",
      cpf: "04398966145",
      email: null,
      logradouro: "Quadra QR 122 Conjunto I",
      numero: "1",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548384",
      complemento: null,
      parentesco: "pai"
    }
  },
  {
    ordem: 12,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "1ca139be-2020-4d40-a3e2-dbf3263c2301",
      nome: "Maitê",
      data_nascimento: "2019-09-12",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 220,
      dia_vencimento: 17,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0174,
      longitude: -47.9750
    },
    responsavel: {
      id: "f68ce469-eaab-4db1-be76-78e965a0df17",
      nome: "Gabrielly",
      telefone: "61994344087",
      cpf: null,
      email: null,
      logradouro: "Quadra QR 122 Conjunto B",
      numero: "15",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548377",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 13,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "d2e9222f-35b8-472a-9187-fed0656ca823",
      nome: "Luiza Teixeira Moura",
      data_nascimento: "2017-12-02",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 220,
      dia_vencimento: 24,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0175,
      longitude: -47.9751
    },
    responsavel: {
      id: "484d60bb-05a6-4ae2-981d-9074228b2c4f",
      nome: "Sarah Emilly Oliveira Moura",
      telefone: "61991263752",
      cpf: "05055427140",
      email: null,
      logradouro: "Quadra QR 122 Conjunto B",
      numero: "21",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548377",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 14,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "6198b340-b882-40fd-9ad5-60915f9247c0",
      nome: "Laura da Silva Barbosa",
      data_nascimento: "2018-04-18",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 240,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0166,
      longitude: -47.9771
    },
    responsavel: {
      id: "763c7a9b-fa82-47aa-9a53-cbf6f5f06066",
      nome: "Edimar José Barbosa",
      telefone: "61999968219",
      cpf: "47312807100",
      email: null,
      logradouro: "Quadra QR 120 Conjunto B",
      numero: "17",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546377",
      complemento: null,
      parentesco: "pai"
    }
  },
  {
    ordem: 15,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "afc7782e-31a8-4aac-bef6-1cb6a4115ee2",
      nome: "Rodrigo Aguiar Ferreira Pereira",
      data_nascimento: "2017-01-24",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 225,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0168,
      longitude: -47.9774
    },
    responsavel: {
      id: "4e63dca9-6abf-45bd-8bed-746bb65fb8e2",
      nome: "Lorhaine Aguiar Ferreira Pereira",
      telefone: "6198330441",
      cpf: "03235609113",
      email: null,
      logradouro: "Quadra QR 120 Conjunto E",
      numero: "9",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546380",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 16,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "ef43c535-3085-4519-afe1-977c1a06f177",
      nome: "Yago Rodrigues Ângelo",
      data_nascimento: "2017-09-05",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 200,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0167,
      longitude: -47.9773
    },
    responsavel: {
      id: "2e77a8f2-6b57-4afc-b21c-d6f128b6193b",
      nome: "Ricardo Angelo da Silva Rodrigues",
      telefone: "61991223404",
      cpf: "99789485115",
      email: "tioricardoescolar2023@gmail.com",
      logradouro: "Quadra QR 120 Conjunto D",
      numero: "2",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546379",
      complemento: "Conjunto D",
      parentesco: "pai"
    }
  },
  {
    ordem: 17,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "28d154eb-141e-45e4-87db-db88bc785702",
      nome: "Pedro Lamartini Mendes dos Santos",
      data_nascimento: "2019-08-07",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 240,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0128,
      longitude: -47.9854
    },
    responsavel: {
      id: "50a63ae7-afce-436a-bd42-815ed6b41e3b",
      nome: "Raquel Mendes de Oliveira",
      telefone: "61993677492",
      cpf: "02943733148",
      email: null,
      logradouro: "Quadra QR 116 Conjunto L",
      numero: "15",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546412",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 18,
    tipo_no: "escola",
    sentido: null,
    escola: {
      id: "70246c2f-34f2-449e-8912-3810fa380a4f",
      nome: "Escola Classe 116 de Santa Maria",
      logradouro: "Quadra QR 116 Conjunto G",
      numero: "S/N",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546407",
      latitude: -16.01183,
      longitude: -47.98421
    }
  },
  {
    ordem: 19,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "0b22abbe-024f-49d9-a4ee-119b689fad33",
      nome: "Heloísa Rodrigues Paixão",
      data_nascimento: "2017-05-16",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 240,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0151,
      longitude: -47.9818
    },
    responsavel: {
      id: "37895ff1-5602-4fd9-bf1d-0e82ab69aa61",
      nome: "Marilaine de Jesus Paixão",
      telefone: "61996555342",
      cpf: "05013781116",
      email: null,
      logradouro: "Quadra QR 118 Conjunto Q",
      numero: "10",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548417",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 20,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "878e0fa7-fda9-4162-8aee-6bc7ece6305b",
      nome: "Alicia Ângelo",
      data_nascimento: "2019-10-14",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 1,
      dia_vencimento: 10,
      escola_id: "567e57b5-c9bd-46cc-b605-614c8c2d0176",
      latitude: -16.0152,
      longitude: -47.9819
    },
    responsavel: {
      id: "2e6d422a-7c5d-4829-9879-42b04b068662",
      nome: "Bruna Ângelo",
      telefone: "61991174234",
      cpf: null,
      email: null,
      logradouro: "Quadra QR 118 Conjunto Q",
      numero: "14",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548417",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 21,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "cb8bb7c4-d0f4-46d0-aaa0-917f3d1de7cd",
      nome: "Apollo Rocky",
      data_nascimento: "2021-03-20",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 1,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0152,
      longitude: -47.9819
    },
    responsavel: {
      id: "2e6d422a-7c5d-4829-9879-42b04b068662",
      nome: "Bruna Ângelo",
      telefone: "61991174234",
      cpf: null,
      email: null,
      logradouro: "Quadra QR 118 Conjunto Q",
      numero: "14",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548417",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 22,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "8a7fd0d7-f7be-4dd7-84fa-803b141e5541",
      nome: "José Heitor Gomes Oliveira",
      data_nascimento: "2018-05-12",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 190,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0150,
      longitude: -47.9816
    },
    responsavel: {
      id: "110b67d5-3938-4f37-ac92-5a834599dfb8",
      nome: "Kauany Gomes Oliveira",
      telefone: "61992563705",
      cpf: "61923763369",
      email: null,
      logradouro: "Quadra QR 118 Conjunto Q",
      numero: "01",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548417",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 23,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "f4211d32-9af2-498f-b6ac-530ece4c3d31",
      nome: "Laura Oliveira Sousa",
      data_nascimento: "2016-08-31",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 190,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0150,
      longitude: -47.9816
    },
    responsavel: {
      id: "110b67d5-3938-4f37-ac92-5a834599dfb8",
      nome: "Kauany Gomes Oliveira",
      telefone: "61992563705",
      cpf: "61923763369",
      email: null,
      logradouro: "Quadra QR 118 Conjunto Q",
      numero: "01",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548417",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 24,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "c2a06579-a0e4-4bbc-9fe6-a231b6492a0f",
      nome: "Rebeca Bismarck Rocha Rodrigues",
      data_nascimento: "2017-06-20",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 220,
      dia_vencimento: 31,
      escola_id: "70246c2f-34f2-449e-8912-3810fa380a4f",
      latitude: -16.0177,
      longitude: -47.9754
    },
    responsavel: {
      id: "d584907e-11a9-437e-97a1-6efa25a7821d",
      nome: "Daniela Rocha Bismarck",
      telefone: "61985684454",
      cpf: "06605955161",
      email: null,
      logradouro: "Quadra QR 122 Conjunto K",
      numero: "07",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548386",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 25,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "dee8abfd-de62-474a-a94e-0eefafd3e967",
      nome: "Sofia Vitória Rodrigues Soares",
      data_nascimento: "2018-02-04",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 220,
      dia_vencimento: 15,
      escola_id: "70246c2f-34f2-449e-8912-3810fa380a4f",
      latitude: -16.0176,
      longitude: -47.9752
    },
    responsavel: {
      id: "c0aefda8-1aac-4ac2-bcab-598cb9a26ba8",
      nome: "Erika Suzana Martins Rodrigues",
      telefone: "61981745691",
      cpf: "71560750120",
      email: null,
      logradouro: "Quadra QR 122 Conjunto D",
      numero: "Casa 27",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548379",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 26,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "6374f447-1cd0-46a8-a924-ab48b2b3c8cf",
      nome: "Isaac Matheus Marques Silva",
      data_nascimento: "2016-05-22",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 240,
      dia_vencimento: 15,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0179,
      longitude: -47.9758
    },
    responsavel: {
      id: "d682ecc5-7d05-447b-903a-c6c712fec190",
      nome: "Fiama Marques de Carvalho",
      telefone: "61992960129",
      cpf: "05011185192",
      email: null,
      logradouro: "Quadra QR 122 Conjunto I",
      numero: "13",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548384",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 27,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "5e5781db-85b6-4e69-8c50-ec23dc1e13d3",
      nome: "Gabriel Gutemberg Guimarães",
      data_nascimento: "2021-08-09",
      genero: "masculino",
      modalidade: "volta",
      periodo: "manha",
      valor_cobranca: 190,
      dia_vencimento: 10,
      escola_id: "567e57b5-c9bd-46cc-b605-614c8c2d0176",
      latitude: -16.0221,
      longitude: -47.9961
    },
    responsavel: {
      id: "f93c964e-9241-40cc-8835-6ead3744677c",
      nome: "Alana Guimarães Gutemberg",
      telefone: "61982342407",
      cpf: "03853460186",
      email: null,
      logradouro: "Quadra QRC 1",
      numero: "1",
      bairro: "Residencial Santos Dumont (Santa Maria)",
      cidade: "Brasília",
      estado: "DF",
      cep: "72592101",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 28,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "832e35a5-4b51-44a4-be97-b55b2d70595a",
      nome: "Daniella Valentina de S. Nonato",
      data_nascimento: "2016-10-18",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 200,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0224,
      longitude: -47.9965
    },
    responsavel: {
      id: "ec80b695-c82b-4812-bca6-1986c9726285",
      nome: "Napoleão Nonato Neto",
      telefone: "61983376585",
      cpf: "27516350400",
      email: null,
      logradouro: "Quadra QRC 5",
      numero: "Casa 9",
      bairro: "Residencial Santos Dumont (Santa Maria)",
      cidade: "Brasília",
      estado: "DF",
      cep: "72592105",
      complemento: null,
      parentesco: "pai"
    }
  },
  {
    ordem: 29,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "7197a255-7425-475c-af0e-37598af2a3e9",
      nome: "Ana Flávia de Araújo Paz",
      data_nascimento: "2016-11-01",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 180,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0227,
      longitude: -47.9968
    },
    responsavel: {
      id: "0e4fd8eb-b61f-40d9-9857-b9c5688d110b",
      nome: "Benedita Alves Paz",
      telefone: "61998525946",
      cpf: "21033986100",
      email: null,
      logradouro: "Quadra QRI 3",
      numero: "17",
      bairro: "Residencial Santos Dumont (Santa Maria)",
      cidade: "Brasília",
      estado: "DF",
      cep: "72592203",
      complemento: null,
      parentesco: "avo"
    }
  },
  {
    ordem: 30,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "a0972ed2-6a81-4468-ac99-619edebaaecb",
      nome: "Enzo Rodrigues Pantaleão",
      data_nascimento: "2020-06-08",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 250,
      dia_vencimento: 10,
      escola_id: "567e57b5-c9bd-46cc-b605-614c8c2d0176",
      latitude: -16.0225,
      longitude: -47.9966
    },
    responsavel: {
      id: "85260881-f11e-4856-8ab0-d10b3f74666b",
      nome: "María Janiele Rodrigues Pantaleão",
      telefone: "61981591789",
      cpf: "02688081390",
      email: null,
      logradouro: "Quadra QRC 7",
      numero: "22",
      bairro: "Residencial Santos Dumont (Santa Maria)",
      cidade: "Brasília",
      estado: "DF",
      cep: "72592107",
      complemento: "CASA",
      parentesco: "mae"
    }
  },
  {
    ordem: 31,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "141da90e-b0cc-47b9-9530-c42169e2388b",
      nome: "Aimê Carvalheira da Silva",
      data_nascimento: "2016-05-14",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 200,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0226,
      longitude: -47.9967
    },
    responsavel: {
      id: "a75bc527-4a92-4e2a-bc89-36fd57a9b88b",
      nome: "José Airton Lopes de Medeiros",
      telefone: "61984251248",
      cpf: "04754719468",
      email: null,
      logradouro: "Quadra QRC 9",
      numero: "02",
      bairro: "Residencial Santos Dumont (Santa Maria)",
      cidade: "Brasília",
      estado: "DF",
      cep: "72592109",
      complemento: null,
      parentesco: "avo"
    }
  },
  {
    ordem: 32,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "d5bb9211-5ea0-4fbf-99d3-431e58f7b3e5",
      nome: "Júlia Soares Gomes",
      data_nascimento: "2017-04-17",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 250,
      dia_vencimento: 10,
      escola_id: "70246c2f-34f2-449e-8912-3810fa380a4f",
      latitude: -16.0228,
      longitude: -47.9972
    },
    responsavel: {
      id: "b6a82a6c-57fa-4491-ae05-253662e33487",
      nome: "Gleidson Soares dos Santos Filho",
      telefone: "61994179134",
      cpf: "03107877182",
      email: null,
      logradouro: "Quadra QRC 12",
      numero: "Casa 37",
      bairro: "Residencial Santos Dumont (Santa Maria)",
      cidade: "Brasília",
      estado: "DF",
      cep: "72593112",
      complemento: null,
      parentesco: "pai"
    }
  },
  {
    ordem: 33,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "41ab44fa-7404-46d4-a67a-6fcf3cf5abc6",
      nome: "Luna Vasconcellos Cardozo",
      data_nascimento: "2016-11-11",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 180,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0227,
      longitude: -47.9970
    },
    responsavel: {
      id: "c58f7315-adf1-419d-9cf6-17bd48e33309",
      nome: "Rosângela Vasconcellos Cardozo",
      telefone: "61983832580",
      cpf: "35768410163",
      email: null,
      logradouro: "Quadra QRC 10 casa",
      numero: "9",
      bairro: "Residencial Santos Dumont (Santa Maria)",
      cidade: "Brasília",
      estado: "DF",
      cep: "72593110",
      complemento: null,
      parentesco: "responsavel_legal"
    }
  },
  {
    ordem: 34,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "3ea8e920-937a-4f91-b545-db307dc4e15d",
      nome: "Anthony Miranda Gurgel",
      data_nascimento: "2017-04-11",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 210,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0232,
      longitude: -47.9975
    },
    responsavel: {
      id: "fc5b2ef9-60a8-4b94-a95c-453efa5ebfe6",
      nome: "Verônica Prado Miranda",
      telefone: "61983742062",
      cpf: "87041880125",
      email: null,
      logradouro: "Quadra QRC 20 casa",
      numero: "29",
      bairro: "Residencial Santos Dumont (Santa Maria)",
      cidade: "Brasília",
      estado: "DF",
      cep: "72593120",
      complemento: null,
      parentesco: "responsavel_legal"
    }
  },
  {
    ordem: 35,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "a0107ebf-f042-463f-b1fe-c69203948d13",
      nome: "Samuel Freitas de Souza Arantes",
      data_nascimento: "2020-07-20",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 250,
      dia_vencimento: 10,
      escola_id: "567e57b5-c9bd-46cc-b605-614c8c2d0176",
      latitude: -16.0223,
      longitude: -47.9963
    },
    responsavel: {
      id: "c83824e1-4591-4735-9ccf-c103ed6d6807",
      nome: "Sarah Lorena Freitas de Souza",
      telefone: "61995672000",
      cpf: "70319340104",
      email: null,
      logradouro: "Quadra QBR 4 bloco L",
      numero: "Apt 11",
      bairro: "Residencial Santos Dumont (Santa Maria)",
      cidade: "Brasília",
      estado: "DF",
      cep: "72593050",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 36,
    tipo_no: "escola",
    sentido: null,
    escola: {
      id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      nome: "CEF Santos Dumont",
      logradouro: "QRC 17",
      numero: "1",
      bairro: "Residencial Santos Dumont (Santa Maria)",
      cidade: "Brasília",
      estado: "DF",
      cep: "72593270",
      latitude: -16.02298,
      longitude: -47.99812
    }
  },
  {
    ordem: 37,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "2422b9f1-d82a-4989-94cd-06989349b08d",
      nome: "Elias Flávio de Araújo Paz",
      data_nascimento: "2013-10-22",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 180,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0227,
      longitude: -47.9968
    },
    responsavel: {
      id: "0e4fd8eb-b61f-40d9-9857-b9c5688d110b",
      nome: "Benedita Alves Paz",
      telefone: "61998525946",
      cpf: "21033986100",
      email: null,
      logradouro: "Quadra QRI 3",
      numero: "17",
      bairro: "Residencial Santos Dumont (Santa Maria)",
      cidade: "Brasília",
      estado: "DF",
      cep: "72592203",
      complemento: null,
      parentesco: "avo"
    }
  },
  {
    ordem: 38,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "caf6da82-21f8-47ef-8b9d-d3f9cef71dc8",
      nome: "Rogério Montalvão dos Santos",
      data_nascimento: "2014-06-17",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 230,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0156,
      longitude: -47.9792
    },
    responsavel: {
      id: "58514160-4a4d-438c-b947-b4fbfea8a70e",
      nome: "Irene Alves dos Santos",
      telefone: "61996143792",
      cpf: "02166928579",
      email: null,
      logradouro: "Quadra QR 119 Conjunto B",
      numero: "Lote 19",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72549110",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 39,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "d19abcc7-5db9-4640-ab20-e6959e02e3d9",
      nome: "Nara Alice Cardoso Ribeiro",
      data_nascimento: "2021-09-11",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 240,
      dia_vencimento: 10,
      escola_id: "567e57b5-c9bd-46cc-b605-614c8c2d0176",
      latitude: -16.0179,
      longitude: -47.9758
    },
    responsavel: {
      id: "a5acaa6b-7cb8-4dfe-ab56-cf49f5700e84",
      nome: "Jennifer Lorrane Cardoso Gomes",
      telefone: "61981128260",
      cpf: "04884596137",
      email: null,
      logradouro: "Quadra QR 122 Conjunto I",
      numero: "Lote 12 Casa 2",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548384",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 40,
    tipo_no: "passageiro",
    sentido: "indo",
    passageiro: {
      id: "cbabc67d-b174-4ccd-966b-0d485a932a11",
      nome: "Maria Júlia Silva Barros Santos",
      data_nascimento: "2022-01-31",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "tarde",
      valor_cobranca: 220,
      dia_vencimento: 10,
      escola_id: "567e57b5-c9bd-46cc-b605-614c8c2d0176",
      latitude: -16.0175,
      longitude: -47.9751
    },
    responsavel: {
      id: "9329bf56-840e-4eff-bf57-922559384bb7",
      nome: "Eliana da Silva",
      telefone: "61998213710",
      cpf: "02060166381",
      email: null,
      logradouro: "Quadra QR 122 Conjunto C",
      numero: "3",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548378",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 41,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "6167a9cf-7fc5-4d51-8e17-30d5c1205b44",
      nome: "Ester Gentil Santos",
      data_nascimento: "2014-06-17",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 230,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0173,
      longitude: -47.9749
    },
    responsavel: {
      id: "d0902c73-4cb1-46ed-9174-da3c89d8508c",
      nome: "Marizane dos Santos",
      telefone: "61982636776",
      cpf: "57889651368",
      email: null,
      logradouro: "Quadra QR 122 Conjunto A",
      numero: "34",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548376",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 42,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "85012f87-f9d9-4944-8b3c-52e86716c00f",
      nome: "Yasmin Rodrigues Ângelo",
      data_nascimento: "2015-01-10",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 1,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0167,
      longitude: -47.9773
    },
    responsavel: {
      id: "2e77a8f2-6b57-4afc-b21c-d6f128b6193b",
      nome: "Ricardo Angelo da Silva Rodrigues",
      telefone: "61991223404",
      cpf: "99789485115",
      email: "tioricardoescolar2023@gmail.com",
      logradouro: "Quadra QR 120 Conjunto D",
      numero: "2",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546379",
      complemento: "Conjunto D",
      parentesco: "pai"
    }
  },
  {
    ordem: 43,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "2028435a-8ce6-4015-bd0e-6a449af235fb",
      nome: "Manuela Vieira Oliveira",
      data_nascimento: "2014-12-19",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 230,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0129,
      longitude: -47.9856
    },
    responsavel: {
      id: "cfa194cd-6db8-4b86-811d-f209549966b7",
      nome: "Karen Isabel Vieira Oliveira",
      telefone: "61981801289",
      cpf: "01175285102",
      email: null,
      logradouro: "Quadra QR 116 Conjunto N",
      numero: "05",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546414",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 44,
    tipo_no: "escola",
    sentido: null,
    escola: {
      id: "567e57b5-c9bd-46cc-b605-614c8c2d0176",
      nome: "Jardim de Infância 116 de Santa Maria",
      logradouro: "Quadra QR 116 Conjunto H",
      numero: "9",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546408",
      latitude: -16.01251,
      longitude: -47.98502
    }
  },
  {
    ordem: 45,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "6bf1b0d8-223d-4445-99a2-ed6fcb2def59",
      nome: "José Elias Oliveira Silva",
      data_nascimento: "2013-09-05",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 240,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0124,
      longitude: -47.9848
    },
    responsavel: {
      id: "e6a4f9ce-a2f3-4b73-9eb1-2df54c0ee863",
      nome: "Janaína da Costa Oliveira",
      telefone: "61999097390",
      cpf: "91654386120",
      email: null,
      logradouro: "Quadra QR 116 Conjunto C",
      numero: "14",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546403",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 46,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "88185d3e-6a1f-4009-8132-35ea69d2fbdd",
      nome: "Lucas Rodrigues Macedo",
      data_nascimento: "2014-05-09",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 240,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0128,
      longitude: -47.9854
    },
    responsavel: {
      id: "580ab2ba-2580-4b5f-90ab-1b39f8dbd25c",
      nome: "Kleber de Aquino Macedo",
      telefone: "61998318860",
      cpf: "28726642115",
      email: null,
      logradouro: "Quadra QR 116 Conjunto L",
      numero: "09",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546412",
      complemento: null,
      parentesco: "pai"
    }
  },
  {
    ordem: 47,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "4fcb1592-47fb-4e28-b5a5-223f0c3adc9b",
      nome: "Ana Vitoria Eloi Generoso",
      data_nascimento: "2014-11-20",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 250,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0149,
      longitude: -47.9817
    },
    responsavel: {
      id: "0ce2bbf2-99e6-43d4-b52e-f1dea71c5f6d",
      nome: "Sarah Yolandina Generoso França",
      telefone: "61994436495",
      cpf: "05671222125",
      email: null,
      logradouro: "Quadra QR 118 Conjunto O",
      numero: "06",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548415",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 48,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "47ad180a-29f4-4e4e-b6ec-0fc49105cc74",
      nome: "Anna Júlia Silva de Araújo",
      data_nascimento: "2013-10-28",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 240,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0147,
      longitude: -47.9813
    },
    responsavel: {
      id: "80a8f83e-1915-4504-addb-5125c7b1153a",
      nome: "Ligia Fernanda",
      telefone: "61995916081",
      cpf: "00197014119",
      email: null,
      logradouro: "Quadra CL 118",
      numero: "10",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548200",
      complemento: "Apartamento 101",
      parentesco: "mae"
    }
  },
  {
    ordem: 49,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "2008e6a2-5e10-4c94-a46e-c270705dcf24",
      nome: "Isabella Vitória dos Santos Paiva",
      data_nascimento: "2014-06-14",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 220,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0148,
      longitude: -47.9815
    },
    responsavel: {
      id: "e560df09-5659-4fdf-8a01-26b42d55b9ea",
      nome: "Ronaldo Delgado Paiva",
      telefone: "61998381501",
      cpf: "79581552120",
      email: null,
      logradouro: "Quadra QR 118 Conjunto K",
      numero: "24",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548411",
      complemento: null,
      parentesco: "pai"
    }
  },
  {
    ordem: 50,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "a92ae36c-aa9a-439a-a6b3-17aa600d33b1",
      nome: "Isabelly Valentina Klimontovies Gurgel",
      data_nascimento: "2014-09-18",
      genero: "feminino",
      modalidade: "volta",
      periodo: "manha",
      valor_cobranca: 190,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0190,
      longitude: -47.9860
    },
    responsavel: {
      id: "f9337413-3029-4b7c-afb9-fddb1b915af4",
      nome: "Stefany Klimontovies da Costa",
      telefone: "61983469347",
      cpf: "04338240180",
      email: null,
      logradouro: "Quadra QR 216 Conjunto A",
      numero: "10",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546501",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 51,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "4933c1a6-8df5-489b-a132-25c05a84faa9",
      nome: "Lunna Victória Cedro Passos",
      data_nascimento: "2013-02-16",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 240,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0195,
      longitude: -47.9866
    },
    responsavel: {
      id: "d9f5f894-b213-43e8-ac98-17cda512389a",
      nome: "Débora Cedro Menezes",
      telefone: "61995591671",
      cpf: "01385334150",
      email: null,
      logradouro: "Quadra QR 216 Conjunto I",
      numero: "22",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546509",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 52,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "1651d036-520a-4b5c-ac56-3e0daa456af0",
      nome: "Luiz Guilherme Ferreira Machado",
      data_nascimento: "2014-10-27",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 240,
      dia_vencimento: 15,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0236,
      longitude: -47.9871
    },
    responsavel: {
      id: "0ba3b3fd-c7e5-4f96-9591-7ddeba6861fd",
      nome: "Sônia Izabel Santos Ferreira",
      telefone: "61994189775",
      cpf: "03251095161",
      email: null,
      logradouro: "Quadra QR 316 Conjunto O",
      numero: "12",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546615",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 53,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "a521f23d-17f1-4e82-bd70-74b5c2c707d0",
      nome: "Nicole de Oliveira Coutinho",
      data_nascimento: "2012-11-16",
      genero: "feminino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 230,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0234,
      longitude: -47.9868
    },
    responsavel: {
      id: "24f2ed28-af7a-4ffd-934f-e435aef452fe",
      nome: "Daniele Alves de Oliveira",
      telefone: "61985618897",
      cpf: "02166928579",
      email: null,
      logradouro: "Quadra QR 316 Conjunto K",
      numero: "05",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72546611",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 54,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "1ccdf999-dedb-4149-8cd7-e8a92ec1f6fb",
      nome: "Eduardo Ribeiro Corrêa da Conceição",
      data_nascimento: "2014-09-05",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 220,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0271,
      longitude: -47.9852
    },
    responsavel: {
      id: "b244dd3a-0de5-44bf-84a5-04781486eea8",
      nome: "David Ribeiro da Conceição",
      telefone: "61999538187",
      cpf: "73603830130",
      email: null,
      logradouro: "Quadra QR 417 Conjunto J",
      numero: "30",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72547710",
      complemento: null,
      parentesco: "pai"
    }
  },
  {
    ordem: 55,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "171a9d31-a5b3-46b9-8b64-c0adaf462d04",
      nome: "Enzo Gabriel Alves de Almeida",
      data_nascimento: "2013-10-29",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 250,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0246,
      longitude: -47.9832
    },
    responsavel: {
      id: "03da50ff-3010-4681-ba45-5eb021964c61",
      nome: "Aline Rodrigues de Almeida",
      telefone: "61995877973",
      cpf: "04010630116",
      email: null,
      logradouro: "Quadra QR 318 Conjunto G",
      numero: "29",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548607",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 56,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "48b8beee-b624-4a6e-81d0-cf6ee639a53f",
      nome: "Nathan Vinícius Batista de Santana",
      data_nascimento: "2014-04-12",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 230,
      dia_vencimento: 10,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0211,
      longitude: -47.9822
    },
    responsavel: {
      id: "4a5dad83-5a33-4014-bb37-5071234b4e80",
      nome: "Isabela Cristiny Batista da Silva",
      telefone: "61994479752",
      cpf: "05273687179",
      email: null,
      logradouro: "Quadra QR 218 Conjunto J",
      numero: "11",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72548510",
      complemento: null,
      parentesco: "mae"
    }
  },
  {
    ordem: 57,
    tipo_no: "passageiro",
    sentido: "voltando",
    passageiro: {
      id: "2fbeb3c5-818e-4ae2-9171-6dff3ec356fe",
      nome: "João Miguel Vieira Farias",
      data_nascimento: "2015-08-22",
      genero: "masculino",
      modalidade: "ida_volta",
      periodo: "manha",
      valor_cobranca: 240,
      dia_vencimento: 16,
      escola_id: "8b20702a-003c-42d7-b950-1775f2646f9b",
      latitude: -16.0201,
      longitude: -47.9842
    },
    responsavel: {
      id: "46bebfa6-18e9-47de-9dff-54ad1463c95f",
      nome: "Luana Vieira Jacome",
      telefone: "61994155825",
      cpf: "03875777182",
      email: null,
      logradouro: "Quadra QR 217 Conjunto N",
      numero: "8",
      bairro: "Santa Maria",
      cidade: "Brasília",
      estado: "DF",
      cep: "72547514",
      complemento: null,
      parentesco: "mae"
    }
  }
];
