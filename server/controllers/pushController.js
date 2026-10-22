import PushSubscription from "../models/PushSubscription.js";
import { pushConfigured, sendPush } from "../utils/push.js";
import { httpError } from "../utils/helpers.js";

// POST /api/push/subscribe - save this browser's push subscription
export const subscribe = async (req, res) => {
  if (!pushConfigured()) throw httpError(503, "Push notifications are not set up on the server");
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw httpError(400, "Invalid push subscription");
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { user: req.user._id, endpoint, keys, userAgent: req.get("user-agent") },
    { upsert: true, returnDocument: "after" }
  );
  res.status(201).json({ message: "Push notifications enabled on this device" });
};

// DELETE /api/push/subscribe  { endpoint }
export const unsubscribe = async (req, res) => {
  await PushSubscription.deleteOne({ endpoint: req.body?.endpoint, user: req.user._id });
  res.json({ message: "Push notifications disabled on this device" });
};

// POST /api/push/test - sends a test notification to all of the user's devices
export const sendTest = async (req, res) => {
  if (!pushConfigured()) throw httpError(503, "Push notifications are not set up on the server");
  const devices = await PushSubscription.countDocuments({ user: req.user._id });
  if (!devices) throw httpError(400, "Enable push notifications on this device first");
  await sendPush(req.user._id, { title: "SubTrack test notification", body: "Push notifications are working 🎉", link: "/" });
  res.json({ message: `Test sent to ${devices} device${devices === 1 ? "" : "s"}` });
};
