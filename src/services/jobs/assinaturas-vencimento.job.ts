import { subscriptionMonitorService } from "../subscriptions/subscription-monitor.service.js";

export const assinaturasVencimentoJob = {
  async runDaily() {
    return subscriptionMonitorService.expireTrials();
  }
};
