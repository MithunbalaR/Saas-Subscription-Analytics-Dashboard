import { Router } from "express";
import { getSummary } from "../controllers/analyticsController.js";
import { protect } from "../middleware/auth.js";
import { withWorkspace } from "../middleware/workspace.js";

const router = Router();

router.get("/summary", protect, withWorkspace, getSummary);

export default router;
