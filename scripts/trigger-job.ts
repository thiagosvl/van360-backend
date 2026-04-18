import 'dotenv/config';
import { cronQueue } from '../src/queues/cron.queue';
import { logger } from '../src/config/logger.js';

async function triggerJob() {
  const jobName = process.argv[2];

  if (!jobName) {
    console.error('❌ Erro: Você deve fornecer o nome do job.');
    console.log('\nJobs disponíveis:');
    console.log('- repasse-monitor');
    console.log('- pix-validation-monitor');
    console.log('- repasse-retry');
    console.log('- reconciliacao-entrada');
    console.log('- daily-subscription-monitor');
    console.log('- charge-generator');
    console.log('- subscription-generator');
    console.log('- daily-charge-monitor');
    process.exit(1);
  }

  logger.info(`🚀 Disparando job manualmente: ${jobName}...`);

  try {
    // Adicionamos o job na fila sem a configuração de 'repeat' para que ele execute imediatamente uma única vez
    const job = await cronQueue.add(jobName, { manual: true });
    
    logger.info(`✅ Job '${jobName}' (ID: ${job.id}) adicionado à fila com sucesso!`);
    
    // Pequeno delay para garantir que a conexão Redis feche corretamente se necessário
    setTimeout(() => process.exit(0), 1000);
  } catch (error: any) {
    logger.error(`❌ Erro ao disparar job: ${error?.message || 'Erro desconhecido'}`);
    process.exit(1);
  }
}

triggerJob();
