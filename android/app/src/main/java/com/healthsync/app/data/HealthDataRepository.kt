package com.healthsync.app.data

import com.healthsync.app.supabase.SupabaseRestClient
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.async
import org.json.JSONArray
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class DailySteps(val date: String, val count: Long)
data class SleepNight(val date: String, val hours: Double)
data class RecentWorkout(val id: String, val completedAt: String)

data class DashboardData(
    val stepsToday: Long,
    val avgHeartRate7d: Int?,
    val lastSleepHours: Double?,
    val dailySteps: List<DailySteps>,
    val sleepNights: List<SleepNight>,
    val recentWorkouts: List<RecentWorkout>,
)

private val ISO_INSTANT = DateTimeFormatter.ISO_INSTANT

// See TtlCache's doc comment -- DashboardScreen re-fetches from scratch on
// every return visit since it doesn't survive Compose Navigation's
// teardown, so a 60s cache is what makes a quick "back, then forward
// again" feel instant instead of re-paying every query.
private val dashboardCache = TtlCache<DashboardData>(Duration.ofSeconds(60))

// One raw steps row, pre-bucketing -- carries source_package/end_time so
// resolveOverlappingSources (below) has what it needs; bucketStepsByDay
// only reads start_time/count.
private data class StepsRawRow(val startTime: String, val endTime: String, val count: Double, val sourcePackage: String?)

/**
 * Basic per-client data-viz queries for the Android dashboard -- a
 * deliberately simplified Kotlin counterpart to the web dashboard's
 * dashboard/lib/queries.ts. One remaining real simplification from that
 * file, called out here rather than left to be discovered later: no
 * prorating a row's count across the days its [start_time, end_time)
 * span crosses -- every row is credited whole to its start_time's day.
 * (Cross-source step dedup, the other simplification this comment used to
 * flag, is no longer one -- see resolveOverlappingSources below, added
 * alongside client_metric_source_preference, supabase/migrations/
 * 0038_client_timezone_and_source_preference.sql.)
 * Good enough to confirm sync is actually working and see rough trends
 * on-device; not a source of truth for exact totals -- the web dashboard
 * remains that.
 */
class HealthDataRepository(private val supabase: SupabaseRestClient) {

    // The four queries below are independent of each other (different
    // tables, no shared state), so they run concurrently via async/await
    // instead of one after another -- each pays its own network
    // round-trip, and doing that sequentially was the single biggest
    // contributor to this screen's slow load.
    suspend fun loadDashboard(clientId: String, days: Int = 14): DashboardData {
        dashboardCache.get(clientId)?.let { return it }
        return loadDashboardFresh(clientId, days).also { dashboardCache.put(clientId, it) }
    }

    private suspend fun getSourcePreference(clientId: String, metricType: String): String? {
        val rows = supabase.select(
            "client_metric_source_preference",
            mapOf(
                "select" to "source_package",
                "client_id" to "eq.$clientId",
                "metric_type" to "eq.$metricType",
                "limit" to "1",
            ),
        )
        return if (rows.length() == 0) null else rows.getJSONObject(0).optString("source_package").ifBlank { null }
    }

