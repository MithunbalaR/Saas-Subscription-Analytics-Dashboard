// Each user can link their own WhatsApp account to SubTrack (like WhatsApp Web) by scanning a QR code in
// Settings; messages they trigger are then sent from their number. Uses the Baileys library and is enabled
// with WHATSAPP_PROVIDER=web.
//
// Recipients don't need to join anything, but this is NOT an official WhatsApp API: WhatsApp's terms
// don't allow automated messages from personal accounts and can ban the number. To keep the risk low,
// each account sends one message at a time with a short pause, and only to numbers that are on WhatsApp.
import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { SERVER_ROOT } from "../config/paths.js";

const SESSIONS_DIR = process.env.WHATSAPP_SESSION_DIR || path.join(SERVER_ROOT, "whatsapp-session");
const RECONNECT_MS = 5000;

// Baileys logs a lot of protocol detail; keep the server terminal readable.
const silentLogger = { level: "silent", child: () => silentLogger, trace() {}, debug() {}, info() {}, warn() {}, error() {} };

// userId -> { sock, status: stopped | connecting | qr | connected, qr, queue }
const sessions = new Map();

const dirFor = (userId) => path.join(SESSIONS_DIR, String(userId));
const phoneOf = (jid = "") => `+${jid.split(/[:@]/)[0]}`;
const sessionOf = (userId) => {
  const id = String(userId);
  if (!sessions.has(id)) sessions.set(id, { sock: null, status: "stopped", qr: null, queue: Promise.resolve(), starting: false });
  return sessions.get(id);
};

export const isLinked = (userId) => sessions.get(String(userId))?.status === "connected";

export const getStatus = (userId) => {
  const s = sessions.get(String(userId));
  if (!s) return { status: "stopped", qr: null, number: null };
  return {
    status: s.status,
    qr: s.status === "qr" ? s.qr : null,
    number: s.status === "connected" && s.sock?.user?.id ? phoneOf(s.sock.user.id) : null,
  };
};

// Connects a user's WhatsApp: reuses their saved login, or produces QR codes to scan.
export const startSession = async (userId) => {
  const session = sessionOf(userId);
  if (session.sock || session.starting) return;
  session.starting = true;
  session.status = "connecting";
  try {
    const { state, saveCreds } = await useMultiFileAuthState(dirFor(userId));
    const socket = makeWASocket({
      auth: state,
      logger: silentLogger,
      browser: Browsers.appropriate("SubTrack"),
      markOnlineOnConnect: false, // don't make the phone look "online" all the time
      syncFullHistory: false,
    });
    session.sock = socket;
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        session.status = "qr";
        session.qr = await QRCode.toDataURL(qr, { margin: 1, width: 260 });
      }
      if (connection === "open") {
        session.status = "connected";
        session.qr = null;
        console.log(`[whatsapp] User ${userId} linked as ${phoneOf(socket.user?.id)}`);
      }
      if (connection === "close") {
        if (session.sock === socket) session.sock = null;
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          // Unlinked from the phone or from Settings: forget the login.
          await fs.rm(dirFor(userId), { recursive: true, force: true });
          session.status = "stopped";
          session.qr = null;
          return;
        }
        if (code === DisconnectReason.restartRequired) return startSession(userId); // normal right after scanning
        if (!state.creds.me) {
          // Nobody scanned the QR code in time (a finished link always has creds.me); the user can click "Link WhatsApp" again.
          await fs.rm(dirFor(userId), { recursive: true, force: true });
          session.status = "stopped";
          session.qr = null;
          return;
        }
        session.status = "connecting";
        setTimeout(() => startSession(userId), RECONNECT_MS); // network hiccup: reconnect with the saved login
      }
    });
  } catch (err) {
    session.sock = null;
    session.status = "stopped";
    console.error(`[whatsapp] Could not start for user ${userId}:`, err.message);
  } finally {
    session.starting = false;
  }
};

// Unlink the user's WhatsApp from SubTrack.
export const logoutSession = async (userId) => {
  const session = sessions.get(String(userId));
  if (session?.sock) await session.sock.logout().catch(() => session.sock?.end());
  await fs.rm(dirFor(userId), { recursive: true, force: true });
  sessions.delete(String(userId));
};

// On server start: reconnect every user who linked WhatsApp before.
export const restoreSessions = async () => {
  const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true }).catch(() => []);
  const linked = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Only accounts that finished linking: a successful QR scan stores the account in creds.me
    // (a QR code that was never scanned leaves a login without it, which is cleaned up).
    const creds = await fs.readFile(path.join(SESSIONS_DIR, entry.name, "creds.json"), "utf8").then(JSON.parse, () => undefined);
    if (creds?.me?.id) linked.push(entry.name);
    else if (creds) await fs.rm(path.join(SESSIONS_DIR, entry.name), { recursive: true, force: true });
  }
  for (const userId of linked) startSession(userId);
  if (linked.length) console.log(`[whatsapp] Reconnecting ${linked.length} linked account(s)`);
};

// One message at a time per account, with a human-like pause between messages.
const pause = () => new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 2000));

export const sendFrom = (userId, to, text) => {
  const session = sessions.get(String(userId));
  if (!session || session.status !== "connected") return Promise.reject(new Error("WhatsApp isn't linked for this account"));
  const job = session.queue.then(async () => {
    if (!session.sock || session.status !== "connected") throw new Error("WhatsApp disconnected");
    const [account] = (await session.sock.onWhatsApp(to.replace(/\D/g, ""))) || [];
    if (!account?.exists) throw new Error(`${to} is not on WhatsApp`);
    await session.sock.sendMessage(account.jid, { text });
    await pause();
  });
  session.queue = job.catch(() => {});
  return job;
};
