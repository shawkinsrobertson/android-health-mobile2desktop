import { supabase } from "./supabase";

// Every query here takes an optional `userId` to scope results to one
// synced device (client_profiles.sync_code -- see supabase/migrations/
// 0003_sync_code.sql). Omitted, they read everything unscoped, which is
// what the single-user Overview page (`/`) and the /coach chat still
// want -- the health-data tables don't have real per-user RLS yet, so
// this filter is what the client dashboard (`/client`) uses to show only
// its own synced rows among what is, today, still one shared pool.

export interface DailySteps {
  date: string; // yyyy-mm-dd
  count: number;
}

interface StepsRow {
  start_time: string;
  end_time: string;
  count: number | null;
  source_package: string | null;
}

// Merges possibly-overlapping [start, end] ms intervals into a minimal
// sorted set of non-overlapping ones.
function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [[...sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      merged.push([...cur]);
    }
  }
  return merged;
}

// The portion(s) of [start, end] not covered by any interval in `covering`
// (already merged/non-overlapping and sorted).
function subtractIntervals(
  start: number,
  end: number,
  covering: [number, number][],
): [number, number][] {
  const gaps: [number, number][] = [];
  let cursor = start;
  for (const [cs, ce] of covering) {
    if (ce <= cursor) continue;
    if (cs >= end) break;
    if (cs > cursor) gaps.push([cursor, Math.min(cs, end)]);
    cursor = Math.max(cursor, ce);
    if (cursor >= end) break;
  }
  if (cursor < end) gaps.push([cursor, end]);
  return gaps;
}

// Health Connect doesn't dedupe steps written by multiple source apps for
// the same real activity -- seen in practice with Garmin Connect and a
// phone's own step sensor both writing overlapping records for the same
// walk (confirmed from raw synced rows, not a hypothesis). Naively summing
// every row double-counts.
//
// Per UTC day, pick whichever source has the most total steps as that
// day's "primary" and count it in full. For every other source's rows
// that day, only count the portion of their time range the primary source
// didn't already cover -- a genuine gap-filler (primary had no data then)
// still contributes, but an overlapping duplicate reading doesn't.
//
// This is a heuristic, not a guaranteed-correct dedup (we can't know for
// certain which source is "truth" for a given window without more than
// what's stored) -- but it's a real improvement over blind summing, and
// doesn't require touching how the Android app syncs.
function resolveOverlappingSources(rows: StepsRow[]): StepsRow[] {
  const byDay = new Map<string, StepsRow[]>();
  for (const row of rows) {
    const day = row.start_time.slice(0, 10);
    const list = byDay.get(day);
    if (list) list.push(row);
    else byDay.set(day, [row]);
  }

  const resolved: StepsRow[] = [];

  for (const dayRows of byDay.values()) {
    const bySource = new Map<string, StepsRow[]>();
    for (const row of dayRows) {
      const key = row.source_package ?? "unknown";
      const list = bySource.get(key);
      if (list) list.push(row);
      else bySource.set(key, [row]);
    }

    if (bySource.size <= 1) {
      resolved.push(...dayRows);
      continue;
    }

    let primaryKey = "";
    let primaryTotal = -1;
    for (const [key, sourceRows] of bySource) {
      const total = sourceRows.reduce((sum, r) => sum + (r.count ?? 0), 0);
      if (total > primaryTotal) {
        primaryTotal = total;
        primaryKey = key;
      }
    }

    const primaryRows = bySource.get(primaryKey)!;
    resolved.push(...primaryRows);

    const primaryIntervals = mergeIntervals(
      primaryRows.map(
        (r) => [new Date(r.start_time).getTime(), new Date(r.end_time).getTime()] as [number, number],
      ),
    );

    for (const [key, sourceRows] of bySource) {
      if (key === primaryKey) continue;
      for (const row of sourceRows) {
        const startMs = new Date(row.start_time).getTime();
        const endMs = new Date(row.end_time).getTime();
        const totalMs = endMs - startMs;
        if (totalMs <= 0) {
          resolved.push(row);
          continue;
        }
        for (const [gapStart, gapEnd] of subtractIntervals(startMs, endMs, primaryIntervals)) {
          resolved.push({
            start_time: new Date(gapStart).toISOString(),
            end_time: new Date(gapEnd).toISOString(),
            count: (row.count ?? 0) * ((gapEnd - gapStart) / totalMs),
            source_package: row.source_package,
          });
        }
      }
    }
  }

  return resolved;
}

