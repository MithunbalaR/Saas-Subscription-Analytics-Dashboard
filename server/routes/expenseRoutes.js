import { Router } from "express";
import {
  getExpenses,
  exportExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  uploadReceipt,
  downloadReceipt,
  deleteReceipt,
} from "../controllers/expenseController.js";
import { protect } from "../middleware/auth.js";
import { withWorkspace } from "../middleware/workspace.js";
import { validate } from "../middleware/validate.js";
import { receiptUpload } from "../middleware/upload.js";
import { expenseListRules, expenseRules, idParam } from "../validators/rules.js";

const router = Router();

router.use(protect, withWorkspace);
router.route("/").get(validate(expenseListRules), getExpenses).post(validate(expenseRules()), createExpense);
router.get("/export", validate(expenseListRules), exportExpenses);
router
  .route("/:id")
  .put(validate([idParam(), ...expenseRules(true)]), updateExpense)
  .delete(validate([idParam()]), deleteExpense);
router
  .route("/:id/receipt")
  .get(validate([idParam()]), downloadReceipt)
  .post(validate([idParam()]), receiptUpload, uploadReceipt)
  .delete(validate([idParam()]), deleteReceipt);

export default router;
