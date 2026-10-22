import cron from "node-cron";
import Workspace from "../models/Workspace.js";
import Expense from "../models/Expense.js";
import Subscription from "../models/Subscription.js";
import { buildMonthlyReport, previousMonthKey, renderReportPdf } from "../utils/report.js";
import { reportEmail } from "../controllers/reportController.js";
import { sendEmailSafe } from "../utils/email.js";

// On the 1st of every month: email last month's PDF report to every member (who has email turned on)
// of every workspace that had any activity.
export const sendMonthlyReports = async (monthKey = previousMonthKey()) => {
  const workspaces = await Workspace.find().populate("members.user", "email emailReminders");
  let sent = 0;
  for (const workspace of workspaces) {
    const recipients = workspace.members.map((m) => m.user).filter((u) => u?.email && u.emailReminders);
    if (!recipients.length) continue;
    const hasData =
      (await Expense.exists({ workspace: workspace._id })) || (await Subscription.exists({ workspace: workspace._id }));
    if (!hasData) continue;

    const report = await buildMonthlyReport(workspace, monthKey);
    const pdf = await renderReportPdf(report);
    for (const user of recipients) {
      sendEmailSafe({ to: user.email, ...reportEmail(report, pdf) });
      sent += 1;
    }
  }
  return { month: monthKey, emailsSent: sent };
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
