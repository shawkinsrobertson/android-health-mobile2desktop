package com.healthsync.app.data

import com.healthsync.app.supabase.SupabaseRestClient
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter

data class CalendarEventItem(
    val id: String,
    val title: String,
    val startTime: Instant,
    val endTime: Instant,
    val location: String?,
    val hasVideoCall: Boolean,
)

data class GoogleCalendarConnection(
    val externalAccountEmail: String?,
    val lastSyncedAt: Instant?,
)

enum class CalendarItemKind { CALL, WORKOUT, DOCUMENT, CHECK_IN }

/**
 * Kotlin counterpart to the web dashboard's `CalendarItem`
 * (`dashboard/lib/calendar-items.ts`) -- one merged shape for everything
 * that can show up on a given day: coaching calls, workouts/documents
 * scheduled via `assignments.scheduled_date`, and projected check-in
 * occurrences. [date] is a plain device-local calendar date (a call's
 * own [call]?.startTime decides its [date]; a workout/document/check-in
 * only ever has a day, not a time).
 */
data class CalendarItem(
    val kind: CalendarItemKind,
    val id: String,
    val title: String,
    val date: LocalDate,
    val hasVideoCall: Boolean,
    val completed: Boolean,
    // WORKOUT/DOCUMENT only -- what reschedule_assignment and
    // tap-to-complete operate on.
    val assignmentId: String? = null,
    // CALL only -- the original row, for the Join action.
    val call: CalendarEventItem? = null,
)

private val ISO_INSTANT = DateTimeFormatter.ISO_INSTANT

/**
 * Client-side reads merging `calendar_events` with scheduled
 * `assignments` (workout/document) and projected `check_in_templates`
 * occurrences -- the same three sources the web dashboard's
 * `listCalendarItems` merges (`dashboard/lib/calendar-items.ts`), read
 * directly against PostgREST instead of through the Supabase JS SDK.
 * Unlike the web side, this never needs a separate client-timezone
 * lookup to avoid off-by-one-day UTC slicing -- [from]/[to] are already
 * plain device-local `LocalDate`s, the same convention
 * `WorkoutRepository.findTodaysSession` already uses for "today."
 *
 * Writes (`reschedule_assignment`) are scoped by this same client-only
 * role: this screen is only ever a client viewing their own calendar
 * (see CalendarScreen's doc comment), so there's no coach-viewing-a-
 * client case to branch on here the way the web side's CalendarCard
 * has to.
 */
class CalendarRepository(private val supabase: SupabaseRestClient) {

    suspend fun getGoogleConnection(clientId: String): GoogleCalendarConnection? {
        val rows = supabase.select(
            "calendar_connections",
            mapOf(
                "select" to "external_account_email,last_synced_at",
                "profile_id" to "eq.$clientId",
                "provider" to "eq.google",
                "limit" to "1",
            ),
        )
        if (rows.length() == 0) return null
        val row = rows.getJSONObject(0)
        return GoogleCalendarConnection(
            externalAccountEmail = row.optString("external_account_email").ifBlank { null },
            lastSyncedAt = row.optString("last_synced_at").ifBlank { null }?.let { Instant.parse(it) },
        )
    }

    suspend fun getCalendarItems(clientId: String, from: LocalDate, to: LocalDate): List<CalendarItem> {
        val calls = listCalls(clientId, from, to)
        val assignments = listScheduledAssignments(clientId, from, to)
        val checkIns = listCheckInOccurrences(clientId, from, to)
        return calls + assignments + checkIns
    }

    private suspend fun listCalls(clientId: String, from: LocalDate, to: LocalDate): List<CalendarItem> {
        val rows = supabase.select(
            "calendar_events",
            mapOf(
                "select" to "id,title,start_time,end_time,location,has_video_call",
                "client_id" to "eq.$clientId",
                // Both bounds on the same column need PostgREST's `and=(...)`
                // combinator -- a plain map can't hold two "start_time" keys
                // (see HomeSummaryRepository.kt's own use of this same trick).
                "and" to "(start_time.gte.${from.atStartOfDayIso()},start_time.lt.${to.plusDays(1).atStartOfDayIso()})",
                "order" to "start_time.asc",
            ),
        )
        return (0 until rows.length()).map { i ->
            val row = rows.getJSONObject(i)
            val event = CalendarEventItem(
                id = row.getString("id"),
                title = row.getString("title"),
                startTime = Instant.parse(row.getString("start_time")),
                endTime = Instant.parse(row.getString("end_time")),
                location = row.optString("location").ifBlank { null },
                hasVideoCall = row.optBoolean("has_video_call", false),
            )
            CalendarItem(
                kind = CalendarItemKind.CALL,
                id = event.id,
                title = event.title,
                date = event.startTime.atZone(java.time.ZoneId.systemDefault()).toLocalDate(),
                hasVideoCall = event.hasVideoCall,
                completed = false,
                call = event,
            )
        }
    }

