import type { SupabaseClient } from "@supabase/supabase-js";
import { formatHoursMinutes } from "@/lib/time-format";

// Every query here takes the caller's own per-request `supabase` client
// (never a static anon-key singleton) plus an optional `clientId` --
// profiles.id / auth.uid() for the client whose data this is, *not* the
// old sync_code text. Health-data tables now carry a real `client_id`
// column with auth.uid()-scoped RLS (see supabase/migrations/
// 0015_health_data_auth.sql) -- a coach's session can see every one of
// their clients' rows via the coach-select policy, so the explicit
// `clientId` filter here is still required to scope down to *one*
// client's data on a given page, not a correctness-optional nicety.

const PAGE_SIZE = 1000;

// PostgREST caps a single response at 1000 rows by default, and none of
// the sample-based queries below (steps, heart rate) had a .range() at
// all -- fine when there wasn't much history, but confirmed in practice
// to silently truncate once real volume built up: a dense month of
// Garmin-plus-phone step data blew past 1000 rows within the *first two
// days* of a 14-day window, so everything after was just never fetched
// (not miscounted -- absent). Page through with .range() until a page
// comes back short of a full page, instead of trusting one request to
// return everything.
async function fetchAllRows<T>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

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

// Raw shape of a row selected from the unified `metrics` table
// (supabase/migrations/0035_metrics.sql) -- type-specific fields live
// nested under `value` rather than as flat columns. mapMetricRow below
// flattens one back into the StepsRow shape resolveOverlappingSources/
// accumulateStepsByDay already expect, so neither of those pure functions
// needed to change.
interface MetricRow {
  start_time: string;
  end_time: string | null;
  value: Record<string, unknown> | null;
  source_package: string | null;
}

function metricNumber(row: { value?: Record<string, unknown> | null }, field: string): number | null {
  const raw = row.value?.[field];
  return typeof raw === "number" ? raw : raw != null ? Number(raw) : null;
}

interface MetricValueOnlyRow {
  value: Record<string, unknown> | null;
}

// client_profiles.timezone (supabase/migrations/0038_client_timezone_and_
// source_preference.sql) -- an IANA zone id Android writes on every sync
// (SyncRepository.kt), since the server otherwise has no way to know what
// timezone a client is actually in. Falls back to UTC (this file's old,
// pre-0038 behavior) for a client who hasn't synced since this shipped, or
// when no clientId is given at all -- never a hard failure, since getting
// the day-bucketing slightly wrong for a handful of rows beats breaking
// the page.
async function getClientTimezone(supabase: SupabaseClient, clientId?: string): Promise<string> {
  if (!clientId) return "UTC";
  const { data } = await supabase
    .from("client_profiles")
    .select("timezone")
    .eq("profile_id", clientId)
    .maybeSingle();
  return (data?.timezone as string | null) || "UTC";
}

// client_metric_source_preference -- a client's explicit "use this source
// only" override for one metric_type, if they've set one. Null means no
// preference: callers fall back to their existing merge-everything (or,
// for steps, resolveOverlappingSources) behavior.
async function getSourcePreference(
  supabase: SupabaseClient,
  clientId: string | undefined,
  metricType: string,
): Promise<string | null> {
  if (!clientId) return null;
  const { data } = await supabase
    .from("client_metric_source_preference")
    .select("source_package")
    .eq("client_id", clientId)
    .eq("metric_type", metricType)
    .maybeSingle();
  return (data?.source_package as string | null) ?? null;
}

function applySourcePreference<T extends { source_package: string | null }>(
  rows: T[],
  sourcePackage: string | null,
): T[] {
  return sourcePackage ? rows.filter((r) => r.source_package === sourcePackage) : rows;
}

function toStepsRow(row: MetricRow): StepsRow {
  return {
    start_time: row.start_time,
    end_time: row.end_time ?? row.start_time,
    count: metricNumber(row, "count"),
    source_package: row.source_package,
  };
}

// The UTC offset (ms) `timeZone` is at `instant` -- the value X such that
// formatting `instant` in `timeZone` reads the same wall-clock time as
// (instant + X) would in UTC. Used to convert a local calendar day's
// midnight into the UTC instant it actually falls at, below.
function tzOffsetMillis(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant.getTime();
}

// yyyy-mm-dd calendar date `instant` falls on in `timeZone` -- en-CA is a
// locale whose default date format happens to already be yyyy-mm-dd, used
// here as a formatting shortcut, not for anything Canada-specific.
function localDateKey(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    instant,
  );
}

