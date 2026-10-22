import { buildMonthlyReport, previousMonthKey, renderReportPdf } from "../utils/report.js";
import { sendEmail } from "../utils/email.js";
import { formatMoney } from "../utils/currency.js";
import { httpError } from "../utils/helpers.js";

const readMonth = (value) => {
  const month = value || previousMonthKey();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw httpError(400, "month must look like 2026-09");
  return month;
};

export const reportEmail = (report, pdf) => ({
  subject: `Your SubTrack report for ${report.monthLabel}`,
  text:
    `Here's your spending summary for ${report.monthLabel} in ${report.workspaceName}:\n\n` +
    `Total spent: ${formatMoney(report.total, report.currency)} across ${report.payments.length} payments\n` +
    `Previous month: ${formatMoney(report.previousTotal, report.currency)}\n` +
    `Monthly recurring cost: ${formatMoney(report.monthlyRecurring, report.currency)} (${report.activeCount} active subscriptions)\n` +
    `Renewals next month: ${report.upcoming.length}\n\nThe full report is attached as a PDF.`,
  attachments: [{ filename: `subtrack-report-${report.monthKey}.pdf`, content: pdf, contentType: "application/pdf" }],
});

// GET /api/reports/monthly?month=2026-09 - download the PDF
export const downloadMonthly = async (req, res) => {
  const report = await buildMonthlyReport(req.workspace, readMonth(req.query.month));
  const pdf = await renderReportPdf(report);
  res.type("application/pdf");
  res.set("Content-Disposition", `attachment; filename="subtrack-report-${report.monthKey}.pdf"`);
  res.send(pdf);
};

// POST /api/reports/monthly/email  { month } - email the report to yourself now
export const emailMonthly = async (req, res) => {
  const report = await buildMonthlyReport(req.workspace, readMonth(req.body?.month));
  const pdf = await renderReportPdf(report);
  const { delivered } = await sendEmail({ to: req.user.email, ...reportEmail(report, pdf) });
  res.json({
    message: delivered ? `Report for ${report.monthLabel} sent to ${req.user.email}` : "Email isn't configured on the server; the report was printed in the server terminal instead.",
  });
};
