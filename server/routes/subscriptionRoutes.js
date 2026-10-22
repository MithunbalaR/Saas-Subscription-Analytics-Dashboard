import { Router } from "express";
import {
  getSubscriptions,
  getSubscription,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  recordPayment,
  importSubscriptions,
} from "../controllers/subscriptionController.js";
import { protect } from "../middleware/auth.js";
import { withWorkspace } from "../middleware/workspace.js";
import { validate } from "../middleware/validate.js";
import { idParam, importRules, subscriptionListRules, subscriptionRules } from "../validators/rules.js";

const router = Router();

router.use(protect, withWorkspace);
router.route("/").get(validate(subscriptionListRules), getSubscriptions).post(validate(subscriptionRules()), createSubscription);
router.post("/import", validate(importRules), importSubscriptions);
router
  .route("/:id")
  .get(validate([idParam()]), getSubscription)
  .put(validate([idParam(), ...subscriptionRules(true)]), updateSubscription)
  .delete(validate([idParam()]), deleteSubscription);
router.post("/:id/pay", validate([idParam()]), recordPayment);

export default router;
