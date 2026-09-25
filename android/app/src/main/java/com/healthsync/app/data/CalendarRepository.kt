package com.healthsync.app.data

import com.healthsync.app.supabase.SupabaseRestClient
import java.time.Instant
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

private val ISO_INSTANT = DateTimeFormatter.ISO_INSTANT

/**
 * Client-side reads against the same `calendar_events`/`calendar_connections`
 * tables the web dashboard's `lib/calendar.ts` and Google Calendar sync
 * feature use (see `supabase/migrations/0016_calendar_events.sql` and
 * `0017_calendar_connections.sql`). Read-only -- this app has no write
 * path for calendar events (creating/editing events, or the sync/OAuth
 * flow itself, both stay web-only for now; see CalendarScreen's doc
 * comment for why the OAuth connect step specifically can't just be
 * ported here).
 */
class CalendarRepository(private val supabase: SupabaseRestClient) {

    suspend fun getUpcomingEvents(clientId: String, limit: Int = 20): List<CalendarEventItem> {
        val nowIso = ISO_INSTANT.format(Instant.now())
        val rows = supabase.select(
            "calendar_events",
            mapOf(
                "select" to "id,title,start_time,end_time,location,has_video_call",
                "client_id" to "eq.$clientId",
                "start_time" to "gte.$nowIso",
                "order" to "start_time.asc",
                "limit" to limit.toString(),
            ),
        )
        return (0 until rows.length()).map { i ->
            val row = rows.getJSONObject(i)
            CalendarEventItem(
                id = row.getString("id"),
                title = row.getString("title"),
                startTime = Instant.parse(row.getString("start_time")),
                endTime = Instant.parse(row.getString("end_time")),
                location = row.optString("location").ifBlank { null },
                hasVideoCall = row.optBoolean("has_video_call", false),
            )
        }
    }

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
}
