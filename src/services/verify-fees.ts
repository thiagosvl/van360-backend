import { paymentService } from "./payment.service.js";

function runTests() {
  const tests = [
    { valor: 150.00, tipo: 'imediato', expected: 1.35 },
    { valor: 150.00, tipo: 'vencimento', expected: 1.49 },
    { valor: 175.00, tipo: 'imediato', expected: 1.50 }, // Teto
    { valor: 175.00, tipo: 'vencimento', expected: 1.73 },
    { valor: 200.00, tipo: 'imediato', expected: 1.50 }, // Teto
    { valor: 200.00, tipo: 'vencimento', expected: 1.98 },
    { valor: 225.00, tipo: 'imediato', expected: 1.50 }, // Teto
    { valor: 225.00, tipo: 'vencimento', expected: 1.99 }, // Teto
    { valor: 250.00, tipo: 'imediato', expected: 1.50 }, // Teto
    { valor: 250.00, tipo: 'vencimento', expected: 1.99 }, // Teto
    { valor: 5.00, tipo: 'imediato', expected: 0.10 },   // Mínimo
    { valor: 5.00, tipo: 'vencimento', expected: 0.10 }  // Mínimo
  ];

  console.log("=== Fee Logic Verification (Active Gateway) ===");
  let passed = 0;
  const provider = paymentService.getProvider();
  
  (async () => {
    for (const [i, t] of tests.entries()) {
      const result = await provider.getFee(t.valor, t.tipo as any);
      const success = result === t.expected;
      if (success) passed++;
      console.log(`Test ${i + 1}: VALOR R$ ${t.valor.toFixed(2)} (${t.tipo}) -> Taxa: ${result.toFixed(2)} [${success ? 'OK' : 'FAIL, expected ' + t.expected}]`);
    }
    console.log(`\nResult: ${passed}/${tests.length} tests passed.`);
  })();
}

runTests();