    private suspend fun listScheduledAssignments(clientId: String, from: LocalDate, to: LocalDate): List<CalendarItem> {
        val rows = supabase.select(
            "assignments",
            mapOf(
                "select" to "id,type,name,scheduled_date",
                "client_id" to "eq.$clientId",
                "type" to "in.(workout,document)",
                "and" to "(scheduled_date.gte.$from,scheduled_date.lte.$to)",
            ),
        )
        if (rows.length() == 0) return emptyList()

        data class Row(val id: String, val type: String, val name: String, val date: LocalDate)
        val parsed = (0 until rows.length()).map { i ->
            val row = rows.getJSONObject(i)
            Row(row.getString("id"), row.getString("type"), row.getString("name"), LocalDate.parse(row.getString("scheduled_date")))
        }

        val workoutIds = parsed.filter { it.type == "workout" }.map { it.id }
        val documentIds = parsed.filter { it.type == "document" }.map { it.id }

        val completedWorkoutIds = if (workoutIds.isEmpty()) emptySet() else {
            val completedRows = supabase.select(
                "workout_sessions",
                mapOf(
                    "select" to "assigned_workout_id",
                    "assigned_workout_id" to "in.(${workoutIds.joinToString(",")})",
                    "completed_at" to "not.is.null",
                ),
            )
            (0 until completedRows.length()).map { completedRows.getJSONObject(it).getString("assigned_workout_id") }.toSet()
        }
        val completedDocumentIds = if (documentIds.isEmpty()) emptySet() else {
            val responseRows = supabase.select(
                "assignment_responses",
                mapOf(
                    "select" to "assignment_id",
                    "assignment_id" to "in.(${documentIds.joinToString(",")})",
                    "submitted_at" to "not.is.null",
                ),
            )
            (0 until responseRows.length()).map { responseRows.getJSONObject(it).getString("assignment_id") }.toSet()
        }

        return parsed.map { row ->
            CalendarItem(
                kind = if (row.type == "workout") CalendarItemKind.WORKOUT else CalendarItemKind.DOCUMENT,
                id = row.id,
                title = row.name,
                date = row.date,
                hasVideoCall = false,
                completed = if (row.type == "workout") row.id in completedWorkoutIds else row.id in completedDocumentIds,
                assignmentId = row.id,
            )
        }
    }

    // Mirrors the web's listCheckInOccurrences -- never materialized as
    // its own row until a client actually submits one; day_of_week is
    // 0=Sunday..6=Saturday (check_in_templates' own convention), matching
    // LocalDate.dayOfWeek.value % 7 (ISO's MONDAY=1..SUNDAY=7, so
    // SUNDAY%7=0, MONDAY%7=1, ... SATURDAY%7=6).
    private suspend fun listCheckInOccurrences(clientId: String, from: LocalDate, to: LocalDate): List<CalendarItem> {
        val templateRows = supabase.select(
            "check_in_templates",
            mapOf(
                "select" to "id,name,day_of_week",
                "client_id" to "eq.$clientId",
                "active" to "eq.true",
                "limit" to "1",
            ),
        )
        if (templateRows.length() == 0) return emptyList()
        val template = templateRows.getJSONObject(0)
        val templateId = template.getString("id")
        val name = template.getString("name")
        val dayOfWeek = template.getInt("day_of_week")

        val occurrences = mutableListOf<LocalDate>()
        var cursor = from
        while (!cursor.isAfter(to)) {
            if (cursor.dayOfWeek.isoDayOfWeekSundayZero() == dayOfWeek) occurrences.add(cursor)
            cursor = cursor.plusDays(1)
        }
        if (occurrences.isEmpty()) return emptyList()

        val responseRows = supabase.select(
            "check_in_responses",
            mapOf(
                "select" to "week_start,submitted_at",
                "template_id" to "eq.$templateId",
                "week_start" to "in.(${occurrences.joinToString(",")})",
            ),
        )
        val submittedWeeks = (0 until responseRows.length())
            .map { responseRows.getJSONObject(it) }
            .filter { !it.isNull("submitted_at") }
            .map { it.getString("week_start") }
            .toSet()

        return occurrences.map { date ->
            CalendarItem(
                kind = CalendarItemKind.CHECK_IN,
                id = "check_in:$templateId:$date",
                title = name,
                date = date,
                hasVideoCall = false,
                completed = date.toString() in submittedWeeks,
            )
        }
    }

    /**
     * The one write this screen makes onto a scheduled item -- tap to pick
     * a new day, not a drag gesture (see CalendarScreen's doc comment for
     * why), via the same `reschedule_assignment` RPC the web dashboard's
     * drag-and-drop calls (`supabase/migrations/0039_assignment_
     * scheduling.sql`): security definer, checks the caller is this
     * assignment's own client or coach, and only ever touches
     * `scheduled_date`.
     */
    suspend fun rescheduleAssignment(assignmentId: String, newDate: LocalDate) {
        supabase.rpc(
            "reschedule_assignment",
            mapOf("p_assignment_id" to assignmentId, "p_new_date" to newDate.toString()),
        )
    }
}

private fun LocalDate.atStartOfDayIso(): String = ISO_INSTANT.format(this.atStartOfDay(java.time.ZoneId.systemDefault()).toInstant())

private fun DayOfWeek.isoDayOfWeekSundayZero(): Int = this.value % 7
