import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { AdminController } from "../controllers/admin.controller.js";
import { adminBlogController } from "../controllers/blog.controller.js";
import { verifySupabaseJWT } from "../middleware/auth.js";
import { verifyAdmin } from "../middleware/admin.js";

const adminRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook("onRequest", verifySupabaseJWT);
  app.addHook("onRequest", verifyAdmin);

  app.get("/dashboard", AdminController.getDashboard);
  app.get("/login-attempts", AdminController.getLoginAttempts);
  app.get("/logs", AdminController.getGlobalLogs);

  app.get("/users", AdminController.getUsers);
  app.post("/users", AdminController.createUser);
  app.get("/users/:id", AdminController.getUserDetails);
  app.get("/users/:id/logs", AdminController.getUserLogs);
  app.patch("/users/:id", AdminController.updateUser);
  app.patch("/users/:id/subscription", AdminController.updateSubscription);
  app.post("/users/:id/reset-password", AdminController.resetUserPassword);
  app.delete("/users/:id", AdminController.deleteUser);

  app.get("/configs", AdminController.getConfigs);
  app.put("/configs", AdminController.updateConfig);

  app.get("/plans", AdminController.getPlans);
  app.patch("/plans/:id", AdminController.updatePlan);

  app.get("/whatsapp-instances", AdminController.getWhatsappInstances);

  app.get("/blog/posts", adminBlogController.list);
  app.get("/blog/posts/:id", adminBlogController.get);
  app.post("/blog/posts", adminBlogController.create);
  app.post("/blog/posts/upload", adminBlogController.uploadCover);
  app.put("/blog/posts/:id", adminBlogController.update);
  app.delete("/blog/posts/:id", adminBlogController.delete);
};

export default adminRoutes;
