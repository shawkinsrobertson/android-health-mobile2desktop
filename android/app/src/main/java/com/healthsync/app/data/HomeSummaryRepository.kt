package com.healthsync.app.data

import com.healthsync.app.supabase.SupabaseRestClient
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

enum class DayCompletion { NONE, PARTIAL, DONE }

data class WeekDay(val date: LocalDate, val completion: DayCompletion)

data class UpcomingEvent(val title: String, val startTime: Instant)

data class TopDataPointSummary(val key: String, val label: String, val summary: String)

data class HomeSummary(
    val hasUnreadMessages: Boolean,
    val upcomingEvents: List<UpcomingEvent>,
    val checkInDue: Boolean,
    // Sunday..Saturday, the local week containing today -- always 7
    // entries so the heatmap can render a fixed-width row.
    val weekDays: List<WeekDay>,
    // Up to 3, in the order the client picked them. Empty (not an error
    // state) just means they haven't picked any yet.
    val topDataPoints: List<TopDataPointSummary>,
    // Null means "nothing assigned" (HomeScreen's empty state), not
    // "still loading" -- loadSummary() always resolves this one way or
    // the other before returning.
    val trainingItem: TrainingItem?,
)

private val ISO_INSTANT = DateTimeFormatter.ISO_INSTANT

/**
 * Feeds the redesigned client home screen's pull-down notification shade
 * (messages/calendar/tasks) and weekly streak heatmap. Deliberately
 * separate from HealthDataRepository -- this reads chat/calendar/
 * check-in tables that have nothing to do with Health Connect sync, and
 * relies on the same coach/client RLS policies the web dashboard already
 * uses for each (see 0011_chat.sql, 0016_calendar_events.sql,
 * 0023_check_ins.sql) rather than anything new.
 *
 * Streak simplification, stated plainly rather than left to be
 * discovered: this app has no concept of a workout being "scheduled" for
 * a specific day (the web dashboard's own "Next up" card has the same
 * gap -- see its own comment). So "completion" here means *any* workout
 * activity that day: a workout_sessions row with completed_at set makes
 * that day DONE; a row that exists but is still in progress (completed_at
 * null -- the client started it but hasn't finished) makes it PARTIAL,
 * matching the mockup's "partially completed = lighter shade." A day
 * with no session row at all is NONE. This is "did they do something,"
 * not "did they do what was assigned" -- there's no assignment-per-day
 * to compare against yet.
 */
class HomeSummaryRepository(private val supabase: SupabaseRestClient) {

    // Each of the four sub-fetches hits its own, unrelated table
    // (chat/calendar/check-ins/workout_sessions) and is caught
    // independently -- one of them failing (e.g. a migration this
    // client's Supabase project hasn't been run against yet, like
    // 0023_check_ins.sql before it's applied) must not null out the
    // *entire* summary. Before this, a single failing query here left
    // the whole notification shade + streak stuck showing HomeScreen's
    // "still loading" spinner forever, indistinguishable from actually
    // still being in flight -- since loadSummary() itself never
    // completed, there was nothing to tell the difference.
    suspend fun loadSummary(clientId: String): HomeSummary {
        val hasUnreadMessages = runCatching { loadUnreadMessages(clientId) }.getOrDefault(false)
        val upcomingEvents = runCatching { loadUpcomingEvents(clientId) }.getOrDefault(emptyList())
        val checkInDue = runCatching { loadCheckInDue(clientId) }.getOrDefault(false)
        val weekDays = runCatching { loadWeekCompletion(clientId) }.getOrDefault(emptyWeek())
        val topDataPoints = runCatching { loadTopDataPoints(clientId) }.getOrDefault(emptyList())
        val trainingItem = runCatching { WorkoutRepository(supabase).getNextTrainingItem(clientId) }.getOrNull()
        return HomeSummary(hasUnreadMessages, upcomingEvents, checkInDue, weekDays, topDataPoints, trainingItem)
    }

    private suspend fun loadTopDataPoints(clientId: String): List<TopDataPointSummary> {
        val keys = ProfileRepository(supabase).loadTopDataPoints(clientId)
        val dataPoints = DataPointRepository(supabase)
        return keys.map { key ->
            val summary = runCatching { dataPoints.getSummary(clientId, key) }.getOrDefault("No data synced yet")
            TopDataPointSummary(key = key, label = labelFor(key), summary = summary)
        }
    }

    private fun emptyWeek(): List<WeekDay> {
        val today = LocalDate.now(ZoneId.systemDefault())
        val weekStart = today.minusDays(today.dayOfWeek.value.toLong() % 7)
        return (0..6).map { offset -> WeekDay(weekStart.plusDays(offset.toLong()), DayCompletion.NONE) }
    }