// The UTC instant marking local midnight, in `timeZone`, of the calendar
// day `instant` falls on there. One offset-correction pass -- exact
// except within the literal hour of a DST transition, which prorating a
// handful of minutes of step data across isn't worth a full DST-aware
// date library for.
function localDayStartUtc(instant: Date, timeZone: string): Date {
  const key = localDateKey(instant, timeZone);
  const [y, m, d] = key.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  return new Date(guess.getTime() - tzOffsetMillis(guess, timeZone));
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
function resolveOverlappingSources(rows: StepsRow[], timeZone: string): StepsRow[] {
  const byDay = new Map<string, StepsRow[]>();
  for (const row of rows) {
    const day = localDateKey(new Date(row.start_time), timeZone);
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
// Prorate each row's count across every day it overlaps *in the client's
// own timezone*, weighted by how much of the row's duration falls on that
// day -- bucketing this in UTC (the old behavior) shifts data across day
// boundaries for any client not in UTC, which is nearly everyone.
function accumulateStepsByDay(
  rows: { start_time: string; end_time: string; count: number | null }[],
  byDay: Map<string, number>,
  timeZone: string,
) {
  for (const row of rows) {
    const start = new Date(row.start_time);
    const end = new Date(row.end_time);
    const totalMs = end.getTime() - start.getTime();
    const count = row.count ?? 0;

    if (totalMs <= 0) {
      // Zero/negative-duration row (bad data, or start == end) -- nothing
      // to prorate across, just attribute it to the start day.
      const day = localDateKey(start, timeZone);
      byDay.set(day, (byDay.get(day) ?? 0) + count);
      continue;
    }

    let cursor = start;
    while (cursor < end) {
      const dayStart = localDayStartUtc(cursor, timeZone);
      // +25h is guaranteed to land in the next local calendar day
      // regardless of whether today is a 23h (spring-forward) or 25h
      // (fall-back) DST day; localDayStartUtc then snaps it back to that
      // next day's own real start.
      const nextDayStart = localDayStartUtc(new Date(dayStart.getTime() + 25 * 3_600_000), timeZone);
      const segmentEnd = end < nextDayStart ? end : nextDayStart;
      const segmentMs = segmentEnd.getTime() - cursor.getTime();
      const day = localDateKey(dayStart, timeZone);
      byDay.set(day, (byDay.get(day) ?? 0) + count * (segmentMs / totalMs));
      cursor = segmentEnd;
    }
  }
}

export async function getDailySteps(
  supabase: SupabaseClient,
  days = 14,
  clientId?: string,
): Promise<DailySteps[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rawRows = await fetchAllRows<MetricRow>((from, to) => {
    let query = supabase
      .from("metrics")
      .select("start_time, end_time, value, source_package")
      .eq("metric_type", "steps")
      .gte("start_time", since.toISOString())
      // id as a tiebreaker keeps page boundaries stable when many rows
      // share the same start_time (seen in practice -- per-minute Garmin
      // samples routinely do).
      .order("start_time", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (clientId) query = query.eq("client_id", clientId);
    return query;
  });
  const data: StepsRow[] = rawRows.map(toStepsRow);

  const [timeZone, sourcePreference] = await Promise.all([
    getClientTimezone(supabase, clientId),
    getSourcePreference(supabase, clientId, "steps"),
  ]);
  // A client-chosen source needs no dedup heuristic -- with only one
  // source in play there's nothing to reconcile, so this skips
  // resolveOverlappingSources entirely rather than running it uselessly.
  const resolved = sourcePreference
    ? applySourcePreference(data, sourcePreference)
    : resolveOverlappingSources(data, timeZone);

  const byDay = new Map<string, number>();
  accumulateStepsByDay(resolved, byDay, timeZone);

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count: Math.round(count) }));
}

export interface SleepNight {
  date: string;
  hours: number;
}

export async function getSleepNights(
  supabase: SupabaseClient,
  days = 14,
  clientId?: string,
): Promise<SleepNight[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  let query = supabase
    .from("metrics")
    .select("start_time, end_time, source_package")
    .eq("metric_type", "sleep_session")
    .gte("start_time", since.toISOString())
    .order("start_time", { ascending: true });
  if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query;

  if (error) throw new Error(`Failed to load sleep sessions: ${error.message}`);

  const [timeZone, sourcePreference] = await Promise.all([
    getClientTimezone(supabase, clientId),
    getSourcePreference(supabase, clientId, "sleep_session"),
  ]);
  const rows = applySourcePreference(
    (data ?? []) as { start_time: string; end_time: string; source_package: string | null }[],
    sourcePreference,
  );

  return rows.map((row) => {
    const hours =
      (new Date(row.end_time).getTime() - new Date(row.start_time).getTime()) /
      (1000 * 60 * 60);
    // Rounded to the nearest minute (not the nearest tenth of an hour) --
    // the coarser rounding was hiding real discrepancies against a
    // wearable's own minute-level reading once displayed as "7.5h".
    return { date: localDateKey(new Date(row.start_time), timeZone), hours: Math.round(hours * 60) / 60 };
  });
}

export interface OverviewStats {
  stepsToday: number;
  avgHeartRate7d: number | null;
  lastSleepHours: number | null;
  exerciseSessions7d: number;
}

export async function getOverviewStats(
  supabase: SupabaseClient,
  clientId?: string,
): Promise<OverviewStats> {
  const [timeZone, stepsPreference, heartRatePreference] = await Promise.all([
    getClientTimezone(supabase, clientId),
    getSourcePreference(supabase, clientId, "steps"),
    getSourcePreference(supabase, clientId, "heart_rate"),
  ]);
  // The client's own local midnight, not the server's -- a Vercel/Node
  // runtime's "local" time is effectively arbitrary (usually UTC), which
  // has nothing to do with what day it actually is for this client.
  const todayStart = localDayStartUtc(new Date(), timeZone);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  let sleepQuery = supabase
    .from("metrics")
    .select("start_time, end_time")
    .eq("metric_type", "sleep_session")
    .order("start_time", { ascending: false })
    .limit(1);
  let exerciseQuery = supabase
    .from("metrics")
    .select("id", { count: "exact", head: true })
    .eq("metric_type", "exercise_session")
    .gte("start_time", sevenDaysAgo.toISOString());

  if (clientId) {
    sleepQuery = sleepQuery.eq("client_id", clientId);
    exerciseQuery = exerciseQuery.eq("client_id", clientId);
  }

  const [stepsRows, hrSamples, sleepRes, exerciseRes] = await Promise.all([
    fetchAllRows<MetricRow>((from, to) => {
      let q = supabase
        .from("metrics")
        .select("start_time, end_time, value, source_package")
        .eq("metric_type", "steps")
        .gte("start_time", todayStart.toISOString())
        .order("start_time", { ascending: true })
        .range(from, to);
      if (clientId) q = q.eq("client_id", clientId);
      return q;
    }),
    fetchAllRows<MetricRow>((from, to) => {
      let q = supabase
        .from("metrics")
        .select("start_time, end_time, value, source_package")
        .eq("metric_type", "heart_rate")
        .gte("start_time", sevenDaysAgo.toISOString())
        .order("start_time", { ascending: true })
        .range(from, to);
      if (clientId) q = q.eq("client_id", clientId);
      return q;
    }),
    sleepQuery,
    exerciseQuery,
  ]);

  if (sleepRes.error) throw new Error(sleepRes.error.message);
  if (exerciseRes.error) throw new Error(exerciseRes.error.message);

  // Same dedup-or-preference treatment as getDailySteps -- this used to
  // just sum every row with no regard for overlapping sources at all, so
  // "Steps today" on the overview could be inflated even when the chart
  // right below it (which does go through getDailySteps) wasn't.
  const dedupedSteps = stepsPreference
    ? applySourcePreference(stepsRows.map(toStepsRow), stepsPreference)
    : resolveOverlappingSources(stepsRows.map(toStepsRow), timeZone);
  const stepsToday = dedupedSteps.reduce((sum, r) => sum + (r.count ?? 0), 0);
  const dedupedHr = applySourcePreference(hrSamples, heartRatePreference);
  const hrValues = dedupedHr.map((r) => metricNumber(r, "bpm")).filter((v): v is number => v != null);
  const avgHeartRate7d =
    hrValues.length > 0
      ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length)
      : null;

  let lastSleepHours: number | null = null;
  const lastSleep = sleepRes.data?.[0];
  if (lastSleep) {
    // Minute-level precision (not tenths-of-an-hour) -- this feeds the AI
    // assistant's own context as a plain number, same reasoning as
    // getSleepNights below for why the coarser rounding was dropped.
    lastSleepHours =
      Math.round(
        ((new Date(lastSleep.end_time).getTime() - new Date(lastSleep.start_time).getTime()) /
          (1000 * 60 * 60)) *
          60,
      ) / 60;
  }

  return {
    stepsToday,
    avgHeartRate7d,
    lastSleepHours,
    exerciseSessions7d: exerciseRes.count ?? 0,
  };
}

