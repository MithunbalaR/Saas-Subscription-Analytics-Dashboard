import Notification from "../models/Notification.js";
import { sendEmailSafe } from "./email.js";
import { emitToUsers } from "./realtime.js";
import { sendPush } from "./push.js";

// Create an in-app notification for one user and deliver it on every channel:
// live (Socket.io), browser push, and optionally email.
// Returns false (and sends nothing) if an alert with the same dedupeKey already exists.
export const notifyUser = async (user, { type, title, message, link, workspace, dedupeKey }, { email = false } = {}) => {
  let notification;
  try {
    notification = await Notification.create({ user: user._id, type, title, message, link, workspace, dedupeKey });
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
  emitToUsers([String(user._id)], "notification", notification);
  sendPush(user._id, { title, body: message, link }).catch((err) => console.error("Push failed:", err.message));
  if (email && user.email) sendEmailSafe({ to: user.email, subject: title, text: message });
  return true;
};
