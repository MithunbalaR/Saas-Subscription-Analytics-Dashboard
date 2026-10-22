import { useState } from "react";
import toast from "react-hot-toast";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { getErrorMessage } from "../api/client.js";

// Two buttons: CSV and PDF. `onExport(format)` does the work; this handles busy state and errors.
export default function ExportMenu({ onExport, disabled }) {
  const [busy, setBusy] = useState(null);

  const run = async (format) => {
    setBusy(format);
    try {
      await onExport(format);
    } catch (err) {
      toast.error(`Export failed: ${getErrorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="inline-flex rounded-lg border border-stone-300 bg-surface" role="group" aria-label="Export">
      <span className="hidden items-center gap-1.5 border-r border-stone-300 px-3 text-sm text-stone-500 sm:inline-flex">
        <Download className="size-4" /> Export
      </span>
      <button className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-60" onClick={() => run("csv")} disabled={disabled || busy}>
        <FileSpreadsheet className="size-4" /> {busy === "csv" ? "…" : "CSV"}
      </button>
      <button className="inline-flex items-center gap-1.5 rounded-r-lg border-l border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-60" onClick={() => run("pdf")} disabled={disabled || busy}>
        <FileText className="size-4" /> {busy === "pdf" ? "…" : "PDF"}
      </button>
    </div>
  );
}
