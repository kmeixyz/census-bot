// components/TrendChart.js
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

function CustomTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--chart-tooltip-bg)",
      border: "1px solid var(--chart-tooltip-border)",
      borderRadius: 8,
      padding: "10px 14px",
      fontSize: 13,
    }}>
      <div style={{ color: "var(--chart-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "var(--text)", fontWeight: 600 }}>
        {payload[0].payload.value ?? "N/A"}
      </div>
      <div style={{ color: "var(--chart-faint)", fontSize: 11, marginTop: 2 }}>{metric}</div>
    </div>
  );
}

export default function TrendChart({ data }) {
  if (!data) return null;

  const { metric, location, points, source } = data;
  const validPoints = points.filter(p => p.numericValue !== null);

  return (
    <div style={{
      background: "var(--chart-surface)",
      border: "1px solid var(--chart-border)",
      borderLeft: "3px solid var(--green)",
      borderRadius: 12,
      padding: "24px 28px",
      marginTop: 16,
      boxShadow: "0 0 24px rgba(99, 102, 241, 0.15), 0 0 48px rgba(99, 102, 241, 0.08)",
    }}>
      <div style={{
        fontSize: 11,
        letterSpacing: "0.12em",
        color: "var(--green)",
        fontWeight: 600,
        marginBottom: 4,
        textShadow: "0 0 12px rgba(34, 197, 94, 0.6)",
      }}>
        {metric.toUpperCase()} OVER TIME
      </div>

      <div style={{ color: "var(--chart-muted)", fontSize: 13, marginBottom: 20 }}>
        📍 {location}
      </div>

      {validPoints.length === 0 ? (
        <div style={{ color: "var(--chart-empty)", fontSize: 14 }}>No trend data available.</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={validPoints} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="year"
              tick={{ fill: "var(--chart-tick)", fontSize: 12 }}
              axisLine={{ stroke: "var(--chart-axis)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "var(--chart-tick)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={60}
              tickFormatter={v =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v
              }
            />
            <Tooltip content={<CustomTooltip metric={metric} />} />
            <Line
              type="monotone"
              dataKey="numericValue"
              stroke="var(--accent)"
              strokeWidth={2.5}
              dot={{ fill: "var(--accent)", r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: "var(--accent)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      <div style={{ color: "var(--chart-source)", fontSize: 11, marginTop: 16 }}>{source}</div>
    </div>
  );
}
