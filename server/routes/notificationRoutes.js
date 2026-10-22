import { Router } from "express";
import { getNotifications, markRead, markAllRead, deleteNotification } from "../controllers/notificationController.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { idParam } from "../validators/rules.js";

const router = Router();

router.use(protect);
router.get("/", getNotifications);
router.patch("/read-all", markAllRead);
router.patch("/:id/read", validate([idParam()]), markRead);
router.delete("/:id", validate([idParam()]), deleteNotification);

export default router;
