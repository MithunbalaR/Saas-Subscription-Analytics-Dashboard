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
export const sendEmail = async ({ to, subject, text, html, attachments }) => {
  const mail = { to, subject, text, html: html || layout(subject, text.replace(/\n/g, "<br>")), attachments };
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

  await smtp.sendMail({ from: process.env.EMAIL_FROM || `SubTrack <${process.env.SMTP_USER}>`, ...mail });
  return { delivered: true };
};

// Fire-and-forget variant: an email failure should never break the API request.
export const sendEmailSafe = (mail) =>
  sendEmail(mail).catch((err) => console.error(`Email to ${mail.to} failed: ${err.message}`));
