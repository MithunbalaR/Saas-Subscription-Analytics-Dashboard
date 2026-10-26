// Baileys auth state stored in MongoDB (same behaviour as Baileys' useMultiFileAuthState, but one
// document per key instead of one file), so WhatsApp links survive restarts on hosts without a disk.
import fs from "node:fs/promises";
import path from "node:path";
import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";
import WhatsAppAuth from "../models/WhatsAppAuth.js";

const encode = (value) => JSON.stringify(value, BufferJSON.replacer);
const decode = (text) => JSON.parse(text, BufferJSON.reviver);

export const useMongoAuthState = async (userId) => {
  const user = userId;
  const credsDoc = await WhatsAppAuth.findOne({ user, key: "creds" }).lean();
  const creds = credsDoc ? decode(credsDoc.value) : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const docs = await WhatsAppAuth.find({ user, key: { $in: ids.map((id) => `${type}-${id}`) } }).lean();
          const found = new Map(docs.map((d) => [d.key, decode(d.value)]));
          const data = {};
          for (const id of ids) {
            let value = found.get(`${type}-${id}`) ?? null;
            if (type === "app-state-sync-key" && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          const ops = [];
          for (const type in data) {
            for (const id in data[type]) {
              const value = data[type][id];
              const key = `${type}-${id}`;
              ops.push(
                value
                  ? { updateOne: { filter: { user, key }, update: { $set: { value: encode(value) } }, upsert: true } }
                  : { deleteOne: { filter: { user, key } } }
              );
            }
          }
          if (ops.length) await WhatsAppAuth.bulkWrite(ops, { ordered: false });
        },
      },
    },
    saveCreds: () => WhatsAppAuth.updateOne({ user, key: "creds" }, { $set: { value: encode(creds) } }, { upsert: true }),
  };
};

export const clearAuthState = (userId) => WhatsAppAuth.deleteMany({ user: userId });

// Users whose WhatsApp link finished (a successful QR scan stores the account in creds.me).
// Logins whose QR code was never scanned are removed.
export const linkedUserIds = async () => {
  const docs = await WhatsAppAuth.find({ key: "creds" }).lean();
  const linked = [];
  for (const doc of docs) {
    if (decode(doc.value)?.me?.id) linked.push(String(doc.user));
    else await clearAuthState(doc.user);
  }
  return linked;
};

// One-time import of logins saved by the earlier file-based version (server/whatsapp-session/<userId>/).
export const importFolderSessions = async (sessionsDir) => {
  const entries = await fs.readdir(sessionsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-f0-9]{24}$/.test(entry.name)) continue;
    const dir = path.join(sessionsDir, entry.name);
    const files = await fs.readdir(dir).catch(() => []);
    if (files.includes("creds.json") && !(await WhatsAppAuth.exists({ user: entry.name, key: "creds" }))) {
      const ops = [];
      for (const file of files.filter((f) => f.endsWith(".json"))) {
        // file names were "<type>-<id>.json" with "/" written as "__"
        const key = file === "creds.json" ? "creds" : file.slice(0, -5).replace(/__/g, "/");
        const value = await fs.readFile(path.join(dir, file), "utf8");
        ops.push({ updateOne: { filter: { user: entry.name, key }, update: { $set: { value } }, upsert: true } });
      }
      if (ops.length) await WhatsAppAuth.bulkWrite(ops, { ordered: false });
      console.log(`[whatsapp] Moved the saved login of user ${entry.name} into MongoDB`);
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
};
