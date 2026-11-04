package com.healthsync.app.data

import com.healthsync.app.supabase.SupabaseRestClient
import org.json.JSONObject
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
 * that can show up on a given day: coaching calls, and
 * workouts/documents/check-ins scheduled via `assignments.scheduled_date`
 * (a check-in occurrence is a real generated row now, same as a
 * recurring workout's -- see supabase/migrations/0045_check_ins_
 * assignments.sql). [date] is a plain device-local calendar date (a
 * call's own [call]?.startTime decides its [date]; a
 * workout/document/check-in only ever has a day, not a time).
 */
data class CalendarItem(
    val kind: CalendarItemKind,
    val id: String,
    val title: String,
    val date: LocalDate,
    val hasVideoCall: Boolean,
    val completed: Boolean,
    // WORKOUT/DOCUMENT/CHECK_IN only -- what reschedule_assignment and
    // tap-to-complete operate on.
    val assignmentId: String? = null,
    // CALL only -- the original row, for the Join action.
    val call: CalendarEventItem? = null,
)

private val ISO_INSTANT = DateTimeFormatter.ISO_INSTANT

/**
 * Client-side reads merging `calendar_events` with scheduled
 * `assignments` (workout/document/check_in) -- the same two sources the
 * web dashboard's `listCalendarItems` merges
 * (`dashboard/lib/calendar-items.ts`), read directly against PostgREST
 * instead of through the Supabase JS SDK. Unlike the web side, this
 * never needs a separate client-timezone lookup to avoid off-by-one-day
 * UTC slicing -- [from]/[to] are already plain device-local
 * `LocalDate`s, the same convention `WorkoutRepository.findTodaysSession`
 * already uses for "today."
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
            externalAccountEmail = row.optStringOrNull("external_account_email"),
            // last_synced_at is null for every connection until its first
            // sync actually runs -- the common case right after connecting,
            // not an edge case. optString(key) alone returns the literal
            // string "null" for that (Android's platform org.json), which
            // Instant.parse() would throw on, taking down this whole
            // screen's load (see CalendarScreen's try/catch around this
            // call) instead of just showing "Not synced yet."
            lastSyncedAt = row.optStringOrNull("last_synced_at")?.let { Instant.parse(it) },
        )
    }

    suspend fun getCalendarItems(clientId: String, from: LocalDate, to: LocalDate): List<CalendarItem> {
        val calls = listCalls(clientId, from, to)
        val assignments = listScheduledAssignments(clientId, from, to)
        return calls + assignments
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
                location = row.optStringOrNull("location"),
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

    // Recurring series (recurrence_days_of_week set -- only ever true on a
    // series' own source row, never a generated occurrence) only ever grow
    // new rows forward from "today" when generate_recurring_occurrences is
    // actually called -- nothing calls it on a schedule, so it happens
    // lazily here, right before reading the range this screen asks for.
    // Mirrors the web dashboard's own ensureRecurringOccurrences
    // (dashboard/lib/calendar-items.ts) exactly, including that it's a
    // no-op for an already-ended series or a past [to].
    private suspend fun ensureRecurringOccurrences(clientId: String, through: LocalDate) {
        val sources = supabase.select(
            "assignments",
            mapOf(
                "select" to "id",
                "client_id" to "eq.$clientId",
                "recurrence_days_of_week" to "not.is.null",
            ),
        )
        (0 until sources.length()).forEach { i ->
            val sourceId = sources.getJSONObject(i).getString("id")
            supabase.rpc(
                "generate_recurring_occurrences",
                mapOf("p_assignment_id" to sourceId, "p_through" to through.toString()),
            )
        }
    }

    // Workouts, documents, and check-ins are all real `assignments` rows
    // on their own `scheduled_date` now (see
    // supabase/migrations/0045_check_ins_assignments.sql) -- a check-in
    // occurrence is no longer a virtual date projected against
    // check_in_templates/check_in_responses, it's a generated row exactly
    // like a recurring workout's, so this reads/completes it the same way.
    private suspend fun listScheduledAssignments(clientId: String, from: LocalDate, to: LocalDate): List<CalendarItem> {
        ensureRecurringOccurrences(clientId, to)

        val rows = supabase.select(
            "assignments",
            mapOf(
                "select" to "id,type,name,scheduled_date",
                "client_id" to "eq.$clientId",
                "type" to "in.(workout,document,check_in)",
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
        // Documents and check-ins both complete the same way -- an
        // assignment_responses row with submitted_at set.
        val formIds = parsed.filter { it.type == "document" || it.type == "check_in" }.map { it.id }

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
        val completedFormIds = if (formIds.isEmpty()) emptySet() else {
            val responseRows = supabase.select(
                "assignment_responses",
                mapOf(
                    "select" to "assignment_id",
                    "assignment_id" to "in.(${formIds.joinToString(",")})",
                    "submitted_at" to "not.is.null",
                ),
            )
            (0 until responseRows.length()).map { responseRows.getJSONObject(it).getString("assignment_id") }.toSet()
        }

        return parsed.map { row ->
            CalendarItem(
                kind = when (row.type) {
                    "workout" -> CalendarItemKind.WORKOUT
                    "document" -> CalendarItemKind.DOCUMENT
                    else -> CalendarItemKind.CHECK_IN
                },
                id = row.id,
                title = row.name,
                date = row.date,
                hasVideoCall = false,
                completed = if (row.type == "workout") row.id in completedWorkoutIds else row.id in completedFormIds,
                assignmentId = row.id,
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

// optString(key) alone returns the literal string "null" (not blank) for
// a SQL-null column on Android's platform org.json -- ifBlank{null}
// never catches that, since "null" isn't blank.
private fun JSONObject.optStringOrNull(key: String): String? =
    if (isNull(key)) null else optString(key).ifBlank { null }
