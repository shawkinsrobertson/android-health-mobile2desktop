package com.healthsync.app.data

import com.healthsync.app.supabase.SupabaseRestClient
import org.json.JSONArray
import java.time.Instant
import java.time.format.DateTimeFormatter

data class DataPoint(val key: String, val label: String)

// Mirrors dashboard/app/client/data-points.ts exactly -- same 8 keys, same
// order, same labels -- since client_profiles.top_data_points stores keys
// from this exact list and both platforms need to agree on what each one
// means and is called.
val DATA_POINTS = listOf(
    DataPoint("steps", "Steps"),
    DataPoint("heart_rate_samples", "Heart rate"),
    DataPoint("sleep_sessions", "Sleep"),
    DataPoint("exercise_sessions", "Workouts"),
    DataPoint("blood_oxygen", "Blood oxygen (SpO2)"),
    DataPoint("blood_pressure", "Blood pressure"),
    DataPoint("respiratory_rate", "Respiratory rate"),
    DataPoint("blood_glucose", "Blood glucose"),
)

fun labelFor(key: String): String = DATA_POINTS.firstOrNull { it.key == key }?.label ?: key

private val ISO_INSTANT = DateTimeFormatter.ISO_INSTANT

/**
 * Kotlin port of dashboard/lib/queries.ts's getDataPointSummary -- one-line
 * "glance" summaries for the client dashboard's top-3 stat cards, same
 * 7-day window and same per-type wording so a client sees consistent
 * numbers between the app and the web dashboard. Deliberately simpler than
 * that file in one respect, matching HealthDataRepository.kt's own
 * documented precedent: no resolveOverlappingSources cross-source dedup
 * for the steps case (a day with two source apps writing overlapping
 * ranges will double-count here, same accepted "rough trends, not exact
 * totals" tradeoff already made for this app's Stats screen).
 */
class DataPointRepository(private val supabase: SupabaseRestClient) {

    suspend fun getSummary(clientId: String, dataPointKey: String): String {
        val since = ISO_INSTANT.format(Instant.now().minusSeconds(7 * 86_400L))

        return when (dataPointKey) {
            "steps" -> {
                val rows = supabase.select(
                    "steps",
                    mapOf(
                        "select" to "count",
                        "client_id" to "eq.$clientId",
                        "start_time" to "gte.$since",
                    ),
                )
                if (rows.length() == 0) return "No steps synced yet"
                val total = sumInts(rows, "count")
                "${total.thousands()} steps this week"
            }
            "heart_rate_samples" -> {
                val rows = supabase.select(
                    "heart_rate_samples",
                    mapOf(
                        "select" to "bpm",
                        "client_id" to "eq.$clientId",
                        "sample_time" to "gte.$since",
                    ),
                )
                if (rows.length() == 0) return "No heart rate data synced yet"
                val avg = averageDouble(rows, "bpm")
                "${Math.round(avg)} bpm avg this week"
            }
            "sleep_sessions" -> {
                val rows = supabase.select(
                    "sleep_sessions",
                    mapOf(
                        "select" to "start_time,end_time",
                        "client_id" to "eq.$clientId",
                        "start_time" to "gte.$since",
                        "order" to "start_time.asc",
                    ),
                )
                if (rows.length() == 0) return "No sleep data synced yet"
                val last = rows.getJSONObject(rows.length() - 1)
                val hours = (
                    Instant.parse(last.getString("end_time")).epochSecond -
                        Instant.parse(last.getString("start_time")).epochSecond
                    ) / 3600.0
                "${Math.round(hours * 10) / 10.0}h last night"
            }
            "exercise_sessions" -> {
                val rows = supabase.select(
                    "exercise_sessions",
                    mapOf(
                        "select" to "id",
                        "client_id" to "eq.$clientId",
                        "start_time" to "gte.$since",
                    ),
                )
                val count = rows.length()
                "$count workout${if (count == 1) "" else "s"} this week"
            }
            "blood_oxygen" -> {
                val rows = supabase.select(
                    "blood_oxygen",
                    mapOf(
                        "select" to "percentage",
                        "client_id" to "eq.$clientId",
                        "sample_time" to "gte.$since",
                    ),
                )
                if (rows.length() == 0) return "No SpO2 data synced yet"
                val avg = averageDouble(rows, "percentage")
                "${Math.round(avg * 10) / 10.0}% avg SpO2 this week"
            }
            "blood_pressure" -> {
                val rows = supabase.select(
                    "blood_pressure",
                    mapOf(
                        "select" to "systolic_mmhg,diastolic_mmhg,sample_time",
                        "client_id" to "eq.$clientId",
                        "order" to "sample_time.desc",
                        "limit" to "1",
                    ),
                )
                if (rows.length() == 0) return "No blood pressure data synced yet"
                val last = rows.getJSONObject(0)
                "${last.getInt("systolic_mmhg")}/${last.getInt("diastolic_mmhg")} mmHg (most recent)"
            }
            "respiratory_rate" -> {
                val rows = supabase.select(
                    "respiratory_rate",
                    mapOf(
                        "select" to "breaths_per_minute",
                        "client_id" to "eq.$clientId",
                        "sample_time" to "gte.$since",
                    ),
                )
                if (rows.length() == 0) return "No respiratory rate data synced yet"
                val avg = averageDouble(rows, "breaths_per_minute")
                "${Math.round(avg * 10) / 10.0} breaths/min avg this week"
            }
            "blood_glucose" -> {
                val rows = supabase.select(
                    "blood_glucose",
                    mapOf(
                        "select" to "level_mg_dl",
                        "client_id" to "eq.$clientId",
                        "sample_time" to "gte.$since",
                    ),
                )
                if (rows.length() == 0) return "No blood glucose data synced yet"
                val avg = averageDouble(rows, "level_mg_dl")
                "${Math.round(avg)} mg/dL avg this week"
            }
            else -> "No data synced yet"
        }
    }
}

private fun sumInts(rows: JSONArray, field: String): Long {
    var sum = 0L
    for (i in 0 until rows.length()) sum += rows.getJSONObject(i).optLong(field, 0)
    return sum
}

private fun averageDouble(rows: JSONArray, field: String): Double {
    var sum = 0.0
    for (i in 0 until rows.length()) sum += rows.getJSONObject(i).optDouble(field, 0.0)
    return sum / rows.length()
}

private fun Long.thousands(): String {
    val s = toString()
    val sb = StringBuilder()
    for ((i, c) in s.reversed().withIndex()) {
        if (i > 0 && i % 3 == 0) sb.append(',')
        sb.append(c)
    }
    return sb.reverse().toString()
}
