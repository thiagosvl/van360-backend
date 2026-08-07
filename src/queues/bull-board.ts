import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { FastifyInstance } from 'fastify';
import { contractQueue } from './contract.queue.js';

import { whatsappTransactionalQueue, whatsappBulkQueue } from './evolution.queue.js';
import { telegramQueue } from './telegram.queue.js';
import { generationQueue } from './generation.queue.js';

export const setupBullBoard = (app: FastifyInstance) => {
  const serverAdapter = new FastifyAdapter();

  createBullBoard({
    queues: [
      new BullMQAdapter(whatsappTransactionalQueue),
      new BullMQAdapter(whatsappBulkQueue),
      new BullMQAdapter(telegramQueue),
      new BullMQAdapter(generationQueue),
      new BullMQAdapter(contractQueue),
    ],
    serverAdapter,
  });

  serverAdapter.setBasePath('/admin/queues');

  app.register(serverAdapter.registerPlugin(), {
    prefix: '/admin/queues',
  });
};
