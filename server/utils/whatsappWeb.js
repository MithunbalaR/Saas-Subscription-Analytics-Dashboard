// Sends WhatsApp messages from your own WhatsApp account by linking SubTrack as a "linked device"
// (like WhatsApp Web), using the Baileys library. Enabled with WHATSAPP_PROVIDER=web.
//
// Recipients don't need to join anything, but this is NOT an official WhatsApp API: WhatsApp's terms
// don't allow automated messages from personal accounts and can ban the number. To keep the risk low,
// messages are sent one at a time with a short pause, and only to numbers that are on WhatsApp.
import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { SERVER_ROOT } from "../config/paths.js";

const SESSION_DIR = process.env.WHATSAPP_SESSION_DIR || path.join(SERVER_ROOT, "whatsapp-session");
const RECONNECT_MS = 5000;

// Baileys logs a lot of protocol detail; keep the server terminal readable.
const silentLogger = { level: "silent", child: () => silentLogger, trace() {}, debug() {}, info() {}, warn() {}, error() {} };

let sock = null;
let starting = false;
let status = "stopped"; // stopped | connecting | qr | connected
let qrDataUrl = null;
let qrLogged = false;

const phoneOf = (jid = "") => `+${jid.split(/[:@]/)[0]}`;

export const getWhatsAppWebStatus = () => ({
  status,
  qr: status === "qr" ? qrDataUrl : null,
  number: status === "connected" && sock?.user?.id ? phoneOf(sock.user.id) : null,
});

export const startWhatsAppWeb = async () => {
  if (sock || starting) return;
  starting = true;
  status = "connecting";
  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const socket = makeWASocket({
      auth: state,
      logger: silentLogger,
      browser: Browsers.appropriate("SubTrack"),
      markOnlineOnConnect: false, // don't make your phone look "online" all the time
      syncFullHistory: false,
    });
    sock = socket;
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        status = "qr";
        qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 260 });
        if (!qrLogged) console.log("[whatsapp] Not linked yet: open SubTrack → Admin panel → WhatsApp and scan the QR code with your phone.");
        qrLogged = true;
      }
      if (connection === "open") {
        status = "connected";
        qrDataUrl = null;
        qrLogged = false;
        console.log(`[whatsapp] Connected as ${phoneOf(socket.user?.id)}`);
      }
      if (connection === "close") {
        if (sock === socket) sock = null;
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          // Unlinked from the phone (or via "Disconnect"): forget the session and offer a fresh QR code.
          console.log("[whatsapp] Logged out; a new QR code will be shown in the Admin panel.");
          await fs.rm(SESSION_DIR, { recursive: true, force: true });
        }
        status = "connecting";
        // Right after scanning, WhatsApp asks for a restart (515); otherwise back off a little.
        setTimeout(startWhatsAppWeb, code === DisconnectReason.restartRequired ? 0 : RECONNECT_MS);
      }
    });
  } catch (err) {
    sock = null;
    status = "stopped";
    console.error("[whatsapp] Could not start:", err.message);
    setTimeout(startWhatsAppWeb, RECONNECT_MS);
  } finally {
    starting = false;
  }
};

// Unlink SubTrack from the phone; a new QR code appears so another number can be linked.
export const logoutWhatsAppWeb = async () => {
  if (!sock) throw new Error("WhatsApp is not connected");
  await sock.logout();
};

// One message at a time, with a human-like pause between messages.
let queue = Promise.resolve();
const pause = () => new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 2000));

export const sendViaWhatsAppWeb = (to, text) => {
  const job = queue.then(async () => {
    if (!sock || status !== "connected") throw new Error("WhatsApp isn't linked yet (scan the QR code in the Admin panel)");
    const [account] = (await sock.onWhatsApp(to.replace(/\D/g, ""))) || [];
    if (!account?.exists) throw new Error(`${to} is not on WhatsApp`);
    await sock.sendMessage(account.jid, { text });
    await pause();
  });
  queue = job.catch(() => {});
  return job;
};