    private suspend fun loadUnreadMessages(clientId: String): Boolean {
        val rows = supabase.select(
            "chat_threads",
            mapOf(
                "select" to "last_message_at,last_sender_id,client_last_read_at",
                "client_id" to "eq.$clientId",
                "limit" to "1",
            ),
        )
        if (rows.length() == 0) return false
        val thread = rows.getJSONObject(0)
        val lastMessageAt = thread.optString("last_message_at").ifBlank { null } ?: return false
        val lastSenderId = thread.optString("last_sender_id").ifBlank { null } ?: return false
        if (lastSenderId == clientId) return false
        val lastRead = thread.optString("client_last_read_at").ifBlank { null } ?: return true
        return Instant.parse(lastMessageAt).isAfter(Instant.parse(lastRead))
    }

    private suspend fun loadUpcomingEvents(clientId: String): List<UpcomingEvent> {
        val nowIso = ISO_INSTANT.format(Instant.now())
        val rows = supabase.select(
            "calendar_events",
            mapOf(
                "select" to "title,start_time",
                "client_id" to "eq.$clientId",
                "start_time" to "gte.$nowIso",
                "order" to "start_time.asc",
                "limit" to "3",
            ),
        )
        return (0 until rows.length()).map { i ->
            val row = rows.getJSONObject(i)
            UpcomingEvent(
                title = row.getString("title"),
                startTime = Instant.parse(row.getString("start_time")),
            )
        }
    }

    // Mirrors dashboard/lib/check-ins.ts's currentWeekStart exactly (same
    // UTC-based Sunday-anchored bucketing) so a client's "is this due"
    // state agrees with what their coach sees on the web dashboard.
    private fun currentWeekStartUtc(dayOfWeek: Int, reference: Instant = Instant.now()): LocalDate {
        val today = reference.atZone(ZoneOffset.UTC).toLocalDate()
        val diff = ((today.dayOfWeek.value % 7) - dayOfWeek + 7) % 7
        return today.minusDays(diff.toLong())
    }

    private suspend fun loadCheckInDue(clientId: String): Boolean {
        val templateRows = supabase.select(
            "check_in_templates",
            mapOf(
                "select" to "id,day_of_week",
                "client_id" to "eq.$clientId",
                "active" to "eq.true",
                "limit" to "1",
            ),
        )
        if (templateRows.length() == 0) return false
        val template = templateRows.getJSONObject(0)
        val templateId = template.getString("id")
        val dayOfWeek = template.getInt("day_of_week")
        val weekStart = currentWeekStartUtc(dayOfWeek).toString()

        val responseRows = supabase.select(
            "check_in_responses",
            mapOf(
                "select" to "submitted_at",
                "template_id" to "eq.$templateId",
                "week_start" to "eq.$weekStart",
                "limit" to "1",
            ),
        )
        if (responseRows.length() == 0) return true
        return responseRows.getJSONObject(0).optString("submitted_at").isBlank()
    }

    private suspend fun loadWeekCompletion(clientId: String): List<WeekDay> {
        val today = LocalDate.now(ZoneId.systemDefault())
        // Sunday-start week containing today, local device calendar --
        // consistent with HealthDataRepository's own local-date bucketing.
        val weekStart = today.minusDays(today.dayOfWeek.value.toLong() % 7)
        val weekEnd = weekStart.plusDays(6)

        val rows = supabase.select(
            "workout_sessions",
            mapOf(
                "select" to "performed_on,completed_at",
                "client_id" to "eq.$clientId",
                // Both bounds on the same column need PostgREST's `and=(...)`
                // combinator -- a plain map can't hold two "performed_on" keys.
                "and" to "(performed_on.gte.$weekStart,performed_on.lte.$weekEnd)",
            ),
        )

        val completedDates = mutableSetOf<LocalDate>()
        val startedDates = mutableSetOf<LocalDate>()
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            val performedOn = LocalDate.parse(row.getString("performed_on"))
            if (row.optString("completed_at").isNotBlank()) {
                completedDates.add(performedOn)
            } else {
                startedDates.add(performedOn)
            }
        }

        return (0..6).map { offset ->
            val date = weekStart.plusDays(offset.toLong())
            val completion = when {
                completedDates.contains(date) -> DayCompletion.DONE
                startedDates.contains(date) -> DayCompletion.PARTIAL
                else -> DayCompletion.NONE
            }
            WeekDay(date, completion)
        }
    }
}
