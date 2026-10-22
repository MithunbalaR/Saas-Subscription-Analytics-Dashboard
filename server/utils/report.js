import PDFDocument from "pdfkit";
import Expense from "../models/Expense.js";
import Subscription from "../models/Subscription.js";
import { round2, toMonthly } from "./billing.js";
import { convert, getRates } from "./currency.js";

// Monthly spending report: gathered from MongoDB, rendered to PDF with PDFKit.
// PDFKit's built-in fonts have no ₹ glyph, so amounts use currency codes ("INR 1,234.00").
const money = (value, currency) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: 2 }).format(value || 0);

const monthBounds = (monthKey) => {
  const [y, m] = monthKey.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)), prevStart: new Date(Date.UTC(y, m - 2, 1)) };
};

export const previousMonthKey = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);

export const buildMonthlyReport = async (workspace, monthKey) => {
  const base = workspace.currency;
  const { start, end, prevStart } = monthBounds(monthKey);
  const [{ rates }, payments, previous, subscriptions] = await Promise.all([
    getRates(),
    Expense.find({ workspace: workspace._id, date: { $gte: start, $lt: end } }).sort({ date: 1 }),
    Expense.find({ workspace: workspace._id, date: { $gte: prevStart, $lt: start } }, "amount currency"),
    Subscription.find({ workspace: workspace._id, status: "active" }),
  ]);
  const toBase = (amount, currency) => convert(amount, currency, base, rates);

  const byCategory = {};
  for (const p of payments) byCategory[p.category] = (byCategory[p.category] || 0) + toBase(p.amount, p.currency);
  const total = round2(payments.reduce((sum, p) => sum + toBase(p.amount, p.currency), 0));
  const previousTotal = round2(previous.reduce((sum, p) => sum + toBase(p.amount, p.currency), 0));
  const nextEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1));

  return {
    workspaceName: workspace.name,
    currency: base,
    monthKey,
    monthLabel: start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    total,
    previousTotal,
    budget: workspace.monthlyBudget,
    payments: payments.map((p) => ({ date: p.date, title: p.title, category: p.category, amount: p.amount, currency: p.currency })),
    byCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
    monthlyRecurring: round2(subscriptions.reduce((sum, s) => sum + toBase(toMonthly(s.cost, s.billingCycle), s.currency), 0)),
    activeCount: subscriptions.length,
    upcoming: subscriptions
      .filter((s) => s.nextRenewal >= end && s.nextRenewal < nextEnd)
      .sort((a, b) => a.nextRenewal - b.nextRenewal)
      .map((s) => ({ name: s.name, date: s.nextRenewal, cost: s.cost, currency: s.currency })),
  };
};

const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export const renderReportPdf = (report) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const blue = "#2a78d6";
    const grey = "#78716c";
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    doc.fillColor(blue).fontSize(20).font("Helvetica-Bold").text("SubTrack");
    doc.fillColor("#1c1917").fontSize(16).text(`Monthly report - ${report.monthLabel}`);
    doc.fillColor(grey).fontSize(10).font("Helvetica").text(`${report.workspaceName} · all amounts in ${report.currency}`).moveDown(1.2);

    // Summary tiles
    const change = report.previousTotal > 0 ? Math.round(((report.total - report.previousTotal) / report.previousTotal) * 100) : null;
    const tiles = [
      ["Total spent", money(report.total, report.currency)],
      ["vs previous month", change === null ? "-" : `${change >= 0 ? "+" : ""}${change}%`],
      ["Monthly recurring", money(report.monthlyRecurring, report.currency)],
      ["Budget used", report.budget > 0 ? `${Math.round((report.total / report.budget) * 100)}%` : "No budget"],
    ];
    const tileW = width / 4;
    const tileY = doc.y;
    tiles.forEach(([label, value], i) => {
      const x = left + i * tileW;
      doc.roundedRect(x + 2, tileY, tileW - 4, 52, 6).fillAndStroke("#f5f5f4", "#e7e5e4");
      doc.fillColor(grey).fontSize(8).text(label.toUpperCase(), x + 10, tileY + 9, { width: tileW - 20 });
      doc.fillColor("#1c1917").fontSize(12).font("Helvetica-Bold").text(value, x + 10, tileY + 24, { width: tileW - 20 });
      doc.font("Helvetica");
    });
    doc.y = tileY + 70;

    const section = (title) => {
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.x = left;
      doc.fillColor(blue).fontSize(12).font("Helvetica-Bold").text(title).font("Helvetica").moveDown(0.4);
    };
    const row = (cells, widths, opts = {}) => {
      if (doc.y > doc.page.height - 70) doc.addPage();
      const y = doc.y;
      let x = left;
      doc.fontSize(9).fillColor(opts.bold ? "#1c1917" : "#44403c").font(opts.bold ? "Helvetica-Bold" : "Helvetica");
      cells.forEach((cell, i) => {
        doc.text(String(cell), x, y, { width: widths[i] - 6, align: i === cells.length - 1 ? "right" : "left", lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      doc.y = y + 16;
      doc.moveTo(left, doc.y - 4).lineTo(left + width, doc.y - 4).strokeColor("#e7e5e4").lineWidth(0.5).stroke();
    };

    section("Spending by category");
    if (report.byCategory.length === 0) doc.fontSize(10).fillColor(grey).text("No payments this month.").moveDown();
    else {
      const max = report.byCategory[0].amount || 1;
      for (const c of report.byCategory) {
        const y = doc.y;
        doc.fontSize(9).fillColor("#44403c").text(c.category, left, y, { width: 110 });
        doc.rect(left + 115, y + 1, ((width - 230) * c.amount) / max, 8).fill(blue);
        doc.fillColor("#1c1917").text(money(c.amount, report.currency), left + width - 110, y, { width: 110, align: "right" });
        doc.y = y + 16;
      }
      doc.moveDown(0.8);
    }

    section(`Payments (${report.payments.length})`);
    const widths = [60, width - 260, 110, 90];
    row(["Date", "Title", "Category", "Amount"], widths, { bold: true });
    for (const p of report.payments) row([fmtDate(p.date), p.title, p.category, money(p.amount, p.currency)], widths);
    row(["", "Total", "", money(report.total, report.currency)], widths, { bold: true });
    doc.moveDown(0.8);

    section("Coming up next month");
    if (report.upcoming.length === 0) doc.fontSize(10).fillColor(grey).text("No renewals due next month.");
    else for (const u of report.upcoming) row([fmtDate(u.date), u.name, "", money(u.cost, u.currency)], widths);

    doc.fontSize(8).fillColor(grey).text(`Generated by SubTrack on ${new Date().toLocaleString("en-IN")}`, left, doc.page.height - 40, { width, align: "center" });
    doc.end();
  });