// One-line summary for a single data-point card on /client, scoped to one
// client. Deliberately simple (a 7-day aggregate or most-recent reading
// per type) rather than a full chart -- this is the "top 3 data points"
// glance view, not the Overview page.
export async function getDataPointSummary(
  supabase: SupabaseClient,
  dataPointKey: string,
  clientId: string,
): Promise<string> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const since = sevenDaysAgo.toISOString();

  switch (dataPointKey) {
    case "steps": {
      const steps = await getDailySteps(supabase, 7, clientId);
      const total = steps.reduce((sum, d) => sum + d.count, 0);
      return steps.length ? `${total.toLocaleString()} steps this week` : "No steps synced yet";
    }
    case "heart_rate_samples": {
      const preference = await getSourcePreference(supabase, clientId, "heart_rate");
      const data = await fetchAllRows<MetricValueOnlyRow>((from, to) => {
        let q = supabase
          .from("metrics")
          .select("value")
          .eq("metric_type", "heart_rate")
          .eq("client_id", clientId)
          .gte("start_time", since)
          .range(from, to);
        if (preference) q = q.eq("source_package", preference);
        return q;
      });
      const samples = data.map((r) => metricNumber(r, "bpm")).filter((v): v is number => v != null);
      if (!samples.length) return "No heart rate data synced yet";
      const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      return `${avg} bpm avg this week`;
    }
    case "sleep_sessions": {
      const nights = await getSleepNights(supabase, 7, clientId);
      if (!nights.length) return "No sleep data synced yet";
      const last = nights[nights.length - 1];
      return `${formatHoursMinutes(last.hours)} last night`;
    }
    case "exercise_sessions": {
      const { count } = await supabase
        .from("metrics")
        .select("id", { count: "exact", head: true })
        .eq("metric_type", "exercise_session")
        .eq("client_id", clientId)
        .gte("start_time", since);
      return `${count ?? 0} workout${count === 1 ? "" : "s"} this week`;
    }
    case "blood_oxygen": {
      const preference = await getSourcePreference(supabase, clientId, "blood_oxygen");
      const data = await fetchAllRows<MetricValueOnlyRow>((from, to) => {
        let q = supabase
          .from("metrics")
          .select("value")
          .eq("metric_type", "blood_oxygen")
          .eq("client_id", clientId)
          .gte("start_time", since)
          .range(from, to);
        if (preference) q = q.eq("source_package", preference);
        return q;
      });
      const samples = data.map((r) => metricNumber(r, "percentage")).filter((v): v is number => v != null);
      if (!samples.length) return "No SpO2 data synced yet";
      const avg = Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 10) / 10;
      return `${avg}% avg SpO2 this week`;
    }
    case "blood_pressure": {
      const preference = await getSourcePreference(supabase, clientId, "blood_pressure");
      let bpQuery = supabase
        .from("metrics")
        .select("value, start_time")
        .eq("metric_type", "blood_pressure")
        .eq("client_id", clientId)
        .order("start_time", { ascending: false })
        .limit(1);
      if (preference) bpQuery = bpQuery.eq("source_package", preference);
      const { data } = await bpQuery;
      const last = data?.[0] as MetricValueOnlyRow | undefined;
      const systolic = last ? metricNumber(last, "systolic_mmhg") : null;
      const diastolic = last ? metricNumber(last, "diastolic_mmhg") : null;
      return systolic != null && diastolic != null
        ? `${systolic}/${diastolic} mmHg (most recent)`
        : "No blood pressure data synced yet";
    }
    case "respiratory_rate": {
      const preference = await getSourcePreference(supabase, clientId, "respiratory_rate");
      const data = await fetchAllRows<MetricValueOnlyRow>((from, to) => {
        let q = supabase
          .from("metrics")
          .select("value")
          .eq("metric_type", "respiratory_rate")
          .eq("client_id", clientId)
          .gte("start_time", since)
          .range(from, to);
        if (preference) q = q.eq("source_package", preference);
        return q;
      });
      const samples = data.map((r) => metricNumber(r, "breaths_per_minute")).filter((v): v is number => v != null);
      if (!samples.length) return "No respiratory rate data synced yet";
      const avg = Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 10) / 10;
      return `${avg} breaths/min avg this week`;
    }
    case "blood_glucose": {
      const preference = await getSourcePreference(supabase, clientId, "blood_glucose");
      const data = await fetchAllRows<MetricValueOnlyRow>((from, to) => {
        let q = supabase
          .from("metrics")
          .select("value")
          .eq("metric_type", "blood_glucose")
          .eq("client_id", clientId)
          .gte("start_time", since)
          .range(from, to);
        if (preference) q = q.eq("source_package", preference);
        return q;
      });
      const samples = data.map((r) => metricNumber(r, "level_mg_dl")).filter((v): v is number => v != null);
      if (!samples.length) return "No blood glucose data synced yet";
      const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      return `${avg} mg/dL avg this week`;
    }
    default:
      return "No data synced yet";
  }
}

