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
    "cenario-leads": {
        escolas: { quantidade: 1 },
        veiculos: { quantidade: 1 },
        passageiros: { quantidade: 5, percentualComAniversario: 100 },
        gastos: { quantidadeTotal: 2, quantidadeSemVeiculo: 0 },
        prePassageiros: { quantidade: 15 },
    }
};