    private suspend fun loadDashboardFresh(clientId: String, days: Int): DashboardData = coroutineScope {
        val sinceIso = ISO_INSTANT.format(Instant.now().minusSeconds(days * 86_400L))
        val sevenDaysAgoIso = ISO_INSTANT.format(Instant.now().minusSeconds(7 * 86_400L))
        // Bucketing below uses the *device's* local date, not UTC -- a
        // step/sleep row's start_time is an absolute instant, but "today"
        // is a local-calendar concept. Getting this wrong doesn't just
        // shift dates by a day; in the evening in a timezone behind UTC,
        // it can make an entire day of real, synced data compare unequal
        // to "today" and look like zero.
        val todayIso = LocalDate.now(ZoneId.systemDefault()).toString()

        val stepsPreferenceDeferred = async { getSourcePreference(clientId, "steps") }
        val sleepPreferenceDeferred = async { getSourcePreference(clientId, "sleep_session") }
        val hrPreferenceDeferred = async { getSourcePreference(clientId, "heart_rate") }

        // All three queries below now hit the unified `metrics` table
        // (supabase/migrations/0035_metrics.sql), scoped by `metric_type`;
        // type-specific fields (count/bpm) live under the jsonb `value`
        // column, read back out in bucketStepsByDay/averageBpm below.
        val stepsDeferred = async {
            supabase.select(
                "metrics",
                mapOf(
                    "select" to "start_time,end_time,value,source_package",
                    "client_id" to "eq.$clientId",
                    "metric_type" to "eq.steps",
                    "start_time" to "gte.$sinceIso",
                    "order" to "start_time.asc",
                    // No `limit` here on purpose -- a dense metric type
                    // (steps especially, with multiple sources) can exceed
                    // a hard cap within the `days` window, and with
                    // ascending order a single-page cap silently drops the
                    // *newest* rows, not the oldest. Already date-bounded
                    // to `days`, so this falls through to select()'s normal
                    // auto-pagination and still returns every row in range.
                    // Same bug web dashboard's 562f711 fixed in
                    // lib/queries.ts's fetchAllRows() -- this screen never
                    // got the equivalent fix until now.
                ),
            )
        }
        val sleepDeferred = async {
            supabase.select(
                "metrics",
                mapOf(
                    "select" to "start_time,end_time,source_package",
                    "client_id" to "eq.$clientId",
                    "metric_type" to "eq.sleep_session",
                    "start_time" to "gte.$sinceIso",
                    "order" to "start_time.asc",
                ),
            )
        }
        val hrDeferred = async {
            supabase.select(
                "metrics",
                mapOf(
                    "select" to "value,source_package",
                    "client_id" to "eq.$clientId",
                    "metric_type" to "eq.heart_rate",
                    "start_time" to "gte.$sevenDaysAgoIso",
                ),
            )
        }
        val workoutDeferred = async {
            supabase.select(
                "workout_sessions",
                mapOf(
                    "select" to "id,completed_at",
                    "client_id" to "eq.$clientId",
                    "completed_at" to "not.is.null",
                    "order" to "completed_at.desc",
                    "limit" to "5",
                ),
            )
        }

        val stepsPreference = stepsPreferenceDeferred.await()
        val rawSteps = parseStepsRows(stepsDeferred.await())
        val resolvedSteps = if (stepsPreference != null) {
            rawSteps.filter { it.sourcePackage == stepsPreference }
        } else {
            resolveOverlappingSources(rawSteps)
        }
        val dailySteps = bucketStepsByDay(resolvedSteps)

        val sleepPreference = sleepPreferenceDeferred.await()
        val sleepRows = sleepDeferred.await()
        val sleepNights = bucketSleepByNight(filterBySource(sleepRows, sleepPreference))

        val hrPreference = hrPreferenceDeferred.await()
        val hrRows = hrDeferred.await()
        val avgHr = averageBpm(filterBySource(hrRows, hrPreference))

        val workoutRows = workoutDeferred.await()
        val recentWorkouts = (0 until workoutRows.length()).map { i ->
            val row = workoutRows.getJSONObject(i)
            RecentWorkout(id = row.getString("id"), completedAt = row.getString("completed_at"))
        }

        val stepsToday = dailySteps.firstOrNull { it.date == todayIso }?.count ?: 0L

        DashboardData(
            stepsToday = stepsToday,
            avgHeartRate7d = avgHr,
            lastSleepHours = sleepNights.lastOrNull()?.hours,
            dailySteps = dailySteps,
            sleepNights = sleepNights,
            recentWorkouts = recentWorkouts,
        )
    }

    // The device's local date for the instant a row's start_time
    // represents -- not a substring of the stored UTC string. See the
    // note on todayIso in loadDashboard for why this matters.
    private fun localDateOf(isoInstant: String): String =
        Instant.parse(isoInstant).atZone(ZoneId.systemDefault()).toLocalDate().toString()

