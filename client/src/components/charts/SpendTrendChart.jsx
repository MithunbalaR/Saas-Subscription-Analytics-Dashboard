import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartTooltip from "./ChartTooltip.jsx";
import { useChartColors } from "../../context/ThemeContext.jsx";
import { formatCompactMoney } from "../../utils/format.js";

const paymentsLabel = (row) => `${row.count} payment${row.count === 1 ? "" : "s"}`;

// Vertical bars over months. Used for spend per month (money) and admin sign-ups (counts).
export default function SpendTrendChart({ data, currency, dataKey = "total", name = "Spend", formatValue, detail = paymentsLabel }) {
  const colors = useChartColors();
  const tickFormat = formatValue || ((v) => formatCompactMoney(v, currency));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={colors.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: colors.axis }} tick={{ fill: colors.tick, fontSize: 12 }} />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tick={{ fill: colors.tick, fontSize: 12 }}
            tickFormatter={tickFormat}
          />
          <Tooltip
            cursor={{ fill: colors.cursor }}
            content={<ChartTooltip currency={currency} detail={detail} formatValue={formatValue} />}
          />
          <Bar dataKey={dataKey} name={name} fill={colors.series} radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