export interface DataSeriesPoint {
  date: string;
  value: number;
}

export function unitFor(key: string): string {
  switch (key) {
    case "steps":
      return "steps";
    case "heart_rate_samples":
      return "bpm";
    case "sleep_sessions":
      return "h";
    case "exercise_sessions":
      return "sessions";
    case "blood_oxygen":
      return "% SpO2";
    case "blood_pressure":
      return "mmHg (systolic)";
    case "respiratory_rate":
      return "breaths/min";
    case "blood_glucose":
      return "mg/dL";
    default:
      return "";
  }
}

// One plain numeric reading per row, keyed by start_time -- bucketed to a
// daily average, same shape as getDailySteps/getSleepNights, so all eight
// DATA_POINTS keys can feed one overlay chart (components/
// DataOverlayChart.tsx) through a single entry point. All five now query
// the unified `metrics` table (0035_metrics.sql); `valueField` names the
// field inside the jsonb `value` column rather than a top-level column.
const SAMPLE_SERIES_CONFIG: Record<string, { metricType: string; valueField: string }> = {
  heart_rate_samples: { metricType: "heart_rate", valueField: "bpm" },
  blood_oxygen: { metricType: "blood_oxygen", valueField: "percentage" },
  blood_pressure: { metricType: "blood_pressure", valueField: "systolic_mmhg" },
  respiratory_rate: { metricType: "respiratory_rate", valueField: "breaths_per_minute" },
  blood_glucose: { metricType: "blood_glucose", valueField: "level_mg_dl" },
};

