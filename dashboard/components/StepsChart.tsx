"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailySteps } from "@/lib/queries";
import { EmptyChartState } from "./EmptyChartState";

export function StepsChart({ data }: { data: DailySteps[] }) {
  if (data.length === 0) {
    return <EmptyChartState label="No steps data synced yet." />;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          width={48}
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
        <Bar dataKey="count" name="Steps" fill="var(--series-steps)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
