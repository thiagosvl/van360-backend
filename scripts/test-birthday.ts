import 'dotenv/config';
import { logger } from '../src/config/logger';
import { birthdayReminderJob } from '../src/services/jobs/birthday-reminder.job';

async function run() {
  logger.info("Executando job de aniversários manualmente...");
  try {
    await birthdayReminderJob.runWeekly();
    logger.info("Job executado.");
    process.exit(0);
  } catch (error) {
    logger.error({ error }, "Erro no job");
    process.exit(1);
  }
}

run();
