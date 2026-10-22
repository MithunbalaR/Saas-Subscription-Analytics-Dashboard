import { useChartColors } from "../../context/ThemeContext.jsx";
import { formatMoney } from "../../utils/format.js";

// Custom Recharts tooltip: title, coloured key + value, optional detail line.
export default function ChartTooltip({ active, payload, label, currency, detail, formatValue }) {
  const colors = useChartColors();
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const value = formatValue ? formatValue(item.value) : formatMoney(item.value, currency);

  return (
    <div className="rounded-lg border border-stone-200 bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-stone-900">{item.payload.fullLabel || label}</p>
      <p className="flex items-center gap-1.5 text-stone-600">
        <span className="size-2 rounded-full" style={{ background: colors.series }} />
        {item.name}
        <span className="ml-2 font-medium text-stone-900 tabular-nums">{value}</span>
      </p>
      {detail && <p className="mt-0.5 text-stone-500">{detail(item.payload)}</p>}
    </div>
  );
}
