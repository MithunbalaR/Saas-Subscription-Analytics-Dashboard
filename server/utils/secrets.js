import crypto from "node:crypto";

// AES-256-GCM encryption for small secrets stored in the database (e.g. 2FA keys),
// so a leaked database dump alone isn't enough to generate someone's login codes.
const key = () =>
  crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY || `${process.env.JWT_SECRET}-encryption`).digest();

export const encrypt = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
};

export const decrypt = (stored) => {
  const [iv, tag, data] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
};

export const sha256 = (text) => crypto.createHash("sha256").update(String(text)).digest("hex");