    private fun filterBySource(rows: JSONArray, sourcePackage: String?): JSONArray {
        if (sourcePackage == null) return rows
        val filtered = JSONArray()
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            if (row.optString("source_package").ifBlank { null } == sourcePackage) filtered.put(row)
        }
        return filtered
    }

    private fun parseStepsRows(rows: JSONArray): List<StepsRawRow> {
        val parsed = mutableListOf<StepsRawRow>()
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            val start = row.getString("start_time")
            parsed.add(
                StepsRawRow(
                    startTime = start,
                    endTime = row.optString("end_time").ifBlank { start },
                    count = row.getJSONObject("value").optDouble("count", 0.0),
                    sourcePackage = row.optString("source_package").ifBlank { null },
                ),
            )
        }
        return parsed
    }

    // Health Connect doesn't dedupe steps written by multiple source apps
    // for the same real activity -- a wearable and the phone's own step
    // sensor both writing overlapping records for the same walk is the
    // normal case, not an edge case (same finding as web dashboard's
    // resolveOverlappingSources, dashboard/lib/queries.ts). Per local
    // calendar day, pick whichever source has the most total steps as
    // that day's "primary" and count it in full; for every other source's
    // rows that day, only count the portion of their time range the
    // primary source didn't already cover. Heuristic, not a port of web's
    // implementation byte-for-byte -- same idea, this app's own shape.
    private fun resolveOverlappingSources(rows: List<StepsRawRow>): List<StepsRawRow> {
        val byDay = rows.groupBy { localDateOf(it.startTime) }
        val resolved = mutableListOf<StepsRawRow>()

        for (dayRows in byDay.values) {
            val bySource = dayRows.groupBy { it.sourcePackage ?: "unknown" }
            if (bySource.size <= 1) {
                resolved.addAll(dayRows)
                continue
            }

            val (primaryKey, primaryRows) = bySource.entries.maxBy { (_, rs) -> rs.sumOf { it.count } }
            resolved.addAll(primaryRows)

            val primaryIntervals = mergeIntervals(
                primaryRows.map { Instant.parse(it.startTime).toEpochMilli() to Instant.parse(it.endTime).toEpochMilli() },
            )

            for ((key, sourceRows) in bySource) {
                if (key == primaryKey) continue
                for (row in sourceRows) {
                    val startMs = Instant.parse(row.startTime).toEpochMilli()
                    val endMs = Instant.parse(row.endTime).toEpochMilli()
                    val totalMs = endMs - startMs
                    if (totalMs <= 0) {
                        resolved.add(row)
                        continue
                    }
                    for ((gapStart, gapEnd) in subtractIntervals(startMs, endMs, primaryIntervals)) {
                        resolved.add(
                            row.copy(
                                startTime = Instant.ofEpochMilli(gapStart).toString(),
                                endTime = Instant.ofEpochMilli(gapEnd).toString(),
                                count = row.count * ((gapEnd - gapStart).toDouble() / totalMs),
                            ),
                        )
                    }
                }
            }
        }
        return resolved
    }

    // Merges possibly-overlapping [start, end] ms intervals into a
    // minimal sorted set of non-overlapping ones.
    private fun mergeIntervals(intervals: List<Pair<Long, Long>>): List<Pair<Long, Long>> {
        if (intervals.isEmpty()) return emptyList()
        val sorted = intervals.sortedBy { it.first }
        val merged = mutableListOf(sorted.first())
        for (cur in sorted.drop(1)) {
            val last = merged.last()
            if (cur.first <= last.second) {
                merged[merged.lastIndex] = last.first to maxOf(last.second, cur.second)
            } else {
                merged.add(cur)
            }
        }
        return merged
    }

    // The portion(s) of [start, end] not covered by any interval in
    // `covering` (already merged/non-overlapping and sorted).
    private fun subtractIntervals(start: Long, end: Long, covering: List<Pair<Long, Long>>): List<Pair<Long, Long>> {
        val gaps = mutableListOf<Pair<Long, Long>>()
        var cursor = start
        for ((cs, ce) in covering) {
            if (ce <= cursor) continue
            if (cs >= end) break
            if (cs > cursor) gaps.add(cursor to minOf(cs, end))
            cursor = maxOf(cursor, ce)
            if (cursor >= end) break
        }
        if (cursor < end) gaps.add(cursor to end)
        return gaps
    }

    private fun bucketStepsByDay(rows: List<StepsRawRow>): List<DailySteps> {
        val byDay = LinkedHashMap<String, Double>()
        for (row in rows) {
            val day = localDateOf(row.startTime)
            byDay[day] = (byDay[day] ?: 0.0) + row.count
        }
        return byDay.entries.sortedBy { it.key }.map { DailySteps(it.key, Math.round(it.value)) }
    }

    private fun bucketSleepByNight(rows: JSONArray): List<SleepNight> {
        val nights = mutableListOf<SleepNight>()
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            val start = Instant.parse(row.getString("start_time"))
            val end = Instant.parse(row.getString("end_time"))
            val hours = (end.epochSecond - start.epochSecond) / 3600.0
            val date = localDateOf(row.getString("start_time"))
            nights.add(SleepNight(date = date, hours = Math.round(hours * 10) / 10.0))
        }
        return nights
    }

    private fun averageBpm(rows: JSONArray): Int? {
        if (rows.length() == 0) return null
        var sum = 0.0
        for (i in 0 until rows.length()) {
            sum += rows.getJSONObject(i).getJSONObject("value").optDouble("bpm", 0.0)
        }
        return Math.round(sum / rows.length()).toInt()
    }
}
