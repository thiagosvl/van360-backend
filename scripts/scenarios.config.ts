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
    resetarPix?: boolean;
}

export const cenarios: Record<string, ScenarioConfig> = {
    "cenario-1": {
        escolas: { quantidade: 3 },
        veiculos: { quantidade: 2 },
        passageiros: {
            quantidade: 25,
            percentualComAniversario: 75,
        },
        gastos: {
            quantidadeTotal: 20,
            quantidadeSemVeiculo: 5,
        },
        prePassageiros: {
            quantidade: 0,
        },
    },
    "cenario-vazio": {
        escolas: { quantidade: 0 },
        veiculos: { quantidade: 0 },
        passageiros: { quantidade: 0, percentualComAniversario: 0 },
        gastos: { quantidadeTotal: 0, quantidadeSemVeiculo: 0 },
        prePassageiros: { quantidade: 0 },
        resetarPix: true,
    },
    "cenario-rotas": {
        escolas: { quantidade: 2 },
        veiculos: { quantidade: 2 },
        passageiros: {
            quantidade: 50,
            percentualComAniversario: 75,
            percentualSemEndereco: 30,
            percentualComResponsaveisAdicionais: 40,
        },
        gastos: {
            quantidadeTotal: 20,
            quantidadeSemVeiculo: 5,
        },
        prePassageiros: {
            quantidade: 2,
        },
    }
};
