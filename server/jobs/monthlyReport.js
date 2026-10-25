import cron from "node-cron";
import Workspace from "../models/Workspace.js";
import Expense from "../models/Expense.js";
import Subscription from "../models/Subscription.js";
import { buildMonthlyReport, previousMonthKey, renderReportPdf } from "../utils/report.js";
import { reportEmail } from "../controllers/reportController.js";
import { sendEmailSafe } from "../utils/email.js";
import { sendWhatsAppSafe } from "../utils/whatsapp.js";
import { CONTACT_FIELDS, wantsWhatsApp } from "../utils/notify.js";

// On the 1st of every month: email last month's PDF report to every member (who has email turned on)
// of every workspace that had any activity, and WhatsApp them the summary (the PDF stays email-only).
export const sendMonthlyReports = async (monthKey = previousMonthKey()) => {
  const workspaces = await Workspace.find().populate("members.user", CONTACT_FIELDS);
  let sent = 0;
  let whatsapps = 0;
  for (const workspace of workspaces) {
    const members = workspace.members.map((m) => m.user).filter(Boolean);
    const byEmail = members.filter((u) => u.email && u.emailReminders);
    const byWhatsApp = members.filter(wantsWhatsApp);
    if (!byEmail.length && !byWhatsApp.length) continue;
    const hasData =
      (await Expense.exists({ workspace: workspace._id })) || (await Subscription.exists({ workspace: workspace._id }));
    if (!hasData) continue;

    const report = await buildMonthlyReport(workspace, monthKey);
    const mail = reportEmail(report, byEmail.length ? await renderReportPdf(report) : null);
    for (const user of byEmail) {
      sendEmailSafe({ to: user.email, ...mail });
      sent += 1;
    }
    const summary = mail.text.replace("The full report is attached as a PDF.", "The full PDF report is in your email and in SubTrack.");
    for (const user of byWhatsApp) {
      sendWhatsAppSafe({ to: user.phone, subject: mail.subject, text: summary });
      whatsapps += 1;
    }
  }
  return { month: monthKey, emailsSent: sent, whatsappsSent: whatsapps };
};

export const startMonthlyReportJob = () => {
  if (process.env.DISABLE_CRON === "true") return;
  cron.schedule(
    process.env.REPORT_CRON || "0 9 1 * *",
    () =>
      sendMonthlyReports()
        .then((r) => console.log(`[monthly-report] ${r.month}: sent ${r.emailsSent} emails`))
        .catch((err) => console.error("[monthly-report] failed:", err.message)),
    { timezone: process.env.REMINDER_TIMEZONE || "Asia/Kolkata" }
  );
  console.log("Monthly report job scheduled (1st of each month at 9:00)");
};
