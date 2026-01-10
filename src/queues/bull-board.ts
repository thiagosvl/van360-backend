import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { FastifyInstance } from 'fastify';
import { generationQueue } from './generation.queue.js';
import { payoutQueue } from './payout.queue.js';
import { pixQueue } from './pix.queue.js';
import { receiptQueue } from './receipt.queue.js';
import { webhookQueue } from './webhook.queue.js';
import { whatsappQueue } from './whatsapp.queue.js';

export const setupBullBoard = (app: FastifyInstance) => {
  const serverAdapter = new FastifyAdapter();

  createBullBoard({
    queues: [
      new BullMQAdapter(whatsappQueue),
      new BullMQAdapter(receiptQueue),
      new BullMQAdapter(webhookQueue),
      new BullMQAdapter(generationQueue),
      new BullMQAdapter(pixQueue),
      new BullMQAdapter(payoutQueue),
    ],
    serverAdapter,
  });

  serverAdapter.setBasePath('/admin/queues');

  app.register(serverAdapter.registerPlugin(), {
    prefix: '/admin/queues',
  });
};
