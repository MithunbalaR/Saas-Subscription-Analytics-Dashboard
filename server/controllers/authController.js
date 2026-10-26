import crypto from "node:crypto";
import User from "../models/User.js";
import { avatarFileId, deleteStoredFile, saveUpload } from "../utils/files.js";
import { httpError, pick } from "../utils/helpers.js";
import { createPersonalWorkspace } from "../utils/workspace.js";
import { sendEmail } from "../utils/email.js";
import { clearRefreshCookie, issueSession, readRefreshCookie, verifyRefreshToken } from "../utils/tokens.js";
import { completeLogin } from "./twoFactorController.js";
import { pushConfigured } from "../utils/push.js";
import { aiProvider } from "./aiController.js";
import { whatsappConfigured } from "../utils/whatsapp.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const hashOtp = (otp) => crypto.createHash("sha256").update(String(otp)).digest("hex");

// POST /api/auth/register
export const register = async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (await User.exists({ email })) throw httpError(409, "An account with this email already exists");

  const user = await User.create({ name, email, password, phone: phone || "", lastLoginAt: new Date() });
  await createPersonalWorkspace(user);
  res.status(201).json(issueSession(res, user));
};

// POST /api/auth/login - returns a session, or { twoFactorRequired, tempToken } when 2FA is on
export const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password +tokenVersion");
  if (!user || !(await user.matchPassword(password))) throw httpError(401, "Invalid email or password");
  res.json(await completeLogin(res, user));
};

// GET /api/auth/config - which optional features the server has keys for
export const getConfig = (req, res) => {
  res.json({
    vapidPublicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null,
    aiEnabled: true, // the assistant always works: Claude, Gemini, or built-in smart answers
    aiProvider: aiProvider(),
    whatsappEnabled: whatsappConfigured(),
  });
};

// POST /api/auth/refresh - swaps the httpOnly refresh cookie for a new access token.
export const refresh = async (req, res) => {
  const token = readRefreshCookie(req);
  if (!token) throw httpError(401, "Not logged in");

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    clearRefreshCookie(res);
    throw httpError(401, "Session expired, please log in again");
  }

  const user = await User.findById(payload.id).select("+tokenVersion");
  if (!user || user.tokenVersion !== payload.v) {
    clearRefreshCookie(res);
    throw httpError(401, "Session expired, please log in again");
  }
  res.json(issueSession(res, user)); // rotates the refresh cookie too
};

// POST /api/auth/logout
export const logout = async (req, res) => {
  clearRefreshCookie(res);
  res.json({ message: "Logged out" });
};

// GET /api/auth/me
export const getMe = async (req, res) => {
  res.json({ user: req.user });
};

// PUT /api/auth/profile
export const updateProfile = async (req, res) => {
  req.user.set(pick(req.body, ["name", "emailReminders", "reminderDays", "language", "phone", "whatsappNotifications"]));
  await req.user.save();
  res.json({ user: req.user });
};

// POST /api/auth/avatar  (multipart/form-data, field "avatar")
export const uploadAvatar = async (req, res) => {
  if (!req.file) throw httpError(400, "Please choose an image to upload");
  const previous = avatarFileId(req.user.avatar);
  const id = await saveUpload(req.file, { kind: "avatar", owner: req.user._id });
  req.user.avatar = `/uploads/avatars/${id}`;
  await req.user.save();
  await deleteStoredFile(previous);
  res.json({ user: req.user });
};

// DELETE /api/auth/avatar
export const removeAvatar = async (req, res) => {
  await deleteStoredFile(avatarFileId(req.user.avatar));
  req.user.avatar = "";
  await req.user.save();
  res.json({ user: req.user });
};

// PUT /api/auth/password
export const changePassword = async (req, res) => {
  const user = await User.findById(req.user._id).select("+password +tokenVersion");
  if (!(await user.matchPassword(req.body.currentPassword))) throw httpError(400, "Current password is incorrect");

  user.password = req.body.newPassword;
  user.tokenVersion += 1; // log out every other device
  await user.save();
  res.json({ ...issueSession(res, user), message: "Password updated" });
};

// POST /api/auth/forgot-password - emails a 6-digit code valid for 10 minutes.
export const forgotPassword = async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (user) {
    const otp = crypto.randomInt(100000, 1000000);
    user.resetOtpHash = hashOtp(otp);
    user.resetOtpExpires = new Date(Date.now() + OTP_TTL_MS);
    user.resetOtpAttempts = 0;
    await user.save();
    await sendEmail({
      to: user.email,
      subject: "Your SubTrack password reset code",
      text: `Hi ${user.name},\n\nYour password reset code is ${otp}.\nIt expires in 10 minutes. If you didn't ask for this, you can ignore this email.`,
    });
  }
  // Same answer whether or not the email exists, so attackers can't discover accounts.
  res.json({ message: "If an account exists for that email, a reset code has been sent." });
};

// POST /api/auth/reset-password
export const resetPassword = async (req, res) => {
  const { email, otp, password } = req.body;
  const user = await User.findOne({ email }).select("+resetOtpHash +resetOtpExpires +resetOtpAttempts +tokenVersion");
  const invalid = httpError(400, "Invalid or expired code");
  if (!user?.resetOtpHash || user.resetOtpExpires < new Date()) throw invalid;

  if (user.resetOtpAttempts >= OTP_MAX_ATTEMPTS) throw httpError(429, "Too many wrong codes. Request a new one.");
  const matches = crypto.timingSafeEqual(Buffer.from(hashOtp(otp)), Buffer.from(user.resetOtpHash));
  if (!matches) {
    user.resetOtpAttempts += 1;
    await user.save();
    throw invalid;
  }

  user.password = password;
  user.resetOtpHash = undefined;
  user.resetOtpExpires = undefined;
  user.resetOtpAttempts = 0;
  user.tokenVersion += 1;
  await user.save();
  res.json({ message: "Password reset. You can now log in." });
};

