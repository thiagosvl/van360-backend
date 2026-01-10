export * from "./subscription-lifecycle.service.js";
export * from "./subscription-upgrade.service.js";
export * from "./subscription.common.js";

import { subscriptionLifecycleService } from "./subscription-lifecycle.service.js";
import { subscriptionUpgradeService } from "./subscription-upgrade.service.js";

// Facade for backward compatibility if needed, though direct imports are preferred.
export const subscriptionService = {
  ...subscriptionLifecycleService,
  ...subscriptionUpgradeService
};
