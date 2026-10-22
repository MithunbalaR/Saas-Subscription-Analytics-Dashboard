import { useState } from "react";
import toast from "react-hot-toast";
import { Download, FileUp, Upload } from "lucide-react";
import api, { getErrorMessage } from "../api/client.js";
import { Alert, Modal } from "./ui.jsx";
import { downloadCSV } from "../utils/export.js";
import { formatMoney } from "../utils/format.js";

const MAX_ROWS = 500;

// Column names people commonly use, mapped to our field names.
const ALIASES = {
  name: ["name", "service", "tool", "subscription", "app"],
  cost: ["cost", "price", "amount", "fee"],
  currency: ["currency", "cur"],
  billingCycle: ["billingcycle", "billing", "cycle", "frequency", "plan"],
  category: ["category", "type"],
  nextRenewal: ["nextrenewal", "renewal", "renewaldate", "renews", "duedate", "nextpayment", "date"],
  status: ["status"],
  isTrial: ["istrial", "trial", "freetrial"],
  paymentMethod: ["paymentmethod", "payment", "card", "method"],
  website: ["website", "url", "site"],
  notes: ["notes", "note", "comment", "comments"],
};
const fieldFor = (header) => {
  const key = String(header).toLowerCase().replace(/[^a-z]/g, "");
  return Object.entries(ALIASES).find(([, aliases]) => aliases.includes(key))?.[0] || null;
};

const toDate = (value) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // 05/11/2026 (Indian day/month order)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
};

const CYCLES = { month: "monthly", monthly: "monthly", mo: "monthly", quarter: "quarterly", quarterly: "quarterly", year: "yearly", yearly: "yearly", annual: "yearly", annually: "yearly", yr: "yearly" };

const normaliseRow = (raw, defaultCurrency) => {
  const row = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = fieldFor(header);
    if (field && value !== "" && value != null) row[field] = value;
  }
  if (row.cost !== undefined) row.cost = Number(String(row.cost).replace(/[^0-9.-]/g, ""));
  if (row.currency) row.currency = String(row.currency).trim().toUpperCase();
  else row.currency = defaultCurrency;
  if (row.billingCycle) row.billingCycle = CYCLES[String(row.billingCycle).trim().toLowerCase()] || String(row.billingCycle).toLowerCase();
  if (row.status) row.status = String(row.status).trim().toLowerCase();
  if (row.isTrial !== undefined) row.isTrial = /^(yes|y|true|1)$/i.test(String(row.isTrial).trim());
  row.nextRenewal = toDate(row.nextRenewal);
  if (row.name) row.name = String(row.name).trim();
  return row;
};

const problemsOf = (row) => {
  const problems = [];
  if (!row.name) problems.push("name missing");
  if (!(row.cost >= 0)) problems.push("cost missing or invalid");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.nextRenewal || "")) problems.push("renewal date missing or invalid");
  return problems;
};

const TEMPLATE_COLUMNS = ["name", "cost", "currency", "billingCycle", "category", "nextRenewal", "status", "isTrial", "paymentMethod", "website", "notes"];

const downloadTemplate = () =>
  downloadCSV(
    "subtrack-import-template.csv",
    TEMPLATE_COLUMNS.map((c) => ({ label: c, value: (r) => r[c] })),
    [
      { name: "Netflix", cost: 649, currency: "INR", billingCycle: "monthly", category: "Entertainment", nextRenewal: "2026-11-05", status: "active", isTrial: "no", paymentMethod: "UPI", website: "https://netflix.com", notes: "" },
      { name: "Figma Professional", cost: 15, currency: "USD", billingCycle: "monthly", category: "Design", nextRenewal: "2026-11-12", status: "active", isTrial: "no", paymentMethod: "Visa", website: "https://figma.com", notes: "" },
      { name: "Adobe Creative Cloud", cost: 4230, currency: "INR", billingCycle: "monthly", category: "Design", nextRenewal: "2026-10-20", status: "active", isTrial: "yes", paymentMethod: "", website: "", notes: "trial" },
    ]
  );

