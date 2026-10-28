package com.healthsync.app.data

import com.healthsync.app.supabase.SupabaseRestClient
import org.json.JSONArray
import java.time.Instant
import java.time.format.DateTimeFormatter

data class DataPoint(val key: String, val label: String)

// Mirrors dashboard/app/client/data-points.ts exactly -- same 8 keys, same
// order, same labels -- since client_profiles.top_data_points stores keys
// from this exact list and both platforms need to agree on what each one
// means and is called. This is the client-facing consent/display taxonomy
// (also shared with client_data_consent.data_type) -- deliberately a
// *different* namespace from metrics.metric_type (the storage-layer
// discriminator from supabase/migrations/0035_metrics.sql), mapped below.
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

// dataPointKey (the consent/display taxonomy above) -> metrics.metric_type.
private val METRIC_TYPE_BY_DATA_POINT = mapOf(
    "steps" to "steps",
    "heart_rate_samples" to "heart_rate",
    "sleep_sessions" to "sleep_session",
    "exercise_sessions" to "exercise_session",
    "blood_oxygen" to "blood_oxygen",
    "blood_pressure" to "blood_pressure",
    "respiratory_rate" to "respiratory_rate",
    "blood_glucose" to "blood_glucose",
)

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
 *
 * Queries the unified `metrics` table (0035_metrics.sql), filtered by
 * `metric_type`, selecting the whole jsonb `value` column rather than a
 * PostgREST json-path projection -- type-specific fields are read back out
 * of the nested JSONObject in Kotlin below instead of relying on
 * `->>`/cast query-string syntax.
 */
class DataPointRepository(private val supabase: SupabaseRestClient) {

    suspend fun getSummary(clientId: String, dataPointKey: String): String {
        val since = ISO_INSTANT.format(Instant.now().minusSeconds(7 * 86_400L))
        val metricType = METRIC_TYPE_BY_DATA_POINT[dataPointKey] ?: return "No data synced yet"

        suspend fun metricRows(select: String, extraFilters: Map<String, String> = emptyMap()): JSONArray =
            supabase.select(
                "metrics",
                mapOf(
                    "select" to select,
                    "client_id" to "eq.$clientId",
                    "metric_type" to "eq.$metricType",
                ) + extraFilters,
            )

        return when (dataPointKey) {
            "steps" -> {
                val rows = metricRows("value", mapOf("start_time" to "gte.$since"))
                if (rows.length() == 0) return "No steps synced yet"
                val total = sumInts(rows, "count")
                "${total.thousands()} steps this week"
            }
            "heart_rate_samples" -> {
                val rows = metricRows("value", mapOf("start_time" to "gte.$since"))
                if (rows.length() == 0) return "No heart rate data synced yet"
                val avg = averageDouble(rows, "bpm")
                "${Math.round(avg)} bpm avg this week"
            }
            "sleep_sessions" -> {
                val rows = metricRows(
                    "start_time,end_time",
                    mapOf("start_time" to "gte.$since", "order" to "start_time.asc"),
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
                val rows = metricRows("id", mapOf("start_time" to "gte.$since"))
                val count = rows.length()
                "$count workout${if (count == 1) "" else "s"} this week"
            }
            "blood_oxygen" -> {
                val rows = metricRows("value", mapOf("start_time" to "gte.$since"))
                if (rows.length() == 0) return "No SpO2 data synced yet"
                val avg = averageDouble(rows, "percentage")
                "${Math.round(avg * 10) / 10.0}% avg SpO2 this week"
            }
            "blood_pressure" -> {
                val rows = metricRows("value", mapOf("order" to "start_time.desc", "limit" to "1"))
                if (rows.length() == 0) return "No blood pressure data synced yet"
                val last = rows.getJSONObject(0).getJSONObject("value")
                "${last.getInt("systolic_mmhg")}/${last.getInt("diastolic_mmhg")} mmHg (most recent)"
            }
            "respiratory_rate" -> {
                val rows = metricRows("value", mapOf("start_time" to "gte.$since"))
                if (rows.length() == 0) return "No respiratory rate data synced yet"
                val avg = averageDouble(rows, "breaths_per_minute")
                "${Math.round(avg * 10) / 10.0} breaths/min avg this week"
            }
            "blood_glucose" -> {
                val rows = metricRows("value", mapOf("start_time" to "gte.$since"))
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
    for (i in 0 until rows.length()) sum += rows.getJSONObject(i).getJSONObject("value").optLong(field, 0)
    return sum
}

private fun averageDouble(rows: JSONArray, field: String): Double {
    var sum = 0.0
    for (i in 0 until rows.length()) sum += rows.getJSONObject(i).getJSONObject("value").optDouble(field, 0.0)
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
