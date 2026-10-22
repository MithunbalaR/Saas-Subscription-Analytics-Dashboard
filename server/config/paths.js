import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const UPLOAD_DIR = path.join(SERVER_ROOT, "uploads");
export const AVATAR_DIR = path.join(UPLOAD_DIR, "avatars"); // public (served statically)
export const RECEIPT_DIR = path.join(UPLOAD_DIR, "receipts"); // private (served only to workspace members)
export const CLIENT_DIST = path.resolve(SERVER_ROOT, "../client/dist");

for (const dir of [AVATAR_DIR, RECEIPT_DIR]) fs.mkdirSync(dir, { recursive: true });
