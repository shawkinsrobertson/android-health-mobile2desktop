import { supabase } from "./supabase";

export interface DailySteps {
  date: string; // yyyy-mm-dd
  count: number;
}

export async function getDailySteps(days = 14): Promise<DailySteps[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("steps")
    .select("start_time, count")
    .gte("start_time", since.toISOString())
    .order("start_time", { ascending: true });

  if (error) throw new Error(`Failed to load steps: ${error.message}`);

  const byDay = new Map<string, number>();
  for (const row of data ?? []) {
    const day = String(row.start_time).slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + (row.count ?? 0));
  }
  return Array.from(byDay.entries()).map(([date, count]) => ({ date, count }));
}

export interface SleepNight {
  date: string;
  hours: number;
}

export async function getSleepNights(days = 14): Promise<SleepNight[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("sleep_sessions")
    .select("start_time, end_time")
    .gte("start_time", since.toISOString())
    .order("start_time", { ascending: true });

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

export async function getOverviewStats(): Promise<OverviewStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [stepsRes, hrRes, sleepRes, exerciseRes] = await Promise.all([
    supabase.from("steps").select("count").gte("start_time", todayStart.toISOString()),
    supabase
      .from("heart_rate_samples")
      .select("bpm")
      .gte("sample_time", sevenDaysAgo.toISOString()),
    supabase
      .from("sleep_sessions")
      .select("start_time, end_time")
      .order("start_time", { ascending: false })
      .limit(1),
    supabase
      .from("exercise_sessions")
      .select("id", { count: "exact", head: true })
      .gte("start_time", sevenDaysAgo.toISOString()),
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
