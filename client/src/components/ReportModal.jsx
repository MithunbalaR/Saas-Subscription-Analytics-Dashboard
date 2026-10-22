import { useState } from "react";
import toast from "react-hot-toast";
import { Download, Mail } from "lucide-react";
import api, { getErrorMessage } from "../api/client.js";
import { Modal } from "./ui.jsx";

const lastMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Monthly PDF report (generated on the server with PDFKit): download it or email it to yourself.
// It's also emailed automatically on the 1st of every month.
export default function ReportModal({ onClose }) {
  const [month, setMonth] = useState(lastMonth);
  const [busy, setBusy] = useState(null);

  const download = async () => {
    setBusy("download");
    try {
      const { data } = await api.get("/reports/monthly", { params: { month }, responseType: "blob" });
      const url = URL.createObjectURL(data);
      Object.assign(document.createElement("a"), { href: url, download: `subtrack-report-${month}.pdf` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const email = async () => {
    setBusy("email");
    try {
      const { data } = await api.post("/reports/monthly/email", { month });
      toast.success(data.message);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title="Monthly report" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          A PDF summary of one month: total spent, comparison with the previous month, spending by category, every payment and the renewals coming next month.
        </p>
        <div className="max-w-xs">
          <label htmlFor="report-month" className="label">Month</label>
          <input id="report-month" type="month" className="input" value={month} max={new Date().toISOString().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={download} disabled={!month || busy}>
            <Download className="size-4" /> {busy === "download" ? "Generating…" : "Download PDF"}
          </button>
          <button className="btn btn-secondary" onClick={email} disabled={!month || busy}>
            <Mail className="size-4" /> {busy === "email" ? "Sending…" : "Email it to me"}
          </button>
        </div>
        <p className="text-xs text-stone-500">Reports are also emailed automatically on the 1st of every month (turn off in Settings → Reminders).</p>
      </div>
    </Modal>
  );
}
