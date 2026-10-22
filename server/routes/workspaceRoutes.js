import { Router } from "express";
import {
  getWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  addMember,
  removeMember,
} from "../controllers/workspaceController.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { idParam, memberRules, workspaceCreateRules, workspaceUpdateRules } from "../validators/rules.js";

const router = Router();

router.use(protect);
router.route("/").get(getWorkspaces).post(validate(workspaceCreateRules), createWorkspace);
router.route("/:id").put(validate(workspaceUpdateRules), updateWorkspace).delete(validate([idParam()]), deleteWorkspace);
router.post("/:id/members", validate(memberRules), addMember);
router.delete("/:id/members/:userId", validate([idParam(), idParam("userId")]), removeMember);

export default router;
