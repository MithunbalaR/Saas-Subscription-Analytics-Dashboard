import api from "../api/client.js";

// Browser push notifications via the Push API + our service worker (public/sw.js).

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const registerServiceWorker = () => {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("Service worker registration failed:", err));
  });
};

// VAPID public keys are base64url strings; the Push API wants raw bytes.
const toBytes = (base64url) => {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

export const getPushSubscription = async () => {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
};

export const enablePush = async (vapidPublicKey) => {
  if (!pushSupported()) throw new Error("This browser doesn't support push notifications");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked. Allow them in your browser's site settings.");

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(vapidPublicKey) }));
  await api.post("/push/subscribe", subscription.toJSON());
};

export const disablePush = async () => {
  const subscription = await getPushSubscription();
  if (!subscription) return;
  await api.delete("/push/subscribe", { data: { endpoint: subscription.endpoint } }).catch(() => {});
  await subscription.unsubscribe();
};
