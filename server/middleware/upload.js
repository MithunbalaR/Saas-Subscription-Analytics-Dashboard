import multer from "multer";
import { httpError } from "../utils/helpers.js";

// Files are kept in memory and then saved to MongoDB (see utils/files.js), never on the server's disk.
const storage = multer.memoryStorage();

const allow = (types, label) => (req, file, cb) =>
  types.includes(file.mimetype) ? cb(null, true) : cb(httpError(400, `Only ${label} files are allowed`));

export const avatarUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: allow(["image/png", "image/jpeg", "image/webp"], "PNG, JPG or WEBP"),
}).single("avatar");

export const receiptUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: allow(["application/pdf", "image/png", "image/jpeg", "image/webp"], "PDF, PNG, JPG or WEBP"),
}).single("receipt");
