import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { withWorkspace } from "../middleware/workspace.js";
import { validate } from "../middleware/validate.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { idParam } from "../validators/rules.js";
import { getSplits, setSettled, settleAll, remind } from "../controllers/splitController.js";
import { getActivity } from "../controllers/activityController.js";
import { subscribe, unsubscribe, sendTest } from "../controllers/pushController.js";
import { chat } from "../controllers/aiController.js";
import { downloadMonthly, emailMonthly } from "../controllers/reportController.js";

// Cost splitting: /api/splits
export const splitRoutes = Router()
  .use(protect, withWorkspace)
  .get("/", getSplits)
  .post("/settle-all", settleAll)
  .patch("/:id", validate([idParam()]), setSettled)
  .post("/:id/remind", validate([idParam()]), remind);

// Workspace audit trail: /api/activity
export const activityRoutes = Router().use(protect, withWorkspace).get("/", getActivity);

// Browser push notifications: /api/push
export const pushRoutes = Router()
  .use(protect)
  .post("/subscribe", subscribe)
  .delete("/subscribe", unsubscribe)
  .post("/test", sendTest);

// AI assistant: /api/ai
export const aiRoutes = Router().use(protect, withWorkspace).post("/chat", aiLimiter, chat);

// Monthly PDF reports: /api/reports
export const reportRoutes = Router()
  .use(protect, withWorkspace)
  .get("/monthly", downloadMonthly)
  .post("/monthly/email", emailMonthly);
