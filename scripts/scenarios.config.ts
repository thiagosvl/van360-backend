export interface ScenarioConfig {
    escolas: {
        quantidade: number;
    };
    veiculos: {
        quantidade: number;
    };
    passageiros: {
        quantidade: number;
        percentualComAniversario: number;
        percentualSemEndereco?: number;
        percentualComResponsaveisAdicionais?: number;
    };
    gastos: {
        quantidadeTotal: number;
        quantidadeSemVeiculo: number;
    };
    prePassageiros: {
        quantidade: number;
    };
    rotas?: {
        quantidade: number;
        criarAusencias?: boolean;
    };
    cobrancas?: {
        taxaInadimplencia?: number;
    };
    resetarPix?: boolean;
}

export const cenarios: Record<string, ScenarioConfig> = {
    "cenario-rota-real": {
        escolas: { quantidade: 3 },
        veiculos: { quantidade: 1 },
        passageiros: {
            quantidade: 56,
            percentualComAniversario: 80,
            percentualSemEndereco: 0,
            percentualComResponsaveisAdicionais: 0,
        },
        gastos: {
            quantidadeTotal: 8,
            quantidadeSemVeiculo: 1,
        },
        prePassageiros: {
            quantidade: 2,
        },
        rotas: {
            quantidade: 1,
            criarAusencias: false,
        },
        cobrancas: {
            taxaInadimplencia: 10,
        },
    },
    "cenario-1": {
        escolas: { quantidade: 3 },
        veiculos: { quantidade: 2 },
        passageiros: {
            quantidade: 25,
            percentualComAniversario: 75,
            percentualSemEndereco: 10,
            percentualComResponsaveisAdicionais: 40,
        },
        gastos: {
            quantidadeTotal: 15,
            quantidadeSemVeiculo: 3,
        },
        prePassageiros: {
            quantidade: 2,
        },
        rotas: {
            quantidade: 2,
            criarAusencias: true,
        },
        cobrancas: {
            taxaInadimplencia: 15,
        },
    },
    "cenario-vazio": {
        escolas: { quantidade: 0 },
        veiculos: { quantidade: 0 },
        passageiros: {
            quantidade: 0,
            percentualComAniversario: 0,
        },
        gastos: {
            quantidadeTotal: 0,
            quantidadeSemVeiculo: 0,
        },
        prePassageiros: {
            quantidade: 0,
        },
        resetarPix: true,
    },
    "cenario-rotas": {
        escolas: { quantidade: 3 },
        veiculos: { quantidade: 2 },
        passageiros: {
            quantidade: 35,
            percentualComAniversario: 60,
            percentualSemEndereco: 15,
            percentualComResponsaveisAdicionais: 50,
        },
        gastos: {
            quantidadeTotal: 10,
            quantidadeSemVeiculo: 2,
        },
        prePassageiros: {
            quantidade: 3,
        },
        rotas: {
            quantidade: 3,
            criarAusencias: true,
        },
    },
    "cenario-inadimplencia": {
        escolas: { quantidade: 2 },
        veiculos: { quantidade: 1 },
        passageiros: {
            quantidade: 20,
            percentualComAniversario: 50,
            percentualSemEndereco: 5,
            percentualComResponsaveisAdicionais: 30,
        },
        gastos: {
            quantidadeTotal: 12,
            quantidadeSemVeiculo: 2,
        },
        prePassageiros: {
            quantidade: 1,
        },
        rotas: {
            quantidade: 1,
            criarAusencias: false,
        },
        cobrancas: {
            taxaInadimplencia: 60,
        },
    },
    "cenario-completo": {
        escolas: { quantidade: 4 },
        veiculos: { quantidade: 3 },
        passageiros: {
            quantidade: 45,
            percentualComAniversario: 70,
            percentualSemEndereco: 10,
            percentualComResponsaveisAdicionais: 50,
        },
        gastos: {
            quantidadeTotal: 25,
            quantidadeSemVeiculo: 5,
        },
        prePassageiros: {
            quantidade: 5,
        },
        rotas: {
            quantidade: 4,
            criarAusencias: true,
        },
        cobrancas: {
            taxaInadimplencia: 20,
        },
    }
};
