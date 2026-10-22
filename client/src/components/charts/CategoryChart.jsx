import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartTooltip from "./ChartTooltip.jsx";
import { useChartColors } from "../../context/ThemeContext.jsx";
import { formatCompactMoney } from "../../utils/format.js";

const subsLabel = (row) => `${row.count} subscription${row.count === 1 ? "" : "s"}`;

// Horizontal bars, sorted largest first. Used for cost per category and admin "top tools".
export default function CategoryChart({
  data,
  currency,
  labelKey = "category",
  dataKey = "monthly",
  name = "Per month",
  formatValue,
  detail = subsLabel,
}) {
  const colors = useChartColors();
  const height = Math.max(160, data.length * 36 + 32);
  const tickFormat = formatValue || ((v) => formatCompactMoney(v, currency));

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke={colors.grid} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tick={{ fill: colors.tick, fontSize: 12 }}
            tickFormatter={tickFormat}
          />
          <YAxis
            type="category"
            dataKey={labelKey}
            width={120}
            tickLine={false}
            axisLine={{ stroke: colors.axis }}
            tick={{ fill: colors.label, fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: colors.cursor }}
            content={<ChartTooltip currency={currency} detail={detail} formatValue={formatValue} />}
          />
          <Bar dataKey={dataKey} name={name} fill={colors.series} radius={[0, 4, 4, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
