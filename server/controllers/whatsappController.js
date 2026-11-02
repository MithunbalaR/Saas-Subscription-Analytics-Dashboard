import { httpError } from "../utils/helpers.js";
import { sendWhatsApp, whatsappConfigured } from "../utils/whatsapp.js";

// Each user links their own WhatsApp (Settings -> WhatsApp). These routes only work with WHATSAPP_PROVIDER=web.
const manager = () => import("../utils/whatsappWeb.js"); // Baileys is loaded only when WhatsApp is enabled

const requireEnabled = () => {
  if (!whatsappConfigured()) throw httpError(400, "WhatsApp messaging isn't enabled on this server (set WHATSAPP_PROVIDER=web)");
};

// GET /api/auth/whatsapp - link status of the current user's WhatsApp, with the QR code while linking
export const getMyWhatsApp = async (req, res) => {
  if (!whatsappConfigured()) return res.json({ enabled: false, status: "disabled", qr: null, number: null });
  const { getStatus } = await manager();
  res.json({ enabled: true, ...getStatus(req.user._id) });
};

// POST /api/auth/whatsapp/link - start linking: QR codes appear in GET /api/auth/whatsapp
export const linkWhatsApp = async (req, res) => {
  requireEnabled();
  const { getStatus, startSession } = await manager();
  await startSession(req.user._id);
  res.json({ enabled: true, ...getStatus(req.user._id) });
};

// POST /api/auth/whatsapp/logout - unlink the current user's WhatsApp
export const unlinkWhatsApp = async (req, res) => {
  requireEnabled();
  const { logoutSession } = await manager();
  await logoutSession(req.user._id);
  res.json({ message: "WhatsApp disconnected from SubTrack" });
};

// POST /api/auth/whatsapp/test - send yourself a test message from your linked WhatsApp
export const testMyWhatsApp = async (req, res) => {
  requireEnabled();
  const { getStatus } = await manager();
  const { status, number } = getStatus(req.user._id);
  if (status !== "connected") throw httpError(400, "Link your WhatsApp first");
  const to = req.user.phone || number;
  try {
    await sendWhatsApp({
      from: req.user._id,
      to,
      subject: "SubTrack test message",
      text: `Hi ${req.user.name}! WhatsApp notifications from SubTrack are working.\n\nSent by SubTrack.`,
    });
  } catch (err) {
    throw httpError(400, `WhatsApp message failed: ${err.message}`);
  }
  res.json({ message: `Test message sent to ${to}` });
};
