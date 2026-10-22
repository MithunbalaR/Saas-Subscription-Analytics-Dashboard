import { useState } from "react";

// Card wrapper for a chart with a Chart / Table toggle, so every chart's numbers are readable as text too.
export default function ChartCard({ title, subtitle, columns, rows, emptyMessage, children }) {
  const [view, setView] = useState("chart");
  const isEmpty = rows.length === 0;

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
        </div>
        {!isEmpty && (
          <div role="group" aria-label="View as" className="inline-flex shrink-0 rounded-lg border border-stone-200 p-0.5 text-xs">
            {["chart", "table"].map((v) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`rounded-md px-2.5 py-1 capitalize ${
                  view === v ? "bg-stone-100 font-medium text-stone-900" : "text-stone-500 hover:text-stone-900"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      {isEmpty ? (
        <p className="py-16 text-center text-sm text-stone-500">{emptyMessage}</p>
      ) : view === "chart" ? (
        children
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-stone-200">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={`th px-2 ${c.align === "right" ? "text-right" : ""}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className={`td px-2 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                      {c.format ? c.format(row[c.key]) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
