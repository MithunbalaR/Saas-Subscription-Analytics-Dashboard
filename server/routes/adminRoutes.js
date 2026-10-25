import { Router } from "express";
import { getStats, getUsers, updateUserRole, deleteUser, triggerReminders, triggerMonthlyReports, getWhatsApp, logoutWhatsApp, testWhatsApp } from "../controllers/adminController.js";
import { protect, adminOnly } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { adminUserUpdateRules, idParam, paging } from "../validators/rules.js";

const router = Router();

// Every admin route needs a logged-in user with role "admin".
router.use(protect, adminOnly);
router.get("/stats", getStats);
router.get("/users", validate(paging), getUsers);
router.patch("/users/:id", validate(adminUserUpdateRules), updateUserRole);
router.delete("/users/:id", validate([idParam()]), deleteUser);
router.post("/run-reminders", triggerReminders);
router.post("/run-monthly-reports", triggerMonthlyReports);
router.get("/whatsapp", getWhatsApp);
router.post("/whatsapp/logout", logoutWhatsApp);
router.post("/whatsapp/test", testWhatsApp);

export default router;