// A StepsRecord's [start_time, end_time) isn't guaranteed to fit inside one
// calendar day -- a historical backfill (seen with a Garmin-sourced import)
// can write one record spanning several days. Crediting the whole count to
// start_time's day, like a naive groupBy would, dumps it all onto one day
// as a huge spike and leaves the days it actually covers looking empty.
// Prorate each row's count across every UTC day it overlaps, weighted by
// how much of the row's duration falls on that day.
function accumulateStepsByDay(
  rows: { start_time: string; end_time: string; count: number | null }[],
  byDay: Map<string, number>,
) {
  for (const row of rows) {
    const start = new Date(row.start_time);
    const end = new Date(row.end_time);
    const totalMs = end.getTime() - start.getTime();
    const count = row.count ?? 0;

    if (totalMs <= 0) {
      // Zero/negative-duration row (bad data, or start == end) -- nothing
      // to prorate across, just attribute it to the start day.
      const day = row.start_time.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + count);
      continue;
    }

    let cursor = start;
    while (cursor < end) {
      const dayStart = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()),
      );
      const nextDayStart = new Date(dayStart.getTime() + 86_400_000);
      const segmentEnd = end < nextDayStart ? end : nextDayStart;
      const segmentMs = segmentEnd.getTime() - cursor.getTime();
      const day = dayStart.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + count * (segmentMs / totalMs));
      cursor = segmentEnd;
    }
  }
}

export async function getDailySteps(days = 14, userId?: string): Promise<DailySteps[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  let query = supabase
    .from("steps")
    .select("start_time, end_time, count, source_package")
    .gte("start_time", since.toISOString())
    .order("start_time", { ascending: true });
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;

  if (error) throw new Error(`Failed to load steps: ${error.message}`);

  const byDay = new Map<string, number>();
  accumulateStepsByDay(resolveOverlappingSources(data ?? []), byDay);

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count: Math.round(count) }));
}

export interface SleepNight {
  date: string;
  hours: number;
}

export async function getSleepNights(days = 14, userId?: string): Promise<SleepNight[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  let query = supabase
    .from("sleep_sessions")
    .select("start_time, end_time")
    .gte("start_time", since.toISOString())
    .order("start_time", { ascending: true });
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;

  if (error) throw new Error(`Failed to load sleep sessions: ${error.message}`);

  return (data ?? []).map((row) => {
    const hours =
      (new Date(row.end_time).getTime() - new Date(row.start_time).getTime()) /
      (1000 * 60 * 60);
    return { date: String(row.start_time).slice(0, 10), hours: Math.round(hours * 10) / 10 };
  });
}

export interface OverviewStats {
  stepsToday: number;
  avgHeartRate7d: number | null;
  lastSleepHours: number | null;
  exerciseSessions7d: number;
}

