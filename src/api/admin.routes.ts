import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { adminUserController } from "../controllers/admin/admin-user.controller.js";
import { adminLogController } from "../controllers/admin/admin-log.controller.js";
import { adminNotificationController } from "../controllers/admin/admin-notification.controller.js";
import { adminLoginAttemptsController } from "../controllers/admin/admin-login-attempts.controller.js";
import { adminConfigController } from "../controllers/admin/admin-config.controller.js";
import { adminPlanController } from "../controllers/admin/admin-plan.controller.js";
import { adminEvolutionController } from "../controllers/admin/admin-evolution.controller.js";
import { adminCalculatorController } from "../controllers/admin/admin-calculator.controller.js";
import { adminBlogController } from "../controllers/blog.controller.js";
import { verifySupabaseJWT } from "../middleware/auth.js";
import { verifyAdmin } from "../middleware/admin.js";

const adminRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook("onRequest", verifySupabaseJWT);
  app.addHook("onRequest", verifyAdmin);

  // Dashboard & Usuários / Motoristas
  app.get("/dashboard", adminUserController.getDashboard);
  app.get("/users", adminUserController.getUsers);
  app.post("/users", adminUserController.createUser);
  app.get("/users/:id", adminUserController.getUserDetails);
  app.patch("/users/:id", adminUserController.updateUser);
  app.patch("/users/:id/subscription", adminUserController.updateSubscription);
  app.post("/users/:id/reset-password", adminUserController.resetUserPassword);
  app.post("/users/:id/dispatch-notification", adminUserController.dispatchNotification);
  app.delete("/users/:id", adminUserController.deleteUser);

  // Logs & Atividades & Notificações & Tentativas de Login
  app.get("/login-attempts", adminLoginAttemptsController.getLoginAttempts);
  app.get("/logs", adminLogController.getGlobalLogs);
  app.get("/users/:id/logs", adminLogController.getUserLogs);
  app.get("/users/:id/notifications", adminNotificationController.getUserNotifications);
  app.get("/passengers/:id/notifications", adminNotificationController.getPassengerNotifications);

  // Configurações Internas & Planos SaaS & Calculadora
  app.get("/configs", adminConfigController.getConfigs);
  app.put("/configs", adminConfigController.updateConfig);
  app.get("/plans", adminPlanController.getPlans);
  app.patch("/plans/:id", adminPlanController.updatePlan);
  app.get("/calculator/baseline", adminCalculatorController.getBaseline);

  // Evolution Instâncias
  app.get("/evolution-instances", adminEvolutionController.getEvolutionInstances);

  // Blog Admin
  app.get("/blog/posts", adminBlogController.list);
  app.post("/blog/posts", adminBlogController.create);
  app.post("/blog/posts/upload", adminBlogController.uploadCover);
  app.get("/blog/posts/:id", adminBlogController.get);
  app.put("/blog/posts/:id", adminBlogController.update);
  app.delete("/blog/posts/:id", adminBlogController.delete);
};

export default adminRoutes;
