import webpush from "web-push";
import PushSubscription from "../models/PushSubscription.js";

// Browser push notifications (Web Push + VAPID keys). Works even when the SubTrack tab is closed.
// Generate keys once with:  npx web-push generate-vapid-keys
let configured = null;

export const pushConfigured = () => {
  if (configured !== null) return configured;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  if (configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@subtrack.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }
  return configured;
};

export const sendPush = async (userId, { title, body, link }) => {
  if (!pushConfigured()) return;
  const subscriptions = await PushSubscription.find({ user: userId });
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({ title, body, link: link || "/" }),
          { TTL: 24 * 60 * 60 }
        );
      } catch (err) {
        // 404/410 = the browser unsubscribed; forget it.
        if (err.statusCode === 404 || err.statusCode === 410) await sub.deleteOne();
        else console.error("Push failed:", err.message);
      }
    })
  );
};