export async function getOverviewStats(userId?: string): Promise<OverviewStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  let stepsQuery = supabase
    .from("steps")
    .select("count")
    .gte("start_time", todayStart.toISOString());
  let hrQuery = supabase
    .from("heart_rate_samples")
    .select("bpm")
    .gte("sample_time", sevenDaysAgo.toISOString());
  let sleepQuery = supabase
    .from("sleep_sessions")
    .select("start_time, end_time")
    .order("start_time", { ascending: false })
    .limit(1);
  let exerciseQuery = supabase
    .from("exercise_sessions")
    .select("id", { count: "exact", head: true })
    .gte("start_time", sevenDaysAgo.toISOString());

  if (userId) {
    stepsQuery = stepsQuery.eq("user_id", userId);
    hrQuery = hrQuery.eq("user_id", userId);
    sleepQuery = sleepQuery.eq("user_id", userId);
    exerciseQuery = exerciseQuery.eq("user_id", userId);
  }

  const [stepsRes, hrRes, sleepRes, exerciseRes] = await Promise.all([
    stepsQuery,
    hrQuery,
    sleepQuery,
    exerciseQuery,
  ]);

  if (stepsRes.error) throw new Error(stepsRes.error.message);
  if (hrRes.error) throw new Error(hrRes.error.message);
  if (sleepRes.error) throw new Error(sleepRes.error.message);
  if (exerciseRes.error) throw new Error(exerciseRes.error.message);

  const stepsToday = (stepsRes.data ?? []).reduce((sum, r) => sum + (r.count ?? 0), 0);

  const hrSamples = (hrRes.data ?? []).map((r) => r.bpm as number);
  const avgHeartRate7d =
    hrSamples.length > 0
      ? Math.round(hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length)
      : null;

  let lastSleepHours: number | null = null;
  const lastSleep = sleepRes.data?.[0];
  if (lastSleep) {
    lastSleepHours =
      Math.round(
        ((new Date(lastSleep.end_time).getTime() - new Date(lastSleep.start_time).getTime()) /
          (1000 * 60 * 60)) *
          10,
      ) / 10;
  }

  return {
    stepsToday,
    avgHeartRate7d,
    lastSleepHours,
    exerciseSessions7d: exerciseRes.count ?? 0,
  };
}

// One-line summary for a single data-point card on /client, scoped to one
// synced device via sync_code. Deliberately simple (a 7-day aggregate or
// most-recent reading per type) rather than a full chart -- this is the
// "top 3 data points" glance view, not the Overview page.
export async function getDataPointSummary(dataPointKey: string, userId: string): Promise<string> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const since = sevenDaysAgo.toISOString();

  switch (dataPointKey) {
    case "steps": {
      const steps = await getDailySteps(7, userId);
      const total = steps.reduce((sum, d) => sum + d.count, 0);
      return steps.length ? `${total.toLocaleString()} steps this week` : "No steps synced yet";
    }
    case "heart_rate_samples": {
      const { data } = await supabase
        .from("heart_rate_samples")
        .select("bpm")
        .eq("user_id", userId)
        .gte("sample_time", since);
      const samples = (data ?? []).map((r) => r.bpm as number);
      if (!samples.length) return "No heart rate data synced yet";
      const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      return `${avg} bpm avg this week`;
    }
    case "sleep_sessions": {
      const nights = await getSleepNights(7, userId);
      if (!nights.length) return "No sleep data synced yet";
      const last = nights[nights.length - 1];
      return `${last.hours}h last night`;
    }
    case "exercise_sessions": {
      const { count } = await supabase
        .from("exercise_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("start_time", since);
      return `${count ?? 0} workout${count === 1 ? "" : "s"} this week`;
    }
    case "blood_oxygen": {
      const { data } = await supabase
        .from("blood_oxygen")
        .select("percentage")
        .eq("user_id", userId)
        .gte("sample_time", since);
      const samples = (data ?? []).map((r) => Number(r.percentage));
      if (!samples.length) return "No SpO2 data synced yet";
      const avg = Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 10) / 10;
      return `${avg}% avg SpO2 this week`;
    }
    case "blood_pressure": {
      const { data } = await supabase
        .from("blood_pressure")
        .select("systolic_mmhg, diastolic_mmhg, sample_time")
        .eq("user_id", userId)
        .order("sample_time", { ascending: false })
        .limit(1);
      const last = data?.[0];
      return last ? `${last.systolic_mmhg}/${last.diastolic_mmhg} mmHg (most recent)` : "No blood pressure data synced yet";
    }
    case "respiratory_rate": {
      const { data } = await supabase
        .from("respiratory_rate")
        .select("breaths_per_minute")
        .eq("user_id", userId)
        .gte("sample_time", since);
      const samples = (data ?? []).map((r) => Number(r.breaths_per_minute));
      if (!samples.length) return "No respiratory rate data synced yet";
      const avg = Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 10) / 10;
      return `${avg} breaths/min avg this week`;
    }
    default:
      return "No data synced yet";
  }
}
