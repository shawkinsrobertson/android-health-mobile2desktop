"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { EmptyChartState } from "./EmptyChartState";
import type { DataSeriesPoint } from "@/lib/queries";

export interface OverlaySeries {
  key: string;
  label: string;
  unit: string;
  points: DataSeriesPoint[];
}

const SERIES_COLORS = [
  "var(--series-steps)",
  "var(--series-sleep)",
  "#f97316",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#eab308",
  "#6366f1",
];

// One shared graph for every data type this client has shared, each
// togglable and multi-selectable for overlay/pattern comparison. Per the
// locked-in design decision, each selected series is normalized to its
// own 0-100% range (based on its min/max within the current window) and
// plotted on one shared Y axis -- the tooltip still looks up and shows
// each point's real value/unit, not the normalized number.
export function DataOverlayChart({ series }: { series: OverlaySeries[] }) {
  const withData = useMemo(() => series.filter((s) => s.points.length > 0), [series]);
  const [selected, setSelected] = useState<string[]>(() => withData.slice(0, 1).map((s) => s.key));

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const activeSeries = withData.filter((s) => selected.includes(s.key));

  const { chartData, rawLookup } = useMemo(() => {
    const raw = new Map<string, number>();
    const byDate = new Map<string, Record<string, number | string>>();

    for (const s of activeSeries) {
      const values = s.points.map((p) => p.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min;

      for (const p of s.points) {
        const normalized = range === 0 ? 50 : ((p.value - min) / range) * 100;
        const row = byDate.get(p.date) ?? { date: p.date };
        row[s.key] = Math.round(normalized * 10) / 10;
        byDate.set(p.date, row);
        raw.set(`${s.key}|${p.date}`, p.value);
      }
    }

    const sortedData = Array.from(byDate.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
    return { chartData: sortedData, rawLookup: raw };
  }, [activeSeries]);

  if (withData.length === 0) {
    return <EmptyChartState label="No shared data synced yet." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {withData.map((s, i) => {
          const active = selected.includes(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                active
                  ? "border-transparent text-white"
                  : "border-[color:var(--border-hairline)] text-ink-secondary hover:bg-[color:var(--page-plane)]"
              }`}
              style={active ? { backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] } : undefined}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: active ? "white" : SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              {s.label}
            </button>
          );
        })}
      </div>

      {activeSeries.length === 0 ? (
        <EmptyChartState label="Pick a data type above to see its chart." />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--gridline)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => d.slice(5)}
              stroke="var(--baseline)"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              stroke="var(--baseline)"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip content={<OverlayTooltip series={activeSeries} rawLookup={rawLookup} />} />
            {activeSeries.map((s) => {
              const i = withData.findIndex((w) => w.key === s.key);
              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function OverlayTooltip({
  active,
  label,
  series,
  rawLookup,
}: TooltipProps<number, string> & { series: OverlaySeries[]; rawLookup: Map<string, number> }) {
  if (!active || !label) return null;

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs"
      style={{
        background: "var(--surface-1)",
        borderColor: "var(--gridline)",
        color: "var(--text-primary)",
      }}
    >
      <div className="mb-1 font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </div>
      {series.map((s) => {
        const raw = rawLookup.get(`${s.key}|${label}`);
        if (raw === undefined) return null;
        return (
          <div key={s.key}>
            {s.label}: {raw} {s.unit}
          </div>
        );
      })}
    </div>
  );
}