export default function ImportModal({ currency, onClose, onImported }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const readFile = async (file) => {
    setError("");
    setResult(null);
    setRows(null);
    setFileName(file.name);
    setParsing(true);
    try {
      let records;
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const [header, ...data] = await readSheet(file);
        records = data.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i]])));
      } else {
        const { default: Papa } = await import("papaparse");
        records = await new Promise((resolve, reject) =>
          Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => resolve(r.data), error: reject })
        );
      }
      const normalised = records.map((r) => normaliseRow(r, currency)).filter((r) => Object.keys(r).length > 2);
      if (normalised.length === 0) throw new Error("No rows found. Check that the first row has column headers like name, cost, nextRenewal.");
      if (normalised.length > MAX_ROWS) throw new Error(`That file has ${normalised.length} rows; the limit is ${MAX_ROWS} per import.`);
      setRows(normalised);
    } catch (err) {
      setError(err.message || "Couldn't read that file");
    } finally {
      setParsing(false);
    }
  };

  const importRows = async () => {
    setImporting(true);
    setError("");
    try {
      const { data } = await api.post("/subscriptions/import", { items: rows }, { validateStatus: (s) => s === 201 || s === 400 });
      setResult(data);
      if (data.imported > 0) {
        toast.success(`Imported ${data.imported} subscription${data.imported === 1 ? "" : "s"}`);
        onImported();
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  const withProblems = rows?.map((r) => ({ ...r, problems: problemsOf(r) })) || [];
  const bad = withProblems.filter((r) => r.problems.length).length;

  return (
    <Modal title="Import subscriptions" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          Upload a <strong>CSV</strong> or <strong>Excel (.xlsx)</strong> file with one subscription per row. Required columns:{" "}
          <code>name</code>, <code>cost</code>, <code>nextRenewal</code>. Optional: currency, billingCycle, category, status, isTrial, paymentMethod, website, notes.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={downloadTemplate}>
            <Download className="size-3.5" /> Download template
          </button>
          <label className="btn btn-secondary btn-sm cursor-pointer">
            <FileUp className="size-3.5" /> {fileName ? "Choose another file" : "Choose file"}
            <input type="file" accept=".csv,.xlsx,text/csv" className="sr-only" onChange={(e) => e.target.files[0] && readFile(e.target.files[0])} />
          </label>
          {fileName && <span className="self-center text-xs text-stone-500">{fileName}</span>}
        </div>

        {error && <Alert>{error}</Alert>}
        {parsing && <p className="text-sm text-stone-500">Reading file…</p>}

        {rows && !result && (
          <>
            <p className="text-sm">
              <span className="font-medium">{rows.length} rows found.</span>{" "}
              {bad > 0 ? <span className="text-amber-700">{bad} look incomplete and will probably be rejected.</span> : <span className="text-green-700">All rows look good.</span>}
            </p>
            <div className="max-h-64 overflow-auto rounded-lg border border-stone-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-stone-50">
                  <tr>
                    <th className="th px-3 py-2">#</th>
                    <th className="th px-3 py-2">Name</th>
                    <th className="th px-3 py-2 text-right">Cost</th>
                    <th className="th px-3 py-2">Cycle</th>
                    <th className="th px-3 py-2">Renews</th>
                    <th className="th px-3 py-2">Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {withProblems.slice(0, 100).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 text-stone-500">{i + 1}</td>
                      <td className="px-3 py-1.5">{r.name || "-"}{r.isTrial && <span className="ml-1 text-xs text-blue-700">trial</span>}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.cost >= 0 ? formatMoney(r.cost, r.currency) : "-"}</td>
                      <td className="px-3 py-1.5">{r.billingCycle || "monthly"}</td>
                      <td className="px-3 py-1.5">{r.nextRenewal || "-"}</td>
                      <td className={`px-3 py-1.5 text-xs ${r.problems.length ? "text-amber-700" : "text-green-700"}`}>{r.problems.join(", ") || "OK"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={importRows} disabled={importing}>
                <Upload className="size-4" /> {importing ? "Importing…" : `Import ${rows.length} rows`}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-3">
            <Alert type={result.imported ? "success" : "error"}>
              Imported {result.imported} subscription{result.imported === 1 ? "" : "s"}
              {result.failed > 0 && `; ${result.failed} row${result.failed === 1 ? "" : "s"} skipped`}.
            </Alert>
            {result.errors.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                {result.errors.map((e) => (
                  <li key={e.row} className="text-stone-600">
                    <span className="font-medium">Row {e.row}{e.name && ` (${e.name})`}:</span> {e.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
