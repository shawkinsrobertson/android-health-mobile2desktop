package com.healthsync.app.data

import com.healthsync.app.supabase.SupabaseRestClient
import org.json.JSONArray
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

/**
 * Basic per-client data-viz queries for the Android dashboard -- a
 * deliberately simplified Kotlin counterpart to the web dashboard's
 * dashboard/lib/queries.ts. Two real simplifications from that file,
 * called out here rather than left to be discovered later:
 *  - No dedup of overlapping step sources (queries.ts's
 *    resolveOverlappingSources) -- a day with two source apps writing
 *    overlapping step ranges will double-count here.
 *  - No prorating a row's count across the days its [start_time,
 *    end_time) span crosses -- every row is credited whole to its
 *    start_time's day.
 * Good enough to confirm sync is actually working and see rough trends
 * on-device; not a source of truth for exact totals -- the web dashboard
 * remains that.
 */
class HealthDataRepository(private val supabase: SupabaseRestClient) {

    suspend fun loadDashboard(clientId: String, days: Int = 14): DashboardData {
        val sinceIso = ISO_INSTANT.format(Instant.now().minusSeconds(days * 86_400L))
        val sevenDaysAgoIso = ISO_INSTANT.format(Instant.now().minusSeconds(7 * 86_400L))
        // Bucketing below uses the *device's* local date, not UTC -- a
        // step/sleep row's start_time is an absolute instant, but "today"
        // is a local-calendar concept. Getting this wrong doesn't just
        // shift dates by a day; in the evening in a timezone behind UTC,
        // it can make an entire day of real, synced data compare unequal
        // to "today" and look like zero.
        val todayIso = LocalDate.now(ZoneId.systemDefault()).toString()

        val stepsRows = supabase.select(
            "steps",
            mapOf(
                "select" to "start_time,count",
                "client_id" to "eq.$clientId",
                "start_time" to "gte.$sinceIso",
                "order" to "start_time.asc",
            ),
        )
        val dailySteps = bucketStepsByDay(stepsRows)

        val sleepRows = supabase.select(
            "sleep_sessions",
            mapOf(
                "select" to "start_time,end_time",
                "client_id" to "eq.$clientId",
                "start_time" to "gte.$sinceIso",
                "order" to "start_time.asc",
            ),
        )
        val sleepNights = bucketSleepByNight(sleepRows)

        val hrRows = supabase.select(
            "heart_rate_samples",
            mapOf(
                "select" to "bpm",
                "client_id" to "eq.$clientId",
                "sample_time" to "gte.$sevenDaysAgoIso",
            ),
        )
        val avgHr = averageBpm(hrRows)

        val workoutRows = supabase.select(
            "workout_sessions",
            mapOf(
                "select" to "id,completed_at",
                "client_id" to "eq.$clientId",
                "completed_at" to "not.is.null",
                "order" to "completed_at.desc",
                "limit" to "5",
            ),
        )
        val recentWorkouts = (0 until workoutRows.length()).map { i ->
            val row = workoutRows.getJSONObject(i)
            RecentWorkout(id = row.getString("id"), completedAt = row.getString("completed_at"))
        }

        val stepsToday = dailySteps.firstOrNull { it.date == todayIso }?.count ?: 0L

        return DashboardData(
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

    private fun bucketStepsByDay(rows: JSONArray): List<DailySteps> {
        val byDay = LinkedHashMap<String, Long>()
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            val day = localDateOf(row.getString("start_time"))
            val count = row.optLong("count", 0)
            byDay[day] = (byDay[day] ?: 0L) + count
        }
        return byDay.entries.sortedBy { it.key }.map { DailySteps(it.key, it.value) }
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
            sum += rows.getJSONObject(i).optDouble("bpm", 0.0)
        }
        return Math.round(sum / rows.length()).toInt()
    }
}
