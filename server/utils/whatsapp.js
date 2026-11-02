// WhatsApp messages, sent from the WhatsApp account that the sending user linked in Settings
// (WHATSAPP_PROVIDER=web, see whatsappWeb.js). `from` is that user's id: messages to split participants
// come from the person who added them, and a user's own alerts come from their own number to themselves.
// Without WHATSAPP_PROVIDER=web, messages are printed in the server terminal, like emails without SMTP.

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

export const sendWhatsApp = async ({ from, to, subject, text }) => {
  const body = toWhatsAppText(subject, text);

  if (!whatsappConfigured()) {
    whatsappOutbox.push({ from: from ? String(from) : null, to, body });
    if (whatsappOutbox.length > 50) whatsappOutbox.shift();
    if (process.env.NODE_ENV !== "test") {
      console.log(`\n--- WhatsApp (not enabled, not sent) ---\nTo: ${to}\n${body}\n----------------------------------------\n`);
    }
    return { delivered: false };
  }

  const { isLinked, sendFrom } = await import("./whatsappWeb.js"); // loaded only when used
  if (!from || !isLinked(from)) return { delivered: false, reason: "not-linked" }; // that user hasn't linked WhatsApp
  await sendFrom(from, to, body);
  return { delivered: true };
};

// Fire-and-forget variant: a WhatsApp failure should never break the API request.
export const sendWhatsAppSafe = (message) =>
  sendWhatsApp(message).catch((err) => console.error(`WhatsApp to ${message.to} failed: ${err.message}`));
