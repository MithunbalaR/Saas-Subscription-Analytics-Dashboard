// WhatsApp messages, sent from your own WhatsApp account linked by QR code (WHATSAPP_PROVIDER=web,
// see whatsappWeb.js). Anyone can receive them, but it's unofficial and the number can be banned.
// Without it, messages are printed in the server terminal, exactly like emails without SMTP.

const MAX_LENGTH = 1600; // keep one message to a readable size

// Messages "sent" while WhatsApp isn't enabled (useful in tests and offline demos).
export const whatsappOutbox = [];

export const whatsappProvider = () => (String(process.env.WHATSAPP_PROVIDER).toLowerCase() === "web" ? "web" : "log");
export const whatsappConfigured = () => whatsappProvider() === "web";

// Formats an email-style message for WhatsApp: bold title, then the text.
export const toWhatsAppText = (subject, text) => {
  const body = `*${subject}*\n\n${text}`.trim();
  return body.length > MAX_LENGTH ? `${body.slice(0, MAX_LENGTH - 1)}…` : body;
};

export const sendWhatsApp = async ({ to, subject, text }) => {
  const body = toWhatsAppText(subject, text);

  if (!whatsappConfigured()) {
    whatsappOutbox.push({ to, body });
    if (whatsappOutbox.length > 50) whatsappOutbox.shift();
    if (process.env.NODE_ENV !== "test") {
      console.log(`\n--- WhatsApp (not enabled, not sent) ---\nTo: ${to}\n${body}\n----------------------------------------\n`);
    }
    return { delivered: false };
  }

  const { sendViaWhatsAppWeb } = await import("./whatsappWeb.js"); // loaded only when used
  await sendViaWhatsAppWeb(to, body);
  return { delivered: true };
};

// Fire-and-forget variant: a WhatsApp failure should never break the API request.
export const sendWhatsAppSafe = (message) =>
  sendWhatsApp(message).catch((err) => console.error(`WhatsApp to ${message.to} failed: ${err.message}`));
