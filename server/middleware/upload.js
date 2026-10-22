import crypto from "node:crypto";
import multer from "multer";
import { AVATAR_DIR, RECEIPT_DIR } from "../config/paths.js";
import { httpError } from "../utils/helpers.js";

const EXTENSIONS = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

// Random file names (never the user's original name) so files can't overwrite each other or be guessed.
const storage = (dir) =>
  multer.diskStorage({
    destination: dir,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${EXTENSIONS[file.mimetype]}`),
  });

const allow = (types, label) => (req, file, cb) =>
  types.includes(file.mimetype) ? cb(null, true) : cb(httpError(400, `Only ${label} files are allowed`));

export const avatarUpload = multer({
  storage: storage(AVATAR_DIR),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: allow(["image/png", "image/jpeg", "image/webp"], "PNG, JPG or WEBP"),
}).single("avatar");

export const receiptUpload = multer({
  storage: storage(RECEIPT_DIR),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: allow(Object.keys(EXTENSIONS), "PDF, PNG, JPG or WEBP"),
}).single("receipt");
