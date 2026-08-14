"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SleepNight } from "@/lib/queries";
import { EmptyChartState } from "./EmptyChartState";

export function SleepChart({ data }: { data: SleepNight[] }) {
  if (data.length === 0) {
    return <EmptyChartState label="No sleep data synced yet." />;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => d.slice(5)}
          stroke="var(--baseline)"
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          tickLine={false}
        />
        <YAxis
          stroke="var(--baseline)"
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={40}
          unit="h"
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--gridline)",
            borderRadius: 8,
            color: "var(--text-primary)",
          }}
          labelStyle={{ color: "var(--text-secondary)" }}
        />
        <Line
          type="monotone"
          dataKey="hours"
          name="Sleep (hrs)"
          stroke="var(--series-sleep)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--series-sleep)" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