export async function getDailySeries(
  supabase: SupabaseClient,
  dataPointKey: string,
  days = 14,
  clientId?: string,
): Promise<DataSeriesPoint[]> {
  if (dataPointKey === "steps") {
    const steps = await getDailySteps(supabase, days, clientId);
    return steps.map((s) => ({ date: s.date, value: s.count }));
  }

  if (dataPointKey === "sleep_sessions") {
    const nights = await getSleepNights(supabase, days, clientId);
    return nights.map((n) => ({ date: n.date, value: n.hours }));
  }

  const since = new Date();
  since.setDate(since.getDate() - days);
  const timeZone = await getClientTimezone(supabase, clientId);

  if (dataPointKey === "exercise_sessions") {
    const preference = await getSourcePreference(supabase, clientId, "exercise_session");
    let query = supabase
      .from("metrics")
      .select("start_time")
      .eq("metric_type", "exercise_session")
      .gte("start_time", since.toISOString())
      .order("start_time", { ascending: true });
    if (clientId) query = query.eq("client_id", clientId);
    if (preference) query = query.eq("source_package", preference);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const byDay = new Map<string, number>();
    for (const row of (data ?? []) as { start_time: string }[]) {
      const day = localDateKey(new Date(row.start_time), timeZone);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }));
  }

  const config = SAMPLE_SERIES_CONFIG[dataPointKey];
  if (!config) return [];

  const preference = await getSourcePreference(supabase, clientId, config.metricType);
  const rows = await fetchAllRows<MetricRow>((from, to) => {
    let query = supabase
      .from("metrics")
      .select("start_time, end_time, value, source_package")
      .eq("metric_type", config.metricType)
      .gte("start_time", since.toISOString())
      .order("start_time", { ascending: true })
      .range(from, to);
    if (clientId) query = query.eq("client_id", clientId);
    if (preference) query = query.eq("source_package", preference);
    return query;
  });

  const byDay = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const day = localDateKey(new Date(row.start_time), timeZone);
    const value = metricNumber(row, config.valueField);
    if (value == null) continue;
    const bucket = byDay.get(day) ?? { sum: 0, count: 0 };
    bucket.sum += value;
    bucket.count += 1;
    byDay.set(day, bucket);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count }]) => ({ date, value: Math.round((sum / count) * 10) / 10 }));
}
