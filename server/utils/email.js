import nodemailer from "nodemailer";

let transporter;

// Emails sent while SMTP isn't configured (useful in tests and offline demos).
export const outbox = [];

const getTransporter = () => {
  if (!process.env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
};

const layout = (title, body) => `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1c1917">
    <div style="font-size:18px;font-weight:600;color:#2a78d6;margin-bottom:16px">SubTrack</div>
    <h2 style="font-size:18px;margin:0 0 12px">${title}</h2>
    <div style="font-size:14px;line-height:1.6">${body}</div>
    <p style="font-size:12px;color:#78716c;margin-top:24px">You received this email from SubTrack - SaaS Subscription &amp; Expense Analytics.</p>
  </div>`;

// Sends an email via SMTP, or prints it to the server console when SMTP isn't configured.
const fromAddress = () => process.env.EMAIL_FROM || `SubTrack <${process.env.SMTP_USER}>`;

// Brevo's HTTP email API (https://developers.brevo.com/reference/sendtransacemail). Used when BREVO_API_KEY is set:
// it works over HTTPS, so it also works on hosts that block SMTP ports (e.g. Render's free plan).
const sendWithBrevo = async (mail) => {
  const [, name, email] = fromAddress().match(/^\s*(.*?)\s*<([^>]+)>\s*$/) || [null, "SubTrack", fromAddress()];
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: name || "SubTrack", email },
      to: [{ email: mail.to }],
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html,
      ...(mail.attachments?.length && {
        attachment: mail.attachments.map((a) => ({ name: a.filename, content: Buffer.from(a.content).toString("base64") })),
      }),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Brevo ${res.status}: ${data.message || res.statusText}`);
  }
};

export const sendEmail = async ({ to, subject, text, html, attachments }) => {
  const mail = { to, subject, text, html: html || layout(subject, text.replace(/\n/g, "<br>")), attachments };

  if (process.env.BREVO_API_KEY) {
    await sendWithBrevo(mail);
    return { delivered: true };
  }

  const smtp = getTransporter();
  if (!smtp) {
    outbox.push(mail);
    if (outbox.length > 50) outbox.shift();
    if (process.env.NODE_ENV !== "test") {
      const files = attachments?.length ? `\nAttachments: ${attachments.map((a) => a.filename).join(", ")}` : "";
      console.log(`\n--- Email (SMTP not configured, not sent) ---\nTo: ${to}\nSubject: ${subject}\n${text}${files}\n---------------------------------------------\n`);
    }
    return { delivered: false };
  }

  await smtp.sendMail({ from: fromAddress(), ...mail });
  return { delivered: true };
};

// Fire-and-forget variant: an email failure should never break the API request.
export const sendEmailSafe = (mail) =>
  sendEmail(mail).catch((err) => console.error(`Email to ${mail.to} failed: ${err.message}`));
