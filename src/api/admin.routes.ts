import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { AdminController } from "../controllers/admin.controller.js";
import { verifySupabaseJWT } from "../middleware/auth.js";
import { verifyAdmin } from "../middleware/admin.js";

const adminRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook("onRequest", verifySupabaseJWT);
  app.addHook("onRequest", verifyAdmin);

  app.get("/dashboard", AdminController.getDashboard);

  app.get("/users", AdminController.getUsers);
  app.post("/users", AdminController.createUser);
  app.get("/users/:id", AdminController.getUserDetails);
  app.patch("/users/:id", AdminController.updateUser);
  app.patch("/users/:id/subscription", AdminController.updateSubscription);
  app.post("/users/:id/reset-password", AdminController.resetUserPassword);

  app.get("/configs", AdminController.getConfigs);
  app.put("/configs", AdminController.updateConfig);

  app.get("/plans", AdminController.getPlans);
  app.patch("/plans/:id", AdminController.updatePlan);
};

export default adminRoutes;
