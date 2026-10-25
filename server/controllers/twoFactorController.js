import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { generateSecret, generateURI, verify } from "otplib";
import User from "../models/User.js";
import { decrypt, encrypt, sha256 } from "../utils/secrets.js";
import { issueSession } from "../utils/tokens.js";
import { httpError } from "../utils/helpers.js";

// Two-factor authentication with time-based one-time passwords (TOTP):
// the user scans a QR code into Google Authenticator / Microsoft Authenticator / Authy,
// and after entering their password they must also type the 6-digit code from the app.

const RECOVERY_CODE_COUNT = 8;
const TEMP_TOKEN_TTL = "5m";
// Separate secret so a "password OK, waiting for code" token can never be used as a login token.
const tempSecret = () => `${process.env.JWT_SECRET}-2fa`;

const codeIsValid = async (secret, code) => (await verify({ secret, token: String(code).replace(/\s/g, "") })).valid;

const newRecoveryCodes = () =>
  Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const hex = crypto.randomBytes(4).toString("hex");
    return `${hex.slice(0, 4)}-${hex.slice(4)}`;
  });

// Used by password login: either log in now, or ask for the 2FA code first.
export const completeLogin = async (res, user) => {
  if (user.twoFactorEnabled) {
    return { twoFactorRequired: true, tempToken: jwt.sign({ id: user._id }, tempSecret(), { expiresIn: TEMP_TOKEN_TTL }) };
  }
  user.lastLoginAt = new Date();
  await user.save();
  return issueSession(res, user);
};

// POST /api/auth/2fa/setup - creates a new secret and returns a QR code to scan
export const setup = async (req, res) => {
  if (req.user.twoFactorEnabled) throw httpError(400, "Two-factor authentication is already on");
  const secret = generateSecret();
  await User.updateOne({ _id: req.user._id }, { twoFactorPendingSecret: encrypt(secret) });
  const uri = generateURI({ issuer: "SubTrack", label: req.user.email, secret });
  res.json({ qrCode: await QRCode.toDataURL(uri, { margin: 1, width: 220 }), secret });
};

// POST /api/auth/2fa/enable  { code } - confirms the app is set up correctly, returns recovery codes once
export const enable = async (req, res) => {
  const user = await User.findById(req.user._id).select("+twoFactorPendingSecret");
  if (!user.twoFactorPendingSecret) throw httpError(400, "Start the setup first");
  const secret = decrypt(user.twoFactorPendingSecret);
  if (!(await codeIsValid(secret, req.body.code))) throw httpError(400, "That code isn't right. Check the time on your phone and try again.");

  const recoveryCodes = newRecoveryCodes();
  user.twoFactorEnabled = true;
  user.twoFactorSecret = encrypt(secret);
  user.twoFactorPendingSecret = undefined;
  user.recoveryCodes = recoveryCodes.map(sha256);
  await user.save();
  res.json({ user, recoveryCodes });
};

// POST /api/auth/2fa/disable  { password, code }
export const disable = async (req, res) => {
  const user = await User.findById(req.user._id).select("+password +twoFactorSecret +recoveryCodes");
  if (!user.twoFactorEnabled) throw httpError(400, "Two-factor authentication is already off");
  if (!(await user.matchPassword(req.body.password || ""))) throw httpError(400, "Password is incorrect");
  if (!(await checkSecondFactor(user, req.body.code))) throw httpError(400, "Invalid authentication or recovery code");

  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  user.recoveryCodes = [];
  await user.save();
  res.json({ user });
};

// Accepts a 6-digit app code, or a one-time recovery code (which is then used up).
const checkSecondFactor = async (user, code = "") => {
  const clean = String(code).trim().toLowerCase();
  if (/^\d{6}$/.test(clean.replace(/\s/g, ""))) return codeIsValid(decrypt(user.twoFactorSecret), clean);
  const index = (user.recoveryCodes || []).indexOf(sha256(clean));
  if (index === -1) return false;
  user.recoveryCodes.splice(index, 1);
  return true;
};

// POST /api/auth/2fa/verify  { tempToken, code } - second step of login
export const verifyLogin = async (req, res) => {
  let payload;
  try {
    payload = jwt.verify(req.body.tempToken, tempSecret());
  } catch {
    throw httpError(401, "Your login attempt expired. Please enter your password again.");
  }
  const user = await User.findById(payload.id).select("+twoFactorSecret +recoveryCodes +tokenVersion");
  if (!user?.twoFactorEnabled) throw httpError(401, "Please log in again");
  if (!(await checkSecondFactor(user, req.body.code))) throw httpError(401, "Invalid authentication or recovery code");

  user.lastLoginAt = new Date();
  await user.save();
  res.json({ ...issueSession(res, user), recoveryCodesLeft: user.recoveryCodes.length });
};
