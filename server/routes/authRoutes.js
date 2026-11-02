import { Router } from "express";
import {
  register,
  login,
  refresh,
  logout,
  getMe,
  updateProfile,
  uploadAvatar,
  removeAvatar,
  changePassword,
  forgotPassword,
  resetPassword,
  getConfig,
} from "../controllers/authController.js";
import { setup as setup2fa, enable as enable2fa, disable as disable2fa, verifyLogin as verify2fa } from "../controllers/twoFactorController.js";
import { protect } from "../middleware/auth.js";
import { getMyWhatsApp, linkWhatsApp, testMyWhatsApp, unlinkWhatsApp } from "../controllers/whatsappController.js";
import { validate } from "../middleware/validate.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { avatarUpload } from "../middleware/upload.js";
import { changePasswordRules, forgotRules, loginRules, profileRules, registerRules, resetRules } from "../validators/rules.js";

const router = Router();

router.post("/register", authLimiter, validate(registerRules), register);
router.post("/login", authLimiter, validate(loginRules), login);
router.get("/config", getConfig);
router.post("/2fa/verify", authLimiter, verify2fa);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/forgot-password", authLimiter, validate(forgotRules), forgotPassword);
router.post("/reset-password", authLimiter, validate(resetRules), resetPassword);

router.get("/me", protect, getMe);
router.put("/profile", protect, validate(profileRules), updateProfile);
router.put("/password", protect, authLimiter, validate(changePasswordRules), changePassword);
router.post("/avatar", protect, avatarUpload, uploadAvatar);
router.delete("/avatar", protect, removeAvatar);
router.post("/2fa/setup", protect, setup2fa);
router.post("/2fa/enable", protect, authLimiter, enable2fa);
router.post("/2fa/disable", protect, authLimiter, disable2fa);
router.get("/whatsapp", protect, getMyWhatsApp);
router.post("/whatsapp/link", protect, linkWhatsApp);
router.post("/whatsapp/logout", protect, unlinkWhatsApp);
router.post("/whatsapp/test", protect, testMyWhatsApp);

export default router;
