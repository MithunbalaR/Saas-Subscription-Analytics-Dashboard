import path from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CLIENT_DIST = path.resolve(SERVER_ROOT, "../client/dist");

